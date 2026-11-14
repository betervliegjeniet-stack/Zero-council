// Headless game runner: drives the engine with a policy that answers every decision.
import {
  applyIntent, createGame, dialOptions, type Dial, type GameEvent, type GameOptions, type GameState,
  type Intent, type PendingDecision,
} from '../src/engine';
import { pick, randInt, seedToState, type RngHolder } from '../src/engine/rng';
import { checkInvariants } from './invariants';

export type Policy = (state: GameState, decision: PendingDecision, rng: RngHolder) => Intent[];

/** M1 policy: a uniformly random legal action, target, amount and bid. */
export const randomPolicy: Policy = (state, d, rng) => {
  if (d.kind === 'dial') {
    const open = dialOptions(state, d.seat).filter((o) => o.available);
    const opt = pick(rng, open);
    const dial: Dial = { action: opt.action };
    if (opt.action === 'sabotage') dial.target = pick(rng, opt.targets!);
    if (opt.action === 'contribute') dial.amount = randInt(rng, opt.minAmount!, opt.maxAmount!);
    return [{ type: 'SetDial', seat: d.seat, dial }, { type: 'LockDial', seat: d.seat }];
  }
  if (d.kind === 'crucibleBid') {
    return [{ type: 'SubmitBid', seat: d.seat, amount: randInt(rng, d.min ?? 0, d.max ?? 0) }];
  }
  throw new Error(`randomPolicy cannot answer a ${d.kind} decision`);
};

export interface GameResult {
  state: GameState;
  events: GameEvent[];
  intents: number;
  violations: string[];
}

export function runGame(options: GameOptions, policy: Policy = randomPolicy, maxIntents = 5000): GameResult {
  const rng = { rng: seedToState(options.seed ^ 0x5eed) };
  let { state, events } = createGame(options);
  const violations: string[] = [];
  let intents = 0;
  const apply = (intent: Intent) => {
    const r = applyIntent(state, intent);
    state = r.state;
    events = events.concat(r.events);
    intents++;
    for (const v of checkInvariants(state)) violations.push(`turn ${state.turn} ${state.step}: ${v}`);
  };
  while (state.step !== 'ended') {
    if (intents > maxIntents) throw new Error(`Game did not end within ${maxIntents} intents (seed ${options.seed})`);
    const decision = state.pending[0];
    if (!decision) {
      apply({ type: 'Advance', seal: true });
      continue;
    }
    const answers = policy(state, decision, rng);
    try {
      for (const a of answers) apply(a);
    } catch (err) {
      // An unaffordable random pick (e.g. a costlier Sabotage target): take the first open sector instead.
      if (decision.kind !== 'dial') throw err;
      const open = dialOptions(state, decision.seat).filter((o) => o.available);
      const safe = open.find((o) => o.action !== 'sabotage' && o.action !== 'contribute') ?? open[0]!;
      const dial: Dial = { action: safe.action };
      if (safe.action === 'contribute') dial.amount = safe.minAmount;
      if (safe.action === 'sabotage') {
        dial.target = safe.targets!.find((t) => {
          try { applyIntent(state, { type: 'SetDial', seat: decision.seat, dial: { action: 'sabotage', target: t } }); return true; } catch { return false; }
        });
      }
      apply({ type: 'SetDial', seat: decision.seat, dial });
      apply({ type: 'LockDial', seat: decision.seat });
    }
  }
  return { state, events, intents, violations };
}
