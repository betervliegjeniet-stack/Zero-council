// Event playback (SPEC §6, §10): every animated engine event has a duration, a sound, a haptic
// and, for some, an ink stamp. All durations live here. Fast mode halves them.
import { getCard, type GameEvent, type GameState, type Seat } from '../engine';
import type { SfxName } from '../audio/sfx';
import type { HapticName } from './haptics';

export const DURATION = {
  turnAdvance: 700,
  newStage: 1700,
  crisisDraw: 300,
  crisisFlip: 450,
  catastropheShake: 250,
  mandateReveal: 600,
  ehPerSegment: 80,
  ehSettle: 350,
  tokenFlight: 400,
  lpForged: 450,
  lpDestroyed: 500,
  reveal: 800,
  revealStagger: 40,
  action: 480,
  fizzle: 750,
  mitigation: 1000,
  blight: 550,
  embargo: 650,
  exile: 850,
  status: 500,
  dealSealed: 550,
  dealBroken: 1000,
  voteStart: 600,
  ballotDrop: 230,
  ballotCount: 300,
  voteResult: 1300,
  stamp: 750,
  crucibleStart: 1900,
  fists: 1100,
  deletion: 900,
  holdToSeal: 600,
  dialSlam: 260,
} as const;

export type StampTone = 'bad' | 'good' | 'grey' | 'brass';

export interface FxSpec {
  ms: number;
  sfx?: SfxName;
  /** Extra plays of the same sound, as delays in seconds. */
  sfxRepeat?: number[];
  haptic?: HapticName;
  stamp?: { text: string; tone: StampTone };
  /** A full-screen title card. */
  title?: { head: string; sub?: string };
  /** Shake the screen and flash red. */
  shake?: boolean;
}

const STAGE_TITLE = ['', 'STAGE I — THE FIRST CRACKS', 'STAGE II — THE DEEPENING SCHISM', 'STAGE III — THE TERMINAL PHASE', 'STAGE IV — THE VOID'];
const ABILITY: Record<string, string> = {
  redactName: 'REDACTED', ventSector: 'SECTOR VENTED', bindingOath: 'BINDING OATH', whisperedParanoia: 'WHISPERED PARANOIA',
  martialLaw: 'MARTIAL LAW', inoculate: 'INOCULATED', subpoena: 'SUBPOENA',
};

export function isCatastrophic(cardId: string): boolean {
  const c = getCard(cardId);
  return c.tags.includes('gameBreaker') || (c.eh.op === 'delta' && c.eh.value <= -3) || c.eh.op === 'set' || c.eh.op === 'end';
}

/** The animation of one event, or null if it is not animated (it then applies at once). */
export function fxFor(e: GameEvent, g: GameState, me: Seat | null): FxSpec | null {
  const mine = (seat: Seat) => seat === me;
  const involved = (dealId: string) => {
    const d = g.deals.find((x) => x.id === dealId);
    return !!d && (d.proposer === me || d.partner === me);
  };
  switch (e.type) {
    case 'TurnStarted':
      return e.newStage && e.turn > 1
        ? { ms: DURATION.newStage, sfx: 'catastrophe', title: { head: STAGE_TITLE[e.stage]!, sub: `Turn ${e.turn}` } }
        : { ms: DURATION.turnAdvance, sfx: 'cogClink', sfxRepeat: [0.12] };
    case 'CardRevealed': {
      if (e.deck !== 'crisis') return { ms: DURATION.mandateReveal, sfx: 'cardDraw' };
      const bad = !e.faceDown && isCatastrophic(e.cardId);
      return bad
        ? { ms: DURATION.crisisDraw + DURATION.crisisFlip + DURATION.catastropheShake + 200, sfx: 'cardDraw', shake: true, haptic: 'ehLoss' }
        : { ms: DURATION.crisisDraw + DURATION.crisisFlip + 150, sfx: 'cardDraw' };
    }
    case 'EHChanged': {
      const n = Math.abs(e.to - e.from);
      const loss = e.to < e.from;
      return {
        ms: n * DURATION.ehPerSegment + DURATION.ehSettle,
        sfx: loss ? 'ehDrop' : 'ehHeal',
        sfxRepeat: loss ? Array.from({ length: Math.floor((n - 1) / 2) }, (_, i) => (i + 1) * 0.16) : [],
        haptic: loss ? 'ehLoss' : undefined,
      };
    }
    case 'InfluenceChanged':
      if (e.cause.startsWith('cost:')) return null; // told by the action itself
      return { ms: DURATION.tokenFlight + 80, sfx: 'cogClink', sfxRepeat: [0.06, 0.13] };
    case 'LPChanged':
      return e.delta > 0 ? { ms: DURATION.lpForged, sfx: 'skullForge' } : { ms: DURATION.lpDestroyed, sfx: 'skullCrack', haptic: mine(e.seat) ? 'ehLoss' : undefined };
    case 'PoolChanged': return { ms: DURATION.tokenFlight, sfx: 'cogClink', sfxRepeat: [0.07] };
    case 'BlightChanged': return { ms: DURATION.blight, sfx: 'blight' };
    case 'StatusApplied':
      if (e.status === 'exiled') return { ms: DURATION.exile, sfx: 'vaultDoor', stamp: { text: 'EXILED', tone: 'bad' } };
      if (e.status === 'embargoedUntil') return { ms: DURATION.embargo, sfx: 'dialSeal', stamp: { text: 'EMBARGOED', tone: 'grey' } };
      if (e.status === 'silencedUntil') return { ms: DURATION.status, sfx: 'glitch', stamp: { text: 'SILENCED', tone: 'grey' } };
      if (e.status === 'paralyzed') return { ms: DURATION.status, sfx: 'glitch', stamp: { text: 'PARALYZED', tone: 'bad' } };
      return { ms: DURATION.status, sfx: 'dialTick' };
    case 'WhisperSkipped': return { ms: 3000, sfx: 'staticCrackle', sfxRepeat: [0.8, 1.6, 2.3], title: { head: 'DEAD FREQUENCY', sub: 'Nobody can whisper.' } };
    case 'DialSpun': return { ms: 160, sfx: 'dialTick' };
    case 'DialsRevealed': return { ms: DURATION.reveal + e.dials.length * DURATION.revealStagger, sfx: 'revealAll' };
    case 'DialRevealedEarly': return { ms: 420, sfx: 'cardFlip' };
    case 'DialPeeked': return mine(e.seat) ? { ms: 500, sfx: 'cardFlip' } : null;
    case 'ActionsQueued': return { ms: DURATION.stamp, sfx: 'glitch', stamp: { text: 'DELAYED', tone: 'grey' } };
    case 'ActionResolved': return { ms: DURATION.action, sfx: e.dial.action === 'sabotage' ? 'skullCrack' : 'dialTick' };
    case 'ActionFizzled': return { ms: DURATION.fizzle, sfx: 'poolFailed', stamp: { text: 'FIZZLED', tone: 'grey' } };
    case 'LiarExposed': return { ms: DURATION.stamp, sfx: 'glitch', stamp: { text: 'LIAR', tone: 'bad' } };
    case 'MitigationResult':
      return e.success
        ? { ms: DURATION.mitigation, sfx: 'poolLocked', stamp: { text: 'MITIGATED', tone: 'good' } }
        : { ms: DURATION.mitigation, sfx: 'poolFailed', stamp: { text: 'FAILED', tone: 'bad' } };
    case 'PledgesRevealed': return { ms: DURATION.stamp, sfx: 'skullForge', stamp: { text: `PLEDGED ${e.total} / ${e.needed}`, tone: e.total >= e.needed ? 'good' : 'bad' } };
    case 'VolunteerAsked': return e.volunteered ? { ms: DURATION.stamp, sfx: 'skullCrack', stamp: { text: 'VOLUNTEERED', tone: 'good' } } : { ms: 260, sfx: 'dialTick' };
    case 'InfluenceBidsRevealed': return { ms: DURATION.fists, sfx: 'revealAll' };
    case 'AbilityUsed': return { ms: DURATION.stamp, sfx: e.ability === 'subpoena' ? 'toll' : 'dialSeal', stamp: { text: ABILITY[e.ability] ?? 'ABILITY', tone: 'brass' } };
    case 'LPRevealed': return e.to === 'all' || e.to === me ? { ms: DURATION.stamp, sfx: 'cardFlip', stamp: { text: `${e.value} LP`, tone: 'brass' } } : null;
    case 'DealAccepted': return e.proposer === me || e.partner === me ? { ms: DURATION.dealSealed, sfx: 'dialSeal', stamp: { text: 'SEALED', tone: 'good' } } : null;
    case 'DealBound': return involved(e.dealId) ? { ms: DURATION.stamp, sfx: 'toll', stamp: { text: 'BINDING OATH', tone: 'brass' } } : null;
    case 'DealBroken': return involved(e.dealId) ? { ms: DURATION.dealBroken, sfx: 'glitch', haptic: 'ehLoss', stamp: { text: 'BETRAYED', tone: 'bad' } } : null;
    case 'DealKept': return involved(e.dealId) ? { ms: 420, sfx: 'cogClink', stamp: { text: 'KEPT', tone: 'good' } } : null;
    case 'VoteStarted': return { ms: DURATION.voteStart, sfx: 'vaultDoor' };
    case 'BallotCast': return { ms: DURATION.ballotDrop, sfx: 'ballotDrop' };
    case 'BallotsCancelled': return { ms: DURATION.stamp, sfx: 'glitch', stamp: { text: 'REDACTED', tone: 'grey' } };
    case 'BallotCounted': return { ms: DURATION.ballotCount, sfx: 'ballotDrop' };
    case 'VoteResult': return { ms: DURATION.voteResult, sfx: 'toll', stamp: { text: e.result.tie ? 'TIE' : e.result.winners.length ? 'THE URN HAS SPOKEN' : 'NO RESULT', tone: e.result.tie ? 'bad' : 'brass' } };
    case 'DeckReshuffled': return { ms: DURATION.stamp, sfx: 'cardDraw', stamp: { text: 'SYSTEM REBOOT', tone: 'brass' } };
    case 'TurnSkipped': return { ms: DURATION.stamp, sfx: 'catastrophe', stamp: { text: 'OVERDRIVE', tone: 'bad' } };
    case 'MainGameOver': return e.cause === 'collapse' ? { ms: 1400, sfx: 'catastrophe', shake: true, stamp: { text: 'THE BUNKER FAILS', tone: 'bad' } } : { ms: 500 };
    case 'CollapsePenalty': return { ms: 1100, sfx: 'catastrophe', shake: true, haptic: 'deletion', stamp: { text: 'EVERYONE BLEEDS', tone: 'bad' } };
    case 'CrucibleStarted': return { ms: DURATION.crucibleStart, sfx: 'vaultDoor', title: { head: 'THE CRUCIBLE', sub: 'Influence crumbles to dust. Only Legacy counts.' } };
    case 'BidsRevealed': return { ms: DURATION.fists, sfx: 'revealAll' };
    case 'PlayerDeleted': return { ms: DURATION.deletion, sfx: 'glitch', sfxRepeat: [], haptic: 'deletion', stamp: { text: 'DELETED', tone: 'bad' } };
    default: return null;
  }
}

/** Events of these kinds that follow each other play together as one group. */
export function batchable(a: GameEvent, b: GameEvent): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'InfluenceChanged': return b.type === 'InfluenceChanged' && a.cause === b.cause;
    case 'LPChanged': return b.type === 'LPChanged' && a.cause === b.cause;
    case 'BlightChanged':
    case 'StatusApplied':
    case 'DialSpun':
    case 'BallotCast':
    case 'PlayerDeleted':
      return true;
    default: return false;
  }
}
