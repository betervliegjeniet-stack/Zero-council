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
  /** Sabotage target (and the Salvage victim under Cannibalism). */
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
  /** Mass Paranoia: last turn's dial, resolving after this turn's actions. */
  queuedDial: Dial | null;
  /** What this player's dial did this turn (used by deal checking). */
  acted: { dial: Dial; fizzled: boolean } | null;
  contributedThisTurn: number;
  lpPledge: number;
  /** Total Influence put into pools this game (used by the collapse penalty). */
  contributedTotal: number;
  abilityUsedThisTurn: boolean;
  abilityUsesThisGame: number;
  /** Quiet Choir: Binding Oath is once per Whisper. */
  oathUsedThisTurn: boolean;
  /** LP revealed to everyone (Subpoena, Legacy Audit), with the turn it was true. */
  lpRevealed: { value: number; turn: number } | null;
  /** LP disclosed privately through a deal, keyed by the seat that was told. */
  lpShownTo: Record<string, { value: number; turn: number }>;
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
  randomActions: boolean;
  delayActions: boolean;
  revealSequential: boolean;
  announceActions: boolean;
  cannibalSalvage: boolean;
  sabotageInfects: boolean;
}

export type Step =
  | 'turnStart' | 'crisisGate' | 'whisper' | 'dialsOpen' | 'dials' | 'paranoia' | 'reveal' | 'actions'
  | 'mitigation' | 'mitigationDone' | 'cardResolve' | 'mandate' | 'deals' | 'turnEndGate' | 'turnEnd'
  | 'crucibleStart' | 'crucibleOpen' | 'crucibleBids' | 'crucibleResolve' | 'ended';

export type DecisionKind =
  | 'dial' | 'crucibleBid' | 'lpPledge' | 'ballot' | 'tieBreak' | 'redactName' | 'volunteer' | 'cardChoice' | 'martialLaw'
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
  /** Extra facts for the prompt, e.g. how many ballots name you, or who vented your sector. */
  info?: Record<string, number | string>;
}

export type VoteType = 'target' | 'twoTargets' | 'ayeNay' | 'mercy' | 'judas' | 'unanimous' | 'open';

export interface VoteResult {
  /** Weighted votes per option (a seat number as string, or aye/nay/mercy/efficiency). */
  tally: Record<string, number>;
  winners: string[];
  tie: boolean;
  /** The Directorate seat that broke a tie, if any. */
  brokenBy: Seat | null;
}

export interface VoteState {
  cardId: CardId;
  type: VoteType;
  voters: Seat[];
  /** Ballots by voter seat. */
  ballots: Record<string, string>;
  /** Voters whose ballot was cancelled by Redact Name. */
  cancelled: Seat[];
  /** MAN-15: the fixed target. */
  mercyTarget: Seat | null;
  /** Unresolved tie: the options still tied and how many of them must be picked. */
  tied: string[];
  slots: number;
  result: VoteResult | null;
}

/** A finished vote of this turn, kept for `willVote` deal checks. */
export interface VoteRecord {
  cardId: CardId;
  type: VoteType;
  ballots: Record<string, string>;
}

export type DealTerm =
  | { kind: 'giveInfluenceNow'; from: Seat; amount: number }
  | { kind: 'willContribute'; who: Seat; min: number }
  | { kind: 'willNotSabotage'; who: Seat; target: Seat }
  | { kind: 'willSabotage'; who: Seat; target: Seat }
  | { kind: 'willVote'; who: Seat; target: Seat | 'aye' | 'nay' }
  | { kind: 'willInoculate'; who: Seat; target: Seat }
  | { kind: 'revealLP'; who: Seat };

export type DealStatus = 'offered' | 'accepted' | 'rejected' | 'expired' | 'kept' | 'broken' | 'voided';

export interface Deal {
  id: string;
  proposer: Seat;
  partner: Seat;
  terms: DealTerm[];
  status: DealStatus;
  binding: boolean;
  turn: number;
  /** Who broke it, once checked. */
  breakers: Seat[];
}

export type AbilityId =
  | 'redactName' | 'ventSector' | 'bindingOath' | 'whisperedParanoia' | 'martialLaw' | 'inoculate' | 'subpoena';

/** Deferred engine work. Tasks run before the next step, as soon as no decision is pending. */
export type Task =
  | { k: 'effect'; cardId: CardId; hook: EffectHook }
  | { k: 'effectApply'; cardId: CardId; hook: EffectHook }
  | { k: 'cardFlow'; cardId: CardId; stage: string }
  | { k: 'startVote'; cardId: CardId }
  | { k: 'voteOpenNext' }
  | { k: 'voteRedact' }
  | { k: 'voteTally' }
  | { k: 'voteFinish' }
  | { k: 'volunteerNext'; index: number };

export type EffectHook = 'reveal' | 'resolve' | 'vote' | 'final';

/** Answers collected for the card flow that is running. */
export interface Scratch {
  choices: Record<string, string>;
  bids: Record<string, number>;
  /** Iron Remnant seats that paid for Martial Law against the current effect. */
  shield: Seat[];
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
  vote: VoteState | null;
  votesThisTurn: VoteRecord[];
  deals: Deal[];
  /** Inoculations performed this turn (for `willInoculate` promises). */
  inoculations: { by: Seat; target: Seat }[];
  /** CR-19: the action each seat announced. */
  announced: Record<string, ActionKind>;
  /** MAN-17: turns to skip when this turn ends. */
  skipTurns: number;
  tasks: Task[];
  scratch: Scratch;
  pending: PendingDecision[];
  nextId: number;
  mainOver: { cause: MainEndCause; turn: number } | null;
  outcome: Outcome | null;
}

export type Intent =
  | { type: 'Advance'; now?: number; seal?: boolean }
  | { type: 'SetDial'; seat: Seat; dial: Dial }
  | { type: 'LockDial'; seat: Seat }
  /** Crucible bids, and the Influence bids of FIN-02 and FIN-03. */
  | { type: 'SubmitBid'; seat: Seat; amount: number }
  | { type: 'PledgeLP'; seat: Seat; amount: number }
  | { type: 'CastBallot'; seat: Seat; choice: Seat | string }
  | { type: 'ChooseOption'; seat: Seat; decisionId: string; option: string }
  | { type: 'ProposeDeal'; seat: Seat; partner: Seat; terms: DealTerm[] }
  | { type: 'RespondDeal'; seat: Seat; dealId: string; accept: boolean }
  | { type: 'UseAbility'; seat: Seat; ability: AbilityId; target?: Seat; dealId?: string };

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
  | { type: 'DialSpun'; seat: Seat }
  | { type: 'DialRevealedEarly'; seat: Seat; dial: Dial }
  /** Private to `seat` (Whispered Paranoia). */
  | { type: 'DialPeeked'; seat: Seat; target: Seat; dial: Dial }
  | { type: 'ActionsQueued' }
  | { type: 'ActionAnnounced'; seat: Seat; action: ActionKind }
  | { type: 'LiarExposed'; seat: Seat; announced: ActionKind; actual: ActionKind }
  | { type: 'PledgesRevealed'; total: number; needed: number; destroyed: boolean }
  | { type: 'VolunteerAsked'; seat: Seat; volunteered: boolean }
  | { type: 'CardChoice'; seat: Seat; cardId: CardId; choice: string }
  | { type: 'InfluenceBidsRevealed'; cardId: CardId; bids: { seat: Seat; amount: number }[] }
  | { type: 'AbilityUsed'; seat: Seat; ability: AbilityId; target?: Seat }
  | { type: 'LPRevealed'; seat: Seat; value: number; to: Seat | 'all' }
  | { type: 'DealProposed'; dealId: string; proposer: Seat; partner: Seat }
  | { type: 'DealAccepted'; dealId: string; proposer: Seat; partner: Seat }
  | { type: 'DealRejected'; dealId: string }
  | { type: 'DealExpired'; dealId: string }
  | { type: 'DealBound'; dealId: string; by: Seat }
  | { type: 'DealKept'; dealId: string }
  | { type: 'DealBroken'; dealId: string; breakers: Seat[]; binding: boolean }
  | { type: 'DealVoided'; dealId: string; reason: string }
  | { type: 'VoteStarted'; cardId: CardId; voteType: VoteType; voters: Seat[]; mercyTarget: Seat | null }
  /** `choice` is only present for open votes (CR-08). */
  | { type: 'BallotCast'; seat: Seat; choice?: string }
  | { type: 'BallotsCancelled'; by: Seat; count: number }
  | { type: 'BallotCounted'; choice: string; weight: number }
  | { type: 'VoteResult'; cardId: CardId; result: VoteResult }
  | { type: 'DeckReshuffled'; pile: 'stage3'; count: number }
  | { type: 'TurnSkipped'; turn: number }
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
  /** Seats protected by Martial Law while a Crisis effect is applied. */
  shield?: Set<Seat>;
  /** Dry run only: collects the seats a Crisis effect would hit. */
  hits?: Set<Seat>;
}

export class IllegalIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalIntentError';
  }
}
