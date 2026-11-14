// Everything the engine can ask the human besides the dial: the Black Urn, card choices,
// Martial Law, bids and pledges.
import { useEffect, useState } from 'react';
import { getCard, getHandler, type GameState, type PendingDecision, type Seat } from '../../engine';
import { CardView } from '../CardView';
import { Sheet, Stepper } from '../common';
import { Cog, Skull, Urn } from '../icons';
import { FACTION_SHORT, useGameStore } from '../../store/gameStore';
import { ACTION_LABEL, optionLabel } from '../text';
import type { ActionKind } from '../../engine';

function promptText(g: GameState, d: PendingDecision): { title: string; body: string } {
  const card = d.sourceCardId ? getCard(d.sourceCardId) : null;
  switch (d.kind) {
    case 'martialLaw':
      return { title: 'Martial Law', body: `${card?.title ?? 'A Crisis'} is about to hit you. Spend 3 Influence to ignore it?` };
    case 'ventResponse':
      return { title: 'Your sector is being vented', body: `The ${FACTION_SHORT[g.players[Number(d.info?.by)]!.factionId]} closes your valves. Pay them 2 Influence, or be Embargoed this turn (every action costs 1 more).` };
    case 'volunteer':
      return { title: card?.title ?? 'Volunteer', body: `Sacrifice ${d.info?.cost ?? 2} LP to avert the crisis? If nobody volunteers, Earth Health drops.` };
    case 'cardChoice':
      return d.options.includes('sacrifice')
        ? { title: card?.title ?? 'Choose', body: 'You hold the most Influence. Sacrifice 3 of your LP, or let every player gain a Blight Cube.' }
        : { title: card?.title ?? 'Choose', body: 'Pay 5 Influence, or lose 2 LP and your faction abilities for 2 turns.' };
    case 'tieBreak':
      return { title: 'The Urn is tied', body: 'As the Directorate, you break the tie. Pick a result, or let the tie stand and the bunker pay for it.' };
    case 'redactName':
      return { title: 'Redact Name', body: `${d.info?.ballotsNamingYou} ballot${d.info?.ballotsNamingYou === 1 ? ' names' : 's name'} you. How many do you cancel? You can do this once per game.` };
    case 'paranoiaPeek':
      return { title: 'Whispered Paranoia', body: 'Every dial is locked. Pay 2 Influence to see one rival\'s dial; then you may change your own.' };
    case 'announceAction':
      return { title: 'Whisper Campaign', body: 'Announce an action to the Council. You may lie; liars are exposed when the dials turn.' };
    case 'exileBuyout':
      return { title: 'The Urn names you', body: 'Pay 10 LP to force a tie (Earth Health is set to 2), or accept Exile.' };
    default:
      return { title: 'Decide', body: '' };
  }
}

function choiceLabel(g: GameState, d: PendingDecision, o: string, me: Seat): string {
  if (d.kind === 'announceAction') return ACTION_LABEL[o as ActionKind] ?? o;
  if (d.kind === 'redactName') return o === '0' ? 'Cancel none' : `Cancel ${o}`;
  const map: Record<string, string> = {
    ignore: 'Spend 3 — ignore it', decline: d.kind === 'volunteer' ? 'Stay silent' : 'Take the hit', pay: d.kind === 'exileBuyout' ? 'Pay 10 LP' : d.kind === 'ventResponse' ? 'Pay 2 Influence' : 'Pay 5 Influence',
    embargo: 'Be Embargoed', volunteer: 'I volunteer', sacrifice: 'Sacrifice 3 LP', blight: 'Let them all be Infected',
    suffer: 'Lose 2 LP and my abilities', accept: 'Accept Exile', pass: 'Pass', chaos: 'LET IT BURN',
  };
  return map[o] ?? optionLabel(g, o, me);
}

export function ChoicePrompt({ g, d, me }: { g: GameState; d: PendingDecision; me: Seat }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const { title, body } = promptText(g, d);
  const [left, setLeft] = useState(d.timeoutMs ? Math.ceil(d.timeoutMs / 1000) : null);
  const choose = (option: string) => dispatch({ type: 'ChooseOption', seat: me, decisionId: d.id, option });
  // Timed prompts (Martial Law) fall back to their default when the clock runs out.
  useEffect(() => {
    if (!d.timeoutMs) return;
    const end = Date.now() + d.timeoutMs;
    const id = window.setInterval(() => {
      const ms = end - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) {
        window.clearInterval(id);
        choose(d.defaultOption ?? d.options.at(-1)!);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet title={title} kind="modal">
      <p>{body}</p>
      {left !== null && <p className="warn center" aria-live="polite">{left}s</p>}
      <div className="choices">
        {d.options.map((o, i) => (
          <button key={o} type="button" className={i === 0 && d.kind !== 'tieBreak' ? 'btn btn-primary' : o === 'chaos' ? 'btn btn-danger' : 'btn'} onClick={() => choose(o)}>
            {choiceLabel(g, d, o, me)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const BALLOT_HELP: Record<string, string> = {
  target: 'Name one rival. The most votes is the target. A tie fails the Mandate and hurts Earth Health.',
  twoTargets: 'Name one rival. The two with the most votes are the targets.',
  ayeNay: 'Aye passes the Mandate, Nay rejects it. A tie hurts Earth Health.',
  mercy: 'Decide the fate of the Councilor on trial.',
  judas: 'Secretly pick one of your two neighbours. Anyone picked by both neighbours is hit.',
  unanimous: 'Name one rival. It only works if every other ballot names the same Councilor.',
  open: 'An open vote: ballots are cast one by one, for all to see.',
};

/** The Black Urn overlay (SPEC §7.1 screen 7). */
export function UrnPrompt({ g, d, me }: { g: GameState; d: PendingDecision; me: Seat }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const vote = g.vote!;
  const card = getCard(vote.cardId);
  const cast = Object.keys(vote.ballots).length;
  const open = vote.type === 'open';
  return (
    <Sheet title={open ? 'Open Vote' : 'The Black Urn'} kind="full" className="urn-panel">
      <div className="urn-card"><CardView card={card} /></div>
      <p className="urn-help"><Urn size={16} /> {BALLOT_HELP[vote.type]}</p>
      {vote.mercyTarget !== null && <p className="center">On trial: <b>{vote.mercyTarget === me ? 'you' : `the ${FACTION_SHORT[g.players[vote.mercyTarget]!.factionId]}`}</b></p>}
      {getHandler(vote.cardId).silentVote && <p className="dim center">The Silent Ballot: no deal applies to this vote.</p>}
      {open && cast > 0 && (
        <ul className="open-ballots">
          {Object.entries(vote.ballots).map(([seat, choice]) => (
            <li key={seat}>{FACTION_SHORT[g.players[Number(seat)]!.factionId]} → <b>{optionLabel(g, choice, me)}</b></li>
          ))}
        </ul>
      )}
      <div className="ballot-options">
        {d.options.map((o) => (
          <button key={o} type="button" className="btn ballot" onClick={() => dispatch({ type: 'CastBallot', seat: me, choice: o })}>
            {optionLabel(g, o, me)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** LP pledge (CR-26) and the Influence bids of the Finale cards. */
export function NumberPrompt({ g, d, me }: { g: GameState; d: PendingDecision; me: Seat }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const [value, setValue] = useState(d.min ?? 0);
  const card = d.sourceCardId ? getCard(d.sourceCardId) : null;
  const pledge = d.kind === 'lpPledge';
  const text = pledge
    ? 'Secretly pledge LP. If the Council pledges 5 or more in total, the pledges are destroyed and the crisis is averted. Otherwise they are refunded and Earth Health drops by 5.'
    : d.kind === 'finalePool'
      ? 'Secretly put Influence into the pool. 15 in total averts the purge. The Influence is spent either way.'
      : 'Blind-bid Influence. Every bid is spent. The single highest bidder takes ALL LP from the two lowest bidders.';
  const submit = () => dispatch(pledge ? { type: 'PledgeLP', seat: me, amount: value } : { type: 'SubmitBid', seat: me, amount: value });
  return (
    <Sheet title={card?.title ?? 'Bid'} kind="modal">
      <p>{text}</p>
      <Stepper label={pledge ? 'LP to pledge' : 'Influence to bid'} value={value} min={d.min ?? 0} max={d.max ?? 0} onChange={setValue} unit={pledge ? 'LP' : 'Influence'} />
      <p className="dim center">You have {pledge ? <><Skull size={12} /> {g.players[me]!.lp} LP</> : <><Cog size={12} /> {g.players[me]!.influence} Influence</>}.</p>
      <button type="button" className="btn btn-primary wide" onClick={submit}>{pledge ? 'Seal the pledge' : 'Close fist'}</button>
    </Sheet>
  );
}
