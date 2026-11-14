// Apex Mandates and the Finale card (SPEC §2.9). M1 draws and reveals them; the Black Urn
// voting system and the 24 handlers arrive in M2.
import { HANDLERS } from '../cards';
import { emit } from '../effects';
import type { Ctx } from '../types';
import { drawMandate } from './crisis';

export function resolveMandate(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'turnEndGate';
  drawMandate(ctx); // no-op if already revealed at turn start, or if this turn has none
  if (!s.mandate) return;
  const handler = HANDLERS[s.mandate.cardId];
  if (handler?.onResolve) handler.onResolve(ctx, null);
  else emit(ctx, { type: 'CardSkipped', cardId: s.mandate.cardId, reason: 'Urn votes arrive in M2' });
}
