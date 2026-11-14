// Personal penalties dealt by cards. A seat protected by Martial Law ignores them, and a dry
// run records who would be hit so the engine knows whom to offer Martial Law to.
import { addBlight, applyTimedStatus, changeInfluence, changeLP, setFlagStatus, type LPOptions } from '../effects';
import { player } from '../selectors';
import type { Ctx, PlayerStatus, Seat } from '../types';

function shielded(ctx: Ctx, seat: Seat): boolean {
  return ctx.shield?.has(seat) ?? false;
}

/** Destroys up to `amount` LP. Returns the LP actually lost (0 if shielded). */
export function hitLP(ctx: Ctx, seat: Seat, amount: number, cause: string, opts: LPOptions = {}): number {
  if (amount <= 0 || shielded(ctx, seat)) return 0;
  const lost = -changeLP(ctx, seat, -amount, cause, opts);
  if (lost > 0) ctx.hits?.add(seat);
  return lost;
}

export function hitInfluence(ctx: Ctx, seat: Seat, amount: number, cause: string): number {
  if (amount <= 0 || shielded(ctx, seat)) return 0;
  const lost = -changeInfluence(ctx, seat, -amount, cause);
  if (lost > 0) ctx.hits?.add(seat);
  return lost;
}

export function hitBlight(ctx: Ctx, seat: Seat, kind: 'bio' | 'neuro', count: number, cause: string): void {
  if (shielded(ctx, seat)) return;
  if (addBlight(ctx, seat, kind, count, cause) > 0) ctx.hits?.add(seat);
}

type Timed = 'embargoedUntil' | 'abilitiesDisabledUntil' | 'silencedUntil' | 'noTradeUntil'
  | 'noGatherUntil' | 'noSabotageSalvageUntil' | 'gatherYield0Until' | 'conscriptedUntil';
type Flag = Exclude<keyof PlayerStatus, Timed>;

export function hitTimed(ctx: Ctx, seat: Seat, status: Timed, until: number): void {
  if (shielded(ctx, seat)) return;
  if (until > player(ctx.s, seat).status[status]) ctx.hits?.add(seat);
  applyTimedStatus(ctx, seat, status, until);
}

export function hitFlag(ctx: Ctx, seat: Seat, status: Flag): void {
  if (shielded(ctx, seat)) return;
  if (!player(ctx.s, seat).status[status]) ctx.hits?.add(seat);
  setFlagStatus(ctx, seat, status, true);
}
