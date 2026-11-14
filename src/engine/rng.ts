// Seeded RNG (mulberry32). The generator state is a single uint32 kept in GameState.rng,
// so the same seed and the same intents always give the same game.
export interface RngHolder {
  rng: number;
}

export function seedToState(seed: number): number {
  return (seed >>> 0) || 0x9e3779b9;
}

/** Advances the holder's state and returns a float in [0, 1). */
export function nextFloat(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max], both inclusive. */
export function randInt(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(nextFloat(h) * (max - min + 1));
}

export function pick<T>(h: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  return items[randInt(h, 0, items.length - 1)]!;
}

/** Fisher-Yates; returns a new array. */
export function shuffle<T>(h: RngHolder, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(h, 0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
