// Every tunable number and every design-question flag of the digital ruleset (SPEC §2).
// The designer can change values here without touching logic. Flags marked DQ-n are
// explained in docs/DESIGN_QUESTIONS.md.
export interface RulesConfig {
  // §2.1 setup
  startEH: number;
  startEH4Players: number;
  totalTurns: number;
  blightCap: number; // DQ-17: gains beyond the cap are ignored
  // §2.2 decks
  /** Last turn of stages I, II and III; everything after is stage IV. DQ-2 */
  stageTurnBounds: [number, number, number];
  expansionEnabled: boolean;
  finaleMode: 'replaceTurn9Mandate' | 'off';
  mandateTurns: number[];
  finaleTurn: number;
  /** DQ-1: show the Mandate/Finale card at the start of its turn so deals can be made over it. */
  revealMandateAtTurnStart: boolean;
  // §2.3
  collapsePenalty: boolean; // DQ-12
  collapseLowestContributorExtraLP: number;
  // §2.5 actions
  gatherYield: number;
  salvageCost: number;
  salvageCostArchivists: number;
  salvageGain: number;
  sabotageCost: number;
  sabotageCostIronVsLeader: number;
  sabotageDamage: number;
  repairCost: number;
  medicalTaxCost: number;
  embargoSurcharge: number; // DQ-22
  /** If true, Embargo doubles costs instead of adding the surcharge. No current card sets this. */
  oxygenEmbargo: boolean;
  contributeWithoutPool: boolean; // DQ-3
  embargoGatherFreeWhenBroke: boolean; // DQ-4
  scrubberAirTax: number;
  // §2.7 / §2.9 votes
  defaultUrnTiePenalty: number; // DQ-6
  skipTargetVotesAtTwoPlayers: boolean; // DQ-14
  publicExecutionVotes: number; // DQ-15
  finaleExileTieNeverHeals: boolean; // DQ-13
  zeroConsensusSuccessLP: number; // SPEC §14.8
  // §4 whisper and deals
  whisperSeconds: number;
  bindingOathPenaltyLP: number;
  lpPledgeRefundOnFail: boolean; // SPEC §14.11
  harshMode: boolean; // CR-16 variant
  // §7.2
  tutorialCardId: string; // DQ-9
}

export const DEFAULT_CONFIG: RulesConfig = {
  startEH: 20,
  startEH4Players: 18,
  totalTurns: 10,
  blightCap: 20,
  stageTurnBounds: [3, 6, 9],
  expansionEnabled: true,
  finaleMode: 'replaceTurn9Mandate',
  mandateTurns: [3, 6, 9],
  finaleTurn: 9,
  revealMandateAtTurnStart: true,
  collapsePenalty: true,
  collapseLowestContributorExtraLP: 1,
  gatherYield: 2,
  salvageCost: 3,
  salvageCostArchivists: 2,
  salvageGain: 1,
  sabotageCost: 2,
  sabotageCostIronVsLeader: 1,
  sabotageDamage: 1,
  repairCost: 3,
  medicalTaxCost: 5,
  embargoSurcharge: 1,
  oxygenEmbargo: false,
  contributeWithoutPool: true,
  embargoGatherFreeWhenBroke: true,
  scrubberAirTax: 1,
  defaultUrnTiePenalty: 3,
  skipTargetVotesAtTwoPlayers: true,
  publicExecutionVotes: 4,
  finaleExileTieNeverHeals: true,
  zeroConsensusSuccessLP: 2,
  whisperSeconds: 45,
  bindingOathPenaltyLP: 2,
  lpPledgeRefundOnFail: true,
  harshMode: false,
  tutorialCardId: 'CR-05',
};

export type Stage = 1 | 2 | 3 | 4;

export function stageForTurn(config: RulesConfig, turn: number): Stage {
  const [a, b, c] = config.stageTurnBounds;
  if (turn <= a) return 1;
  if (turn <= b) return 2;
  if (turn <= c) return 3;
  return 4;
}
