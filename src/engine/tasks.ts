// Runs deferred tasks: card effects (with the Martial Law check), card flows, votes, volunteers.
import { answerMartialLaw, answerParanoia, answerVent, MARTIAL_LAW_COST, martialLawCandidates } from './abilities';
import { getHandler } from './cards';
import { getCard } from './data';
import { changeLP, emit } from './effects';
import { ask, queueNext } from './flow';
import { player, turnOrder } from './selectors';
import type { ActionKind, CardId, Ctx, EffectHook, Seat, Task } from './types';
import { IllegalIntentError } from './types';
import { answerRedact, answerTieBreak, startVote, voteFinish, voteOpenNext, voteRedact, voteTally } from './votes';

function runHook(ctx: Ctx, cardId: CardId, hook: EffectHook): void {
  const s = ctx.s;
  const h = getHandler(cardId);
  switch (hook) {
    case 'reveal': h.reveal?.(ctx); break;
    case 'resolve': h.resolve?.(ctx, s.crisis?.cardId === cardId ? s.crisis.mitigated : null); break;
    case 'vote': if (s.vote?.result) h.voteResult?.(ctx, s.vote.result); break;
    case 'final': h.final?.(ctx); break;
  }
}

/**
 * Applies a card effect. For Crisis cards, an Iron Remnant that would be hit personally is first
 * offered Martial Law ("Spend 3 to ignore?"). The effect is dry-run on a copy to find who is hit.
 */
function runEffect(ctx: Ctx, cardId: CardId, hook: EffectHook): void {
  const s = ctx.s;
  if (getCard(cardId).deck === 'crisis') {
    const candidates = martialLawCandidates(s);
    if (candidates.length > 0) {
      const dry: Ctx = { s: structuredClone(s), ev: [], hits: new Set<Seat>() };
      runHook(dry, cardId, hook);
      const offered = candidates.filter((seat) => dry.hits!.has(seat));
      if (offered.length > 0) {
        for (const seat of offered) {
          ask(ctx, {
            seat, kind: 'martialLaw', options: ['ignore', 'decline'], defaultOption: 'decline', timeoutMs: 5000,
            sourceCardId: cardId, info: { cost: MARTIAL_LAW_COST },
          });
        }
        queueNext(ctx, { k: 'effectApply', cardId, hook });
        return;
      }
    }
  }
  runHook(ctx, cardId, hook);
}

function applyShielded(ctx: Ctx, cardId: CardId, hook: EffectHook): void {
  ctx.shield = new Set(ctx.s.scratch.shield);
  try {
    runHook(ctx, cardId, hook);
  } finally {
    ctx.shield = undefined;
    ctx.s.scratch.shield = [];
  }
}

/** CR-20: in turn order, each player who can afford it may sacrifice LP to avert the crisis. */
function volunteerNext(ctx: Ctx, index: number): void {
  const s = ctx.s;
  const cost = getCard(s.crisis!.cardId).mitigation.amount;
  const order = turnOrder(s);
  for (let i = index; i < order.length; i++) {
    if (player(s, order[i]!).lp < cost) continue;
    ask(ctx, { seat: order[i]!, kind: 'volunteer', options: ['volunteer', 'decline'], defaultOption: 'decline', sourceCardId: s.crisis!.cardId, info: { cost } });
    queueNext(ctx, { k: 'volunteerNext', index: i + 1 });
    return;
  }
  s.crisis!.mitigated = false;
}

export function runTask(ctx: Ctx, t: Task): void {
  switch (t.k) {
    case 'effect': return runEffect(ctx, t.cardId, t.hook);
    case 'effectApply': return applyShielded(ctx, t.cardId, t.hook);
    case 'cardFlow': return getHandler(t.cardId).flow?.(ctx, t.stage);
    case 'startVote': return startVote(ctx, t.cardId, getHandler(t.cardId).vote!);
    case 'voteOpenNext': return voteOpenNext(ctx);
    case 'voteRedact': return voteRedact(ctx);
    case 'voteTally': return voteTally(ctx);
    case 'voteFinish': return voteFinish(ctx);
    case 'volunteerNext': return volunteerNext(ctx, t.index);
  }
}

/** Answers a decision that is a pick from a list of options. */
export function chooseOption(ctx: Ctx, seat: Seat, decisionId: string, option: string): void {
  const s = ctx.s;
  const d = s.pending.find((x) => x.id === decisionId && x.seat === seat);
  if (!d) throw new IllegalIntentError(`Seat ${seat} has no decision ${decisionId}`);
  if (!d.options.includes(option)) throw new IllegalIntentError(`"${option}" is not an option (${d.options.join(', ')})`);
  s.pending = s.pending.filter((x) => x !== d);
  switch (d.kind) {
    case 'tieBreak': return answerTieBreak(ctx, d, option);
    case 'redactName': return answerRedact(ctx, d, option);
    case 'martialLaw': return answerMartialLaw(ctx, d, option);
    case 'ventResponse': return answerVent(ctx, d, option);
    case 'paranoiaPeek': return answerParanoia(ctx, d, option);
    case 'cardChoice':
    case 'exileBuyout':
      s.scratch.choices[String(seat)] = option;
      return;
    case 'announceAction':
      s.announced[String(seat)] = option as ActionKind;
      emit(ctx, { type: 'ActionAnnounced', seat, action: option as ActionKind });
      return;
    case 'volunteer': {
      const yes = option === 'volunteer';
      emit(ctx, { type: 'VolunteerAsked', seat, volunteered: yes });
      if (!yes) return;
      changeLP(ctx, seat, -Number(d.info?.cost ?? 0), s.crisis!.cardId);
      s.crisis!.mitigated = true;
      s.tasks = s.tasks.filter((x) => x.k !== 'volunteerNext');
      return;
    }
    default:
      throw new IllegalIntentError(`A ${d.kind} decision is not answered with ChooseOption`);
  }
}

/** Influence bids of FIN-02 and FIN-03. */
export function submitInfluenceBid(ctx: Ctx, seat: Seat, amount: number): boolean {
  const s = ctx.s;
  const d = s.pending.find((x) => x.seat === seat && (x.kind === 'finaleBid' || x.kind === 'finalePool'));
  if (!d) return false;
  if (!Number.isInteger(amount) || amount < (d.min ?? 0) || amount > (d.max ?? 0)) {
    throw new IllegalIntentError(`Bid must be ${d.min}..${d.max}`);
  }
  s.scratch.bids[String(seat)] = amount;
  s.pending = s.pending.filter((x) => x !== d);
  emit(ctx, { type: 'BidLocked', seat });
  return true;
}
