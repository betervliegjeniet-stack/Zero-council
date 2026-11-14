import { eliminate, endMainGame, setFlagStatus } from '../effects';
import { living } from '../selectors';
import type { Ctx, Seat } from '../types';
import { hitFlag } from './hit';

/** CR-40 / FIN-04: the 2 highest-LP players (plus ties) enter the Crucible; the rest are deleted. */
export function totalCrucible(ctx: Ctx, cause: string): void {
  const s = ctx.s;
  const ranked = living(s).sort((a, b) => b.lp - a.lp);
  if (ranked.length > 2) {
    const cutoff = ranked[1]!.lp;
    for (const p of ranked) if (p.lp < cutoff) eliminate(ctx, p.seat, cause);
  }
  endMainGame(ctx, 'card');
}

/** Permanent loss of faction abilities. Shieldable when it comes from a Crisis card. */
export function exile(ctx: Ctx, seat: Seat): void {
  hitFlag(ctx, seat, 'exiled');
}

/** Exile that cannot be shielded (Mandates and Finale cards). */
export function exileNow(ctx: Ctx, seat: Seat): void {
  setFlagStatus(ctx, seat, 'exiled', true);
}

export const seatOf = (option: string): Seat => Number(option);
