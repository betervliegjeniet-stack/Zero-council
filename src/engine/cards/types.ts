import type { Ctx, GameState, VoteResult, VoteType } from '../types';

/**
 * The special rules of one card. Generic behaviour (reveal/unmitigated/tie EH from the JSON,
 * `mod:*` tags, Influence pools) is handled once by the phases; handlers add the rest.
 *
 * `reveal`, `resolve`, `voteResult` and `final` are FINAL effects: they run synchronously and
 * must not ask for decisions when the card is a Crisis card, because the engine dry-runs them
 * to offer Martial Law. Interactive cards use `flow`.
 */
export interface CardHandler {
  /** The handler applies every EH change itself; the generic EH layer is skipped. */
  customEH?: boolean;
  /** Skip the generic `unmitigated` EH change on failure (CR-16 harsh mode). */
  skipFailEH?(s: GameState): boolean;
  /** Phase 1 instant effect. */
  reveal?(ctx: Ctx): void;
  /** Phase 4 effect after the mitigation check. `mitigated` is null if the card has none. */
  resolve?(ctx: Ctx, mitigated: boolean | null): void;
  /** Phase 4: hold this kind of vote. */
  vote?: VoteType;
  /** MAN-19: `willVote` deals do not apply to this vote. */
  silentVote?: boolean;
  voteResult?(ctx: Ctx, result: VoteResult): void;
  /** Interactive Phase 4 flow: the first stage to run. */
  flowStart?: string;
  /** Runs one stage: may push decisions and queue the next stage with `nextStage`. */
  flow?(ctx: Ctx, stage: string): void;
  /** Final effect of a flow, run through the Martial Law check for Crisis cards. */
  final?(ctx: Ctx): void;
}
