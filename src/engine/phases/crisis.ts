// Upkeep and Phase 1, Crisis Reveal (SPEC §2.2, §2.4, §2.6).
import { applyModifierTags, getHandler } from '../cards';
import { stageForTurn, type Stage } from '../config';
import { getCard } from '../data';
import { changeEH, changeInfluence, changeLP, emit, setEH } from '../effects';
import { queueNext, resetScratch } from '../flow';
import { shuffle } from '../rng';
import { abilitiesActive, emptyModifiers, living } from '../selectors';
import type { CardId, Ctx, GameState } from '../types';

/** Draws the Crisis for a stage. An empty pile falls through to the next stage, then to discards. */
export function drawCrisis(s: GameState, stage: Stage): CardId | null {
  for (let i = stage - 1; i < 4; i++) {
    const card = s.piles.stage[i]!.pop();
    if (card) return card;
  }
  // After Stage IV: reshuffle the Stage IV discards; if there are none, every discard.
  const isStage4 = (id: CardId) => getCard(id).stage === 4;
  const pool = s.piles.crisisDiscard.some(isStage4) ? s.piles.crisisDiscard.filter(isStage4) : s.piles.crisisDiscard.slice();
  if (pool.length === 0) return null;
  s.piles.crisisDiscard = s.piles.crisisDiscard.filter((id) => !pool.includes(id));
  s.piles.stage[3] = shuffle(s, pool);
  return s.piles.stage[3].pop() ?? null;
}

/** Upkeep: Infected players lose 1 LP per bio cube and 1 Influence per neuro cube. */
export function blightDrain(ctx: Ctx): void {
  const s = ctx.s;
  for (const p of living(s)) {
    let bio = p.blight.bio;
    let neuro = p.blight.neuro;
    if (p.factionId === 'wardens' && abilitiesActive(s, p.seat)) {
      // Blight Wardens ignore their first cube, bio first.
      if (bio > 0) bio--;
      else if (neuro > 0) neuro--;
    }
    if (bio > 0) changeLP(ctx, p.seat, -bio, 'blight');
    if (neuro > 0) changeInfluence(ctx, p.seat, -neuro, 'blight');
  }
}

export function startTurn(ctx: Ctx): void {
  const s = ctx.s;
  const c = s.config;
  const prevStage = s.turn >= 1 ? stageForTurn(c, s.turn) : null;
  s.turn += 1;

  // The first player marker moves clockwise to the next living seat (turn 1 starts with seat 0).
  const n = s.players.length;
  const from = s.turn === 1 ? 0 : s.firstSeat + 1;
  for (let k = 0; k < n; k++) {
    const seat = (from + k) % n;
    if (!s.players[seat]!.eliminated) {
      s.firstSeat = seat;
      break;
    }
  }

  s.modifiers = emptyModifiers();
  s.crisis = null;
  s.mandate = null;
  s.whisper = null;
  for (const p of s.players) {
    p.dial = null;
    p.dialLocked = false;
    p.lpPledge = 0;
    p.abilityUsedThisTurn = false;
    p.oathUsedThisTurn = false;
    p.acted = null;
    p.contributedThisTurn = 0;
  }
  s.vote = null;
  s.votesThisTurn = [];
  s.inoculations = [];
  s.announced = {};
  s.tasks = [];
  resetScratch(ctx);

  const stage = stageForTurn(c, s.turn);
  emit(ctx, { type: 'TurnStarted', turn: s.turn, stage, newStage: stage !== prevStage, firstSeat: s.firstSeat });

  blightDrain(ctx);

  if (c.revealMandateAtTurnStart) drawMandate(ctx);

  const cardId = drawCrisis(s, stage);
  if (!cardId) return;
  const card = getCard(cardId);
  const faceDown = s.blackoutTurn === s.turn;
  s.crisis = { cardId, faceDown, pool: 0, mitigated: null };
  emit(ctx, { type: 'CardRevealed', cardId, deck: 'crisis', faceDown });
  applyModifierTags(s.modifiers, card);
  const handler = getHandler(cardId);
  if (!handler.customEH && card.eh.timing === 'reveal') {
    if (card.eh.op === 'delta') changeEH(ctx, card.eh.value, cardId);
    else if (card.eh.op === 'set') setEH(ctx, card.eh.value, cardId);
  }
  if (handler.reveal) queueNext(ctx, { k: 'effect', cardId, hook: 'reveal' });
}

/** Draws this turn's Apex Mandate or Finale card, if the turn has one and it is not drawn yet. */
export function drawMandate(ctx: Ctx): void {
  const s = ctx.s;
  const c = s.config;
  if (s.mandate) return;
  const finaleTurn = c.finaleMode !== 'off' && s.turn === c.finaleTurn;
  if (!finaleTurn && !c.mandateTurns.includes(s.turn)) return;
  const cardId = finaleTurn ? s.piles.finale.pop() : s.piles.mandates.pop();
  if (!cardId) return;
  s.mandate = { cardId };
  emit(ctx, { type: 'CardRevealed', cardId, deck: finaleTurn ? 'finale' : 'mandate', faceDown: false });
}
