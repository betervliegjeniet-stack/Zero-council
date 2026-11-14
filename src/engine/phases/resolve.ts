// Phase 3 bookkeeping and Phase 4, Resolution (SPEC §2.4).
import { offerParanoia } from '../abilities';
import { getHandler } from '../cards';
import { getCard } from '../data';
import { changeEH, changeLP, emit, endMainGame } from '../effects';
import { ask, queueNext, resetScratch } from '../flow';
import { pick, randInt } from '../rng';
import { effectiveThreshold, living, player, turnOrder } from '../selectors';
import type { Ctx, Dial, GameState, Seat } from '../types';
import { IllegalIntentError } from '../types';
import { actionCost, dialOptions, resolveAction, validateDial } from './actions';

function askDial(ctx: Ctx, seat: Seat): void {
  const options = dialOptions(ctx.s, seat).filter((o) => o.available).map((o) => o.action);
  ask(ctx, { seat, kind: 'dial', options });
}

/** CR-23 / BS-01: the dial lands on a random legal action with a random target and amount. */
export function randomDial(s: GameState, seat: Seat): Dial {
  const open = dialOptions(s, seat).filter((o) => o.available);
  const o = pick(s, open);
  const dial: Dial = { action: o.action };
  if (o.targets && (o.action === 'sabotage' || o.action === 'salvage')) {
    const affordable = o.targets.filter((t) => actionCost(s, seat, { action: o.action, target: t }) <= player(s, seat).influence);
    dial.target = pick(s, affordable.length ? affordable : o.targets);
  }
  if (o.action === 'contribute') dial.amount = randInt(s, o.minAmount!, o.maxAmount!);
  return dial;
}

export function openDials(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'dials';
  emit(ctx, { type: 'DialsOpened' });
  if (s.modifiers.randomActions) {
    for (const p of living(s)) {
      p.dial = randomDial(s, p.seat);
      p.dialLocked = true;
      emit(ctx, { type: 'DialSpun', seat: p.seat });
    }
  } else if (s.modifiers.revealSequential) {
    // CR-09: one at a time in turn order; later players see the earlier dials.
    const first = turnOrder(s)[0];
    if (first !== undefined) askDial(ctx, first);
  } else {
    for (const p of living(s)) askDial(ctx, p.seat);
  }
  // CR-26: a secret LP Pledge next to the dial.
  const card = s.crisis ? getCard(s.crisis.cardId) : null;
  if (card?.mitigation.kind === 'pool_lp') {
    for (const p of living(s)) {
      if (p.lp > 0) ask(ctx, { seat: p.seat, kind: 'lpPledge', options: [], min: 0, max: p.lp, sourceCardId: card.id });
    }
  }
}

function requireDialDecision(ctx: Ctx, seat: Seat): void {
  if (!ctx.s.pending.some((d) => d.seat === seat && d.kind === 'dial')) {
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
  if (s.modifiers.revealSequential && s.step === 'dials') {
    emit(ctx, { type: 'DialRevealedEarly', seat, dial: p.dial });
    const next = turnOrder(s).find((x) => !player(s, x).dialLocked);
    if (next !== undefined) askDial(ctx, next);
  }
}

export function pledgeLP(ctx: Ctx, seat: Seat, amount: number): void {
  const s = ctx.s;
  const d = s.pending.find((x) => x.seat === seat && x.kind === 'lpPledge');
  if (!d) throw new IllegalIntentError(`Seat ${seat} has no LP Pledge to make`);
  if (!Number.isInteger(amount) || amount < 0 || amount > player(s, seat).lp) {
    throw new IllegalIntentError(`Pledge must be 0..${player(s, seat).lp}`);
  }
  player(s, seat).lpPledge = amount;
  s.pending = s.pending.filter((x) => x !== d);
}

/** After every dial is locked: the Quiet Choir may peek (Whispered Paranoia). */
export function paranoiaWindow(ctx: Ctx): void {
  ctx.s.step = 'reveal';
  offerParanoia(ctx);
}

export function revealDials(ctx: Ctx): void {
  const s = ctx.s;
  const dials = turnOrder(s)
    .filter((seat) => player(s, seat).dial)
    .map((seat) => ({ seat, dial: player(s, seat).dial! }));
  emit(ctx, { type: 'DialsRevealed', dials });
  // CR-19: anyone whose dial differs from their announcement is exposed.
  for (const { seat, dial } of dials) {
    const said = s.announced[String(seat)];
    if (said && said !== dial.action) emit(ctx, { type: 'LiarExposed', seat, announced: said, actual: dial.action });
  }
  s.step = 'actions';
}

export function resolveActions(ctx: Ctx): void {
  const s = ctx.s;
  const order = turnOrder(s);
  // Dials queued by last turn's Mass Paranoia resolve after this turn's actions.
  const queued = order.map((seat) => ({ seat, dial: player(s, seat).queuedDial })).filter((q) => q.dial);
  for (const p of s.players) p.queuedDial = null;

  if (s.modifiers.delayActions) {
    for (const seat of order) {
      const p = player(s, seat);
      if (!p.dial) continue;
      p.queuedDial = p.dial;
      p.acted = { dial: p.dial, fizzled: false };
    }
    emit(ctx, { type: 'ActionsQueued' });
  } else {
    for (const seat of order) {
      const p = player(s, seat);
      if (p.dial) resolveAction(ctx, seat, p.dial);
    }
  }
  for (const q of queued) resolveAction(ctx, q.seat, q.dial!, true);
  s.step = 'mitigation';
}

/** Works out whether the Crisis was mitigated. Volunteer prompts (CR-20) may make this wait. */
export function checkMitigation(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'mitigationDone';
  if (!s.crisis) return;
  const card = getCard(s.crisis.cardId);
  if (s.crisis.faceDown) {
    s.crisis.faceDown = false;
    emit(ctx, { type: 'CardRevealed', cardId: card.id, deck: 'crisis', faceDown: false });
  }
  switch (card.mitigation.kind) {
    case 'pool_influence':
      s.crisis.pool = Math.max(0, s.crisis.pool - s.modifiers.poolLeak);
      s.crisis.mitigated = s.crisis.pool >= effectiveThreshold(s, card);
      break;
    case 'pool_lp': {
      // CR-26: pledges are destroyed on success and refunded on failure (by default).
      const pledgers = living(s).filter((p) => p.lpPledge > 0);
      const total = pledgers.reduce((sum, p) => sum + Math.min(p.lpPledge, p.lp), 0);
      const success = total >= card.mitigation.amount;
      const destroyed = success || !s.config.lpPledgeRefundOnFail;
      emit(ctx, { type: 'PledgesRevealed', total, needed: card.mitigation.amount, destroyed });
      if (destroyed) pledgers.forEach((p) => changeLP(ctx, p.seat, -p.lpPledge, card.id));
      s.crisis.pool = total;
      s.crisis.mitigated = success;
      break;
    }
    case 'volunteer_lp':
      queueNext(ctx, { k: 'volunteerNext', index: 0 });
      break;
    default:
      break;
  }
}

/** Announces the mitigation result and applies the `unmitigated` EH change on failure. */
export function finishMitigation(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'cardResolve';
  if (!s.crisis || s.crisis.mitigated === null) return;
  const card = getCard(s.crisis.cardId);
  const handler = getHandler(card.id);
  const success = s.crisis.mitigated;
  emit(ctx, { type: 'MitigationResult', cardId: card.id, success, pool: s.crisis.pool, threshold: effectiveThreshold(s, card) });
  if (success) return;
  const skipEH = handler.customEH || handler.skipFailEH?.(s);
  if (!skipEH && card.eh.timing === 'unmitigated' && card.eh.op === 'delta') changeEH(ctx, card.eh.value, card.id);
  if (card.tags.includes('endsGameOnFail')) endMainGame(ctx, 'card');
}

/** Card-specific resolution: penalties, then a vote, then any interactive flow. */
export function resolveCrisisCard(ctx: Ctx): void {
  const s = ctx.s;
  s.step = 'mandate';
  if (!s.crisis) return;
  const cardId = s.crisis.cardId;
  const h = getHandler(cardId);
  resetScratch(ctx);
  if (h.resolve) queueNext(ctx, { k: 'effect', cardId, hook: 'resolve' });
  else if (h.vote) queueNext(ctx, { k: 'startVote', cardId });
  else if (h.flowStart) queueNext(ctx, { k: 'cardFlow', cardId, stage: h.flowStart });
}

export function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (s.crisis) s.piles.crisisDiscard.push(s.crisis.cardId);
  if (s.mandate && getCard(s.mandate.cardId).deck === 'mandate') s.piles.mandateDiscard.push(s.mandate.cardId);
  s.crisis = null;
  s.mandate = null;
  s.vote = null;
  emit(ctx, { type: 'TurnEnded', turn: s.turn });
  // MAN-17 Emergency Overdrive: the turn marker jumps ahead.
  for (; s.skipTurns > 0 && s.turn < s.config.totalTurns; s.skipTurns--) {
    s.turn += 1;
    emit(ctx, { type: 'TurnSkipped', turn: s.turn });
  }
  s.skipTurns = 0;
  if (s.turn >= s.config.totalTurns) endMainGame(ctx, 'turnLimit');
  s.step = s.mainOver ? 'crucibleStart' : 'turnStart';
}
