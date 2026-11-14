// The Black Urn (SPEC §2.7, §2.9): ballots, the Directorate's casting vote, Redact Name, ties.
import { getHandler } from './cards';
import { getCard } from './data';
import { changeEH, emit } from './effects';
import { ask, queueNext } from './flow';
import { pick } from './rng';
import { abilitiesActive, leftOf, living, lpLowest, player, rightOf } from './selectors';
import type { CardId, Ctx, GameState, PendingDecision, Seat, VoteState, VoteType } from './types';
import { IllegalIntentError } from './types';

const NAMES_A_SEAT: ReadonlySet<VoteType> = new Set<VoteType>(['target', 'twoTargets', 'unanimous', 'judas', 'open']);
const WEIGHTED: ReadonlySet<VoteType> = new Set<VoteType>(['target', 'twoTargets', 'ayeNay', 'mercy']);

export function ballotOptions(s: GameState, vote: VoteState, seat: Seat): string[] {
  switch (vote.type) {
    case 'ayeNay': return ['aye', 'nay'];
    case 'mercy': return ['mercy', 'efficiency'];
    case 'judas': {
      const sides = [leftOf(s, seat), rightOf(s, seat)].filter((x): x is Seat => x !== null);
      return [...new Set(sides)].map(String);
    }
    default: // no self-votes
      return living(s).filter((p) => p.seat !== seat).map((p) => String(p.seat));
  }
}

function directorate(s: GameState): Seat | null {
  const d = living(s).find((p) => p.factionId === 'directorate' && abilitiesActive(s, p.seat));
  return d ? d.seat : null;
}

function weight(s: GameState, vote: VoteState, seat: Seat): number {
  return WEIGHTED.has(vote.type) && directorate(s) === seat ? 2 : 1;
}

function askBallot(ctx: Ctx, vote: VoteState, seat: Seat): void {
  ask(ctx, { seat, kind: 'ballot', options: ballotOptions(ctx.s, vote, seat), sourceCardId: vote.cardId });
}

export function startVote(ctx: Ctx, cardId: CardId, type: VoteType): void {
  const s = ctx.s;
  const voters = living(s).map((p) => p.seat);
  // With two players every target vote ties (no self-votes), and the Judas Kiss has one neighbour.
  const tooFew = voters.length < 3 && NAMES_A_SEAT.has(type) && (type === 'judas' || s.config.skipTargetVotesAtTwoPlayers);
  if (tooFew || voters.length === 0) {
    emit(ctx, { type: 'CardSkipped', cardId, reason: 'Too few players left to vote' });
    return;
  }
  const mercyTarget = type === 'mercy' ? pick(s, lpLowest(s)) : null;
  const vote: VoteState = { cardId, type, voters, ballots: {}, cancelled: [], mercyTarget, tied: [], slots: 0, result: null };
  s.vote = vote;
  emit(ctx, { type: 'VoteStarted', cardId, voteType: type, voters, mercyTarget });
  if (type === 'open') {
    queueNext(ctx, { k: 'voteOpenNext' });
  } else {
    for (const seat of voters) askBallot(ctx, vote, seat);
    queueNext(ctx, { k: 'voteRedact' }, { k: 'voteTally' }, { k: 'voteFinish' });
  }
}

/** CR-08: ballots are cast one at a time in seat order, so later voters see earlier votes. */
export function voteOpenNext(ctx: Ctx): void {
  const s = ctx.s;
  const vote = s.vote!;
  const next = vote.voters.find((seat) => !player(s, seat).eliminated && vote.ballots[String(seat)] === undefined);
  if (next === undefined) {
    queueNext(ctx, { k: 'voteTally' }, { k: 'voteFinish' });
    return;
  }
  askBallot(ctx, vote, next);
  queueNext(ctx, { k: 'voteOpenNext' });
}

export function castBallot(ctx: Ctx, seat: Seat, choice: Seat | string): void {
  const s = ctx.s;
  const vote = s.vote;
  const d = s.pending.find((x) => x.seat === seat && x.kind === 'ballot');
  if (!vote || !d) throw new IllegalIntentError(`Seat ${seat} has no ballot to cast`);
  const c = String(choice);
  if (!d.options.includes(c)) throw new IllegalIntentError(`"${c}" is not on seat ${seat}'s ballot`);
  vote.ballots[String(seat)] = c;
  s.pending = s.pending.filter((x) => x !== d);
  emit(ctx, vote.type === 'open' ? { type: 'BallotCast', seat, choice: c } : { type: 'BallotCast', seat });
}

/** Valid ballots: cast, not cancelled, voter still alive. */
function validBallots(s: GameState, vote: VoteState): { seat: Seat; choice: string; weight: number }[] {
  return vote.voters
    .filter((seat) => vote.ballots[String(seat)] !== undefined && !vote.cancelled.includes(seat) && !player(s, seat).eliminated)
    .map((seat) => ({ seat, choice: vote.ballots[String(seat)]!, weight: weight(s, vote, seat) }));
}

/** Archivists' Redact Name: once per game, cancel up to 2 ballots that name you. */
export function voteRedact(ctx: Ctx): void {
  const s = ctx.s;
  const vote = s.vote!;
  if (!NAMES_A_SEAT.has(vote.type) || vote.type === 'open') return;
  for (const p of living(s)) {
    if (p.factionId !== 'archivists' || !abilitiesActive(s, p.seat) || p.abilityUsesThisGame > 0) continue;
    const naming = validBallots(s, vote).filter((b) => b.choice === String(p.seat)).length;
    if (naming === 0) continue;
    const max = Math.min(2, naming);
    ask(ctx, {
      seat: p.seat, kind: 'redactName', options: Array.from({ length: max + 1 }, (_, i) => String(i)),
      min: 0, max, sourceCardId: vote.cardId, info: { ballotsNamingYou: naming },
    });
  }
}

export function answerRedact(ctx: Ctx, d: PendingDecision, option: string): void {
  const s = ctx.s;
  const vote = s.vote!;
  const count = Number(option);
  if (count <= 0) return;
  // The heaviest ballots go first (the Directorate's counts double).
  const naming = validBallots(s, vote).filter((b) => b.choice === String(d.seat)).sort((a, b) => b.weight - a.weight);
  naming.slice(0, count).forEach((b) => vote.cancelled.push(b.seat));
  const p = player(s, d.seat);
  p.abilityUsesThisGame += 1;
  emit(ctx, { type: 'AbilityUsed', seat: d.seat, ability: 'redactName' });
  emit(ctx, { type: 'BallotsCancelled', by: d.seat, count: Math.min(count, naming.length) });
}

export function voteTally(ctx: Ctx): void {
  const s = ctx.s;
  const vote = s.vote!;
  const ballots = validBallots(s, vote);
  const tally: Record<string, number> = {};
  for (const b of ballots) tally[b.choice] = (tally[b.choice] ?? 0) + b.weight;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  let winners: string[] = [];
  let tied: string[] = [];
  let slots = 0;

  switch (vote.type) {
    case 'judas': {
      // Hit: picked by BOTH neighbours.
      for (const p of living(s)) {
        const l = leftOf(s, p.seat);
        const r = rightOf(s, p.seat);
        if (l === null || r === null || l === r) continue;
        const names = (voter: Seat) => ballots.some((b) => b.seat === voter && b.choice === String(p.seat));
        if (names(l) && names(r)) winners.push(String(p.seat));
      }
      break;
    }
    case 'unanimous': {
      // Every ballot except the target's own names the same target.
      const t = living(s).find((p) => vote.voters.filter((v) => v !== p.seat && !player(s, v).eliminated)
        .every((v) => ballots.some((b) => b.seat === v && b.choice === String(p.seat))));
      if (t && vote.voters.length > 1) winners = [String(t.seat)];
      break;
    }
    case 'open': {
      // Not an Urn vote: everyone tied for the most votes is hit, no tie penalty.
      if (ranked.length) winners = ranked.filter(([, n]) => n === ranked[0]![1]).map(([o]) => o);
      break;
    }
    case 'twoTargets': {
      if (ranked.length <= 2) {
        winners = ranked.map(([o]) => o);
      } else {
        const second = ranked[1]![1];
        winners = ranked.filter(([, n]) => n > second).map(([o]) => o);
        const group = ranked.filter(([, n]) => n === second).map(([o]) => o);
        if (group.length <= 2 - winners.length) winners.push(...group);
        else {
          tied = group;
          slots = 2 - winners.length;
        }
      }
      break;
    }
    default: {
      // target, ayeNay, mercy: the most votes wins; a tie for most is a tie.
      if (ranked.length === 0) break;
      const top = ranked.filter(([, n]) => n === ranked[0]![1]).map(([o]) => o);
      if (top.length === 1) winners = top;
      else {
        tied = top;
        slots = 1;
      }
    }
  }

  vote.result = { tally, winners, tie: tied.length > 0, brokenBy: null };
  vote.tied = tied;
  vote.slots = slots;
  if (tied.length > 0) askTieBreak(ctx);
}

/** The Directorate (not Exiled or disabled) breaks Urn ties, or lets the tie stand ("chaos"). */
function askTieBreak(ctx: Ctx): void {
  const s = ctx.s;
  const vote = s.vote!;
  const d = directorate(s);
  if (d === null) return;
  ask(ctx, { seat: d, kind: 'tieBreak', options: [...vote.tied, 'chaos'], sourceCardId: vote.cardId, defaultOption: 'chaos' });
}

export function answerTieBreak(ctx: Ctx, d: PendingDecision, option: string): void {
  const vote = ctx.s.vote!;
  const result = vote.result!;
  if (option === 'chaos') return; // the tie stands
  result.winners.push(option);
  vote.tied = vote.tied.filter((o) => o !== option);
  vote.slots -= 1;
  if (vote.slots > 0) return askTieBreak(ctx);
  result.tie = false;
  result.brokenBy = d.seat;
  vote.tied = [];
}

export function voteFinish(ctx: Ctx): void {
  const s = ctx.s;
  const vote = s.vote!;
  const result = vote.result!;
  const card = getCard(vote.cardId);
  const handler = getHandler(vote.cardId);
  if (vote.type !== 'open') {
    // Ballots come out of the urn anonymously, one at a time.
    const out = validBallots(s, vote).sort((a, b) => a.choice.localeCompare(b.choice));
    for (const b of out) emit(ctx, { type: 'BallotCounted', choice: b.choice, weight: b.weight });
  }
  if (result.tie) result.winners = []; // a standing tie has no winner: the Mandate fails
  emit(ctx, { type: 'VoteResult', cardId: vote.cardId, result });
  s.votesThisTurn.push({ cardId: vote.cardId, type: vote.type, ballots: { ...vote.ballots } });

  if (result.tie && !handler.customEH) {
    if (card.eh.timing === 'tie' && card.eh.op === 'delta') changeEH(ctx, card.eh.value, card.id);
    else if (card.mitigation.kind === 'urn_vote') changeEH(ctx, -s.config.defaultUrnTiePenalty, card.id);
  }
  if (handler.voteResult) queueNext(ctx, { k: 'effect', cardId: vote.cardId, hook: 'vote' });
}
