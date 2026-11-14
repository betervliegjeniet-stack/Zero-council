import {
  applyIntent, createGame, dialOptions, stageForTurn, type DecisionKind, type Dial, type FactionId, type GameEvent,
  type GameOptions, type GameState, type Intent, type PendingDecision,
} from '../src/engine';

/** A fresh game. `factions` overrides who sits where (seat 0 first). */
export function newGame(opts: Partial<GameOptions> & { factions?: FactionId[] } = {}): GameState {
  const { state } = createGame({ seed: 7, playerCount: 6, ...opts });
  opts.factions?.forEach((f, seat) => {
    state.players[seat]!.factionId = f;
  });
  return state;
}

/** Six seats of the same quiet faction, everyone at 5 Influence and 3 LP. */
export function plainGame(opts: Partial<GameOptions> & { factions?: FactionId[] } = {}): GameState {
  const s = newGame({ factions: Array(opts.playerCount ?? 6).fill('choir'), ...opts });
  for (const p of s.players) {
    p.influence = 5;
    p.lp = 3;
  }
  return s;
}

/** Puts a Crisis card on top of the pile that the NEXT turn will draw from. */
export function stackCrisis(s: GameState, cardId: string): void {
  for (const pile of s.piles.stage) {
    const i = pile.indexOf(cardId);
    if (i >= 0) pile.splice(i, 1);
  }
  s.piles.stage[stageForTurn(s.config, s.turn + 1) - 1]!.push(cardId);
}

/** A plain game about to start turn 1 with the given Crisis. */
export function crisisGame(cardId: string, opts: Partial<GameOptions> = {}): GameState {
  const s = plainGame(opts);
  stackCrisis(s, cardId);
  return s;
}

/** A plain game about to start turn 3 with the given Apex Mandate and a quiet Crisis. */
export function mandateGame(cardId: string, opts: Partial<GameOptions> = {}): GameState {
  const s = plainGame(opts);
  s.turn = 2;
  s.piles.mandates = s.piles.mandates.filter((id) => id !== cardId).concat(cardId);
  stackCrisis(s, NO_EFFECT);
  return s;
}

/** A plain game about to start turn 9 with the given Finale card and a quiet Crisis. */
export function finaleGame(cardId: string, opts: Partial<GameOptions> = {}): GameState {
  const s = plainGame(opts);
  s.turn = 8;
  s.piles.finale = s.piles.finale.filter((id) => id !== cardId).concat(cardId);
  stackCrisis(s, NO_EFFECT);
  return s;
}

export function send(s: GameState, ...intents: Intent[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  let events: GameEvent[] = [];
  for (const i of intents) {
    const r = applyIntent(state, i);
    state = r.state;
    events = events.concat(r.events);
  }
  return { state, events };
}

type Result = { state: GameState; events: GameEvent[] };

function advanceTo(s: GameState, step: GameState['step']): Result {
  let r: Result = { state: s, events: [] };
  for (let i = 0; i < 4 && r.state.step !== step; i++) {
    if (r.state.pending.length) throw new Error(`Unexpected decision before ${step}: ${r.state.pending[0]!.kind}`);
    const next = send(r.state, { type: 'Advance', seal: true });
    r = { state: next.state, events: r.events.concat(next.events) };
  }
  if (r.state.step !== step) throw new Error(`Expected ${step}, got ${r.state.step}`);
  return r;
}

/** Advances from the start of a turn into the Whisper Campaign. */
export const toWhisper = (s: GameState) => advanceTo(s, 'whisper');
/** Advances from the start of a turn to the open dials. */
export const toDials = (s: GameState) => advanceTo(s, 'dials');

export interface Script {
  dials?: Record<number, Dial>;
  ballots?: Record<number, string | number>;
  pledges?: Record<number, number>;
  bids?: Record<number, number>;
  /** Answers for option decisions, per kind: one answer for everyone or one per seat. */
  choose?: Partial<Record<DecisionKind, string | Record<number, string>>>;
}

function defaultDial(state: GameState, seat: number): Dial {
  const open = dialOptions(state, seat).filter((o) => o.available);
  const o = open.find((x) => x.action === 'gather') ?? open.find((x) => !x.targets && x.action !== 'contribute') ?? open[0]!;
  const dial: Dial = { action: o.action };
  if (o.action === 'contribute') dial.amount = o.minAmount;
  if (o.targets) dial.target = o.targets[0];
  return dial;
}

function answer(state: GameState, d: PendingDecision, script: Script): Intent[] {
  switch (d.kind) {
    case 'dial':
      return [{ type: 'SetDial', seat: d.seat, dial: script.dials?.[d.seat] ?? defaultDial(state, d.seat) }, { type: 'LockDial', seat: d.seat }];
    case 'ballot':
      return [{ type: 'CastBallot', seat: d.seat, choice: script.ballots?.[d.seat] ?? d.options[0]! }];
    case 'lpPledge':
      return [{ type: 'PledgeLP', seat: d.seat, amount: script.pledges?.[d.seat] ?? 0 }];
    case 'crucibleBid':
    case 'finaleBid':
    case 'finalePool':
      return [{ type: 'SubmitBid', seat: d.seat, amount: script.bids?.[d.seat] ?? 0 }];
    default: {
      const c = script.choose?.[d.kind];
      const option = (typeof c === 'string' ? c : c?.[d.seat]) ?? d.defaultOption ?? d.options.at(-1)!;
      return [{ type: 'ChooseOption', seat: d.seat, decisionId: d.id, option }];
    }
  }
}

/**
 * Plays on until the end-of-turn gate (or the end of the game), answering every decision from
 * the script. Unscripted seats Gather, cast the first ballot option, pledge and bid 0, and
 * decline every optional prompt.
 */
export function play(s: GameState, script: Script = {}): Result {
  let state = s;
  let events: GameEvent[] = [];
  for (let guard = 0; guard < 500; guard++) {
    if (state.step === 'ended' || (state.step === 'turnEndGate' && state.pending.length === 0)) return { state, events };
    const d = state.pending[0];
    const r = send(state, ...(d ? answer(state, d, script) : [{ type: 'Advance' as const, seal: true }]));
    state = r.state;
    events = events.concat(r.events);
  }
  throw new Error('play() did not reach the end of the turn');
}

/** Plays one whole turn with the given dials (kept for the M1 tests). */
export function playTurn(s: GameState, dials: Record<number, Dial> = {}): Result {
  return play(s, { dials });
}

/** Ballots where every seat names `target`, and the target names `targetVotes`. */
export function allVote(target: number, targetVotes: number, seats = 6): Record<number, number> {
  return Object.fromEntries(Array.from({ length: seats }, (_, seat) => [seat, seat === target ? targetVotes : target]));
}

export const lps = (s: GameState) => s.players.map((p) => p.lp);
export const infl = (s: GameState) => s.players.map((p) => p.influence);
export function setLP(s: GameState, values: number[]): void {
  values.forEach((v, i) => (s.players[i]!.lp = v));
}
export function setInfluence(s: GameState, values: number[]): void {
  values.forEach((v, i) => (s.players[i]!.influence = v));
}

export const QUIET = 'CR-03'; // Ration Shortage: no EH change, only locks Salvage
export const NO_EFFECT = 'CR-36'; // Dead Frequency: only skips the Whisper
