// Apex Mandates and the Finale card (SPEC §2.2, §2.9), resolved at the end of Phase 4.
import { getHandler } from '../cards';
import { getCard } from '../data';
import { changeEH, setEH } from '../effects';
import { queueNext, resetScratch } from '../flow';
import type { Ctx } from '../types';
import { drawMandate } from './crisis';

export function resolveMandate(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'deals';
  drawMandate(ctx); // no-op if already revealed at turn start, or if this turn has none
  if (!s.mandate) return;
  const card = getCard(s.mandate.cardId);
  const h = getHandler(card.id);
  resetScratch(ctx);
  s.vote = null;
  if (!h.customEH && card.eh.timing === 'reveal') {
    if (card.eh.op === 'delta') changeEH(ctx, card.eh.value, card.id);
    else if (card.eh.op === 'set') setEH(ctx, card.eh.value, card.id);
  }
  if (h.resolve) queueNext(ctx, { k: 'effect', cardId: card.id, hook: 'resolve' });
  else if (h.vote) queueNext(ctx, { k: 'startVote', cardId: card.id });
  else if (h.flowStart) queueNext(ctx, { k: 'cardFlow', cardId: card.id, stage: h.flowStart });
}
