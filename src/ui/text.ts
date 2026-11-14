// Turns engine events into log lines, hiding what the human is not allowed to know (SPEC §2.8).
import { getCard, type ActionKind, type DealTerm, type Dial, type GameEvent, type GameState, type Seat, type StatusId } from '../engine';
import { FACTION_SHORT } from '../store/gameStore';

export const ACTION_LABEL: Record<ActionKind, string> = {
  gather: 'Gather', salvage: 'Salvage', sabotage: 'Sabotage', contribute: 'Contribute', quarantine: 'Self-Quarantine',
  repair: 'Repair', medicalTax: 'Medical Tax', idle: 'Idle',
};

export const STATUS_LABEL: Record<StatusId, string> = {
  embargoedUntil: 'Embargoed', abilitiesDisabledUntil: 'Abilities disabled', silencedUntil: 'Silenced', noTradeUntil: 'No trade',
  noGatherUntil: 'Cannot Gather', noSabotageSalvageUntil: 'No Sabotage or Salvage', gatherYield0Until: 'Gather yields 0',
  conscriptedUntil: 'Conscripted', exiled: 'Exiled', gatherLocked: 'Gather broken', paralyzed: 'Paralyzed', eliminated: 'Deleted',
};

const CAUSE: Record<string, string> = {
  gather: 'Gather', salvage: 'Salvage', sabotage: 'Sabotage', cannibalism: 'Cannibalism', blight: 'Blight', deal: 'a deal',
  airTax: 'Air Tax', collapse: 'Total Collapse', collapseLowestContributor: 'lowest contributor', crucible: 'the Crucible',
  crucibleBid: 'a bid', bindingOath: 'a broken Binding Oath', contributeReward: 'Contributing', ventSector: 'Vent the Sector',
  inoculate: 'Inoculate', martialLaw: 'Martial Law', whisperedParanoia: 'Whispered Paranoia', quarantine: 'Self-Quarantine',
  blightTransfer: 'a Blight transfer',
};
function cause(c: string): string {
  if (c.startsWith('cost:')) return ACTION_LABEL[c.slice(5) as ActionKind] ?? c;
  if (/^(CR|BS|MAN|FIN)-\d\d$/.test(c)) return getCard(c).title;
  return CAUSE[c] ?? c;
}

export function seatName(g: GameState, seat: Seat, me: Seat | null): string {
  return seat === me ? 'You' : `The ${FACTION_SHORT[g.players[seat]!.factionId]}`;
}
/** "you" / "the Iron Remnant" for the middle of a sentence. */
export function seatObj(g: GameState, seat: Seat, me: Seat | null): string {
  return seat === me ? 'you' : `the ${FACTION_SHORT[g.players[seat]!.factionId]}`;
}
const s = (n: number) => (Math.abs(n) === 1 ? '' : 's');

export function dialText(g: GameState, dial: Dial, me: Seat | null): string {
  const label = ACTION_LABEL[dial.action];
  if (dial.action === 'contribute') return `${label} ${dial.amount}`;
  if (dial.target !== undefined) return `${label} → ${seatObj(g, dial.target, me)}`;
  return label;
}

export function optionLabel(g: GameState, option: string, me: Seat | null): string {
  if (/^\d+$/.test(option)) return seatName(g, Number(option), me).replace(/^The /, '');
  return { aye: 'Aye', nay: 'Nay', mercy: 'Mercy', efficiency: 'Efficiency', chaos: 'Let it burn' }[option] ?? option;
}

export function termText(g: GameState, t: DealTerm, me: Seat | null): string {
  const who = (seat: Seat) => (seat === me ? 'You' : seatName(g, seat, me));
  const verb = (seat: Seat, you: string, they: string) => (seat === me ? you : they);
  switch (t.kind) {
    case 'giveInfluenceNow': return `${who(t.from)} ${verb(t.from, 'give', 'gives')} ${t.amount} Influence now`;
    case 'willContribute': return `${who(t.who)} will Contribute at least ${t.min}`;
    case 'willNotSabotage': return `${who(t.who)} will not Sabotage ${seatObj(g, t.target, me)}`;
    case 'willSabotage': return `${who(t.who)} will Sabotage ${seatObj(g, t.target, me)}`;
    case 'willVote': return `${who(t.who)} will vote ${typeof t.target === 'number' ? seatObj(g, t.target, me) : t.target.toUpperCase()}`;
    case 'willInoculate': return `${who(t.who)} will Inoculate ${seatObj(g, t.target, me)}`;
    case 'revealLP': return `${who(t.who)} ${verb(t.who, 'show', 'shows')} ${verb(t.who, 'your', 'their')} LP`;
  }
}

export type Tone = 'plain' | 'bad' | 'good' | 'head' | 'dim';
export interface LogLine { text: string; tone: Tone }

/** One log line for an event, or null if it is not shown (or not the human's to know). */
export function describe(e: GameEvent, g: GameState, me: Seat | null): LogLine | null {
  const N = (seat: Seat) => seatName(g, seat, me);
  const line = (text: string, tone: Tone = 'plain'): LogLine => ({ text, tone });
  const verb = (seat: Seat, you: string, they: string) => (seat === me ? you : they);
  switch (e.type) {
    case 'TurnStarted': return line(`Turn ${e.turn} — Stage ${['I', 'II', 'III', 'IV'][e.stage - 1]}`, 'head');
    case 'CardRevealed': {
      if (e.faceDown) return line('A Crisis is dealt face-down: ???', 'bad');
      const c = getCard(e.cardId);
      return line(`${c.deck === 'crisis' ? 'Crisis' : c.deck === 'mandate' ? 'Apex Mandate' : 'Finale'}: ${c.title}`, 'head');
    }
    case 'CardSkipped': return line(`${getCard(e.cardId).title} is skipped: ${e.reason.toLowerCase()}.`, 'dim');
    case 'EHChanged': return line(`Earth Health ${e.from} → ${e.to} (${cause(e.cause)})`, e.to < e.from ? 'bad' : 'good');
    case 'InfluenceChanged': {
      if (e.cause.startsWith('cost:') || e.cause === 'gather') return null; // told by the action line
      return line(`${N(e.seat)} ${e.delta > 0 ? verb(e.seat, 'gain', 'gains') : verb(e.seat, 'lose', 'loses')} ${Math.abs(e.delta)} Influence (${cause(e.cause)})`, e.seat === me ? (e.delta > 0 ? 'good' : 'bad') : 'plain');
    }
    case 'LPChanged': {
      if (e.seat === me) return line(`You ${e.delta > 0 ? 'gain' : 'lose'} ${Math.abs(e.delta)} LP (${cause(e.cause)})`, e.delta > 0 ? 'good' : 'bad');
      if (!e.hidden) return line(`${N(e.seat)} ${e.delta > 0 ? 'gains' : 'loses'} ${Math.abs(e.delta)} LP (${cause(e.cause)})`);
      if (['sabotage', 'salvage', 'cannibalism', 'crucibleBid'].includes(e.cause)) return null;
      return line(`${N(e.seat)} ${e.delta > 0 ? 'gains' : 'loses'} LP (${cause(e.cause)})`, 'dim');
    }
    case 'BlightChanged': return line(`${N(e.seat)}: ${e.bio + e.neuro} Blight Cube${s(e.bio + e.neuro)} (${cause(e.cause)})`, e.seat === me ? 'bad' : 'plain');
    case 'StatusApplied': return line(`${N(e.seat)}: ${STATUS_LABEL[e.status]}${e.until ? ` through turn ${e.until}` : ''}`, e.seat === me ? 'bad' : 'plain');
    case 'StatusCleared': return line(`${N(e.seat)}: no longer ${STATUS_LABEL[e.status].toLowerCase()}`, 'good');
    case 'WhisperSkipped': return line('DEAD FREQUENCY. Nobody can whisper.', 'bad');
    case 'ActionsQueued': return line('Every action is delayed until next turn.', 'bad');
    case 'ActionAnnounced': return line(`${N(e.seat)} ${verb(e.seat, 'announce', 'announces')}: ${ACTION_LABEL[e.action]}`);
    case 'LiarExposed': return line(`LIAR: ${N(e.seat)} announced ${ACTION_LABEL[e.announced]} but chose ${ACTION_LABEL[e.actual]}`, 'bad');
    case 'DialRevealedEarly': return line(`${N(e.seat)} ${verb(e.seat, 'show', 'shows')} ${verb(e.seat, 'your', 'their')} dial: ${dialText(g, e.dial, me)}`);
    case 'DialPeeked': return e.seat === me ? line(`You peek: ${N(e.target)} chose ${dialText(g, e.dial, me)}`, 'good') : null;
    case 'ActionResolved': return line(`${N(e.seat)}: ${dialText(g, e.dial, me)}`, e.dial.target === me ? 'bad' : 'plain');
    case 'ActionFizzled': return line(`${N(e.seat)}: ${dialText(g, e.dial, me)} — FIZZLED (${e.reason.toLowerCase()})`, 'dim');
    case 'MitigationResult': return line(e.success ? `MITIGATED: ${e.pool} / ${e.threshold}` : `FAILED: ${e.pool} / ${e.threshold}`, e.success ? 'good' : 'bad');
    case 'PledgesRevealed': return line(`LP pledged: ${e.total} of ${e.needed}. ${e.destroyed ? 'The pledges are destroyed.' : 'The pledges are refunded.'}`);
    case 'VolunteerAsked': return line(`${N(e.seat)} ${e.volunteered ? verb(e.seat, 'volunteer', 'volunteers') : verb(e.seat, 'decline', 'declines')}`, e.volunteered ? 'good' : 'dim');
    case 'CardChoice': return line(`${N(e.seat)} ${verb(e.seat, 'choose', 'chooses')}: ${e.choice}`);
    case 'InfluenceBidsRevealed': return line(`Fists open: ${e.bids.map((b) => `${N(b.seat).replace(/^The /, '')} ${b.amount}`).join(', ')}`);
    case 'AbilityUsed': {
      const name = { redactName: 'Redact Name', ventSector: 'Vent the Sector', bindingOath: 'Binding Oath', whisperedParanoia: 'Whispered Paranoia', martialLaw: 'Martial Law', inoculate: 'Inoculate', subpoena: 'Subpoena' }[e.ability];
      if (e.ability === 'whisperedParanoia' && e.seat !== me) return line(`${N(e.seat)} uses Whispered Paranoia`, 'dim');
      return line(`${N(e.seat)} ${verb(e.seat, 'use', 'uses')} ${name}${e.target !== undefined && e.target !== e.seat ? ` on ${seatObj(g, e.target, me)}` : ''}`, e.target === me ? 'bad' : 'plain');
    }
    case 'LPRevealed':
      if (e.to !== 'all' && e.to !== me && e.seat !== me) return null;
      return line(`${N(e.seat)} ${verb(e.seat, 'have', 'has')} ${e.value} LP${e.to === 'all' ? ' — revealed to the whole Council' : ''}`, 'good');
    case 'DealProposed':
      if (e.proposer === me) return null;
      if (e.partner === me) return line(`${N(e.proposer)} slides you a note.`);
      return line(`${N(e.proposer)} and ${seatObj(g, e.partner, me)} whisper behind cupped hands…`, 'dim');
    case 'DealAccepted':
      return e.proposer === me || e.partner === me ? line(`Deal sealed with ${seatObj(g, e.proposer === me ? e.partner : e.proposer, me)}.`, 'good') : null;
    case 'DealBound': {
      const d = g.deals.find((x) => x.id === e.dealId);
      return d && (d.proposer === me || d.partner === me) ? line(`${N(e.by)} ${verb(e.by, 'seal', 'seals')} the deal with a Binding Oath.`, 'bad') : null;
    }
    case 'DealKept': {
      const d = g.deals.find((x) => x.id === e.dealId);
      return d && (d.proposer === me || d.partner === me) ? line(`Deal kept with ${seatObj(g, d.proposer === me ? d.partner : d.proposer, me)}.`, 'good') : null;
    }
    case 'DealBroken': {
      const d = g.deals.find((x) => x.id === e.dealId);
      if (!d || (d.proposer !== me && d.partner !== me)) return null;
      return line(`BETRAYED: ${e.breakers.map((b) => N(b)).join(' and ')} broke the deal${e.binding ? ' (Binding Oath: −2 LP)' : ''}.`, 'bad');
    }
    case 'DealVoided': {
      const d = g.deals.find((x) => x.id === e.dealId);
      return d && (d.proposer === me || d.partner === me) ? line(`A deal is void (${e.reason}).`, 'dim') : null;
    }
    case 'VoteStarted': return line(`The Black Urn opens: ${getCard(e.cardId).title}${e.mercyTarget !== null ? ` — on trial: ${seatObj(g, e.mercyTarget, me)}` : ''}`, 'head');
    case 'BallotCast': return e.choice !== undefined ? line(`${N(e.seat)} ${verb(e.seat, 'vote', 'votes')}: ${optionLabel(g, e.choice, me)}`) : null;
    case 'BallotsCancelled': return line(`${N(e.by)} ${verb(e.by, 'redact', 'redacts')} ${e.count} ballot${s(e.count)}.`, 'bad');
    case 'VoteResult': {
      const tally = Object.entries(e.result.tally).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${optionLabel(g, o, me)} ${n}`).join(', ');
      const out = e.result.tie ? 'TIE — the Mandate fails' : e.result.winners.length ? e.result.winners.map((w) => optionLabel(g, w, me)).join(' + ') : 'no result';
      return line(`Count: ${tally || 'no ballots'}. Result: ${out}${e.result.brokenBy !== null ? ' (tie broken by the Directorate)' : ''}.`, e.result.tie ? 'bad' : 'plain');
    }
    case 'DeckReshuffled': return line(`${e.count} old Crisis cards are shuffled back into Stage III.`);
    case 'TurnSkipped': return line(`OVERDRIVE: turn ${e.turn} is skipped.`, 'bad');
    case 'AbsencePunished': return line('While you were gone, the Council conspired against you.', 'bad');
    case 'MainGameOver': return line({ turnLimit: 'Turn 10 is over.', collapse: 'EARTH HEALTH IS ZERO. The bunker fails.', card: 'The main game ends.', attrition: 'The Council is empty.' }[e.cause], 'head');
    case 'CollapsePenalty': return line('TOTAL COLLAPSE: everyone bleeds half their LP; the lowest contributors lose 1 more.', 'bad');
    case 'CrucibleStarted': return line('THE CRUCIBLE. Influence crumbles to dust. Only Legacy counts.', 'head');
    case 'CrucibleRoundOpened': return line(`Round ${e.round}: close your fist.`, 'head');
    case 'BidsRevealed': return line(`Fists open: ${e.bids.map((b) => `${N(b.seat).replace(/^The /, '')} ${b.amount}`).join(', ')}`);
    case 'PlayerDeleted': return line(`DELETED: ${N(e.seat)} (${cause(e.cause)})`, 'bad');
    case 'GameEnded': return line(e.outcome.kind === 'survivor' ? `Last Survivor: ${N(e.outcome.seat)}` : 'TOTAL EXTINCTION. Silence wins.', 'head');
    default: return null;
  }
}
