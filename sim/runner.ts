// Headless game runner: drives the engine with a policy that answers every decision.
import {
  IllegalIntentError, applyIntent, createGame, dialOptions, living, type DealTerm, type Dial, type GameEvent,
  type GameOptions, type GameState, type Intent, type PendingDecision, type Seat,
} from '../src/engine';
import { nextFloat, pick, randInt, seedToState, type RngHolder } from '../src/engine/rng';
import { checkInvariants } from './invariants';

export interface Policy {
  /** Answers one pending decision with one or more intents. */
  decide(state: GameState, decision: PendingDecision, rng: RngHolder): Intent[];
  /** Called once per Whisper: deals and Whisper abilities to attempt (illegal ones are dropped). */
  whisper?(state: GameState, rng: RngHolder): Intent[];
  /** Called after a deal was offered to `seat`: accept it? */
  acceptDeal?(state: GameState, seat: Seat, dealId: string, rng: RngHolder): boolean;
}

function randomDial(state: GameState, seat: Seat, rng: RngHolder): Dial {
  const open = dialOptions(state, seat).filter((o) => o.available);
  const opt = pick(rng, open);
  const dial: Dial = { action: opt.action };
  if (opt.targets && (opt.action === 'sabotage' || opt.action === 'salvage')) dial.target = pick(rng, opt.targets);
  if (opt.action === 'contribute') dial.amount = randInt(rng, opt.minAmount!, opt.maxAmount!);
  return dial;
}

function randomTerm(state: GameState, a: Seat, b: Seat, rng: RngHolder): DealTerm {
  const who = nextFloat(rng) < 0.5 ? a : b;
  const others = living(state).map((p) => p.seat).filter((x) => x !== who);
  const anyone = pick(rng, others);
  switch (randInt(rng, 0, 6)) {
    case 0: return { kind: 'giveInfluenceNow', from: who, amount: randInt(rng, 1, 2) };
    case 1: return { kind: 'willContribute', who, min: randInt(rng, 1, 3) };
    case 2: return { kind: 'willNotSabotage', who, target: who === a ? b : a };
    case 3: return { kind: 'willSabotage', who, target: anyone };
    case 4: return { kind: 'willVote', who, target: pick(rng, ['aye', 'nay', anyone] as const) };
    case 5: return { kind: 'revealLP', who };
    default: return state.players[who]!.factionId === 'wardens'
      ? { kind: 'willInoculate', who, target: anyone }
      : { kind: 'willContribute', who, min: 1 };
  }
}

/** A uniformly random legal answer to everything. Used until the AI Councilors arrive (M3). */
export const randomPolicy: Policy = {
  decide(state, d, rng) {
    switch (d.kind) {
      case 'dial':
        return [{ type: 'SetDial', seat: d.seat, dial: randomDial(state, d.seat, rng) }, { type: 'LockDial', seat: d.seat }];
      case 'crucibleBid':
      case 'finaleBid':
      case 'finalePool':
        return [{ type: 'SubmitBid', seat: d.seat, amount: randInt(rng, d.min ?? 0, d.max ?? 0) }];
      case 'lpPledge':
        return [{ type: 'PledgeLP', seat: d.seat, amount: randInt(rng, 0, Math.min(d.max ?? 0, 2)) }];
      case 'ballot':
        return [{ type: 'CastBallot', seat: d.seat, choice: pick(rng, d.options) }];
      default:
        return [{ type: 'ChooseOption', seat: d.seat, decisionId: d.id, option: pick(rng, d.options) }];
    }
  },
  whisper(state, rng) {
    const out: Intent[] = [];
    const alive = living(state);
    for (const p of alive) {
      const others = alive.filter((x) => x.seat !== p.seat);
      if (others.length === 0) continue;
      const other = pick(rng, others).seat;
      if (nextFloat(rng) < 0.4) {
        const terms = [randomTerm(state, p.seat, other, rng)];
        if (nextFloat(rng) < 0.4) terms.push(randomTerm(state, p.seat, other, rng));
        out.push({ type: 'ProposeDeal', seat: p.seat, partner: other, terms });
      }
      if (nextFloat(rng) < 0.4) {
        if (p.factionId === 'scrubbers') out.push({ type: 'UseAbility', seat: p.seat, ability: 'ventSector', target: other });
        if (p.factionId === 'wardens') out.push({ type: 'UseAbility', seat: p.seat, ability: 'inoculate', target: pick(rng, alive).seat });
        if (p.factionId === 'directorate') out.push({ type: 'UseAbility', seat: p.seat, ability: 'subpoena', target: other });
      }
    }
    return out;
  },
  acceptDeal: (_s, _seat, _id, rng) => nextFloat(rng) < 0.6,
};

export interface GameResult {
  state: GameState;
  events: GameEvent[];
  intents: number;
  violations: string[];
}

export function runGame(options: GameOptions, policy: Policy = randomPolicy, maxIntents = 20000): GameResult {
  const rng = { rng: seedToState(options.seed ^ 0x5eed) };
  let { state, events } = createGame(options);
  const violations: string[] = [];
  let intents = 0;
  let whisperedTurn = 0;

  const apply = (intent: Intent) => {
    const r = applyIntent(state, intent);
    state = r.state;
    events = events.concat(r.events);
    intents++;
    for (const v of checkInvariants(state)) violations.push(`turn ${state.turn} ${state.step}: ${v}`);
  };
  /** Applies an intent that may be illegal by the time it is sent; returns whether it went through. */
  const attempt = (intent: Intent): boolean => {
    try {
      apply(intent);
      return true;
    } catch (err) {
      if (err instanceof IllegalIntentError) return false;
      throw err;
    }
  };
  const answer = (decision: PendingDecision) => {
    const answers = policy.decide(state, decision, rng);
    if (decision.kind !== 'dial') {
      for (const a of answers) apply(a);
      return;
    }
    // A picked dial can be unaffordable (a costlier Sabotage target, or Influence spent on a peek):
    // fall back to the first sector that works.
    if (answers.every(attempt)) return;
    for (const o of dialOptions(state, decision.seat).filter((x) => x.available)) {
      const tries: Dial[] = o.targets?.length
        ? o.targets.map((target) => ({ action: o.action, target }))
        : [{ action: o.action, amount: o.action === 'contribute' ? o.minAmount : undefined }];
      for (const dial of tries) {
        if (attempt({ type: 'SetDial', seat: decision.seat, dial }) && attempt({ type: 'LockDial', seat: decision.seat })) return;
      }
    }
    throw new Error(`Seat ${decision.seat} has no legal dial (seed ${options.seed}, turn ${state.turn})`);
  };
  const drain = () => {
    while (state.pending.length > 0 && state.step !== 'ended') answer(state.pending[0]!);
  };

  while (state.step !== 'ended') {
    if (intents > maxIntents) throw new Error(`Game did not end within ${maxIntents} intents (seed ${options.seed})`);
    if (state.pending.length > 0) {
      drain();
      continue;
    }
    if (state.step === 'whisper' && whisperedTurn !== state.turn && policy.whisper) {
      whisperedTurn = state.turn;
      for (const intent of policy.whisper(state, rng)) {
        if (!attempt(intent)) continue;
        drain();
        if (intent.type === 'ProposeDeal' && policy.acceptDeal) {
          const deal = state.deals.at(-1)!;
          attempt({ type: 'RespondDeal', seat: deal.partner, dealId: deal.id, accept: policy.acceptDeal(state, deal.partner, deal.id, rng) });
          const choir = [deal.proposer, deal.partner].find((x) => state.players[x]!.factionId === 'choir');
          if (choir !== undefined && deal.status !== 'rejected' && nextFloat(rng) < 0.5) {
            attempt({ type: 'UseAbility', seat: choir, ability: 'bindingOath', dealId: deal.id });
          }
        }
      }
      continue;
    }
    apply({ type: 'Advance', seal: true });
  }
  return { state, events, intents, violations };
}
