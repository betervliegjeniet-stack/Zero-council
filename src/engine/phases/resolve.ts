// Phase 3 bookkeeping and Phase 4, Resolution (SPEC §2.4).
import { HANDLERS, isImplemented } from '../cards';
import { getCard } from '../data';
import { changeEH, emit } from '../effects';
import { living, player, turnOrder } from '../selectors';
import type { Ctx, Dial, Seat } from '../types';
import { IllegalIntentError } from '../types';
import { dialOptions, resolveAction, validateDial } from './actions';

export function openDials(ctx: Ctx): void {
  const s = ctx.s;
  for (const p of living(s)) {
    const options = dialOptions(s, p.seat).filter((o) => o.available).map((o) => o.action);
    s.pending.push({ id: `d${s.nextId++}`, seat: p.seat, kind: 'dial', options });
  }
  s.step = 'dials';
  emit(ctx, { type: 'DialsOpened' });
}

function requireDialDecision(ctx: Ctx, seat: Seat): void {
  const s = ctx.s;
  if (s.step !== 'dials' || !s.pending.some((d) => d.seat === seat && d.kind === 'dial')) {
    throw new IllegalIntentError(`Seat ${seat} has no dial to set right now`);
  }
}

export function setDial(ctx: Ctx, seat: Seat, dial: Dial): void {
  requireDialDecision(ctx, seat);
  validateDial(ctx.s, seat, dial);
  player(ctx.s, seat).dial = { ...dial };
}

export function lockDial(ctx: Ctx, seat: Seat): void {
  requireDialDecision(ctx, seat);
  const s = ctx.s;
  const p = player(s, seat);
  if (!p.dial) throw new IllegalIntentError(`Seat ${seat} has not set a dial`);
  validateDial(s, seat, p.dial);
  p.dialLocked = true;
  s.pending = s.pending.filter((d) => !(d.seat === seat && d.kind === 'dial'));
  emit(ctx, { type: 'DialLocked', seat });
}

export function revealDials(ctx: Ctx): void {
  const s = ctx.s;
  const dials = turnOrder(s)
    .filter((seat) => player(s, seat).dial)
    .map((seat) => ({ seat, dial: player(s, seat).dial! }));
  emit(ctx, { type: 'DialsRevealed', dials });
  s.step = 'actions';
}

export function resolveActions(ctx: Ctx): void {
  const s = ctx.s;
  for (const seat of turnOrder(s)) {
    const p = player(s, seat);
    if (p.dial) resolveAction(ctx, seat, p.dial);
  }
  s.step = 'mitigation';
}

/** Checks the Crisis mitigation and applies the `unmitigated` EH change on failure. */
export function checkMitigation(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'cardResolve';
  if (!s.crisis) return;
  const card = getCard(s.crisis.cardId);
  if (s.crisis.faceDown) {
    s.crisis.faceDown = false;
    emit(ctx, { type: 'CardRevealed', cardId: card.id, deck: 'crisis', faceDown: false });
  }
  if (card.eh.timing !== 'unmitigated' && card.mitigation.kind !== 'pool_influence') return;

  let success = false;
  let pool = 0;
  if (card.mitigation.kind === 'pool_influence') {
    pool = Math.max(0, s.crisis.pool - s.modifiers.poolLeak);
    success = pool >= card.mitigation.amount;
  }
  // Volunteer and LP-pledge mitigations (CR-20, CR-26) get their prompts in M2; until then they fail.
  s.crisis.mitigated = success;
  emit(ctx, { type: 'MitigationResult', cardId: card.id, success, pool, threshold: card.mitigation.amount });
  if (success) return;
  if (card.eh.timing === 'unmitigated' && card.eh.op === 'delta') changeEH(ctx, card.eh.value, card.id);
  if (card.tags.includes('endsGameOnFail') && !s.mainOver) {
    s.mainOver = { cause: 'card', turn: s.turn };
    emit(ctx, { type: 'MainGameOver', cause: 'card' });
  }
}

/** Card-specific resolution (penalties, choices, votes). Handlers arrive in M2. */
export function resolveCrisisCard(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'deals';
  if (!s.crisis) return;
  const card = getCard(s.crisis.cardId);
  const handler = HANDLERS[card.id];
  if (handler?.onResolve) handler.onResolve(ctx, s.crisis.mitigated);
  else if (!isImplemented(card)) emit(ctx, { type: 'CardSkipped', cardId: card.id, reason: 'Special rules arrive in M2' });
}

/** Promise checking for accepted deals. Arrives with the deal model in M2. */
export function checkDeals(ctx: Ctx): void {
  ctx.s.step = 'mandate';
}

export function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (s.crisis) s.piles.crisisDiscard.push(s.crisis.cardId);
  if (s.mandate && getCard(s.mandate.cardId).deck === 'mandate') s.piles.mandateDiscard.push(s.mandate.cardId);
  s.crisis = null;
  s.mandate = null;
  emit(ctx, { type: 'TurnEnded', turn: s.turn });
  if (!s.mainOver && s.turn >= s.config.totalTurns) {
    s.mainOver = { cause: 'turnLimit', turn: s.turn };
    emit(ctx, { type: 'MainGameOver', cause: 'turnLimit' });
  }
  s.step = s.mainOver ? 'crucibleStart' : 'turnStart';
}
