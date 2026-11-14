// Core engine types. Everything here is plain serializable JSON.
import type { RulesConfig, Stage } from './config';
import type { FactionId } from './data';

export type Seat = number;
export type CardId = string;

export type ActionKind =
  | 'gather' | 'salvage' | 'sabotage' | 'contribute' | 'quarantine'
  | 'repair' | 'medicalTax' | 'idle';

export interface Dial {
  action: ActionKind;
  /** Sabotage target. */
  target?: Seat;
  /** Contribute amount (Influence put into the pool, before surcharges). */
  amount?: number;
  /** Blight Wardens: move one of your cubes onto the Sabotage target. */
  transferBlight?: boolean;
}

/**
 * Timed statuses store the LAST turn they cover (0 = not active), see DQ-10.
 * A status is active while state.turn <= value.
 */
export interface PlayerStatus {
  embargoedUntil: number;
  abilitiesDisabledUntil: number;
  silencedUntil: number;
  noTradeUntil: number;
  noGatherUntil: number;
  noSabotageSalvageUntil: number;
  gatherYield0Until: number;
  conscriptedUntil: number;
  exiled: boolean;
  gatherLocked: boolean;
  paralyzed: boolean;
}

export type StatusId = keyof PlayerStatus | 'eliminated';

export interface PlayerStats {
  lpForged: number;
  lpDestroyed: number;
  dealsMade: number;
  dealsBroken: number;
  timesBetrayed: number;
}

export interface PlayerState {
  seat: Seat;
  factionId: FactionId;
  isHuman: boolean;
  influence: number;
  lp: number;
  blight: { bio: number; neuro: number };
  status: PlayerStatus;
  eliminated: boolean;
  eliminatedCause: string | null;
  eliminatedTurn: number | null;
  dial: Dial | null;
  dialLocked: boolean;
  lpPledge: number;
  /** Total Influence put into pools this game (used by the collapse penalty). */
  contributedTotal: number;
  abilityUsedThisTurn: boolean;
  abilityUsesThisGame: number;
  stats: PlayerStats;
}

/** Turn modifiers registered from the Crisis card's `mod:*` tags. Cleared every turn. */
export interface TurnModifiers {
  salvageBlocked: boolean;
  gatherBlocked: boolean;
  gatherYield: number | null;
  sabotageCost: number | null;
  sabotageDamageBonus: number;
  sabotageDamageSet: number | null;
  contributeSurcharge: number;
  contributeRewardLP: number;
  noLPGain: boolean;
  skipWhisper: boolean;
  poolLeak: number;
  abilitiesDisabledAll: boolean;
  /** Raw `mod:*` tags that have no generic handling (their card handlers read them in M2). */
  other: string[];
}

export type Step =
  | 'turnStart' | 'crisisGate' | 'whisper' | 'dialsOpen' | 'dials' | 'reveal' | 'actions'
  | 'mitigation' | 'cardResolve' | 'deals' | 'mandate' | 'turnEndGate' | 'turnEnd'
  | 'crucibleStart' | 'crucibleOpen' | 'crucibleBids' | 'crucibleResolve' | 'ended';

export type DecisionKind =
  | 'dial' | 'crucibleBid'
  // reserved for M2:
  | 'lpPledge' | 'ballot' | 'tieBreak' | 'redactName' | 'volunteer' | 'cardChoice' | 'martialLaw'
  | 'ventResponse' | 'paranoiaPeek' | 'announceAction' | 'finaleBid' | 'finalePool' | 'exileBuyout';

export interface PendingDecision {
  id: string;
  seat: Seat;
  kind: DecisionKind;
  options: string[];
  min?: number;
  max?: number;
  timeoutMs?: number;
  defaultOption?: string;
  sourceCardId?: CardId;
}

export type MainEndCause = 'turnLimit' | 'collapse' | 'attrition' | 'card';

export type Outcome =
  | { kind: 'survivor'; seat: Seat; mainEndCause: MainEndCause }
  | { kind: 'extinction'; mainEndCause: MainEndCause };

export interface CrucibleState {
  round: number;
  bids: Record<string, number>;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  config: RulesConfig;
  turn: number;
  step: Step;
  firstSeat: Seat;
  eh: number;
  maxEH: number;
  players: PlayerState[];
  piles: {
    /** Index 0..3 = stage I..IV. The top of a pile is its LAST element. */
    stage: [CardId[], CardId[], CardId[], CardId[]];
    crisisDiscard: CardId[];
    mandates: CardId[];
    mandateDiscard: CardId[];
    finale: CardId[];
  };
  crisis: { cardId: CardId; faceDown: boolean; pool: number; mitigated: boolean | null } | null;
  mandate: { cardId: CardId } | null;
  modifiers: TurnModifiers;
  /** Turn on which the Crisis is dealt face-down (MAN-10), 0 = none. */
  blackoutTurn: number;
  whisper: { startedAt: number; endsAt: number } | null;
  crucible: CrucibleState | null;
  pending: PendingDecision[];
  nextId: number;
  mainOver: { cause: MainEndCause; turn: number } | null;
  outcome: Outcome | null;
}

export type Intent =
  | { type: 'Advance'; now?: number; seal?: boolean }
  | { type: 'SetDial'; seat: Seat; dial: Dial }
  | { type: 'LockDial'; seat: Seat }
  | { type: 'SubmitBid'; seat: Seat; amount: number };

export type GameEvent =
  | { type: 'GameCreated'; seed: number; playerCount: number }
  | { type: 'TurnStarted'; turn: number; stage: Stage; newStage: boolean; firstSeat: Seat }
  | { type: 'CardRevealed'; cardId: CardId; deck: 'crisis' | 'mandate' | 'finale'; faceDown: boolean }
  | { type: 'CardSkipped'; cardId: CardId; reason: string }
  | { type: 'EHChanged'; from: number; to: number; cause: string }
  | { type: 'InfluenceChanged'; seat: Seat; delta: number; cause: string }
  | { type: 'LPChanged'; seat: Seat; delta: number; cause: string; hidden: boolean }
  | { type: 'BlightChanged'; seat: Seat; bio: number; neuro: number; cause: string }
  | { type: 'StatusApplied'; seat: Seat; status: StatusId; until?: number }
  | { type: 'StatusCleared'; seat: Seat; status: StatusId }
  | { type: 'WhisperStarted'; endsAt: number }
  | { type: 'WhisperSkipped' }
  | { type: 'DialsOpened' }
  | { type: 'DialLocked'; seat: Seat }
  | { type: 'DialsRevealed'; dials: { seat: Seat; dial: Dial }[] }
  | { type: 'ActionResolved'; seat: Seat; dial: Dial; cost: number }
  | { type: 'ActionFizzled'; seat: Seat; dial: Dial; reason: string }
  | { type: 'PoolChanged'; from: number; to: number; threshold: number | null }
  | { type: 'MitigationResult'; cardId: CardId; success: boolean; pool: number; threshold: number }
  | { type: 'TurnEnded'; turn: number }
  | { type: 'MainGameOver'; cause: MainEndCause }
  | { type: 'CollapsePenalty'; lowestContributors: Seat[] }
  | { type: 'CrucibleStarted'; seats: Seat[] }
  | { type: 'CrucibleRoundOpened'; round: number; seats: Seat[] }
  | { type: 'BidLocked'; seat: Seat }
  | { type: 'BidsRevealed'; round: number; bids: { seat: Seat; amount: number }[] }
  | { type: 'PlayerDeleted'; seat: Seat; cause: string }
  | { type: 'GameEnded'; outcome: Outcome };

/** Mutable working context used inside one applyIntent call. */
export interface Ctx {
  s: GameState;
  ev: GameEvent[];
}

export class IllegalIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalIntentError';
  }
}
