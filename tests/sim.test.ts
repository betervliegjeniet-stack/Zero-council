import { describe, expect, it } from 'vitest';
import { aiPolicy, randomPolicy, runGame as run } from '../sim/runner';

const runGame = (options: Parameters<typeof run>[0]) => run(options, randomPolicy);

describe('headless random-action games with every card, vote, ability and deal active', () => {
  for (const [playerCount, games] of [[6, 100], [5, 50], [4, 50]] as const) {
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
    for (let seed = 1; seed <= 30; seed++) {
      const r = runGame({ seed, config: { expansionEnabled: false, finaleMode: 'off', collapsePenalty: false } });
      expect(r.violations).toEqual([]);
    }
  });
});

describe('headless games played by the AI Councilors (SPEC §5.7)', () => {
  it('500 games finish with zero thrown errors and no state invariant violations', () => {
    const outcomes = { survivor: 0, extinction: 0 };
    for (const [playerCount, games] of [[6, 300], [5, 100], [4, 100]] as const) {
      for (let seed = 1; seed <= games; seed++) {
        const r = run({ seed: seed * 104729 + playerCount, playerCount });
        expect(r.violations, `seed ${seed}, ${playerCount} players`).toEqual([]);
        expect(r.state.step).toBe('ended');
        expect(r.state.turn).toBeLessThanOrEqual(10);
        outcomes[r.state.outcome!.kind]++;
      }
    }
    expect(outcomes.survivor).toBeGreaterThan(250);
  });

  it('also runs on Easy and on Merciless with cheating AIs', () => {
    for (let seed = 1; seed <= 25; seed++) {
      expect(run({ seed, difficulty: 'easy' }).violations).toEqual([]);
      expect(run({ seed, difficulty: 'merciless', aiCheats: true }).violations).toEqual([]);
    }
  });

  it('plays around a human seat too (the human answered at random)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = run({ seed, humanFaction: 'iron' }, {
        decide: (s, d, rng) => (s.ai[d.seat] ? aiPolicy.decide(s, d, rng) : randomPolicy.decide(s, d, rng)),
        whisper: (s, seat, rng) => (s.ai[seat] ? aiPolicy.whisper!(s, seat, rng) : []),
        acceptDeal: (s, seat, id, rng) => (s.ai[seat] ? aiPolicy.acceptDeal!(s, seat, id, rng) : randomPolicy.acceptDeal!(s, seat, id, rng)),
        afterDeal: aiPolicy.afterDeal,
      });
      expect(r.violations).toEqual([]);
      expect(r.state.ai[0]).toBeNull();
    }
  });
});
