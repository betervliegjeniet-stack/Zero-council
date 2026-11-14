// Read-only helpers over GameState.
import { getCard, type Card } from './data';
import type { GameState, PlayerState, Seat, TurnModifiers } from './types';

export function player(s: GameState, seat: Seat): PlayerState {
  const p = s.players[seat];
  if (!p) throw new Error(`No such seat: ${seat}`);
  return p;
}

export function living(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.eliminated);
}

export function livingSeats(s: GameState): Seat[] {
  return living(s).map((p) => p.seat);
}

/** LEFT of seat i = (i+1) mod n, skipping eliminated players. Null if nobody else is alive. */
export function leftOf(s: GameState, seat: Seat): Seat | null {
  return neighbour(s, seat, 1);
}

/** RIGHT of seat i = (i-1+n) mod n, skipping eliminated players. */
export function rightOf(s: GameState, seat: Seat): Seat | null {
  return neighbour(s, seat, -1);
}

function neighbour(s: GameState, seat: Seat, dir: 1 | -1): Seat | null {
  const n = s.players.length;
  for (let k = 1; k < n; k++) {
    const other = (seat + dir * k + n * n) % n;
    if (!s.players[other]!.eliminated) return other;
  }
  return null;
}

/** Living seats clockwise, starting from the first player of this turn. */
export function turnOrder(s: GameState): Seat[] {
  const n = s.players.length;
  const order: Seat[] = [];
  for (let k = 0; k < n; k++) {
    const seat = (s.firstSeat + k) % n;
    if (!s.players[seat]!.eliminated) order.push(seat);
  }
  return order;
}

/** All living players tied for the most LP (SPEC §2.7: ties hit everyone). */
export function lpLeaders(s: GameState): Seat[] {
  const alive = living(s);
  if (alive.length === 0) return [];
  const max = Math.max(...alive.map((p) => p.lp));
  return alive.filter((p) => p.lp === max).map((p) => p.seat);
}

export function lpLowest(s: GameState): Seat[] {
  const alive = living(s);
  if (alive.length === 0) return [];
  const min = Math.min(...alive.map((p) => p.lp));
  return alive.filter((p) => p.lp === min).map((p) => p.seat);
}

export function isActive(s: GameState, until: number): boolean {
  return until > 0 && s.turn <= until;
}

export function isEmbargoed(s: GameState, seat: Seat): boolean {
  return isActive(s, player(s, seat).status.embargoedUntil);
}

export function isInfected(p: PlayerState): boolean {
  return p.blight.bio + p.blight.neuro > 0;
}

/** Faction passives and actives work unless Exiled, temporarily disabled, or switched off for everyone. */
export function abilitiesActive(s: GameState, seat: Seat): boolean {
  const p = player(s, seat);
  if (p.eliminated || p.status.exiled) return false;
  if (isActive(s, p.status.abilitiesDisabledUntil)) return false;
  return !s.modifiers.abilitiesDisabledAll;
}

export function totalBlightInPlay(s: GameState): number {
  return s.players.reduce((sum, p) => sum + p.blight.bio + p.blight.neuro, 0);
}

export function currentCrisis(s: GameState): Card | null {
  return s.crisis ? getCard(s.crisis.cardId) : null;
}

/** The Influence pool threshold of the current Crisis, or null if it has none. */
export function poolThreshold(s: GameState): number | null {
  const card = currentCrisis(s);
  if (!card || card.deck !== 'crisis' || card.mitigation.kind !== 'pool_influence') return null;
  return card.mitigation.amount;
}

export function emptyModifiers(): TurnModifiers {
  return {
    salvageBlocked: false,
    gatherBlocked: false,
    gatherYield: null,
    sabotageCost: null,
    sabotageDamageBonus: 0,
    sabotageDamageSet: null,
    contributeSurcharge: 0,
    contributeRewardLP: 0,
    noLPGain: false,
    skipWhisper: false,
    poolLeak: 0,
    abilitiesDisabledAll: false,
    other: [],
  };
}
