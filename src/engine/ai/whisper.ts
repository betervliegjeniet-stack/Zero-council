// Whisper behaviour (SPEC §5.4): which deals an AI offers, which it accepts, and when it uses
// its Whisper abilities.
import { getHandler } from '../cards';
import { INOCULATE_COST_LP, VENT_COST } from '../abilities';
import { abilitiesActive, canTrade, currentCrisis, living, player, poolThreshold } from '../selectors';
import type { Deal, DealTerm, GameState, Intent, Seat } from '../types';
import { nextFloat, type RngHolder } from '../rng';
import { believedLP } from './beliefs';
import { aiRng, clamp } from './personality';

const actor = (t: DealTerm): Seat => (t.kind === 'giveInfluenceNow' ? t.from : t.who);

function grudge(s: GameState, seat: Seat, t: Seat): number {
  const ai = s.ai[seat]!;
  const rivals = living(s).filter((p) => p.seat !== seat);
  const top = Math.max(1, ...rivals.map((p) => believedLP(s, seat, p.seat)));
  return ai.hostility[t]! + (believedLP(s, seat, t) / top) * 0.6 - ai.trust[t]!;
}

/** Expected value of a deal for `seat`, after a trust discount on the partner's promises. */
export function evaluateDeal(s: GameState, seat: Seat, deal: Pick<Deal, 'proposer' | 'partner' | 'terms'>): number {
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const me = player(s, seat);
  const other = deal.proposer === seat ? deal.partner : deal.proposer;
  const tf = clamp(0.5 + ai.trust[other]! / 2, 0.1, 1); // how much their word is worth
  const pool = poolThreshold(s) !== null;
  const turnsLeft = s.config.totalTurns - s.turn;
  const w = s.config.ai;
  let ev = 0;
  for (const t of deal.terms) {
    const mine = actor(t) === seat;
    switch (t.kind) {
      case 'giveInfluenceNow':
        if (mine && me.influence < t.amount) return -99;
        ev += mine ? -t.amount * 0.45 * (0.6 + per.greed) : t.amount * 0.45;
        break;
      case 'willContribute':
        if (mine) {
          if (me.influence < t.min + s.modifiers.contributeSurcharge) return -99;
          ev -= t.min * 0.18 * (1.2 - per.cooperation) * (pool ? 1 : 2.5);
        } else {
          ev += t.min * 0.22 * tf * (pool ? 1 : 0.1);
        }
        break;
      case 'willNotSabotage':
        if (mine) ev -= ai.hostility[t.target]! * 0.8 + per.aggression * 0.15;
        else ev += t.target === seat ? 0.55 * tf : 0.05;
        break;
      case 'willSabotage':
        if (t.target === seat) return -99;
        if (mine) ev += grudge(s, seat, t.target) * 0.6 - w.hitReluctance - Math.max(0, ai.trust[t.target]!) * 0.5 - (me.influence < 4 ? 0.5 : 0);
        else ev += grudge(s, seat, t.target) * 0.5 * tf;
        break;
      case 'willVote':
        if (t.target === seat) return -99;
        if (typeof t.target === 'number') ev += mine ? grudge(s, seat, t.target) * 0.4 - 0.2 : grudge(s, seat, t.target) * 0.4 * tf;
        else ev += mine ? -0.15 : 0.1 * tf;
        break;
      case 'willInoculate':
        if (mine) {
          if (me.lp < INOCULATE_COST_LP + 1) return -99;
          ev -= 1.0 + (turnsLeft <= 2 ? 0.5 : 0);
        } else if (t.target === seat) {
          ev += (me.blight.bio + me.blight.neuro * 0.5) * Math.min(turnsLeft, 3) * 0.5 * tf;
        }
        break;
      case 'revealLP':
        ev += mine ? -0.2 : 0.15;
        break;
    }
  }
  return ev;
}

export function aiAcceptsDeal(s: GameState, seat: Seat, dealId: string): boolean {
  const deal = s.deals.find((d) => d.id === dealId);
  if (!deal || !s.ai[seat]) return false;
  const noise = (nextFloat(aiRng(s, seat, `deal${dealId}`)) - 0.5) * 0.2;
  return evaluateDeal(s, seat, deal) + noise > s.config.ai.acceptThreshold;
}

export type OfferKind = 'pact' | 'extort' | 'hit' | 'vote' | 'cure';

interface Offer {
  kind: OfferKind;
  partner: Seat;
  terms: DealTerm[];
  weight: number;
}

/** The vote this turn that deals can be made over, if any (not the Silent Ballot). */
function voteThisTurn(s: GameState): { cardId: string; ayeNay: boolean } | null {
  for (const cardId of [s.crisis?.faceDown ? undefined : s.crisis?.cardId, s.mandate?.cardId]) {
    if (!cardId) continue;
    const h = getHandler(cardId);
    if (h.silentVote) continue;
    if (h.vote === 'ayeNay') return { cardId, ayeNay: true };
    if (h.vote === 'target' || h.vote === 'twoTargets' || h.vote === 'open') return { cardId, ayeNay: false };
  }
  return null;
}

/** The deals this Councilor would like to propose right now, best first. */
export function candidateOffers(s: GameState, seat: Seat): Offer[] {
  const ai = s.ai[seat]!;
  const per = ai.personality;
  const me = player(s, seat);
  if (!canTrade(s, seat)) return [];
  const partners = living(s).filter((p) => p.seat !== seat && canTrade(s, p.seat)).map((p) => p.seat);
  if (partners.length === 0) return [];
  const byTrust = partners.slice().sort((a, b) => ai.trust[b]! - ai.trust[a]!);
  const n = living(s).length;
  const offers: Offer[] = [];

  // Cooperative: "we both Contribute k".
  const threshold = s.crisis?.faceDown ? null : poolThreshold(s);
  if (threshold !== null && currentCrisis(s)) {
    const k = Math.min(Math.ceil(threshold / n), me.influence - s.modifiers.contributeSurcharge);
    const partner = byTrust.find((x) => player(s, x).influence >= k + s.modifiers.contributeSurcharge);
    if (k >= 1 && partner !== undefined) {
      offers.push({
        kind: 'pact', partner, weight: per.cooperation + 0.2,
        terms: [{ kind: 'willContribute', who: seat, min: k }, { kind: 'willContribute', who: partner, min: k }],
      });
    }
  }
  // Greedy: sell non-aggression for Influence.
  const rich = partners.filter((x) => player(s, x).influence >= 3).sort((a, b) => player(s, b).influence - player(s, a).influence)[0];
  if (rich !== undefined) {
    offers.push({
      kind: 'extort', partner: rich, weight: per.greed * 0.9 + per.aggression * 0.2,
      terms: [{ kind: 'giveInfluenceNow', from: rich, amount: player(s, rich).influence >= 6 ? 2 : 1 }, { kind: 'willNotSabotage', who: seat, target: rich }],
    });
  }
  // Aggressive: "Sabotage the leader with me".
  const leader = partners.concat(living(s).filter((p) => p.seat !== seat).map((p) => p.seat))
    .reduce((a, b) => (believedLP(s, seat, b) > believedLP(s, seat, a) ? b : a));
  const ally = byTrust.find((x) => x !== leader);
  if (ally !== undefined && believedLP(s, seat, leader) > 0 && me.influence >= 2) {
    offers.push({
      kind: 'hit', partner: ally, weight: per.aggression * 0.9 + ai.hostility[leader]! * 0.4,
      terms: [{ kind: 'willSabotage', who: seat, target: leader }, { kind: 'willSabotage', who: ally, target: leader }],
    });
  }
  // A vote is coming: line up ballots.
  const vote = voteThisTurn(s);
  if (vote && !vote.ayeNay && n >= 3) {
    const victim = living(s).filter((p) => p.seat !== seat).map((p) => p.seat).reduce((a, b) => (grudge(s, seat, b) > grudge(s, seat, a) ? b : a));
    const friend = byTrust.find((x) => x !== victim);
    if (friend !== undefined) {
      offers.push({
        kind: 'vote', partner: friend, weight: 0.5 + per.vengefulness * 0.4,
        terms: [{ kind: 'willVote', who: seat, target: victim }, { kind: 'willVote', who: friend, target: victim }],
      });
    }
  }
  // Blight Wardens: sell the cure at an extortionate price.
  if (me.factionId === 'wardens' && abilitiesActive(s, seat) && !me.abilityUsedThisTurn && me.lp >= INOCULATE_COST_LP + 1) {
    const sick = partners.find((x) => player(s, x).blight.bio >= 1 && player(s, x).influence >= 4 && player(s, x).factionId !== 'wardens');
    if (sick !== undefined) {
      offers.push({
        kind: 'cure', partner: sick, weight: per.greed + 0.4,
        terms: [{ kind: 'giveInfluenceNow', from: sick, amount: 4 }, { kind: 'willInoculate', who: seat, target: sick }],
      });
    }
  }
  return offers.filter((o) => evaluateDeal(s, seat, { proposer: seat, partner: o.partner, terms: o.terms }) > -0.2)
    .sort((a, b) => b.weight - a.weight);
}

function pickOffer(rng: RngHolder, offers: Offer[]): Offer | null {
  if (offers.length === 0) return null;
  // Mostly the best fit, sometimes the runner-up.
  return offers.length > 1 && nextFloat(rng) < 0.25 ? offers[1]! : offers[0]!;
}

/** What one AI Councilor does in the Whisper: Whisper abilities first, then at most one offer. */
export function aiWhisperIntents(s: GameState, seat: Seat): { intents: Intent[]; offer: Offer | null } {
  const ai = s.ai[seat];
  const me = player(s, seat);
  if (!ai || me.eliminated) return { intents: [], offer: null };
  const per = ai.personality;
  const rng = aiRng(s, seat, 'whisper');
  const intents: Intent[] = [];
  const rivals = living(s).filter((p) => p.seat !== seat);
  const turnsLeft = s.config.totalTurns - s.turn;

  if (abilitiesActive(s, seat) && !me.abilityUsedThisTurn && rivals.length > 0) {
    if (me.factionId === 'scrubbers' && me.influence >= VENT_COST + 3 && nextFloat(rng) < per.greed) {
      const targets = rivals.filter((p) => p.influence >= 2 && p.status.silencedUntil < s.turn);
      if (targets.length) {
        const t = targets.reduce((a, b) => (ai.hostility[b.seat]! + b.influence * 0.05 > ai.hostility[a.seat]! + a.influence * 0.05 ? b : a));
        intents.push({ type: 'UseAbility', seat, ability: 'ventSector', target: t.seat });
      }
    }
    if (me.factionId === 'wardens' && me.lp >= 4 && (me.blight.bio - 1) * Math.min(turnsLeft, 3) >= 3) {
      intents.push({ type: 'UseAbility', seat, ability: 'inoculate', target: seat });
    }
    if (me.factionId === 'directorate') {
      // Subpoena whoever is believed to lead and has not been exposed recently.
      const fresh = rivals.filter((p) => !p.lpRevealed || p.lpRevealed.turn < s.turn - 1);
      if (fresh.length) {
        const t = fresh.reduce((a, b) => (believedLP(s, seat, b.seat) > believedLP(s, seat, a.seat) ? b : a));
        intents.push({ type: 'UseAbility', seat, ability: 'subpoena', target: t.seat });
      }
    }
  }
  const offer = nextFloat(rng) < s.config.ai.offerChance ? pickOffer(rng, candidateOffers(s, seat)) : null;
  if (offer) intents.push({ type: 'ProposeDeal', seat, partner: offer.partner, terms: offer.terms });
  return { intents, offer };
}

/** After a deal is accepted: a Warden delivers the cure it sold, the Choir may bind the deal. */
export function aiAfterDeal(s: GameState, deal: Deal): Intent[] {
  const out: Intent[] = [];
  for (const seat of [deal.proposer, deal.partner]) {
    const ai = s.ai[seat];
    if (!ai) continue;
    const me = player(s, seat);
    const other = seat === deal.proposer ? deal.partner : deal.proposer;
    for (const t of deal.terms) {
      if (t.kind === 'willInoculate' && t.who === seat) {
        const keep = nextFloat(aiRng(s, seat, `cure${deal.id}`)) < 0.35 + 0.65 * ai.personality.honesty;
        if (keep) out.push({ type: 'UseAbility', seat, ability: 'inoculate', target: t.target });
      }
    }
    const hasPromise = deal.terms.some((t) => t.kind !== 'giveInfluenceNow' && t.kind !== 'revealLP' && actor(t) === other);
    if (me.factionId === 'choir' && abilitiesActive(s, seat) && !me.oathUsedThisTurn && hasPromise && ai.trust[other]! < 0.4) {
      out.push({ type: 'UseAbility', seat, ability: 'bindingOath', dealId: deal.id });
    }
  }
  return out;
}
