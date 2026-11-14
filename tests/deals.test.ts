import { describe, expect, it } from 'vitest';
import { IllegalIntentError, type DealTerm, type FactionId, type GameState } from '../src/engine';
import { NO_EFFECT, QUIET, allVote, play, plainGame, send, stackCrisis, toDials, toWhisper, type Script } from './helpers';

/** All Blight Wardens (no interrupts), in the Whisper of turn 1. */
function whisper(card = QUIET, factions: FactionId[] = Array(6).fill('wardens'), turn = 0): GameState {
  const s = plainGame({ factions });
  s.turn = turn;
  stackCrisis(s, card);
  return toWhisper(s).state;
}
/** Seat `a` offers, seat `b` accepts. */
function deal(s: GameState, a: number, b: number, terms: DealTerm[]): GameState {
  const offered = send(s, { type: 'ProposeDeal', seat: a, partner: b, terms }).state;
  return send(offered, { type: 'RespondDeal', seat: b, dealId: offered.deals.at(-1)!.id, accept: true }).state;
}
const outcome = (s: GameState, script: Script = {}) => {
  const r = play(s, script);
  return { status: r.state.deals.at(-1)!.status, breakers: r.state.deals.at(-1)!.breakers, state: r.state, events: r.events };
};

describe('making deals (SPEC §4.2)', () => {
  it('executes "give Influence now" and "reveal LP" on accept', () => {
    const s = deal(whisper(), 0, 1, [{ kind: 'giveInfluenceNow', from: 0, amount: 2 }, { kind: 'revealLP', who: 1 }]);
    expect([s.players[0]!.influence, s.players[1]!.influence]).toEqual([3, 7]);
    expect(s.players[1]!.lpShownTo).toEqual({ '0': { value: 3, turn: 1 } });
    expect(s.players[1]!.lpRevealed).toBeNull(); // disclosed to the partner only
    expect(s.deals[0]).toMatchObject({ status: 'accepted', binding: false, proposer: 0, partner: 1 });
    expect([s.players[0]!.stats.dealsMade, s.players[1]!.stats.dealsMade]).toEqual([1, 1]);
  });

  it('can be rejected, and unanswered offers expire when the Council is sealed', () => {
    let s = send(whisper(), { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'willContribute', who: 0, min: 1 }] }).state;
    s = send(s, { type: 'RespondDeal', seat: 1, dealId: s.deals[0]!.id, accept: false }).state;
    s = send(s, { type: 'ProposeDeal', seat: 2, partner: 3, terms: [{ kind: 'willContribute', who: 2, min: 1 }] }).state;
    const r = send(s, { type: 'Advance', seal: true });
    expect(r.state.deals.map((d) => d.status)).toEqual(['rejected', 'expired']);
    expect(r.events).toContainEqual({ type: 'DealExpired', dealId: s.deals[1]!.id });
  });

  it('validates parties, terms and timing', () => {
    const s = whisper();
    const bad = (seat: number, partner: number, terms: DealTerm[]) =>
      expect(() => send(s, { type: 'ProposeDeal', seat, partner, terms })).toThrow(IllegalIntentError);
    bad(0, 0, [{ kind: 'revealLP', who: 0 }]);
    bad(0, 1, []);
    bad(0, 1, [{ kind: 'revealLP', who: 2 }]); // binds an outsider
    bad(0, 1, [{ kind: 'giveInfluenceNow', from: 0, amount: 0 }]);
    bad(0, 1, [{ kind: 'willSabotage', who: 0, target: 0 }]);
    bad(0, 1, [{ kind: 'willContribute', who: 0, min: 1 }, { kind: 'revealLP', who: 0 }, { kind: 'willNotSabotage', who: 0, target: 1 }]); // 3 on one side
    const choir = whisper(QUIET, ['choir', ...Array(5).fill('wardens')]);
    expect(() => send(choir, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'willInoculate', who: 0, target: 1 }] })).toThrow(/Wardens/);
    const dials = toDials(plainGameWith(QUIET)).state;
    expect(() => send(dials, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'revealLP', who: 0 }] })).toThrow(/Whisper/);
    // The giver must still have the Influence when the deal is accepted.
    const offered = send(s, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'giveInfluenceNow', from: 0, amount: 5 }] }).state;
    offered.players[0]!.influence = 2;
    expect(() => send(offered, { type: 'RespondDeal', seat: 1, dealId: offered.deals[0]!.id, accept: true })).toThrow(IllegalIntentError);
    expect(() => send(offered, { type: 'RespondDeal', seat: 2, dealId: offered.deals[0]!.id, accept: true })).toThrow(IllegalIntentError);
  });

  it('shuts Silenced and NoTrade players out', () => {
    const s = whisper();
    s.players[1]!.status.silencedUntil = 1;
    s.players[2]!.status.noTradeUntil = 1;
    for (const [a, b] of [[0, 1], [1, 0], [0, 2], [2, 0]]) {
      expect(() => send(s, { type: 'ProposeDeal', seat: a!, partner: b!, terms: [{ kind: 'revealLP', who: a! }] })).toThrow(IllegalIntentError);
    }
  });

  it('limits the pace: 3 offers per Whisper for the human, 2 per partner for an AI', () => {
    let s = whisper();
    s.players[0]!.isHuman = true;
    const offer = (seat: number, partner: number) => ({ type: 'ProposeDeal' as const, seat, partner, terms: [{ kind: 'revealLP' as const, who: seat }] });
    s = send(s, offer(0, 1), offer(0, 2), offer(0, 3)).state;
    expect(() => send(s, offer(0, 4))).toThrow(/3 offers/);
    s = send(s, offer(1, 0), offer(1, 0)).state;
    expect(() => send(s, offer(1, 0))).toThrow(/2 offers/);
    expect(send(s, offer(1, 2)).state.deals).toHaveLength(6);
  });
});

function plainGameWith(card: string): GameState {
  const s = plainGame({ factions: Array(6).fill('wardens') });
  stackCrisis(s, card);
  return s;
}

describe('promise checking after Phase 4', () => {
  it('"will Contribute at least N": kept, or broken with a BETRAYED record', () => {
    const terms: DealTerm[] = [{ kind: 'willContribute', who: 0, min: 3 }, { kind: 'willContribute', who: 1, min: 3 }];
    const kept = outcome(deal(whisper(), 0, 1, terms), { dials: { 0: { action: 'contribute', amount: 3 }, 1: { action: 'contribute', amount: 4 } } });
    expect(kept.status).toBe('kept');
    const broken = outcome(deal(whisper(), 0, 1, terms), { dials: { 0: { action: 'contribute', amount: 3 }, 1: { action: 'contribute', amount: 2 } } });
    expect([broken.status, broken.breakers]).toEqual(['broken', [1]]);
    expect(broken.events).toContainEqual({ type: 'DealBroken', dealId: broken.state.deals[0]!.id, breakers: [1], binding: false });
    expect([broken.state.players[1]!.stats.dealsBroken, broken.state.players[0]!.stats.timesBetrayed]).toEqual([1, 1]);
    expect(broken.state.players[1]!.lp).toBe(3); // not binding: no LP penalty
  });

  it('"will not Sabotage" and "will Sabotage"', () => {
    const peace: DealTerm[] = [{ kind: 'willNotSabotage', who: 1, target: 0 }];
    expect(outcome(deal(whisper(), 0, 1, peace)).status).toBe('kept');
    expect(outcome(deal(whisper(), 0, 1, peace), { dials: { 1: { action: 'sabotage', target: 2 } } }).status).toBe('kept');
    expect(outcome(deal(whisper(), 0, 1, peace), { dials: { 1: { action: 'sabotage', target: 0 } } }).breakers).toEqual([1]);
    const hit: DealTerm[] = [{ kind: 'willSabotage', who: 0, target: 3 }, { kind: 'willSabotage', who: 1, target: 3 }];
    const r = outcome(deal(whisper(), 0, 1, hit), { dials: { 0: { action: 'sabotage', target: 3 } } });
    expect([r.status, r.breakers]).toEqual(['broken', [1]]);
  });

  it('a fizzled action does not keep a promise', () => {
    const s = deal(whisper(), 0, 1, [{ kind: 'willContribute', who: 1, min: 5 }]);
    let d = toDials(s).state;
    for (const p of d.pending.slice()) {
      const dial = p.seat === 1 ? { action: 'contribute' as const, amount: 5 } : { action: 'gather' as const };
      if (p.seat === 5) d.players[1]!.influence = 0; // seat 1 is robbed after locking in
      d = send(d, { type: 'SetDial', seat: p.seat, dial }, { type: 'LockDial', seat: p.seat }).state;
    }
    expect(d.deals[0]).toMatchObject({ status: 'broken', breakers: [1] });
  });

  it('"will vote": checked against this turn\'s vote', () => {
    const s = () => whisper('CR-25'); // The Loyalty Purge: an Urn vote in Phase 4
    const terms: DealTerm[] = [{ kind: 'willVote', who: 1, target: 2 }];
    expect(outcome(deal(s(), 0, 1, terms), { ballots: { ...allVote(2, 0) } }).status).toBe('kept');
    expect(outcome(deal(s(), 0, 1, terms), { ballots: { ...allVote(2, 0), 1: 3 } }).breakers).toEqual([1]);
    // No vote this turn: the promise is void, so the deal counts as kept.
    expect(outcome(deal(whisper(), 0, 1, terms)).status).toBe('kept');
  });

  it('"will vote aye/nay" works over a Mandate revealed at the start of the turn (DQ-1)', () => {
    const base = () => {
      const s = plainGame({ factions: Array(6).fill('wardens') });
      s.turn = 2;
      s.piles.mandates.push('MAN-02');
      stackCrisis(s, QUIET);
      return toWhisper(s).state;
    };
    expect(base().mandate).toEqual({ cardId: 'MAN-02' });
    const terms: DealTerm[] = [{ kind: 'willVote', who: 0, target: 'nay' }, { kind: 'willVote', who: 1, target: 'nay' }];
    expect(outcome(deal(base(), 0, 1, terms), { ballots: { 0: 'nay', 1: 'nay' } }).status).toBe('kept');
    expect(outcome(deal(base(), 0, 1, terms), { ballots: { 0: 'nay', 1: 'aye' } }).breakers).toEqual([1]);
  });

  it('The Silent Ballot voids vote promises', () => {
    const s = plainGame({ factions: Array(6).fill('wardens') });
    s.turn = 2;
    s.piles.mandates.push('MAN-19');
    stackCrisis(s, QUIET);
    const r = outcome(deal(toWhisper(s).state, 0, 1, [{ kind: 'willVote', who: 1, target: 2 }]), { ballots: { ...allVote(3, 0) } });
    expect(r.status).toBe('kept');
  });

  it('"will Inoculate": kept only if the Warden does it this Whisper', () => {
    const terms: DealTerm[] = [{ kind: 'willInoculate', who: 0, target: 1 }, { kind: 'giveInfluenceNow', from: 1, amount: 4 }];
    const done = send(deal(whisper(), 0, 1, terms), { type: 'UseAbility', seat: 0, ability: 'inoculate', target: 1 }).state;
    expect(outcome(done).status).toBe('kept');
    const skipped = outcome(deal(whisper(), 0, 1, terms));
    expect([skipped.status, skipped.breakers, skipped.state.players[0]!.influence]).toEqual(['broken', [0], 11]); // kept the 4 Influence
  });

  it('Self-Quarantine voids that player\'s promise-deals without a penalty', () => {
    const w = whisper(QUIET, ['choir', ...Array(5).fill('wardens')]);
    w.players[1]!.blight.bio = 1;
    let s = deal(w, 0, 1, [{ kind: 'willContribute', who: 1, min: 3 }, { kind: 'giveInfluenceNow', from: 0, amount: 1 }]);
    s = send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: s.deals[0]!.id }).state;
    const r = outcome(s, { dials: { 1: { action: 'quarantine' } } });
    expect(r.status).toBe('voided');
    expect(r.events).toContainEqual({ type: 'DealVoided', dealId: s.deals[0]!.id, reason: 'Self-Quarantine' });
    expect([r.state.players[1]!.lp, r.state.players[1]!.stats.dealsBroken]).toEqual([3, 0]); // no Binding Oath penalty
    expect(r.state.players[1]!.influence).toBe(6); // Influence already handed over stays where it is
  });

  it('only checks this turn\'s deals', () => {
    let s = outcome(deal(whisper(), 0, 1, [{ kind: 'willContribute', who: 1, min: 1 }]), { dials: { 1: { action: 'contribute', amount: 1 } } }).state;
    stackCrisis(s, NO_EFFECT);
    s = play(send(s, { type: 'Advance' }).state).state;
    expect(s.deals.map((d) => d.status)).toEqual(['kept']);
  });
});

describe('Quiet Choir: Binding Oath', () => {
  const choirTable = () => whisper(QUIET, ['choir', ...Array(5).fill('wardens')]);
  const terms: DealTerm[] = [{ kind: 'willContribute', who: 0, min: 2 }, { kind: 'willContribute', who: 1, min: 2 }];

  it('makes one accepted deal binding: whoever breaks it loses 2 LP', () => {
    let s = deal(choirTable(), 0, 1, terms);
    const bound = send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: s.deals[0]!.id });
    s = bound.state;
    expect(s.deals[0]!.binding).toBe(true);
    expect(bound.events).toContainEqual({ type: 'DealBound', dealId: s.deals[0]!.id, by: 0 });
    const r = outcome(s, { dials: { 0: { action: 'contribute', amount: 2 } } });
    expect([r.status, r.breakers, r.state.players[1]!.lp, r.state.players[0]!.lp]).toEqual(['broken', [1], 1, 3]);
    expect(r.events).toContainEqual({ type: 'DealBroken', dealId: s.deals[0]!.id, breakers: [1], binding: true });
  });

  it('binds the Choir too', () => {
    let s = deal(choirTable(), 0, 1, terms);
    s = send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: s.deals[0]!.id }).state;
    expect(outcome(s, { dials: { 1: { action: 'contribute', amount: 2 } } }).state.players[0]!.lp).toBe(1);
  });

  it('is once per Whisper, only on the Choir\'s own accepted deals, and only for the Choir', () => {
    let s = deal(choirTable(), 0, 1, terms);
    s = deal(s, 0, 2, [{ kind: 'revealLP', who: 2 }]);
    s = deal(s, 3, 4, [{ kind: 'revealLP', who: 3 }]);
    const [a, b, c] = s.deals.map((d) => d.id);
    expect(() => send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: c })).toThrow(IllegalIntentError);
    expect(() => send(s, { type: 'UseAbility', seat: 1, ability: 'bindingOath', dealId: a })).toThrow(IllegalIntentError);
    s = send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: a }).state;
    expect(() => send(s, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: b })).toThrow(/once per Whisper/);
    const offered = send(choirTable(), { type: 'ProposeDeal', seat: 0, partner: 1, terms }).state;
    expect(() => send(offered, { type: 'UseAbility', seat: 0, ability: 'bindingOath', dealId: offered.deals[0]!.id })).toThrow(IllegalIntentError);
  });
});
