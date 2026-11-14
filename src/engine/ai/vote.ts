// Voting (SPEC §5.5) and the other prompts a card can put to an AI Councilor.
import { living, player } from '../selectors';
import type { GameState, PendingDecision, Seat } from '../types';
import { believedLP } from './beliefs';
import { myPromises, honorWeight, chooseDial } from './chooseAction';
import { aiRng, softmaxPick, temperature } from './personality';
import { nextFloat, pick } from '../rng';

/** How much this AI wants `t` to be the one who suffers. */
function grudge(s: GameState, seat: Seat, t: Seat): number {
  const ai = s.ai[seat]!;
  const alive = living(s).filter((p) => p.seat !== seat);
  const top = Math.max(1, ...alive.map((p) => believedLP(s, seat, p.seat)));
  const threat = believedLP(s, seat, t) / top; // 0..1, 1 = the believed LP leader
  return ai.hostility[t]! + threat * (0.5 + 0.5 * ai.personality.greed) - ai.trust[t]!;
}

function ayeValue(s: GameState, seat: Seat, cardId: string): number {
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const p = player(s, seat);
  const need = (s.maxEH - s.eh) / s.maxEH; // how badly the bunker needs help
  const others = living(s).filter((o) => o.seat !== seat);
  const iLead = others.every((o) => believedLP(s, seat, o.seat) <= p.lp);
  switch (cardId) {
    case 'MAN-02': // Blood Tithe: everyone -2 LP, EH +4
      return 4 * need * (0.4 + per.cooperation) - (p.lp <= 2 ? 0.2 : 1.0) * (0.5 + per.greed);
    case 'MAN-06': // Austerity: EH +3, Gather yields 0 next turn
      return 3 * need * (0.4 + per.cooperation) - 0.5 * per.greed;
    case 'MAN-08': { // Amnesty: all Blight and Embargoes removed
      const mine = p.blight.bio + p.blight.neuro + (p.status.embargoedUntil >= s.turn ? 1 : 0);
      const enemies = others.reduce((sum, o) => sum + (o.blight.bio + o.blight.neuro) * ai.hostility[o.seat]!, 0);
      return mine * 1.2 + (per.cooperation - 0.5) - enemies * per.vengefulness;
    }
    case 'MAN-10': // Blackout: next Crisis is hidden
      return per.risk - 0.75;
    case 'MAN-14': // System Reboot: old (easier) cards return
      return per.cooperation - 0.45;
    case 'MAN-17': // Emergency Overdrive: one turn fewer
      return (iLead ? 0.8 : -0.4) + (need > 0.6 ? 0.5 : 0) - 0.2;
    default:
      return 0;
  }
}

export function chooseBallot(s: GameState, d: PendingDecision): string {
  const seat = d.seat;
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const vote = s.vote!;
  const rng = aiRng(s, seat, `ballot${vote.cardId}`);
  const temp = temperature(s);
  const scores = d.options.map((o) => {
    let score = 0;
    switch (vote.type) {
      case 'ayeNay':
        score = o === 'aye' ? ayeValue(s, seat, vote.cardId) : 0;
        break;
      case 'mercy': {
        const t = vote.mercyTarget!;
        const kill = t === seat ? -5 : ai.hostility[t]! + per.aggression * 0.6 - ai.trust[t]! - per.cooperation * 0.5 - (s.eh >= 8 ? 0.3 : 0);
        score = o === 'efficiency' ? kill : 0;
        break;
      }
      case 'unanimous': {
        // A focal point: the cooperative vote for the believed LP leader, so consensus is reachable.
        const t = Number(o);
        const alive = living(s).filter((p) => p.seat !== seat);
        const top = Math.max(...alive.map((p) => believedLP(s, seat, p.seat)));
        const focal = alive.find((p) => believedLP(s, seat, p.seat) === top)!.seat;
        score = grudge(s, seat, t) * (1 - per.cooperation) + (t === focal ? 2 * per.cooperation : 0);
        break;
      }
      default:
        score = grudge(s, seat, Number(o));
    }
    // Honor "will vote" deals according to honesty.
    for (const pr of myPromises(s, seat)) {
      if (pr.term.kind === 'willVote' && String(pr.term.target) === o) score += honorWeight(s, seat, pr);
    }
    return score;
  });
  return d.options[softmaxPick(rng, scores, temp)]!;
}

/** Answers every option-style prompt (everything that is not a dial, ballot, bid or pledge). */
export function chooseOptionFor(s: GameState, d: PendingDecision): string {
  const seat = d.seat;
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const p = player(s, seat);
  const rng = aiRng(s, seat, `opt${d.id}`);
  const has = (o: string) => d.options.includes(o);
  switch (d.kind) {
    case 'tieBreak': {
      // The Directorate picks what hurts its worst enemy; chaos only if the bunker can take it.
      const vote = s.vote!;
      const real = d.options.filter((o) => o !== 'chaos');
      if (s.eh >= 12 && per.vengefulness >= 0.7 && nextFloat(rng) < 0.5) return 'chaos';
      if (vote.type === 'ayeNay') return ayeValue(s, seat, vote.cardId) > 0 ? 'aye' : 'nay';
      if (vote.type === 'mercy') return vote.mercyTarget === seat || ai.trust[vote.mercyTarget!]! > 0 ? 'mercy' : 'efficiency';
      const others = real.filter((o) => Number(o) !== seat);
      if (others.length === 0) return has('chaos') ? 'chaos' : real[0]!;
      return others.reduce((a, b) => (grudge(s, seat, Number(b)) > grudge(s, seat, Number(a)) ? b : a));
    }
    case 'redactName': {
      // Only when they would otherwise be the target: a real share of the ballots names them.
      const naming = Number(d.info?.ballotsNamingYou ?? 0);
      const voters = s.vote?.voters.length ?? 6;
      return naming >= 2 && naming >= (voters - 1) / 3 ? String(d.max ?? 0) : '0';
    }
    case 'martialLaw': {
      // Worth 3 Influence against LP loss, Exile and Infection; not against small Influence losses.
      const mild = ['CR-01', 'CR-05', 'CR-13', 'CR-31'];
      const card = d.sourceCardId ?? '';
      if (mild.includes(card)) return 'decline';
      if ((card === 'CR-30' || card === 'CR-34') && p.influence < 6) return 'decline';
      return 'ignore';
    }
    case 'ventResponse': {
      const guild = Number(d.info?.by);
      return has('pay') && p.influence >= 4 && ai.hostility[guild]! < 0.6 ? 'pay' : 'embargo';
    }
    case 'paranoiaPeek': {
      const rivals = d.options.filter((o) => o !== 'pass').map(Number);
      const worst = rivals.reduce((a, b) => (ai.hostility[b]! > ai.hostility[a]! ? b : a), rivals[0]!);
      return p.influence >= 4 && ai.hostility[worst]! > 0.4 ? String(worst) : 'pass';
    }
    case 'announceAction': {
      // CR-19: say what you plan, or lie with chance 1 - honesty.
      const plan = chooseDial(s, seat).action;
      const lies = d.options.filter((o) => o !== plan);
      if (has(plan) && (nextFloat(rng) < per.honesty || lies.length === 0)) return plan;
      return lies.length ? pick(rng, lies) : d.options[0]!;
    }
    case 'volunteer': {
      const danger = s.eh <= 6 ? 1 : s.eh <= 10 ? 0.6 : 0.3;
      const chance = per.cooperation * danger * (p.lp >= 5 ? 1 : 0.5);
      return nextFloat(rng) < chance ? 'volunteer' : 'decline';
    }
    case 'cardChoice': {
      if (has('sacrifice')) {
        // BS-05: 3 LP of mine, or a cube for everyone (the Wardens shrug at one cube).
        const shrug = p.factionId === 'wardens' ? 0.4 : 0;
        return p.lp >= 6 && per.cooperation - shrug > 0.5 ? 'sacrifice' : 'blight';
      }
      // BS-06: 5 Influence, or 2 LP and no abilities for 2 turns.
      return has('pay') && (p.lp <= 4 || nextFloat(rng) < 0.85) ? 'pay' : 'suffer';
    }
    case 'exileBuyout':
      return p.lp >= 16 ? 'pay' : 'accept';
    default:
      return d.defaultOption ?? d.options.at(-1)!;
  }
}


