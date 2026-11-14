// The Crucible (SPEC §2.10): blind-bid rounds until one or nobody is left.
import { changeInfluence, changeLP, eliminate, emit } from '../effects';
import { living, player } from '../selectors';
import type { Ctx, MainEndCause, Seat } from '../types';
import { IllegalIntentError } from '../types';

/** Total Collapse penalty (SPEC §2.3): if the bunker failed, everyone bleeds. */
function applyCollapsePenalty(ctx: Ctx): void {
  const s = ctx.s;
  const alive = living(s);
  if (alive.length === 0) return;
  const least = Math.min(...alive.map((p) => p.contributedTotal));
  const lowest = alive.filter((p) => p.contributedTotal === least).map((p) => p.seat);
  emit(ctx, { type: 'CollapsePenalty', lowestContributors: lowest });
  for (const p of alive) changeLP(ctx, p.seat, -Math.floor(p.lp / 2), 'collapse');
  for (const seat of lowest) changeLP(ctx, seat, -s.config.collapseLowestContributorExtraLP, 'collapseLowestContributor');
}

export function startCrucible(ctx: Ctx): void {
  const s = ctx.s;
  s.pending = [];
  s.whisper = null;
  if (s.config.collapsePenalty && s.eh === 0) applyCollapsePenalty(ctx);
  emit(ctx, { type: 'CrucibleStarted', seats: living(s).map((p) => p.seat) });
  // Influence becomes worthless.
  for (const p of living(s)) changeInfluence(ctx, p.seat, -p.influence, 'crucible');
  s.crucible = { round: 0, bids: {} };
  s.step = 'crucibleOpen';
}

function finish(ctx: Ctx): void {
  const s = ctx.s;
  const alive = living(s);
  const mainEndCause: MainEndCause = s.mainOver?.cause ?? 'turnLimit';
  s.outcome = alive.length === 1
    ? { kind: 'survivor', seat: alive[0]!.seat, mainEndCause }
    : { kind: 'extinction', mainEndCause };
  s.pending = [];
  s.step = 'ended';
  emit(ctx, { type: 'GameEnded', outcome: s.outcome });
}

export function openCrucibleRound(ctx: Ctx): void {
  const s = ctx.s;
  const alive = living(s);
  if (alive.length <= 1) return finish(ctx);
  const cr = s.crucible!;
  cr.round += 1;
  cr.bids = {};
  for (const p of alive) {
    s.pending.push({ id: `b${s.nextId++}`, seat: p.seat, kind: 'crucibleBid', options: [], min: 0, max: p.lp });
  }
  s.step = 'crucibleBids';
  emit(ctx, { type: 'CrucibleRoundOpened', round: cr.round, seats: alive.map((p) => p.seat) });
}

export function submitBid(ctx: Ctx, seat: Seat, amount: number): void {
  const s = ctx.s;
  const decision = s.pending.find((d) => d.seat === seat && d.kind === 'crucibleBid');
  if (s.step !== 'crucibleBids' || !decision) throw new IllegalIntentError(`Seat ${seat} has no bid to make right now`);
  if (!Number.isInteger(amount) || amount < 0 || amount > player(s, seat).lp) {
    throw new IllegalIntentError(`Bid must be 0..${player(s, seat).lp}`);
  }
  s.crucible!.bids[String(seat)] = amount;
  s.pending = s.pending.filter((d) => d !== decision);
  emit(ctx, { type: 'BidLocked', seat });
}

/**
 * Fists open. The lowest bidder is deleted; among tied lowest bidders the one with the fewest LP
 * left after the bid goes; if that is still tied, all of them go. Every bid is destroyed.
 */
export function resolveCrucibleRound(ctx: Ctx): void {
  const s = ctx.s;
  const cr = s.crucible!;
  const bids = living(s).map((p) => ({ seat: p.seat, amount: cr.bids[String(p.seat)] ?? 0 }));
  emit(ctx, { type: 'BidsRevealed', round: cr.round, bids });

  const lowestBid = Math.min(...bids.map((b) => b.amount));
  const tied = bids.filter((b) => b.amount === lowestBid);
  const remaining = (b: { seat: Seat; amount: number }) => player(s, b.seat).lp - b.amount;
  const fewestLeft = Math.min(...tied.map(remaining));
  let deleted = tied.filter((b) => remaining(b) === fewestLeft).map((b) => b.seat);
  // Balance lever B2: if the tie would wipe out everyone who is left, the Councilor who did the
  // most for the bunker is spared. Still tied on contribution: Total Extinction.
  if (s.config.crucibleExtinctionTieBreak === 'contribution' && deleted.length === bids.length && deleted.length > 1) {
    const most = Math.max(...deleted.map((seat) => player(s, seat).contributedTotal));
    const spared = deleted.filter((seat) => player(s, seat).contributedTotal === most);
    if (spared.length === 1) deleted = deleted.filter((seat) => seat !== spared[0]);
  }

  for (const b of bids) changeLP(ctx, b.seat, -b.amount, 'crucibleBid');
  for (const seat of deleted) eliminate(ctx, seat, 'crucible');

  if (living(s).length <= 1) finish(ctx);
  else s.step = 'crucibleOpen';
}
