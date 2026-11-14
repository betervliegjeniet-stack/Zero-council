// The AI Councilors' public surface: answer a decision, act in the Whisper, answer a deal.
import type { GameState, Intent, PendingDecision, Seat } from '../types';
import { chooseBid, choosePledge } from './bid';
import { chooseDial } from './chooseAction';
import { chooseBallot, chooseOptionFor } from './vote';

export { observe, believedLP } from './beliefs';
export { chooseDial } from './chooseAction';
export { aiAcceptsDeal, aiAfterDeal, aiWhisperIntents, candidateOffers, evaluateDeal, type OfferKind } from './whisper';
export { line, LINES, type LineKind } from './lines';

/** The intents with which an AI seat answers one pending decision. */
export function aiDecide(s: GameState, d: PendingDecision): Intent[] {
  const seat: Seat = d.seat;
  if (!s.ai[seat]) throw new Error(`Seat ${seat} is not an AI Councilor`);
  switch (d.kind) {
    case 'dial':
      return [{ type: 'SetDial', seat, dial: chooseDial(s, seat) }, { type: 'LockDial', seat }];
    case 'ballot':
      return [{ type: 'CastBallot', seat, choice: chooseBallot(s, d) }];
    case 'crucibleBid':
    case 'finaleBid':
    case 'finalePool':
      return [{ type: 'SubmitBid', seat, amount: chooseBid(s, d) }];
    case 'lpPledge':
      return [{ type: 'PledgeLP', seat, amount: choosePledge(s, d) }];
    default:
      return [{ type: 'ChooseOption', seat, decisionId: d.id, option: chooseOptionFor(s, d) }];
  }
}
