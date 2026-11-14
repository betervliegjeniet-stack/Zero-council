import { describe, expect, it } from 'vitest';
import { IllegalIntentError, actionCost, type FactionId, type GameState } from '../src/engine';
import { NO_EFFECT, QUIET, allVote, infl, lps, play, plainGame, send, stackCrisis, toDials, toWhisper } from './helpers';

/** Seat 0 plays `faction`; the other five are Blight Wardens, who never interrupt. */
function game(faction: FactionId, card = QUIET, turn = 0): GameState {
  const s = plainGame({ factions: [faction, 'wardens', 'wardens', 'wardens', 'wardens', 'wardens'] });
  s.turn = turn;
  stackCrisis(s, card);
  return s;
}
const exiled = (s: GameState) => s.players.filter((p) => p.status.exiled).map((p) => p.seat);

describe('Scrubber Guild: Vent the Sector', () => {
  it('costs 4 Influence; the rival pays 2 to the Guild or is Embargoed this turn', () => {
    const w = toWhisper(game('scrubbers')).state;
    const r = send(w, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 1 });
    expect(r.state.players[0]!.influence).toBe(1);
    const d = r.state.pending[0]!;
    expect([d.seat, d.kind, d.options]).toEqual([1, 'ventResponse', ['pay', 'embargo']]);
    // The Whisper cannot be sealed while the rival still has to answer.
    expect(send(r.state, { type: 'Advance', seal: true }).state.step).toBe('whisper');

    const paid = send(r.state, { type: 'ChooseOption', seat: 1, decisionId: d.id, option: 'pay' }).state;
    expect(infl(paid).slice(0, 2)).toEqual([3, 3]);

    let emb = send(r.state, { type: 'ChooseOption', seat: 1, decisionId: d.id, option: 'embargo' }).state;
    expect(emb.players[1]!.status.embargoedUntil).toBe(1);
    expect(actionCost(emb, 1, { action: 'salvage' })).toBe(4);
    emb = send(play(emb).state, { type: 'Advance' }).state;
    expect(actionCost(emb, 1, { action: 'salvage' })).toBe(3);
  });

  it('is once per turn, needs 4 Influence and a rival who can still pay gets no "pay" option below 2', () => {
    const w = toWhisper(game('scrubbers')).state;
    w.players[0]!.influence = 9;
    w.players[2]!.influence = 1;
    const r = send(w, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 2 });
    expect(r.state.pending[0]!.options).toEqual(['embargo']);
    const after = send(r.state, { type: 'ChooseOption', seat: 2, decisionId: r.state.pending[0]!.id, option: 'embargo' }).state;
    expect(() => send(after, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 1 })).toThrow(/Already used/);
    const poor = toWhisper(game('scrubbers')).state;
    poor.players[0]!.influence = 3;
    expect(() => send(poor, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 1 })).toThrow(IllegalIntentError);
  });

  it('only works in the Whisper, on a rival, for the Guild, while abilities are active', () => {
    const dials = toDials(game('scrubbers')).state;
    expect(() => send(dials, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 1 })).toThrow(IllegalIntentError);
    const w = toWhisper(game('scrubbers')).state;
    expect(() => send(w, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 0 })).toThrow(IllegalIntentError);
    expect(() => send(w, { type: 'UseAbility', seat: 1, ability: 'ventSector', target: 0 })).toThrow(IllegalIntentError);
    w.players[0]!.status.exiled = true;
    expect(() => send(w, { type: 'UseAbility', seat: 0, ability: 'ventSector', target: 1 })).toThrow(/disabled/);
  });
});

describe('Blight Wardens: Inoculate', () => {
  it('costs 2 LP and removes every cube from any player, themselves included', () => {
    const w = toWhisper(game('wardens')).state;
    w.players[2]!.blight = { bio: 2, neuro: 1 };
    const r = send(w, { type: 'UseAbility', seat: 0, ability: 'inoculate', target: 2 }).state;
    expect([r.players[0]!.lp, r.players[2]!.blight]).toEqual([1, { bio: 0, neuro: 0 }]);
    expect(r.inoculations).toEqual([{ by: 0, target: 2 }]);
    expect(() => send(r, { type: 'UseAbility', seat: 0, ability: 'inoculate', target: 0 })).toThrow(IllegalIntentError);

    const self = toWhisper(game('wardens')).state;
    self.players[0]!.blight.bio = 3;
    expect(send(self, { type: 'UseAbility', seat: 0, ability: 'inoculate', target: 0 }).state.players[0]!.blight.bio).toBe(0);
    self.players[1]!.lp = 1;
    expect(() => send(self, { type: 'UseAbility', seat: 1, ability: 'inoculate', target: 1 })).toThrow(/2 LP/);
  });
});

describe('Black Urn Directorate: Subpoena', () => {
  it('is free, once per turn, and reveals a rival\'s exact LP to everyone', () => {
    const w = toWhisper(game('directorate')).state;
    w.players[3]!.lp = 6;
    const r = send(w, { type: 'UseAbility', seat: 0, ability: 'subpoena', target: 3 });
    expect(r.state.players[3]!.lpRevealed).toEqual({ value: 6, turn: 1 });
    expect(r.state.players[0]!.influence).toBe(5);
    expect(r.events).toContainEqual({ type: 'LPRevealed', seat: 3, value: 6, to: 'all' });
    expect(() => send(r.state, { type: 'UseAbility', seat: 0, ability: 'subpoena', target: 2 })).toThrow(/Already used/);
    stackCrisis(r.state, 'CR-06');
    const next = toWhisper(send(play(r.state).state, { type: 'Advance' }).state).state;
    expect(send(next, { type: 'UseAbility', seat: 0, ability: 'subpoena', target: 2 }).state.players[2]!.lpRevealed).toEqual({ value: 3, turn: 2 });
  });
});

describe('Quiet Choir: Whispered Paranoia', () => {
  it('after all dials are locked: pay 2 to see one rival\'s dial, then change your own', () => {
    let s = toDials(game('choir')).state;
    for (const d of s.pending.slice()) {
      const dial = d.seat === 1 ? { action: 'sabotage' as const, target: 0 } : { action: 'gather' as const };
      s = send(s, { type: 'SetDial', seat: d.seat, dial }, { type: 'LockDial', seat: d.seat }).state;
    }
    const peek = s.pending[0]!;
    expect([peek.seat, peek.kind, peek.options]).toEqual([0, 'paranoiaPeek', ['1', '2', '3', '4', '5', 'pass']]);
    const r = send(s, { type: 'ChooseOption', seat: 0, decisionId: peek.id, option: '1' });
    expect(r.events).toContainEqual({ type: 'DialPeeked', seat: 0, target: 1, dial: { action: 'sabotage', target: 0 } });
    expect(r.state.players[0]!.influence).toBe(3);
    expect(r.state.pending.map((d) => [d.seat, d.kind])).toEqual([[0, 'dial']]);
    // Seat 0 answers the betrayal in kind.
    const end = play(r.state, { dials: { 0: { action: 'sabotage', target: 1 } } }).state;
    expect([end.players[0]!.lp, end.players[1]!.lp, end.players[0]!.influence]).toEqual([2, 2, 1]);
  });

  it('can be passed, and is not offered without 2 Influence or under Static Interference', () => {
    const pass = play(game('choir'));
    expect(pass.events.some((e) => e.type === 'DialPeeked')).toBe(false);
    expect(pass.state.players[0]!.influence).toBe(7);
    const poor = game('choir');
    poor.players[0]!.influence = 1;
    const r = play(poor, { choose: { paranoiaPeek: '1' } });
    expect(r.events.some((e) => e.type === 'DialPeeked')).toBe(false);
    const seq = play(game('choir', 'CR-09'), { choose: { paranoiaPeek: '1' } });
    expect(seq.events.some((e) => e.type === 'DialPeeked')).toBe(false);
  });

  it('allows the peek but no change when the dials were spun at random (DQ-16)', () => {
    const r = play(game('choir', 'CR-23'), { choose: { paranoiaPeek: '1' } });
    expect(r.events.filter((e) => e.type === 'DialPeeked')).toHaveLength(1);
    expect(r.events.some((e) => e.type === 'DialLocked')).toBe(false);
  });
});

describe('Iron Remnant: Martial Law', () => {
  it('offers "spend 3 to ignore" when a personal Crisis penalty is about to hit', () => {
    const r = send(game('iron', 'CR-01'), { type: 'Advance' }); // Flickering Grid: everyone loses 1 Influence
    const d = r.state.pending[0]!;
    expect([d.seat, d.kind, d.options, d.timeoutMs, d.defaultOption]).toEqual([0, 'martialLaw', ['ignore', 'decline'], 5000, 'decline']);
    expect(infl(r.state)).toEqual([5, 5, 5, 5, 5, 5]); // nothing has landed yet
    const ignore = send(r.state, { type: 'ChooseOption', seat: 0, decisionId: d.id, option: 'ignore' });
    expect(infl(ignore.state)).toEqual([2, 4, 4, 4, 4, 4]);
    expect(ignore.events).toContainEqual({ type: 'AbilityUsed', seat: 0, ability: 'martialLaw' });
    const decline = send(r.state, { type: 'ChooseOption', seat: 0, decisionId: d.id, option: 'decline' }).state;
    expect(infl(decline)).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('covers LP loss, Exile, Infection and other statuses from Crisis cards', () => {
    const lp = game('iron', 'CR-02');
    const r = play(lp, { choose: { martialLaw: 'ignore' } }).state; // pool fails: everyone else loses 1 LP
    expect(lps(r)).toEqual([3, 2, 2, 2, 2, 2]);
    const purge = play(game('iron', 'CR-25'), { ballots: allVote(0, 1), choose: { martialLaw: 'ignore' } }).state;
    expect(exiled(purge)).toEqual([]);
    const purged = play(game('iron', 'CR-25'), { ballots: allVote(0, 1) }).state;
    expect(exiled(purged)).toEqual([0]);
    const cough = play(game('iron', 'CR-08'), { ballots: allVote(0, 1), choose: { martialLaw: 'ignore' } }).state;
    expect(cough.players[0]!.blight.bio).toBe(0);
  });

  it('is not offered for EH changes, Mandates, penalties that miss them, or without 3 Influence', () => {
    const none = (s: GameState, script = {}) => play(s, script).events.some((e) => e.type === 'AbilityUsed' && e.ability === 'martialLaw');
    expect(none(game('iron', 'CR-07'), { choose: { martialLaw: 'ignore' } })).toBe(false); // EH only
    const mandate = game('iron', NO_EFFECT, 2);
    mandate.piles.mandates.push('MAN-05');
    expect(none(mandate, { ballots: allVote(0, 1), choose: { martialLaw: 'ignore' } })).toBe(false);
    const miss = game('iron', 'CR-22'); // The Culling exiles the poorest, which is not seat 0
    miss.players[3]!.influence = 0;
    expect(none(miss, { choose: { martialLaw: 'ignore' } })).toBe(false);
    const poor = game('iron', 'CR-01');
    poor.players[0]!.influence = 2;
    expect(send(poor, { type: 'Advance' }).state.pending).toHaveLength(0);
  });

  it('is once per turn and does not work while Exiled', () => {
    const s = game('iron', 'CR-02');
    s.players[0]!.influence = 9;
    stackCrisis(s, 'CR-02');
    const r = play(s, { choose: { martialLaw: 'ignore' } });
    expect(r.events.filter((e) => e.type === 'AbilityUsed' && e.ability === 'martialLaw')).toHaveLength(1);
    const ex = game('iron', 'CR-01');
    ex.players[0]!.status.exiled = true;
    expect(send(ex, { type: 'Advance' }).state.pending).toHaveLength(0);
  });
});
