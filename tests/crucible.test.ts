import { describe, expect, it } from 'vitest';
import { IllegalIntentError, type GameState } from '../src/engine';
import { newGame, send } from './helpers';

/** A game standing at the door of the Crucible with the given LP per seat. */
function crucible(lp: number[]): GameState {
  const s = newGame({ playerCount: 6 });
  s.players.forEach((p, i) => {
    if (i >= lp.length) p.eliminated = true;
    else p.lp = lp[i]!;
  });
  s.turn = 10;
  s.mainOver = { cause: 'turnLimit', turn: 10 };
  s.step = 'crucibleStart';
  return send(s, { type: 'Advance' }).state;
}
const bid = (s: GameState, bids: number[]) =>
  send(s, ...s.pending.map((d) => ({ type: 'SubmitBid' as const, seat: d.seat, amount: bids[d.seat]! })));
const alive = (s: GameState) => s.players.filter((p) => !p.eliminated).map((p) => p.seat);

describe('The Crucible (SPEC §2.10)', () => {
  it('makes Influence worthless and asks every living player for a bid of 0..LP', () => {
    const s = crucible([5, 4, 3]);
    expect(s.players.filter((p) => !p.eliminated).every((p) => p.influence === 0)).toBe(true);
    expect(s.pending.map((d) => [d.seat, d.kind, d.min, d.max])).toEqual([
      [0, 'crucibleBid', 0, 5], [1, 'crucibleBid', 0, 4], [2, 'crucibleBid', 0, 3],
    ]);
    expect(() => send(s, { type: 'SubmitBid', seat: 2, amount: 4 })).toThrow(IllegalIntentError);
    expect(() => send(s, { type: 'SubmitBid', seat: 4, amount: 0 })).toThrow(IllegalIntentError);
  });

  it('deletes the lowest bidder and destroys every bid, survivors included', () => {
    const { state, events } = bid(crucible([5, 4, 3]), [2, 3, 1]);
    expect(alive(state)).toEqual([0, 1]);
    expect(state.players.map((p) => p.lp).slice(0, 3)).toEqual([3, 1, 2]);
    expect(events).toContainEqual({ type: 'PlayerDeleted', seat: 2, cause: 'crucible' });
    expect(state.crucible!.round).toBe(2);
  });

  it('breaks a tie for lowest by the fewest LP left after the bid', () => {
    // Seats 1 and 2 both bid 1; seat 1 keeps 3, seat 2 keeps 2 -> seat 2 is deleted.
    const { state } = bid(crucible([5, 4, 3]), [2, 1, 1]);
    expect(alive(state)).toEqual([0, 1]);
  });

  it('deletes ALL tied players if the tie-break is tied too', () => {
    const { state } = bid(crucible([5, 3, 3, 6]), [2, 1, 1, 3]);
    expect(alive(state)).toEqual([0, 3]);
  });

  it('ends with a Last Survivor', () => {
    let s = bid(crucible([5, 4, 3]), [2, 3, 1]).state;
    const end = bid(s, [3, 1, 0]);
    s = end.state;
    expect(s.step).toBe('ended');
    expect(s.outcome).toEqual({ kind: 'survivor', seat: 0, mainEndCause: 'turnLimit' });
    expect(end.events.at(-1)).toEqual({ type: 'GameEnded', outcome: s.outcome });
    expect(() => send(s, { type: 'Advance' })).toThrow(IllegalIntentError);
  });

  it('ends in Total Extinction when the last players tie completely', () => {
    const { state } = bid(crucible([4, 4]), [4, 4]);
    expect(state.outcome).toEqual({ kind: 'extinction', mainEndCause: 'turnLimit' });
    expect(alive(state)).toEqual([]);
  });

  it('deletes at least one player every round, even when everyone bids 0', () => {
    const { state } = bid(crucible([3, 2, 5]), [0, 0, 0]);
    expect(alive(state)).toEqual([0, 2]);
  });

  it('ends at once when only one player reaches it', () => {
    const s = crucible([4]);
    expect(s.outcome).toEqual({ kind: 'survivor', seat: 0, mainEndCause: 'turnLimit' });
  });
});
