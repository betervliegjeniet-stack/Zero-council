import { describe, expect, it } from 'vitest';
import { IllegalIntentError, ballotOptions, type GameState } from '../src/engine';
import { allVote, crisisGame, lps, mandateGame, play, send, toDials } from './helpers';

const exiled = (s: GameState) => s.players.filter((p) => p.status.exiled).map((p) => p.seat);
const SPLIT = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 };

/** Plays MAN-01 (Decree of Exile) up to the point where ballots are asked for. */
function toBallots(s: GameState): GameState {
  let state = toDials(s).state;
  for (let i = 0; i < 50 && !state.pending.some((d) => d.kind === 'ballot'); i++) {
    const d = state.pending[0];
    if (!d) throw new Error('no ballot was asked');
    if (d.kind === 'dial') state = send(state, { type: 'SetDial', seat: d.seat, dial: { action: 'gather' } }, { type: 'LockDial', seat: d.seat }).state;
    else state = send(state, { type: 'ChooseOption', seat: d.seat, decisionId: d.id, option: d.defaultOption ?? d.options.at(-1)! }).state;
  }
  return state;
}

describe('the Black Urn (SPEC §2.9)', () => {
  it('asks every living player for a ballot and forbids self-votes', () => {
    const s = mandateGame('MAN-01');
    s.players[4]!.eliminated = true;
    const b = toBallots(s);
    expect(b.pending.map((d) => d.seat)).toEqual([0, 1, 2, 3, 5]);
    expect(ballotOptions(b, b.vote!, 0)).toEqual(['1', '2', '3', '5']);
    expect(() => send(b, { type: 'CastBallot', seat: 0, choice: 0 })).toThrow(IllegalIntentError);
    expect(() => send(b, { type: 'CastBallot', seat: 0, choice: 4 })).toThrow(IllegalIntentError);
    expect(() => send(b, { type: 'CastBallot', seat: 4, choice: 0 })).toThrow(IllegalIntentError);
  });

  it('keeps urn ballots secret until the count, then pops them out one at a time', () => {
    const r = play(mandateGame('MAN-01'), { ballots: allVote(5, 0) });
    const cast = r.events.filter((e) => e.type === 'BallotCast');
    expect(cast).toHaveLength(6);
    expect(cast.every((e) => e.type === 'BallotCast' && e.choice === undefined)).toBe(true);
    expect(r.events.filter((e) => e.type === 'BallotCounted')).toHaveLength(6);
    const result = r.events.find((e) => e.type === 'VoteResult');
    expect(result).toMatchObject({ result: { tally: { '5': 5, '0': 1 }, winners: ['5'], tie: false, brokenBy: null } });
  });

  it('counts the Directorate ballot as 2', () => {
    const s = mandateGame('MAN-01');
    s.players[0]!.factionId = 'directorate';
    // Seat 0 (x2) and seat 1 name seat 2 = 3 votes; seats 2, 3 and 4 name seat 5 = 3 votes... seat 5 names seat 2.
    const r = play(s, { ballots: { 0: 2, 1: 2, 2: 5, 3: 5, 4: 5, 5: 1 } });
    expect(r.events.find((e) => e.type === 'VoteResult')).toMatchObject({ result: { tally: { '2': 3, '5': 3, '1': 1 } } });
  });

  it('does not count double when the Directorate is Exiled', () => {
    const s = mandateGame('MAN-01');
    s.players[0]!.factionId = 'directorate';
    s.players[0]!.status.exiled = true;
    const r = play(s, { ballots: { 0: 2, 1: 2, 2: 5, 3: 5, 4: 5, 5: 1 } });
    expect(exiled(r.state)).toEqual([0, 5]);
  });

  it('a tie fails the Mandate and costs EH when nobody can break it', () => {
    const r = play(mandateGame('MAN-01'), { ballots: SPLIT });
    expect([exiled(r.state), r.state.eh]).toEqual([[], 17]);
    expect(r.events.find((e) => e.type === 'VoteResult')).toMatchObject({ result: { tie: true, winners: [] } });
  });

  it('lets the Directorate break a tie, which avoids the EH penalty', () => {
    const s = mandateGame('MAN-01');
    s.players[5]!.factionId = 'directorate';
    // Seat 5 counts double: 0 gets 1+1+1 = 3 (from 1, 2, 3); 1 gets 1+2 = 3 (from 0 and 5); seat 4 names 2.
    const ballots = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 };
    const r = play(s, { ballots, choose: { tieBreak: '0' } });
    expect([exiled(r.state), r.state.eh]).toEqual([[0], 20]);
    expect(r.events.find((e) => e.type === 'VoteResult')).toMatchObject({ result: { tie: false, brokenBy: 5, winners: ['0'] } });
  });

  it('lets the Directorate choose chaos and let it burn', () => {
    const s = mandateGame('MAN-01');
    s.players[5]!.factionId = 'directorate';
    const r = play(s, { ballots: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 }, choose: { tieBreak: 'chaos' } });
    expect([exiled(r.state), r.state.eh]).toEqual([[], 17]);
  });

  it('uses the default tie penalty for an Urn vote whose card has no tie block (BS-04)', () => {
    const r = play(crisisGame('BS-04', { config: { defaultUrnTiePenalty: 5 } }), { ballots: SPLIT }).state;
    expect(r.eh).toBe(20 - 1 - 5);
  });

  it('skips target votes when only two players are left', () => {
    const s = mandateGame('MAN-01');
    [2, 3, 4, 5].forEach((seat) => (s.players[seat]!.eliminated = true));
    const r = play(s);
    expect(r.events).toContainEqual({ type: 'CardSkipped', cardId: 'MAN-01', reason: 'Too few players left to vote' });
    expect([exiled(r.state), r.state.eh]).toEqual([[], 20]);
  });
});

describe("Archivists' Redact Name", () => {
  const withArchivist = () => {
    const s = mandateGame('MAN-05'); // The Scapegoat: the target loses 3 LP, the others gain 1
    s.players[0]!.factionId = 'archivists';
    return s;
  };

  it('tells the Archivist how many ballots name them and cancels up to 2', () => {
    // Seat 0 is named by 1, 2 and 3; seat 1 by 0, 4 and 5 -> a 3-3 tie. Cancelling 2 makes seat 1 the target.
    const ballots = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 };
    const r = play(withArchivist(), { ballots, choose: { redactName: '2' } });
    expect(lps(r.state)).toEqual([4, 0, 4, 4, 4, 4]);
    expect(r.events).toContainEqual({ type: 'BallotsCancelled', by: 0, count: 2 });
    expect(r.state.players[0]!.abilityUsesThisGame).toBe(1);
    expect(r.events.filter((e) => e.type === 'BallotCounted')).toHaveLength(4);
  });

  it('offers at most the number of ballots that name them, and only once per game', () => {
    const s = withArchivist();
    const b = toBallots(s);
    let state = b;
    for (const d of b.pending) state = send(state, { type: 'CastBallot', seat: d.seat, choice: d.seat === 0 ? 1 : d.seat === 1 ? 0 : 1 }).state;
    const ask = state.pending.find((d) => d.kind === 'redactName')!;
    expect([ask.seat, ask.max, ask.info]).toEqual([0, 1, { ballotsNamingYou: 1 }]);

    const used = withArchivist();
    used.players[0]!.abilityUsesThisGame = 1;
    const r = play(used, { ballots: allVote(0, 1), choose: { redactName: '2' } });
    expect(r.state.players[0]!.lp).toBe(0);
  });

  it('is not offered when no ballot names them, or when they are Exiled', () => {
    const none = play(withArchivist(), { ballots: allVote(3, 1), choose: { redactName: '2' } });
    expect(none.events.some((e) => e.type === 'BallotsCancelled')).toBe(false);
    const ex = withArchivist();
    ex.players[0]!.status.exiled = true;
    expect(play(ex, { ballots: allVote(0, 1), choose: { redactName: '2' } }).state.players[0]!.lp).toBe(0);
  });

  it('cancels the heaviest ballot first (the Directorate counts double)', () => {
    const s = withArchivist();
    s.players[5]!.factionId = 'directorate';
    // Seat 0 is named by 1, 2 and 5 (x2) = 4; seat 3 by 0 and 4 = 2. Cancelling one ballot removes the double one.
    const r = play(s, { ballots: { 0: 3, 1: 0, 2: 0, 3: 1, 4: 3, 5: 0 }, choose: { redactName: '1', tieBreak: '3' } });
    expect(r.events.find((e) => e.type === 'VoteResult')).toMatchObject({ result: { tally: { '0': 2, '3': 2, '1': 1 } } });
    expect(r.state.players[3]!.lp).toBe(0);
  });
});
