import {
  applyIntent, createGame, dialOptions, stageForTurn, type Dial, type FactionId, type GameEvent,
  type GameOptions, type GameState, type Intent,
} from '../src/engine';

/** A fresh game. `factions` overrides who sits where (seat 0 first). */
export function newGame(opts: Partial<GameOptions> & { factions?: FactionId[] } = {}): GameState {
  const { state } = createGame({ seed: 7, playerCount: 6, ...opts });
  opts.factions?.forEach((f, seat) => {
    state.players[seat]!.factionId = f;
  });
  return state;
}

/** Puts a Crisis card on top of the pile that the NEXT turn will draw from. */
export function stackCrisis(s: GameState, cardId: string): void {
  for (const pile of s.piles.stage) {
    const i = pile.indexOf(cardId);
    if (i >= 0) pile.splice(i, 1);
  }
  s.piles.stage[stageForTurn(s.config, s.turn + 1) - 1]!.push(cardId);
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

/** Advances from the start of a turn to the open dials. */
export function toDials(s: GameState): { state: GameState; events: GameEvent[] } {
  let r = { state: s, events: [] as GameEvent[] };
  for (let i = 0; i < 4 && r.state.step !== 'dials'; i++) {
    const next = send(r.state, { type: 'Advance', seal: true });
    r = { state: next.state, events: r.events.concat(next.events) };
  }
  if (r.state.step !== 'dials') throw new Error(`Expected dials, got ${r.state.step}`);
  return r;
}

/**
 * Plays one whole turn up to the end-of-turn gate. Seats without an entry take Gather
 * (or the first open sector that needs no target).
 */
export function playTurn(s: GameState, dials: Record<number, Dial> = {}, prepare?: (s: GameState) => void) {
  let { state, events } = toDials(s);
  prepare?.(state);
  for (const d of state.pending.slice()) {
    let dial = dials[d.seat];
    if (!dial) {
      const open = dialOptions(state, d.seat).filter((o) => o.available);
      const o = open.find((x) => x.action === 'gather') ?? open.find((x) => !['sabotage', 'contribute'].includes(x.action)) ?? open[0]!;
      dial = { action: o.action, amount: o.minAmount, target: o.targets?.[0] };
      if (o.action !== 'contribute') delete dial.amount;
      if (o.action !== 'sabotage') delete dial.target;
    }
    const r = send(state, { type: 'SetDial', seat: d.seat, dial }, { type: 'LockDial', seat: d.seat });
    state = r.state;
    events = events.concat(r.events);
  }
  return { state, events };
}

export const QUIET = 'CR-03'; // Ration Shortage: no EH change, only locks Salvage
export const NO_EFFECT = 'CR-09'; // Static Interference: no generic effect at all in M1
