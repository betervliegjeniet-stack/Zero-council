// AI personalities and difficulty (SPEC §5.1).
import { getFaction, type Personality } from '../data';
import { nextFloat, type RngHolder } from '../rng';
import type { AIState, GameState, Seat } from '../types';

const TRAITS = ['greed', 'aggression', 'cooperation', 'honesty', 'vengefulness', 'risk'] as const;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The faction default with a seeded ± jitter per game. */
export function rollPersonality(rng: RngHolder, base: Personality, jitter: number): Personality {
  const p = { ...base };
  for (const t of TRAITS) p[t] = clamp01(base[t] + (nextFloat(rng) * 2 - 1) * jitter);
  return p;
}

export function createAIState(rng: RngHolder, s: Pick<GameState, 'players' | 'config'>, seat: Seat): AIState {
  const me = s.players[seat]!;
  const n = s.players.length;
  return {
    personality: rollPersonality(rng, getFaction(me.factionId).aiPersonality, s.config.ai.personalityJitter),
    trust: Array(n).fill(0),
    hostility: Array(n).fill(0.1),
    // Starting pools are printed on the faction mats, so they are public.
    lpEstimate: s.players.map((p) => getFaction(p.factionId).start.lp),
    recentHarm: Array(n).fill(0),
  };
}

export function temperature(s: GameState): number {
  return s.config.ai.temperature[s.difficulty];
}

/** A throwaway RNG for one AI decision: deterministic for a given state, seat and purpose. */
export function aiRng(s: GameState, seat: Seat, salt: string): RngHolder {
  let h = (s.rng ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(s.turn + 1, 0x85ebca6b)) >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
  return { rng: h || 1 };
}

/** Samples an index with probability proportional to exp(score / temperature). */
export function softmaxPick(rng: RngHolder, scores: number[], temp: number): number {
  const max = Math.max(...scores);
  const w = scores.map((x) => Math.exp((x - max) / Math.max(temp, 0.01)));
  let r = nextFloat(rng) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r <= 0) return i;
  }
  return w.length - 1;
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
