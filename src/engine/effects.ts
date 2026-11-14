// The only functions that change resources. Each one clamps, updates stats and emits an event.
import { player, totalBlightInPlay } from './selectors';
import type { Ctx, GameEvent, PlayerStatus, Seat } from './types';

export function emit(ctx: Ctx, e: GameEvent): void {
  ctx.ev.push(e);
}

/** Changes Earth Health by `delta`, clamped to [0, maxEH]. Returns the real change. */
export function changeEH(ctx: Ctx, delta: number, cause: string): number {
  return setEH(ctx, ctx.s.eh + delta, cause);
}

export function setEH(ctx: Ctx, value: number, cause: string): number {
  const s = ctx.s;
  const to = Math.max(0, Math.min(s.maxEH, value));
  const from = s.eh;
  if (to === from) return 0;
  s.eh = to;
  emit(ctx, { type: 'EHChanged', from, to, cause });
  return to - from;
}

/** Influence never goes below 0. Returns the real change. */
export function changeInfluence(ctx: Ctx, seat: Seat, delta: number, cause: string): number {
  const p = player(ctx.s, seat);
  const to = Math.max(0, p.influence + delta);
  const real = to - p.influence;
  if (real === 0) return 0;
  p.influence = to;
  emit(ctx, { type: 'InfluenceChanged', seat, delta: real, cause });
  return real;
}

export interface LPOptions {
  /** Hidden from rivals (the default, SPEC §2.8). */
  hidden?: boolean;
  /** LP moved from another player rather than newly created; allowed under `noLPGain`. */
  transfer?: boolean;
}

/** LP never goes below 0; damage beyond 0 is wasted. Returns the real change. */
export function changeLP(ctx: Ctx, seat: Seat, delta: number, cause: string, opts: LPOptions = {}): number {
  const s = ctx.s;
  const p = player(s, seat);
  if (delta > 0 && s.modifiers.noLPGain && !opts.transfer) return 0;
  const to = Math.max(0, p.lp + delta);
  const real = to - p.lp;
  if (real === 0) return 0;
  p.lp = to;
  if (real > 0 && !opts.transfer) p.stats.lpForged += real;
  if (real < 0 && !opts.transfer) p.stats.lpDestroyed += -real;
  emit(ctx, { type: 'LPChanged', seat, delta: real, cause, hidden: opts.hidden ?? true });
  return real;
}

/** Adds Blight Cubes, respecting the global cap. Returns how many were actually placed. */
export function addBlight(ctx: Ctx, seat: Seat, kind: 'bio' | 'neuro', count: number, cause: string): number {
  const s = ctx.s;
  const p = player(s, seat);
  const room = Math.max(0, s.config.blightCap - totalBlightInPlay(s));
  const n = Math.min(count, room);
  if (n <= 0) return 0;
  p.blight[kind] += n;
  emit(ctx, { type: 'BlightChanged', seat, bio: p.blight.bio, neuro: p.blight.neuro, cause });
  return n;
}

/** Removes up to `count` cubes, bio first. Returns how many were removed. */
export function removeBlight(ctx: Ctx, seat: Seat, count: number, cause: string): number {
  const p = player(ctx.s, seat);
  let removed = 0;
  while (removed < count && p.blight.bio + p.blight.neuro > 0) {
    if (p.blight.bio > 0) p.blight.bio--;
    else p.blight.neuro--;
    removed++;
  }
  if (removed > 0) emit(ctx, { type: 'BlightChanged', seat, bio: p.blight.bio, neuro: p.blight.neuro, cause });
  return removed;
}

type TimedStatus = {
  [K in keyof PlayerStatus]: PlayerStatus[K] extends number ? K : never;
}[keyof PlayerStatus];
type FlagStatus = Exclude<keyof PlayerStatus, TimedStatus>;

/** Applies a timed status that covers turns up to and including `until`. */
export function applyTimedStatus(ctx: Ctx, seat: Seat, status: TimedStatus, until: number): void {
  const p = player(ctx.s, seat);
  if (until <= p.status[status]) return;
  p.status[status] = until;
  emit(ctx, { type: 'StatusApplied', seat, status, until });
}

export function setFlagStatus(ctx: Ctx, seat: Seat, status: FlagStatus, on: boolean): void {
  const p = player(ctx.s, seat);
  if (p.status[status] === on) return;
  p.status[status] = on;
  emit(ctx, on ? { type: 'StatusApplied', seat, status } : { type: 'StatusCleared', seat, status });
}

export function eliminate(ctx: Ctx, seat: Seat, cause: string): void {
  const s = ctx.s;
  const p = player(s, seat);
  if (p.eliminated) return;
  p.eliminated = true;
  p.eliminatedCause = cause;
  p.eliminatedTurn = s.turn;
  p.dial = null;
  p.dialLocked = false;
  p.queuedDial = null;
  s.pending = s.pending.filter((d) => d.seat !== seat);
  emit(ctx, { type: 'PlayerDeleted', seat, cause });
}

/** Ends the main game because a card said so (the Crucible follows at the end-of-turn gate). */
export function endMainGame(ctx: Ctx, cause: 'card' | 'collapse' | 'attrition' | 'turnLimit'): void {
  const s = ctx.s;
  if (s.mainOver) return;
  s.mainOver = { cause, turn: s.turn };
  emit(ctx, { type: 'MainGameOver', cause });
}

/** Reveals a player's exact LP, to everyone or privately to one seat. */
export function revealLP(ctx: Ctx, seat: Seat, to: Seat | 'all'): void {
  const s = ctx.s;
  const p = player(s, seat);
  const fact = { value: p.lp, turn: s.turn };
  if (to === 'all') p.lpRevealed = fact;
  else p.lpShownTo[String(to)] = fact;
  emit(ctx, { type: 'LPRevealed', seat, value: p.lp, to });
}
