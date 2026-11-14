// applyIntent: the single entry point that changes a game. Pure from the outside: the input
// state is never mutated; a new state and the events that happened are returned.
import { emit } from './effects';
import { startTurn } from './phases/crisis';
import { openCrucibleRound, resolveCrucibleRound, startCrucible, submitBid } from './phases/crucible';
import { useAbility } from './abilities';
import { checkDeals, proposeDeal, respondDeal } from './deals';
import { resetScratch } from './flow';
import { resolveMandate } from './phases/mandate';
import {
  checkMitigation, endTurn, finishMitigation, lockDial, openDials, paranoiaWindow, pledgeLP, resolveActions,
  resolveCrisisCard, revealDials, setDial,
} from './phases/resolve';
import { chooseOption, runTask, submitInfluenceBid } from './tasks';
import { castBallot } from './votes';
import { openWhisper, tryCloseWhisper } from './phases/whisper';
import { living } from './selectors';
import type { Ctx, GameEvent, GameState, Intent, Step } from './types';
import { IllegalIntentError } from './types';

const MAIN_GAME_STEPS: ReadonlySet<Step> = new Set<Step>([
  'crisisGate', 'whisper', 'dialsOpen', 'dials', 'paranoia', 'reveal', 'actions', 'mitigation', 'mitigationDone',
  'cardResolve', 'mandate', 'deals',
]);

/**
 * SPEC §2.3: if EH hits 0, finish the current effect, then go to the Crucible.
 * Also ends the main game when one or no player is left alive (DQ-24), or when a card ended it.
 */
function checkMainOver(ctx: Ctx): void {
  const s = ctx.s;
  if (!MAIN_GAME_STEPS.has(s.step)) return;
  if (!s.mainOver) {
    const cause = s.eh === 0 ? 'collapse' : living(s).length <= 1 ? 'attrition' : null;
    if (!cause) return;
    s.mainOver = { cause, turn: s.turn };
    emit(ctx, { type: 'MainGameOver', cause });
  }
  s.pending = [];
  s.tasks = [];
  resetScratch(ctx);
  s.whisper = null;
  s.step = 'turnEndGate';
}

/** Runs automatic steps until the engine needs an Advance or a decision. */
function run(ctx: Ctx): void {
  const s = ctx.s;
  for (let guard = 0; guard < 10_000; guard++) {
    checkMainOver(ctx);
    if (s.pending.length > 0) return;
    const task = s.tasks.shift();
    if (task) {
      runTask(ctx, task);
      continue;
    }
    switch (s.step) {
      case 'turnStart': startTurn(ctx); s.step = 'crisisGate'; break;
      case 'crisisGate': case 'whisper': case 'turnEndGate': case 'ended': return;
      case 'dialsOpen': openDials(ctx); break;
      case 'dials': s.step = 'paranoia'; break;
      case 'paranoia': paranoiaWindow(ctx); break;
      case 'reveal': revealDials(ctx); break;
      case 'actions': resolveActions(ctx); break;
      case 'mitigation': checkMitigation(ctx); break;
      case 'mitigationDone': finishMitigation(ctx); break;
      case 'cardResolve': resolveCrisisCard(ctx); break;
      case 'mandate': resolveMandate(ctx); break;
      case 'deals': checkDeals(ctx); s.step = 'turnEndGate'; break;
      case 'turnEnd': endTurn(ctx); break;
      case 'crucibleStart': startCrucible(ctx); break;
      case 'crucibleOpen': openCrucibleRound(ctx); break;
      case 'crucibleBids': s.step = 'crucibleResolve'; break;
      case 'crucibleResolve': resolveCrucibleRound(ctx); break;
    }
  }
  throw new Error(`Engine did not settle (stuck at step ${s.step})`);
}

export function applyIntent(state: GameState, intent: Intent): { state: GameState; events: GameEvent[] } {
  const ctx: Ctx = { s: structuredClone(state), ev: [] };
  const s = ctx.s;
  if (s.step === 'ended') throw new IllegalIntentError('The game is over');

  switch (intent.type) {
    case 'Advance': {
      // Advance opens the gates between phases. It never skips a decision that is still pending.
      if (s.pending.length > 0) break;
      if (s.step === 'crisisGate') openWhisper(ctx, intent.now ?? 0);
      else if (s.step === 'whisper') tryCloseWhisper(ctx, intent.now ?? 0, intent.seal ?? false);
      else if (s.step === 'turnEndGate') s.step = 'turnEnd';
      break;
    }
    case 'SetDial': setDial(ctx, intent.seat, intent.dial); break;
    case 'LockDial': lockDial(ctx, intent.seat); break;
    case 'SubmitBid':
      if (!submitInfluenceBid(ctx, intent.seat, intent.amount)) submitBid(ctx, intent.seat, intent.amount);
      break;
    case 'PledgeLP': pledgeLP(ctx, intent.seat, intent.amount); break;
    case 'CastBallot': castBallot(ctx, intent.seat, intent.choice); break;
    case 'ChooseOption': chooseOption(ctx, intent.seat, intent.decisionId, intent.option); break;
    case 'ProposeDeal': proposeDeal(ctx, intent.seat, intent.partner, intent.terms); break;
    case 'RespondDeal': respondDeal(ctx, intent.seat, intent.dealId, intent.accept); break;
    case 'UseAbility': useAbility(ctx, intent.seat, intent.ability, intent.target, intent.dealId); break;
  }
  run(ctx);
  return { state: s, events: ctx.ev };
}
