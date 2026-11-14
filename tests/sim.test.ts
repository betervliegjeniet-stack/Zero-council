import { describe, expect, it } from 'vitest';
import { runGame } from '../sim/runner';

describe('headless random-action games with every card, vote, ability and deal active', () => {
  for (const [playerCount, games] of [[6, 300], [5, 100], [4, 100]] as const) {
    it(`${games} games with ${playerCount} players run from setup to the end of the Crucible`, () => {
      const outcomes = { survivor: 0, extinction: 0 };
      for (let seed = 1; seed <= games; seed++) {
        const r = runGame({ seed: seed * 7919 + playerCount, playerCount });
        expect(r.violations, `seed ${seed}`).toEqual([]);
        expect(r.state.step).toBe('ended');
        expect(r.state.turn).toBeLessThanOrEqual(10);
        outcomes[r.state.outcome!.kind]++;
        const alive = r.state.players.filter((p) => !p.eliminated);
        expect(alive.length).toBe(r.state.outcome!.kind === 'survivor' ? 1 : 0);
      }
      expect(outcomes.survivor).toBeGreaterThan(0);
    });
  }

  it('also runs with the expansion, the finale and the collapse penalty switched off', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = runGame({ seed, config: { expansionEnabled: false, finaleMode: 'off', collapsePenalty: false } });
      expect(r.violations).toEqual([]);
    }
  });
});
