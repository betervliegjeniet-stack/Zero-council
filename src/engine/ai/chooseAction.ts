// Action choice (SPEC §5.3): score every legal dial setting, then sample with softmax.
import { actionCost, dialOptions } from '../phases/actions';
import { abilitiesActive, currentCrisis, isActive, living, player, poolThreshold } from '../selectors';
import type { Deal, DealTerm, Dial, GameState, Seat } from '../types';
import { believedLP } from './beliefs';
import { aiRng, clamp, softmaxPick, temperature } from './personality';

interface Promise {
  term: DealTerm;
  partner: Seat;
  binding: boolean;
}

/** The promises this seat made in accepted deals this turn. */
export function myPromises(s: GameState, seat: Seat): Promise[] {
  const out: Promise[] = [];
  for (const d of s.deals) {
    if (d.turn !== s.turn || d.status !== 'accepted') continue;
    if (d.proposer !== seat && d.partner !== seat) continue;
    const partner = d.proposer === seat ? d.partner : d.proposer;
    for (const term of d.terms) {
      const who = term.kind === 'giveInfluenceNow' ? term.from : term.who;
      if (who === seat) out.push({ term, partner, binding: d.binding });
    }
  }
  return out;
}

/** How much keeping (or breaking) a promise weighs for this AI: honesty x trust, or the Oath. */
export function honorWeight(s: GameState, seat: Seat, pr: { partner: Seat; binding: boolean }): number {
  const ai = s.ai[seat]!;
  const w = s.config.ai;
  if (pr.binding) return w.bindingBreakPenalty;
  return w.dealHonor * ai.personality.honesty * clamp(0.5 + ai.trust[pr.partner]! / 2, 0.1, 1);
}

/** What other players are expected to put into the pool (the free-rider estimate). */
function expectedFromOthers(s: GameState, seat: Seat, fair: number, deals: Deal[]): number {
  const ai = s.ai[seat]!;
  let total = 0;
  for (const o of living(s)) {
    if (o.seat === seat) continue;
    const can = Math.max(0, o.influence - s.modifiers.contributeSurcharge);
    let expect = Math.min(can, fair) * clamp(0.45 + 0.4 * ai.trust[o.seat]!, 0.1, 0.9);
    for (const d of deals) {
      for (const t of d.terms) {
        if (t.kind === 'willContribute' && t.who === o.seat) expect = Math.max(expect, Math.min(can, t.min) * 0.8);
      }
    }
    total += expect;
  }
  return total;
}

export function chooseDial(s: GameState, seat: Seat): Dial {
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const w = s.config.ai;
  const c = s.config;
  const m = s.modifiers;
  const p = player(s, seat);
  const alive = living(s);
  const n = alive.length;
  const phase = s.turn / c.totalTurns;
  const turnsLeft = c.totalTurns - s.turn;
  const lastTurn = turnsLeft <= 0;
  const promises = myPromises(s, seat);
  const options = dialOptions(s, seat).filter((o) => o.available);
  const estimates = alive.filter((o) => o.seat !== seat).map((o) => believedLP(s, seat, o.seat));
  const avgEst = estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : 0;
  const topEst = estimates.length ? Math.max(...estimates) : 0;

  const cands: { dial: Dial; score: number }[] = [];
  const add = (dial: Dial, score: number) => cands.push({ dial, score });

  for (const o of options) {
    switch (o.action) {
      case 'gather': {
        const yieldNow = isActive(s, p.status.gatherYield0Until) ? 0 : (m.gatherYield ?? c.gatherYield);
        const need = p.influence < 3 ? w.gatherLowInfluence : Math.max(0.15, 1 - p.influence / 10);
        let score = (w.gatherBase + per.greed * need) * (yieldNow / c.gatherYield);
        if (lastTurn) score *= 0.2; // Influence is worthless in the Crucible
        add({ action: 'gather' }, Math.max(score, 0.05));
        break;
      }
      case 'repair':
        add({ action: 'repair' }, turnsLeft >= 2 ? 0.8 * (w.gatherBase + per.greed * 0.5) : 0.05);
        break;
      case 'medicalTax':
        add({ action: 'medicalTax' }, turnsLeft >= 2 && p.influence >= 8 ? 0.55 : 0.1);
        break;
      case 'salvage': {
        let score = (w.salvageBase + phase) * (0.5 + per.greed);
        if (p.influence >= o.cost + 2) score += w.salvageSpareBonus;
        if (lastTurn) score += 0.5;
        if (o.targets) {
          // Cannibalism: feed on the most hated rival who is believed to still have LP.
          let best = o.targets[0]!;
          let bestScore = -Infinity;
          for (const t of o.targets) {
            const v = ai.hostility[t]! + (believedLP(s, seat, t) > 0 ? 0.3 : -1) - ai.trust[t]! * 0.3;
            if (v > bestScore) [best, bestScore] = [t, v];
          }
          add({ action: 'salvage', target: best }, score + per.aggression * 0.3);
        } else {
          add({ action: 'salvage' }, score);
        }
        break;
      }
      case 'sabotage': {
        const damage = m.sabotageDamageSet ?? c.sabotageDamage + m.sabotageDamageBonus;
        for (const t of o.targets ?? []) {
          const cost = actionCost(s, seat, { action: 'sabotage', target: t });
          if (cost > p.influence) continue;
          const est = believedLP(s, seat, t);
          const leader = clamp((est - avgEst) / (avgEst + 1), -0.5, 1);
          let score = w.sabotageAggression * per.aggression * (0.4 + leader)
            + w.sabotageHostility * ai.hostility[t]!
            + w.sabotageVengeance * per.vengefulness * Math.min(2, ai.recentHarm[t]!)
            + w.sabotagePhase * phase
            - w.sabotageCostPenalty * cost
            - 0.3 * ai.trust[t]!;
          score *= 0.6 + 0.4 * damage;
          if (est <= 0) score -= 1; // nothing left to destroy
          if (m.sabotageInfects) score -= 0.8;
          if (s.difficulty === 'merciless' && est >= topEst) score += 0.5; // gang up on the leader
          for (const pr of promises) {
            if (pr.term.kind === 'willNotSabotage' && pr.term.target === t) score -= honorWeight(s, seat, pr);
            if (pr.term.kind === 'willSabotage' && pr.term.target === t) score += honorWeight(s, seat, pr);
          }
          const transferBlight = p.factionId === 'wardens' && abilitiesActive(s, seat) && p.blight.bio + p.blight.neuro > 0;
          add({ action: 'sabotage', target: t, ...(transferBlight ? { transferBlight: true } : {}) }, score);
        }
        break;
      }
      case 'contribute': {
        const myMax = o.maxAmount ?? 0;
        const myMin = o.minAmount ?? 1;
        const promised = promises.filter((pr) => pr.term.kind === 'willContribute');
        const promisedMin = Math.max(0, ...promised.map((pr) => (pr.term.kind === 'willContribute' ? pr.term.min : 0)));
        const honor = promised.reduce((sum, pr) => sum + honorWeight(s, seat, pr), 0);
        const card = currentCrisis(s);
        const hidden = s.crisis?.faceDown ?? false;
        const threshold = hidden ? 10 : poolThreshold(s);
        let amount = Math.max(myMin, 1);
        let score: number;
        if (threshold === null || !card) {
          // No pool: only worth it to keep a promise, or to dodge BS-02's paralysis.
          score = (card?.id === 'BS-02' ? 0.55 : -0.6) + honor;
        } else {
          const ehLoss = hidden ? 2 : card.eh.timing === 'unmitigated' ? -card.eh.value : 0;
          const danger = (s.maxEH - s.eh) / s.maxEH;
          let harm = w.contributeHarmPerEH * ehLoss * (1 + w.contributeUrgency * danger);
          if (c.collapsePenalty && s.eh - ehLoss <= 0) harm += w.contributeCollapseFear;
          if (!hidden) {
            if (card.id === 'CR-02') harm += w.contributePersonalPenalty;
            if (card.id === 'CR-05' && p.lp >= topEst) harm += w.contributePersonalPenalty * 0.5;
            if (card.tags.includes('endsGameOnFail')) harm += w.contributePersonalPenalty * 1.5;
          }
          // A fair share that allows for a free rider or two: with everyone paying exactly
          // threshold / n, one defector sinks the pool.
          const fair = Math.ceil(threshold / Math.max(1, n - w.contributeExpectedFreeRiders));
          const myDeals = s.deals.filter((d) => d.turn === s.turn && d.status === 'accepted' && (d.proposer === seat || d.partner === seat));
          const others = expectedFromOthers(s, seat, fair, myDeals);
          const capacity = myMax + alive.filter((x) => x.seat !== seat)
            .reduce((sum, x) => sum + Math.max(0, x.influence - m.contributeSurcharge), 0);
          const remaining = threshold - others;
          amount = fair;
          if (remaining > fair && per.cooperation > 0.5) amount = Math.ceil(remaining);
          // Going beyond the fair share must leave a risk-scaled reserve.
          const reserve = Math.round((1 - per.risk) * 2);
          if (amount > fair) amount = Math.max(fair, Math.min(amount, myMax - reserve));
          amount = clamp(amount, 1, myMax);
          const feasible = capacity < threshold ? 0.15 : 1;
          const freeRide = others >= threshold ? w.contributeFreeRider * (1 - per.cooperation) : 0;
          score = (w.contributeBase + harm) * (0.4 + per.cooperation) * feasible * (1 - freeRide) * (hidden ? 0.6 : 1) + honor;
          if (m.contributeRewardLP > 0 && !m.noLPGain) score += (0.6 + phase) * (0.5 + per.greed);
        }
        if (promisedMin > 0 && promisedMin <= myMax) amount = Math.max(amount, promisedMin);
        add({ action: 'contribute', amount: clamp(amount, myMin, myMax) }, score);
        break;
      }
      case 'quarantine': {
        const immune = p.factionId === 'wardens' && abilitiesActive(s, seat) ? 1 : 0;
        const draining = p.blight.bio + p.blight.neuro - immune;
        const worth = (p.blight.bio >= 1 && turnsLeft >= 2) || p.blight.neuro >= 2;
        add({ action: 'quarantine' }, draining <= 0 ? 0.05 : worth ? w.quarantineBase + 0.3 * p.blight.bio : 0.1);
        break;
      }
      case 'idle':
        add({ action: 'idle' }, 0);
        break;
    }
  }
  if (cands.length === 0) return { action: 'idle' };
  // Salted by turn only, so the plan an AI announces (CR-19) is the plan it then follows.
  const pickAt = softmaxPick(aiRng(s, seat, 'dial'), cands.map((x) => x.score), temperature(s));
  return cands[pickAt]!.dial;
}
