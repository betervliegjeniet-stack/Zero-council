import { describe, expect, it } from 'vitest';
import { lpLeaders, lpLowest, type GameState } from '../src/engine';
import { NO_EFFECT, newGame, playTurn, send, stackCrisis } from './helpers';

const PLAIN = ['choir', 'choir', 'choir', 'choir', 'choir', 'choir'] as never;

function game(card: string): GameState {
  const s = newGame({ factions: PLAIN });
  for (const p of s.players) {
    p.influence = 5;
    p.lp = 3;
  }
  stackCrisis(s, card);
  return s;
}
const all = (amount: number) => Object.fromEntries([0, 1, 2, 3, 4, 5].map((seat) => [seat, { action: 'contribute' as const, amount }]));

describe('Earth Health and mitigation timing (SPEC §2.3)', () => {
  it('applies `reveal` changes in Phase 1', () => {
    const r = send(game('CR-07'), { type: 'Advance' });
    expect(r.state.eh).toBe(19);
    expect(r.events).toContainEqual({ type: 'EHChanged', from: 20, to: 19, cause: 'CR-07' });
  });
  it('sets EH with op `set` (The Final Silence)', () => {
    expect(send(game('CR-32'), { type: 'Advance' }).state.eh).toBe(1);
  });
  it('applies `unmitigated` changes only if the pool fails', () => {
    const fail = playTurn(game('CR-18'), all(2));
    expect(fail.state.eh).toBe(16);
    expect(fail.events.find((e) => e.type === 'MitigationResult')).toMatchObject({ success: false, pool: 12, threshold: 15 });
    const ok = playTurn(game('CR-18'), all(3));
    expect(ok.state.eh).toBe(20);
    expect(ok.events.find((e) => e.type === 'MitigationResult')).toMatchObject({ success: true, pool: 18 });
  });
  it('does not change EH before Phase 4 for an `unmitigated` card', () => {
    expect(send(game('CR-18'), { type: 'Advance' }).state.eh).toBe(20);
  });
  it('clamps EH to [0, maxEH]', () => {
    const s = game('CR-18');
    s.eh = 2;
    expect(playTurn(s).state.eh).toBe(0);
  });
  it('ends the main game when Zero Hour is not mitigated', () => {
    const { state, events } = playTurn(game('CR-21'));
    expect(state.eh).toBe(17);
    expect(state.mainOver).toMatchObject({ cause: 'card', turn: 1 });
    expect(events).toContainEqual({ type: 'MainGameOver', cause: 'card' });
    expect(send(state, { type: 'Advance' }).state.step).toBe('crucibleBids');
  });
  it('goes to the Crucible as soon as EH hits 0, after the current effect', () => {
    const s = game('CR-07');
    s.eh = 1;
    const r = send(s, { type: 'Advance' });
    expect(r.state.mainOver).toMatchObject({ cause: 'collapse' });
    expect(r.state.step).toBe('turnEndGate');
    expect(r.state.pending).toHaveLength(0);
  });
});

describe('Total Collapse penalty (SPEC §2.3)', () => {
  function collapse(config = {}) {
    const s = newGame({ factions: PLAIN, config });
    s.players.forEach((p, i) => {
      p.influence = 5;
      p.lp = [7, 4, 1, 6, 0, 5][i]!;
      p.contributedTotal = [3, 0, 2, 0, 9, 1][i]!;
    });
    s.eh = 1;
    stackCrisis(s, 'CR-07');
    return send(s, { type: 'Advance' }, { type: 'Advance' });
  }
  it('halves everyone (rounded down) and takes 1 more LP from the lowest contributors', () => {
    const { state, events } = collapse();
    // floor(LP/2) lost: 7->4, 4->2, 1->1, 6->3, 0->0, 5->3; seats 1 and 3 contributed least.
    expect(state.players.map((p) => p.lp)).toEqual([4, 1, 1, 2, 0, 3]);
    expect(events).toContainEqual({ type: 'CollapsePenalty', lowestContributors: [1, 3] });
  });
  it('can be switched off', () => {
    expect(collapse({ collapsePenalty: false }).state.players.map((p) => p.lp)).toEqual([7, 4, 1, 6, 0, 5]);
  });
  it('does not apply when the game reaches the turn limit with EH above 0', () => {
    const s = game(NO_EFFECT);
    s.turn = 9;
    const end = send(playTurn(s).state, { type: 'Advance' });
    expect(end.state.mainOver).toMatchObject({ cause: 'turnLimit', turn: 10 });
    expect(end.state.players.every((p) => p.lp === 3)).toBe(true);
    expect(end.state.step).toBe('crucibleBids');
  });
});

describe('Blight upkeep (SPEC §2.6)', () => {
  it('drains 1 LP per bio cube and 1 Influence per neuro cube', () => {
    const s = game(NO_EFFECT);
    s.players[0]!.blight = { bio: 2, neuro: 1 };
    const r = send(s, { type: 'Advance' });
    expect([r.state.players[0]!.lp, r.state.players[0]!.influence]).toEqual([1, 4]);
  });
  it('lets the Blight Wardens ignore their first cube, bio first', () => {
    const s = game(NO_EFFECT);
    s.players[0]!.factionId = 'wardens';
    s.players[0]!.blight = { bio: 2, neuro: 1 };
    s.players[1]!.factionId = 'wardens';
    s.players[1]!.blight = { bio: 0, neuro: 1 };
    const r = send(s, { type: 'Advance' });
    expect([r.state.players[0]!.lp, r.state.players[0]!.influence]).toEqual([2, 4]);
    expect(r.state.players[1]!.influence).toBe(5);
  });
});

describe('ties (SPEC §2.7)', () => {
  it('"the player with the most/least LP" means every tied player', () => {
    const s = game(NO_EFFECT);
    s.players.forEach((p, i) => (p.lp = [5, 2, 5, 1, 1, 3][i]!));
    expect(lpLeaders(s)).toEqual([0, 2]);
    expect(lpLowest(s)).toEqual([3, 4]);
    s.players[0]!.eliminated = true;
    expect(lpLeaders(s)).toEqual([2]);
  });
});

describe('Whisper phase', () => {
  it('runs on the wall clock passed in by Advance and can be sealed early', () => {
    let s = send(game('CR-03'), { type: 'Advance' }).state;
    s = send(s, { type: 'Advance', now: 1_000 }).state;
    expect(s.step).toBe('whisper');
    expect(s.whisper).toEqual({ startedAt: 1_000, endsAt: 46_000 });
    expect(send(s, { type: 'Advance', now: 45_999 }).state.step).toBe('whisper');
    expect(send(s, { type: 'Advance', now: 46_000 }).state.step).toBe('dials');
    expect(send(s, { type: 'Advance', now: 2_000, seal: true }).state.step).toBe('dials');
  });
  it('is skipped by Dead Frequency', () => {
    const r = send(game('CR-36'), { type: 'Advance' }, { type: 'Advance' });
    expect(r.state.step).toBe('dials');
    expect(r.state.whisper).toBeNull();
    expect(r.events).toContainEqual({ type: 'WhisperSkipped' });
  });
});
