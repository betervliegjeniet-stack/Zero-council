// The deal data model and promise checking (SPEC §4.2).
import { getHandler } from './cards';
import { changeInfluence, changeLP, emit, revealLP } from './effects';
import { canTrade, player } from './selectors';
import type { Ctx, Deal, DealTerm, GameState, Seat } from './types';
import { IllegalIntentError } from './types';

const actor = (t: DealTerm): Seat => (t.kind === 'giveInfluenceNow' ? t.from : t.who);

function validateTerm(s: GameState, deal: { proposer: Seat; partner: Seat }, t: DealTerm): void {
  const who = actor(t);
  if (who !== deal.proposer && who !== deal.partner) throw new IllegalIntentError('A deal term must bind one of its two parties');
  const alive = (seat: Seat) => s.players[seat] !== undefined && !s.players[seat]!.eliminated;
  switch (t.kind) {
    case 'giveInfluenceNow':
      if (!Number.isInteger(t.amount) || t.amount < 1) throw new IllegalIntentError('Influence gift must be at least 1');
      break;
    case 'willContribute':
      if (!Number.isInteger(t.min) || t.min < 1) throw new IllegalIntentError('Contribute promise must be at least 1');
      break;
    case 'willNotSabotage':
    case 'willSabotage':
      if (!alive(t.target) || t.target === who) throw new IllegalIntentError('Sabotage term needs a living rival as target');
      break;
    case 'willVote':
      if (t.target !== 'aye' && t.target !== 'nay' && (!alive(t.target) || t.target === who)) {
        throw new IllegalIntentError('Vote term needs aye, nay or a living rival');
      }
      break;
    case 'willInoculate':
      if (player(s, who).factionId !== 'wardens' || !alive(t.target)) throw new IllegalIntentError('Only the Blight Wardens can promise to Inoculate');
      break;
    case 'revealLP':
      break;
  }
}

export function proposeDeal(ctx: Ctx, seat: Seat, partner: Seat, terms: DealTerm[]): void {
  const s = ctx.s;
  if (s.step !== 'whisper') throw new IllegalIntentError('Deals can only be made during the Whisper Campaign');
  if (seat === partner || !s.players[partner]) throw new IllegalIntentError('A deal needs a rival as partner');
  if (!canTrade(s, seat) || !canTrade(s, partner)) throw new IllegalIntentError('A Silenced or quarantined-from-trade player cannot deal');
  if (terms.length < 1 || terms.length > 4) throw new IllegalIntentError('A deal has 1 to 4 terms');
  for (const side of [seat, partner]) {
    if (terms.filter((t) => actor(t) === side).length > 2) throw new IllegalIntentError('At most 2 terms per side');
  }
  terms.forEach((t) => validateTerm(s, { proposer: seat, partner }, t));

  // Pace limits (SPEC §4.2): the human sends at most 3 offers per Whisper; nobody sends more than 2 to one seat.
  const mine = s.deals.filter((d) => d.turn === s.turn && d.proposer === seat);
  if (player(s, seat).isHuman && mine.length >= 3) throw new IllegalIntentError('You may send 3 offers per Whisper');
  if (!player(s, seat).isHuman && mine.filter((d) => d.partner === partner).length >= 2) {
    throw new IllegalIntentError('At most 2 offers to the same Councilor per Whisper');
  }
  const deal: Deal = { id: `deal${s.nextId++}`, proposer: seat, partner, terms, status: 'offered', binding: false, turn: s.turn, breakers: [] };
  s.deals.push(deal);
  emit(ctx, { type: 'DealProposed', dealId: deal.id, proposer: seat, partner });
}

export function respondDeal(ctx: Ctx, seat: Seat, dealId: string, accept: boolean): void {
  const s = ctx.s;
  const deal = s.deals.find((d) => d.id === dealId);
  if (!deal || deal.partner !== seat || deal.status !== 'offered' || deal.turn !== s.turn || s.step !== 'whisper') {
    throw new IllegalIntentError(`Seat ${seat} cannot answer deal ${dealId}`);
  }
  if (!accept) {
    deal.status = 'rejected';
    emit(ctx, { type: 'DealRejected', dealId });
    return;
  }
  if (!canTrade(s, deal.proposer) || !canTrade(s, deal.partner)) throw new IllegalIntentError('A party can no longer deal');
  for (const t of deal.terms) {
    if (t.kind === 'giveInfluenceNow' && player(s, t.from).influence < t.amount) {
      throw new IllegalIntentError('The giver no longer has that much Influence');
    }
  }
  deal.status = 'accepted';
  player(s, deal.proposer).stats.dealsMade += 1;
  player(s, deal.partner).stats.dealsMade += 1;
  emit(ctx, { type: 'DealAccepted', dealId, proposer: deal.proposer, partner: deal.partner });
  // Immediate terms are executed on accept and are binding by nature.
  for (const t of deal.terms) {
    const other = (who: Seat) => (who === deal.proposer ? deal.partner : deal.proposer);
    if (t.kind === 'giveInfluenceNow') {
      changeInfluence(ctx, t.from, -t.amount, 'deal');
      changeInfluence(ctx, other(t.from), t.amount, 'deal');
    } else if (t.kind === 'revealLP') {
      revealLP(ctx, t.who, other(t.who));
    }
  }
}

/** Offers nobody answered expire when the Whisper ends. */
export function expireOffers(ctx: Ctx): void {
  for (const d of ctx.s.deals) {
    if (d.status === 'offered') {
      d.status = 'expired';
      emit(ctx, { type: 'DealExpired', dealId: d.id });
    }
  }
}

type Verdict = 'kept' | 'broken' | 'void';

function judge(s: GameState, t: DealTerm): Verdict {
  const who = actor(t);
  const p = player(s, who);
  if (p.eliminated) return 'void';
  const did = p.acted && !p.acted.fizzled ? p.acted.dial : null;
  switch (t.kind) {
    case 'giveInfluenceNow':
    case 'revealLP':
      return 'kept';
    case 'willContribute':
      return did?.action === 'contribute' && (did.amount ?? 0) >= t.min ? 'kept' : 'broken';
    case 'willSabotage':
      return did?.action === 'sabotage' && did.target === t.target ? 'kept' : 'broken';
    case 'willNotSabotage':
      return did?.action === 'sabotage' && did.target === t.target ? 'broken' : 'kept';
    case 'willInoculate':
      return s.inoculations.some((i) => i.by === who && i.target === t.target) ? 'kept' : 'broken';
    case 'willVote': {
      // Checked against the first fitting vote of this turn; void if there was none (or it was silent).
      const wantsAyeNay = t.target === 'aye' || t.target === 'nay';
      const vote = s.votesThisTurn.find((v) =>
        (v.type === 'ayeNay') === wantsAyeNay && v.type !== 'mercy' && v.ballots[String(who)] !== undefined && !getHandler(v.cardId).silentVote);
      if (!vote) return 'void';
      return vote.ballots[String(who)] === String(t.target) ? 'kept' : 'broken';
    }
  }
}

/** After Phase 4: check every accepted deal of this turn against what actually happened. */
export function checkDeals(ctx: Ctx): void {
  const s = ctx.s;
  for (const deal of s.deals) {
    if (deal.turn !== s.turn || deal.status !== 'accepted') continue;
    const parties = [deal.proposer, deal.partner];
    // Self-Quarantine voids that player's promise-deals: no trust change, no Binding Oath penalty.
    if (parties.some((seat) => player(s, seat).acted?.dial.action === 'quarantine')) {
      deal.status = 'voided';
      emit(ctx, { type: 'DealVoided', dealId: deal.id, reason: 'Self-Quarantine' });
      continue;
    }
    const breakers = new Set<Seat>();
    for (const t of deal.terms) if (judge(s, t) === 'broken') breakers.add(actor(t));
    if (breakers.size === 0) {
      deal.status = 'kept';
      emit(ctx, { type: 'DealKept', dealId: deal.id });
      continue;
    }
    deal.status = 'broken';
    deal.breakers = [...breakers];
    emit(ctx, { type: 'DealBroken', dealId: deal.id, breakers: deal.breakers, binding: deal.binding });
    for (const seat of parties) {
      if (breakers.has(seat)) {
        player(s, seat).stats.dealsBroken += 1;
        if (deal.binding) changeLP(ctx, seat, -s.config.bindingOathPenaltyLP, 'bindingOath');
      } else {
        player(s, seat).stats.timesBetrayed += 1;
      }
    }
  }
}
