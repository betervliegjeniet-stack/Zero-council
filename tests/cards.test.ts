// One test (at least) per card id, following each card's `digitalRuling` (SPEC §13, M2).
import { afterAll, describe, expect, it } from 'vitest';
import {
  CARDS, HANDLERS, IllegalIntentError, abilitiesActive, actionCost, assertRegistryComplete, canTrade, dialOptions,
  turnOrder, type GameState,
} from '../src/engine';
import {
  NO_EFFECT, allVote, crisisGame, finaleGame, infl, lps, mandateGame, play, send, setInfluence, setLP, stackCrisis,
  toDials, toWhisper,
} from './helpers';

const tested = new Set<string>();
/** Declares the test(s) of one card and records that the id is covered. */
function card(id: string, name: string, fn: () => void): void {
  tested.add(id);
  it(`${id} ${name}`, fn);
}
const reveal = (s: GameState) => send(s, { type: 'Advance' });
const contributeAll = (amount: number) =>
  Object.fromEntries([0, 1, 2, 3, 4, 5].map((seat) => [seat, { action: 'contribute' as const, amount }]));
const exiled = (s: GameState) => s.players.filter((p) => p.status.exiled).map((p) => p.seat);
const alive = (s: GameState) => s.players.filter((p) => !p.eliminated).map((p) => p.seat);
/** Three seats name seat 0 and three name seat 1: a tie with no Directorate at the table. */
const SPLIT = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 };

describe('registry', () => {
  it('has a handler for every one of the 71 card ids, and nothing else', () => {
    expect(() => assertRegistryComplete()).not.toThrow();
    expect(Object.keys(HANDLERS).sort()).toEqual(CARDS.map((c) => c.id).sort());
  });
  afterAll(() => {
    const untested = CARDS.map((c) => c.id).filter((id) => !tested.has(id));
    expect(untested, 'cards without a test').toEqual([]);
  });
});

describe('Core Crisis, Stage I', () => {
  card('CR-01', 'Flickering Grid: everyone loses 1 Influence on reveal', () => {
    const s = crisisGame('CR-01');
    s.players[2]!.influence = 0;
    expect(infl(reveal(s).state)).toEqual([4, 4, 0, 4, 4, 4]);
  });

  card('CR-02', 'Oxygen Scrubber Failure: pool 10, or EH -2 and everyone loses 1 LP (0 LP: Embargoed)', () => {
    const s = crisisGame('CR-02');
    s.players[4]!.lp = 0;
    const fail = play(s).state;
    expect(fail.eh).toBe(18);
    expect(lps(fail)).toEqual([2, 2, 2, 2, 0, 2]);
    expect(fail.players[4]!.status.embargoedUntil).toBe(2);
    expect(fail.players[0]!.status.embargoedUntil).toBe(0);
    const ok = play(crisisGame('CR-02'), { dials: contributeAll(2) }).state;
    expect([ok.eh, ...lps(ok)]).toEqual([20, 3, 3, 3, 3, 3, 3]);
  });

  card('CR-03', 'Ration Shortage: Salvage is locked this turn only', () => {
    let s = toDials(crisisGame('CR-03')).state;
    expect(dialOptions(s, 0).find((o) => o.action === 'salvage')!.available).toBe(false);
    s = send(play(s).state, { type: 'Advance' }).state;
    expect(s.modifiers.salvageBlocked).toBe(false);
  });

  card('CR-04', 'Data Corruption: every faction ability is off until end of turn', () => {
    const s = crisisGame('CR-04');
    s.players[0]!.factionId = 'archivists';
    let d = toDials(s).state;
    expect([0, 1, 2, 3, 4, 5].some((seat) => abilitiesActive(d, seat))).toBe(false);
    expect(actionCost(d, 0, { action: 'salvage' })).toBe(3);
    stackCrisis(d, NO_EFFECT);
    d = send(play(d).state, { type: 'Advance' }).state;
    expect(abilitiesActive(d, 0)).toBe(true);
  });

  card('CR-05', 'Water Leaking: pool 6, or EH -1 and the LP leader(s) lose 2 Influence', () => {
    const s = crisisGame('CR-05');
    setLP(s, [3, 5, 5, 3, 3, 3]);
    const fail = play(s).state; // everyone Gathers (+2) first
    expect(fail.eh).toBe(19);
    expect(infl(fail)).toEqual([7, 5, 5, 7, 7, 7]);
    const ok = play(crisisGame('CR-05'), { dials: contributeAll(1) }).state;
    expect([ok.eh, ...infl(ok)]).toEqual([20, 4, 4, 4, 4, 4, 4]);
  });

  card('CR-06', 'Supply Chain Snap: Gather yields 1', () => {
    expect(infl(play(crisisGame('CR-06')).state)).toEqual([6, 6, 6, 6, 6, 6]);
  });

  card('CR-07', 'Minor Tremor: EH -1 on reveal', () => {
    const r = play(crisisGame('CR-07'));
    expect(r.state.eh).toBe(19);
    expect(r.events.some((e) => e.type === 'MitigationResult')).toBe(false);
  });

  card('CR-08', 'The First Cough: open vote in seat order; most votes (all tied) are Infected; no tie penalty', () => {
    const s = toDials(crisisGame('CR-08')).state;
    const r = play(s, { ballots: allVote(0, 1) });
    expect(r.state.players.map((p) => p.blight.bio)).toEqual([1, 0, 0, 0, 0, 0]);
    // Open ballots are public and cast one at a time in seat order.
    const cast = r.events.filter((e) => e.type === 'BallotCast');
    expect(cast.map((e) => (e.type === 'BallotCast' ? [e.seat, e.choice] : null))).toEqual([[0, '1'], [1, '0'], [2, '0'], [3, '0'], [4, '0'], [5, '0']]);
    const tie = play(crisisGame('CR-08'), { ballots: SPLIT }).state;
    expect(tie.players.map((p) => p.blight.bio)).toEqual([1, 1, 0, 0, 0, 0]);
    expect(tie.eh).toBe(20);
    // No self-votes.
    const v = toDials(crisisGame('CR-08')).state;
    const open = play(v, { dials: {} });
    expect(open.state.eh).toBe(20);
  });

  card('CR-09', 'Static Interference: dials are set and revealed one at a time in turn order', () => {
    let s = toDials(crisisGame('CR-09')).state;
    expect(s.pending.map((d) => [d.seat, d.kind])).toEqual([[0, 'dial']]);
    const r = send(s, { type: 'SetDial', seat: 0, dial: { action: 'salvage' } }, { type: 'LockDial', seat: 0 });
    s = r.state;
    expect(r.events).toContainEqual({ type: 'DialRevealedEarly', seat: 0, dial: { action: 'salvage' } });
    expect(s.pending.map((d) => d.seat)).toEqual([1]);
    expect(() => send(s, { type: 'SetDial', seat: 3, dial: { action: 'gather' } })).toThrow(IllegalIntentError);
    expect(play(s).state.step).toBe('turnEndGate');
  });

  card('CR-10', 'Waste Overflow: every Contributor gains 1 LP; pool 8 or EH -2', () => {
    const fail = play(crisisGame('CR-10'), { dials: { 0: { action: 'contribute', amount: 1 } } }).state;
    expect([fail.eh, ...lps(fail)]).toEqual([18, 4, 3, 3, 3, 3, 3]);
    const ok = play(crisisGame('CR-10'), { dials: contributeAll(2) }).state;
    expect([ok.eh, ...lps(ok)]).toEqual([20, 4, 4, 4, 4, 4, 4]);
  });
});

describe('Core Crisis, Stage II', () => {
  card('CR-11', 'Mass Paranoia: actions are queued and resolve after next turn\'s actions', () => {
    let r = play(crisisGame('CR-11'), { dials: { 0: { action: 'salvage' } } });
    expect(r.events).toContainEqual({ type: 'ActionsQueued' });
    expect([infl(r.state), lps(r.state)]).toEqual([[5, 5, 5, 5, 5, 5], [3, 3, 3, 3, 3, 3]]);
    expect(r.state.players[0]!.queuedDial).toEqual({ action: 'salvage' });
    stackCrisis(r.state, NO_EFFECT);
    r = play(send(r.state, { type: 'Advance' }).state); // turn 2: everyone Gathers, then the queue resolves
    expect(infl(r.state)).toEqual([5 + 2 - 3, 9, 9, 9, 9, 9]);
    expect(r.state.players[0]!.lp).toBe(4);
    expect(r.state.players.every((p) => p.queuedDial === null)).toBe(true);
  });

  card('CR-12', 'Medical Collapse: Sabotage destroys 2 LP; pool 10 or EH -2', () => {
    const r = play(crisisGame('CR-12'), { dials: { 0: { action: 'sabotage', target: 1 } } }).state;
    expect([r.players[1]!.lp, r.eh]).toEqual([1, 18]);
  });

  card('CR-13', 'Shadow Embargo: the LP leader(s) lose their abilities until end of turn', () => {
    const s = crisisGame('CR-13');
    setLP(s, [3, 6, 6, 3, 3, 3]);
    let r = reveal(s).state;
    expect([0, 1, 2].map((seat) => abilitiesActive(r, seat))).toEqual([true, false, false]);
    stackCrisis(r, NO_EFFECT);
    r = send(play(r).state, { type: 'Advance' }).state;
    expect(abilitiesActive(r, 1)).toBe(true);
  });

  card('CR-14', 'Fuel Depletion: Contributors pay 1 extra; pool 12 or EH -3', () => {
    const fail = play(crisisGame('CR-14'), { dials: contributeAll(1) }).state;
    expect([fail.eh, ...infl(fail)]).toEqual([17, 3, 3, 3, 3, 3, 3]);
    expect(play(crisisGame('CR-14'), { dials: contributeAll(2) }).state.eh).toBe(20);
  });

  card('CR-15', 'Vault Breach: everyone with LP gives 1 LP to their LEFT, all at once', () => {
    const s = crisisGame('CR-15');
    setLP(s, [3, 0, 1, 2, 0, 4]);
    expect(lps(reveal(s).state)).toEqual([3, 1, 0, 2, 1, 3]);
  });

  card('CR-16', 'The Blighted Harvest: Infected players always lose 1 LP; pool 10 or EH -2', () => {
    const s = crisisGame('CR-16');
    s.players[0]!.blight.bio = 1;
    const ok = play(s, { dials: contributeAll(2) }).state;
    // 3 LP - 1 (Blight upkeep) - 1 (Harvest), although the pool held.
    expect([ok.eh, ok.players[0]!.lp, ok.players[1]!.lp]).toEqual([20, 1, 3]);
    expect(play(crisisGame('CR-16')).state.eh).toBe(18);
    const harsh = play(crisisGame('CR-16', { config: { harshMode: true } })).state;
    expect(harsh.eh).toBe(20);
    expect(lps(harsh).reduce((a, b) => a + b, 0)).toBe(18 - 4);
  });

  card('CR-17', 'Signal Flare: the lowest-LP player(s) gain 3 Influence', () => {
    const s = crisisGame('CR-17');
    setLP(s, [3, 1, 3, 1, 3, 3]);
    expect(infl(reveal(s).state)).toEqual([5, 8, 5, 8, 5, 5]);
  });

  card('CR-18', 'Structural Cracks: pool 15 or EH -4', () => {
    expect(play(crisisGame('CR-18'), { dials: contributeAll(2) }).state.eh).toBe(16);
    expect(play(crisisGame('CR-18'), { dials: contributeAll(3) }).state.eh).toBe(20);
  });

  card('CR-19', 'Whisper Campaign: everyone announces an action; liars are exposed at the reveal', () => {
    let s = toWhisper(crisisGame('CR-19')).state;
    s = send(s, { type: 'Advance', seal: true }).state;
    expect(s.pending.map((d) => d.kind)).toEqual(Array(6).fill('announceAction'));
    const r = play(s, { choose: { announceAction: 'gather' }, dials: { 0: { action: 'salvage' } } });
    expect(r.events.filter((e) => e.type === 'ActionAnnounced')).toHaveLength(6);
    expect(r.events.filter((e) => e.type === 'LiarExposed')).toEqual([
      { type: 'LiarExposed', seat: 0, announced: 'gather', actual: 'salvage' },
    ]);
  });

  card('CR-20', 'Air Lock Malfunction: the first volunteer pays 2 LP; nobody: EH -3', () => {
    const none = play(crisisGame('CR-20'));
    expect(none.state.eh).toBe(17);
    expect(none.events.filter((e) => e.type === 'VolunteerAsked')).toHaveLength(6);
    const s = crisisGame('CR-20');
    s.players[0]!.lp = 1; // cannot afford it, so is not asked
    const r = play(s, { choose: { volunteer: { 1: 'decline', 2: 'volunteer' } } });
    expect([r.state.eh, ...lps(r.state)]).toEqual([20, 1, 3, 1, 3, 3, 3]);
    expect(r.events.filter((e) => e.type === 'VolunteerAsked')).toEqual([
      { type: 'VolunteerAsked', seat: 1, volunteered: false },
      { type: 'VolunteerAsked', seat: 2, volunteered: true },
    ]);
  });
});

describe('Core Crisis, Stage III', () => {
  card('CR-21', 'Zero Hour: pool 10, or EH -3 and the main game ends', () => {
    const fail = play(crisisGame('CR-21')).state;
    expect([fail.eh, fail.mainOver?.cause]).toEqual([17, 'card']);
    const ok = play(crisisGame('CR-21'), { dials: contributeAll(2) }).state;
    expect([ok.eh, ok.mainOver]).toEqual([20, null]);
  });

  card('CR-22', 'The Culling: the player(s) with the least Influence are Exiled', () => {
    const s = crisisGame('CR-22');
    setInfluence(s, [5, 1, 4, 1, 6, 5]);
    expect(exiled(reveal(s).state)).toEqual([1, 3]);
  });

  card('CR-23', 'Neural Decay: every dial lands on a random legal action', () => {
    const r = play(crisisGame('CR-23'));
    expect(r.events.filter((e) => e.type === 'DialSpun')).toHaveLength(6);
    expect(r.events.some((e) => e.type === 'DialLocked')).toBe(false);
    for (const p of r.state.players) {
      expect(p.acted).not.toBeNull();
      expect(p.acted!.dial.action).not.toBe('quarantine'); // nobody is Infected
    }
  });

  card('CR-24', 'Total Darkness: Gather is locked', () => {
    const s = toDials(crisisGame('CR-24')).state;
    expect(dialOptions(s, 0).find((o) => o.action === 'gather')!.available).toBe(false);
  });

  card('CR-25', 'The Loyalty Purge: Urn vote, the target is Exiled; tie: EH -3', () => {
    const r = play(crisisGame('CR-25'), { ballots: allVote(0, 1) }).state;
    expect([exiled(r), r.eh]).toEqual([[0], 20]);
    const tie = play(crisisGame('CR-25'), { ballots: SPLIT }).state;
    expect([exiled(tie), tie.eh]).toEqual([[], 17]);
  });

  card('CR-26', 'Atmospheric Flare: secret LP pledges of 5+ avert it; otherwise refunded and EH -5', () => {
    const ok = play(crisisGame('CR-26'), { pledges: { 0: 3, 1: 2 } }).state;
    expect([ok.eh, ...lps(ok)]).toEqual([20, 0, 1, 3, 3, 3, 3]);
    const fail = play(crisisGame('CR-26'), { pledges: { 0: 3, 1: 1 } }).state;
    expect([fail.eh, ...lps(fail)]).toEqual([15, 3, 3, 3, 3, 3, 3]);
    const noRefund = play(crisisGame('CR-26', { config: { lpPledgeRefundOnFail: false } }), { pledges: { 0: 3, 1: 1 } }).state;
    expect([noRefund.eh, ...lps(noRefund)]).toEqual([15, 0, 2, 3, 3, 3, 3]);
    const s = toDials(crisisGame('CR-26')).state;
    expect(() => send(s, { type: 'PledgeLP', seat: 0, amount: 4 })).toThrow(IllegalIntentError);
  });

  card('CR-27', 'Resource War: Sabotage costs 0', () => {
    const s = toDials(crisisGame('CR-27')).state;
    expect(actionCost(s, 0, { action: 'sabotage', target: 1 })).toBe(0);
  });

  card('CR-28', 'Hemorrhage: lose floor(Influence / 5) LP', () => {
    const s = crisisGame('CR-28');
    setInfluence(s, [10, 5, 4, 14, 0, 9]);
    expect(lps(reveal(s).state)).toEqual([1, 2, 3, 1, 3, 2]);
  });

  card('CR-29', 'Echoes of the Surface: no LP can be gained; pool 12 or EH -3', () => {
    const s = toDials(crisisGame('CR-29')).state;
    expect(dialOptions(s, 0).find((o) => o.action === 'salvage')!.available).toBe(false);
    const r = play(s).state;
    expect([r.eh, ...lps(r)]).toEqual([17, 3, 3, 3, 3, 3, 3]);
  });

  card('CR-30', 'Psychotic Break: everyone passes ALL Influence to their RIGHT, all at once', () => {
    const s = crisisGame('CR-30');
    setInfluence(s, [1, 2, 3, 4, 5, 6]);
    expect(infl(reveal(s).state)).toEqual([2, 3, 4, 5, 6, 1]);
  });
});

describe('Core Crisis, Stage IV', () => {
  card('CR-31', 'Total Infrastructure Collapse: EH -2 and everyone is GatherLocked until they Repair', () => {
    const s = toDials(crisisGame('CR-31')).state;
    expect(s.eh).toBe(18);
    expect(s.players.every((p) => p.status.gatherLocked)).toBe(true);
    const r = play(s, { dials: { 0: { action: 'repair' }, 1: { action: 'salvage' } } }).state;
    expect([r.players[0]!.status.gatherLocked, r.players[0]!.influence, r.players[1]!.status.gatherLocked]).toEqual([false, 2, true]);
  });

  card('CR-32', 'The Final Silence: EH is set to 1', () => {
    expect(reveal(crisisGame('CR-32')).state.eh).toBe(1);
  });

  card('CR-33', 'Cannibalism: Salvage needs a target; you gain 1 LP and they lose 2', () => {
    const s = crisisGame('CR-33');
    s.players[5]!.lp = 0;
    const d = toDials(s).state;
    expect(dialOptions(d, 0).find((o) => o.action === 'salvage')!.targets).toEqual([1, 2, 3, 4]);
    expect(() => send(d, { type: 'SetDial', seat: 0, dial: { action: 'salvage' } })).toThrow(IllegalIntentError);
    expect(() => send(d, { type: 'SetDial', seat: 0, dial: { action: 'salvage', target: 5 } })).toThrow(IllegalIntentError);
    const r = play(d, { dials: { 0: { action: 'salvage', target: 1 } } }).state;
    expect([r.players[0]!.lp, r.players[1]!.lp, r.players[0]!.influence]).toEqual([4, 1, 2]);
  });

  card('CR-34', 'Void Pulse: every player\'s Influence becomes 0', () => {
    expect(infl(reveal(crisisGame('CR-34')).state)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  card('CR-35', 'The Last Breath: EH -4, or straight to the Crucible if EH is already 1', () => {
    expect(reveal(crisisGame('CR-35')).state.eh).toBe(16);
    const s = crisisGame('CR-35');
    s.eh = 1;
    const r = reveal(s).state;
    expect([r.eh, r.mainOver?.cause, r.step]).toEqual([1, 'card', 'turnEndGate']);
    const c = send(r, { type: 'Advance' }).state;
    expect([c.step, ...lps(c)]).toEqual(['crucibleBids', 3, 3, 3, 3, 3, 3]); // no collapse penalty: EH is not 0
  });

  card('CR-36', 'Dead Frequency: the Whisper phase is skipped', () => {
    const r = send(crisisGame('CR-36'), { type: 'Advance' }, { type: 'Advance' });
    expect(r.state.step).toBe('dials');
    expect(r.events).toContainEqual({ type: 'WhisperSkipped' });
  });

  card('CR-37', 'The Great Filter: everyone with fewer than 3 LP is eliminated', () => {
    const s = crisisGame('CR-37');
    setLP(s, [2, 3, 0, 5, 3, 1]);
    const r = reveal(s);
    expect(alive(r.state)).toEqual([1, 3, 4]);
    expect(r.events.filter((e) => e.type === 'PlayerDeleted')).toHaveLength(3);
  });

  card('CR-38', 'Entropy Strike: Sabotage destroys 3 LP', () => {
    const r = play(crisisGame('CR-38'), { dials: { 0: { action: 'sabotage', target: 1 } } }).state;
    expect(r.players[1]!.lp).toBe(0);
  });

  card('CR-39', 'Hallucireality: Urn vote, the target is Exiled; tie: EH -4', () => {
    expect(exiled(play(crisisGame('CR-39'), { ballots: allVote(2, 0) }).state)).toEqual([2]);
    const tie = play(crisisGame('CR-39'), { ballots: SPLIT }).state;
    expect([exiled(tie), tie.eh]).toEqual([[], 16]);
  });

  card('CR-40', 'FINALE: Total Crucible: the top 2 by LP (plus ties) enter the Crucible, the rest are deleted', () => {
    const s = crisisGame('CR-40');
    setLP(s, [5, 4, 4, 1, 2, 3]);
    const r = reveal(s).state;
    expect([alive(r), r.mainOver?.cause]).toEqual([[0, 1, 2], 'card']);
    expect(send(r, { type: 'Advance' }).state.pending.map((d) => d.seat)).toEqual([0, 1, 2]);
  });
});

describe('The Biological Schism', () => {
  card('BS-01', 'Night Terror: EH -2 and random actions', () => {
    const r = play(crisisGame('BS-01'));
    expect(r.state.eh).toBe(18);
    expect(r.events.filter((e) => e.type === 'DialSpun')).toHaveLength(6);
  });

  card('BS-02', 'Permanent Paralysis: EH -1; the lowest contributor(s) are Paralyzed until they pay 5', () => {
    const r = play(crisisGame('BS-02'), { dials: { 0: { action: 'contribute', amount: 2 }, 1: { action: 'contribute', amount: 1 } } }).state;
    expect(r.eh).toBe(19);
    expect(r.players.map((p) => p.status.paralyzed)).toEqual([false, false, true, true, true, true]);
    const one = play(crisisGame('BS-02'), { dials: { ...contributeAll(2), 3: { action: 'contribute', amount: 1 } } }).state;
    expect(one.players.map((p) => p.status.paralyzed)).toEqual([false, false, false, true, false, false]);
  });

  card('BS-03', 'Cancer of the Soul: EH -3; a saboteur is Infected and cannot Gather next turn', () => {
    let r = play(crisisGame('BS-03'), { dials: { 0: { action: 'sabotage', target: 1 } } }).state;
    expect([r.eh, r.players[0]!.blight.bio, r.players[0]!.status.noGatherUntil, r.players[1]!.blight.bio]).toEqual([17, 1, 2, 0]);
    stackCrisis(r, NO_EFFECT);
    r = toDials(send(r, { type: 'Advance' }).state).state;
    expect(dialOptions(r, 0).find((o) => o.action === 'gather')!.available).toBe(false);
    expect(dialOptions(r, 1).find((o) => o.action === 'gather')!.available).toBe(true);
  });

  card('BS-04', 'The Critical Debility: EH -1; Urn vote, the target gains a NEURO cube; tie: EH -3', () => {
    const r = play(crisisGame('BS-04'), { ballots: allVote(3, 0) }).state;
    expect([r.eh, r.players[3]!.blight]).toEqual([19, { bio: 0, neuro: 1 }]);
    const tie = play(crisisGame('BS-04'), { ballots: SPLIT }).state;
    expect(tie.eh).toBe(16);
    // A neuro cube drains Influence, not LP.
    stackCrisis(r, NO_EFFECT);
    const next = send(r, { type: 'Advance' }, { type: 'Advance' }).state;
    expect([next.players[3]!.influence, next.players[3]!.lp]).toEqual([6, 3]);
  });

  card('BS-05', 'The Withered Vein: EH -2; the richest player sacrifices 3 LP or everyone is Infected', () => {
    const base = () => {
      const s = crisisGame('BS-05');
      s.players[2]!.influence = 9;
      return s;
    };
    const sac = play(base(), { choose: { cardChoice: 'sacrifice' } }).state;
    expect([sac.eh, ...lps(sac)]).toEqual([18, 3, 3, 0, 3, 3, 3]);
    expect(sac.players.every((p) => p.blight.bio === 0)).toBe(true);
    const blight = play(base(), { choose: { cardChoice: 'blight' } }).state;
    expect(blight.players.map((p) => p.blight.bio)).toEqual([1, 1, 1, 1, 1, 1]);
    const poor = base();
    poor.players[2]!.lp = 2; // cannot sacrifice: no choice is offered
    const forced = play(poor, { choose: { cardChoice: 'sacrifice' } });
    expect(forced.state.players.map((p) => p.blight.bio)).toEqual([1, 1, 1, 1, 1, 1]);
    // Ties for the most Influence go to the first in turn order (seat 0 on turn 1).
    const tie = play(crisisGame('BS-05'), { choose: { cardChoice: 'sacrifice' } }).state;
    expect(lps(tie)).toEqual([0, 3, 3, 3, 3, 3]);
  });

  card('BS-06', 'Liquid Oblivion: EH -3; pay 5 Influence, or lose 2 LP and your abilities for 2 turns', () => {
    const s = crisisGame('BS-06');
    s.players[2]!.influence = 0; // 2 after Gathering: must suffer
    const r = play(s, { choose: { cardChoice: { 0: 'pay', 1: 'suffer', 3: 'pay', 4: 'pay', 5: 'pay' } } }).state;
    expect(r.eh).toBe(17);
    expect(infl(r)).toEqual([2, 7, 2, 2, 2, 2]);
    expect(lps(r)).toEqual([3, 1, 1, 3, 3, 3]);
    expect(r.players.map((p) => p.status.abilitiesDisabledUntil)).toEqual([0, 3, 3, 0, 0, 0]);
  });

  card('BS-07', 'The Hollow Echo: Urn vote, the target is Silenced next turn; tie: EH -3', () => {
    let r = play(crisisGame('BS-07'), { ballots: allVote(4, 0) }).state;
    expect(r.players[4]!.status.silencedUntil).toBe(2);
    stackCrisis(r, 'CR-03');
    r = toWhisper(send(r, { type: 'Advance' }).state).state;
    expect([canTrade(r, 4), canTrade(r, 0)]).toEqual([false, true]);
    expect(() => send(r, { type: 'ProposeDeal', seat: 0, partner: 4, terms: [{ kind: 'revealLP', who: 0 }] })).toThrow(IllegalIntentError);
    expect(play(crisisGame('BS-07'), { ballots: SPLIT }).state.eh).toBe(17);
  });
});

describe('Finale deck (resolved in Phase 4 of turn 9)', () => {
  card('FIN-01', 'Mandate: Exile: the winner is Exiled unless they pay 10 LP, which forces a tie (EH set to 2)', () => {
    const r = play(finaleGame('FIN-01'), { ballots: allVote(0, 1) }).state;
    expect([exiled(r), r.eh]).toEqual([[0], 20]);
    const rich = finaleGame('FIN-01');
    rich.players[0]!.lp = 12;
    const paid = play(rich, { ballots: allVote(0, 1), choose: { exileBuyout: 'pay' } }).state;
    expect([exiled(paid), paid.eh, paid.players[0]!.lp]).toEqual([[], 2, 2]);
    const rich2 = finaleGame('FIN-01');
    rich2.players[0]!.lp = 12;
    const kept = play(rich2, { ballots: allVote(0, 1), choose: { exileBuyout: 'accept' } }).state;
    expect([exiled(kept), kept.eh, kept.players[0]!.lp]).toEqual([[0], 20, 12]);
    const tie = play(finaleGame('FIN-01'), { ballots: SPLIT }).state;
    expect([exiled(tie), tie.eh]).toEqual([[], 2]);
    const low = finaleGame('FIN-01');
    low.eh = 1;
    expect(play(low, { ballots: SPLIT }).state.eh).toBe(1); // DQ-13: a tie never heals
  });

  card('FIN-02', 'Mandate: Sacrifice: EH -5; the single highest Influence bidder takes all LP of the two lowest', () => {
    const r = play(finaleGame('FIN-02'), { bids: { 0: 6, 1: 0, 2: 0, 3: 2, 4: 3, 5: 4 } }).state; // 7 Influence each after Gather
    expect(r.eh).toBe(15);
    expect(infl(r)).toEqual([1, 7, 7, 5, 4, 3]);
    expect(lps(r)).toEqual([9, 0, 0, 3, 3, 3]); // the two lowest places are tied at 0: both are drained
    const tiedTop = play(finaleGame('FIN-02'), { bids: { 0: 6, 1: 6, 2: 1 } }).state;
    expect(lps(tiedTop)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(infl(tiedTop)).toEqual([1, 1, 6, 7, 7, 7]);
  });

  card('FIN-03', 'Apex Mandate: Purge: a secret pool of 15 averts it; otherwise a random faction is purged', () => {
    const ok = play(finaleGame('FIN-03'), { bids: { 0: 5, 1: 5, 2: 5 } }).state;
    expect([exiled(ok), ...infl(ok)]).toEqual([[], 2, 2, 2, 7, 7, 7]);
    const fail = play(finaleGame('FIN-03'), { bids: { 0: 5, 1: 5, 2: 4 } }).state;
    expect(exiled(fail)).toHaveLength(1);
    expect(infl(fail)).toEqual([2, 2, 3, 7, 7, 7]); // the Influence is spent either way
  });

  card('FIN-04', 'Game Breaker: Total Crucible: same as CR-40, at the end of turn 9', () => {
    const s = finaleGame('FIN-04');
    setLP(s, [1, 6, 2, 6, 4, 3]);
    const r = play(s).state;
    expect([alive(r), r.mainOver?.cause, r.turn]).toEqual([[1, 3], 'card', 9]);
  });
});

describe('Apex Mandates (resolved in Phase 4 of turns 3 and 6)', () => {
  card('MAN-01', 'Decree of Exile: the target is Exiled; tie: EH -3', () => {
    expect(exiled(play(mandateGame('MAN-01'), { ballots: allVote(5, 0) }).state)).toEqual([5]);
    const tie = play(mandateGame('MAN-01'), { ballots: SPLIT }).state;
    expect([exiled(tie), tie.eh]).toEqual([[], 17]);
  });

  card('MAN-02', 'Blood Tithe: Aye: everyone loses 2 LP and EH +4 (capped); tie: EH -3', () => {
    const s = mandateGame('MAN-02');
    s.eh = 10;
    s.players[5]!.lp = 1;
    const aye = play(s, { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye', 4: 'nay', 5: 'nay' } }).state;
    expect([aye.eh, ...lps(aye)]).toEqual([14, 1, 1, 1, 1, 1, 0]);
    const capped = play(mandateGame('MAN-02'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye', 4: 'aye', 5: 'aye' } }).state;
    expect(capped.eh).toBe(20);
    const nay = play(mandateGame('MAN-02'), { ballots: { 0: 'nay', 1: 'nay', 2: 'nay', 3: 'nay', 4: 'aye', 5: 'aye' } }).state;
    expect([nay.eh, ...lps(nay)]).toEqual([20, 3, 3, 3, 3, 3, 3]);
    const tie = play(mandateGame('MAN-02'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'nay', 4: 'nay', 5: 'nay' } }).state;
    expect([tie.eh, ...lps(tie)]).toEqual([17, 3, 3, 3, 3, 3, 3]);
  });

  card('MAN-03', 'Asset Seizure: the target\'s Influence is shared evenly among rivals; the rest is lost', () => {
    const r = play(mandateGame('MAN-03'), { ballots: allVote(0, 1) }).state; // 7 Influence each after Gather
    expect(infl(r)).toEqual([0, 8, 8, 8, 8, 8]);
  });

  card('MAN-04', 'Quarantine Seal: 2 Bio cubes and NoTrade for 2 turns', () => {
    const r = play(mandateGame('MAN-04'), { ballots: allVote(1, 0) }).state;
    expect([r.players[1]!.blight.bio, r.players[1]!.status.noTradeUntil]).toEqual([2, 5]);
  });

  card('MAN-05', 'The Scapegoat: the target loses 3 LP, everyone else gains 1', () => {
    expect(lps(play(mandateGame('MAN-05'), { ballots: allVote(2, 0) }).state)).toEqual([4, 4, 0, 4, 4, 4]);
  });

  card('MAN-06', 'Austerity Protocol: Aye: EH +3 and Gather yields 0 next turn', () => {
    const s = mandateGame('MAN-06');
    s.eh = 10;
    let r = play(s, { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye' } }).state;
    expect([r.eh, r.players[0]!.status.gatherYield0Until]).toEqual([13, 4]);
    stackCrisis(r, NO_EFFECT);
    r = play(send(r, { type: 'Advance' }).state).state;
    expect(infl(r)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  card('MAN-07', 'Public Execution: 4+ votes: lose ceil(LP/2); fewer: nothing; tied top: EH -4', () => {
    const s = mandateGame('MAN-07');
    s.players[0]!.lp = 5;
    expect(play(s, { ballots: allVote(0, 1) }).state.players[0]!.lp).toBe(2);
    const few = play(mandateGame('MAN-07'), { ballots: { 0: 1, 1: 0, 2: 0, 3: 0, 4: 2, 5: 3 } }).state;
    expect([few.eh, ...lps(few)]).toEqual([20, 3, 3, 3, 3, 3, 3]);
    expect(play(mandateGame('MAN-07'), { ballots: SPLIT }).state.eh).toBe(16);
  });

  card('MAN-08', 'Amnesty of Ash: Aye: every Blight Cube and Embargo is removed; tie: EH -2', () => {
    const s = mandateGame('MAN-08');
    s.players[0]!.blight = { bio: 2, neuro: 1 };
    s.players[1]!.status.embargoedUntil = 6;
    const r = play(s, { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye' } }).state;
    expect([r.players[0]!.blight, r.players[1]!.status.embargoedUntil]).toEqual([{ bio: 0, neuro: 0 }, 0]);
    const tie = play(mandateGame('MAN-08'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'nay', 4: 'nay', 5: 'nay' } }).state;
    expect(tie.eh).toBe(18);
  });

  card('MAN-09', 'Forced Conscription: the top 2 are Conscripted next turn; unclear 2nd place: EH -3', () => {
    let r = play(mandateGame('MAN-09'), { ballots: { 1: 0, 2: 0, 3: 0, 0: 1, 4: 1, 5: 2 } }).state;
    expect(r.players.map((p) => p.status.conscriptedUntil)).toEqual([4, 4, 0, 0, 0, 0]);
    stackCrisis(r, NO_EFFECT);
    r = toDials(send(r, { type: 'Advance' }).state).state;
    expect(dialOptions(r, 0).filter((o) => o.available).map((o) => [o.action, o.minAmount])).toEqual([['contribute', 7]]);
    const tie = play(mandateGame('MAN-09'), { ballots: { 1: 0, 2: 0, 0: 1, 3: 1, 4: 2, 5: 2 } }).state;
    expect([tie.eh, tie.players.some((p) => p.status.conscriptedUntil > 0)]).toEqual([17, false]);
  });

  card('MAN-10', 'Blackout Decree: Aye: next turn\'s Crisis is dealt face-down and flips in Phase 4', () => {
    let r = play(mandateGame('MAN-10'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye' } }).state;
    expect(r.blackoutTurn).toBe(4);
    stackCrisis(r, 'CR-18');
    const next = send(r, { type: 'Advance' }, { type: 'Advance' });
    expect(next.state.crisis).toMatchObject({ cardId: 'CR-18', faceDown: true });
    expect(next.events).toContainEqual({ type: 'CardRevealed', cardId: 'CR-18', deck: 'crisis', faceDown: true });
    const end = play(next.state);
    expect(end.events).toContainEqual({ type: 'CardRevealed', cardId: 'CR-18', deck: 'crisis', faceDown: false });
    r = end.state;
    expect(r.eh).toBe(16);
  });

  card('MAN-11', 'Legacy Audit: the target\'s LP is revealed and they lose floor(Influence / 3) LP', () => {
    const r = play(mandateGame('MAN-11'), { ballots: allVote(3, 0) });
    expect(r.state.players[3]!.lp).toBe(1); // 7 Influence after Gather -> lose 2
    expect(r.state.players[3]!.lpRevealed).toEqual({ value: 1, turn: 3 });
    expect(r.events).toContainEqual({ type: 'LPRevealed', seat: 3, value: 3, to: 'all' });
  });

  card('MAN-12', 'Oxygen Rationing: the target is Embargoed for the next 2 turns', () => {
    let r = play(mandateGame('MAN-12'), { ballots: allVote(0, 1) }).state;
    expect(r.players[0]!.status.embargoedUntil).toBe(5);
    r = send(r, { type: 'Advance' }).state;
    expect(actionCost(r, 0, { action: 'salvage' })).toBe(4);
    r.turn = 6;
    expect(actionCost(r, 0, { action: 'salvage' })).toBe(3);
  });

  card('MAN-13', 'The Judas Kiss: anyone picked by BOTH neighbours loses 4 LP; no tie penalty', () => {
    const s = mandateGame('MAN-13');
    s.players[0]!.lp = 5;
    // Seats 1 and 5 are seat 0's neighbours and both pick it; nobody else is picked twice.
    const r = play(s, { ballots: { 0: 1, 1: 0, 2: 3, 3: 4, 4: 5, 5: 0 } }).state;
    expect([r.eh, ...lps(r)]).toEqual([20, 1, 3, 3, 3, 3, 3]);
    const v = play(mandateGame('MAN-13'), { ballots: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 0 } }).state;
    expect([v.eh, ...lps(v)]).toEqual([20, 3, 3, 3, 3, 3, 3]);
  });

  card('MAN-14', 'System Reboot: Aye: every discarded Crisis is shuffled into the Stage III pile', () => {
    const s = mandateGame('MAN-14');
    s.piles.crisisDiscard = [s.piles.stage[0].pop()!, s.piles.stage[0].pop()!];
    const before = s.piles.stage[2].length;
    const r = play(s, { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye' } });
    expect(r.state.piles.stage[2]).toHaveLength(before + 2);
    expect(r.state.piles.crisisDiscard).toEqual([]);
    expect(r.events).toContainEqual({ type: 'DeckReshuffled', pile: 'stage3', count: 2 });
  });

  card('MAN-15', 'Mercy Killing: Mercy: the lowest-LP player gains 3 LP; Efficiency: eliminated if EH < 8', () => {
    const base = (eh = 20) => {
      const s = mandateGame('MAN-15');
      s.players[3]!.lp = 1;
      s.eh = eh;
      return s;
    };
    const mercy = play(base(), { ballots: { 0: 'mercy', 1: 'mercy', 2: 'mercy', 3: 'mercy' } }).state;
    expect(mercy.players[3]!.lp).toBe(4);
    const eff = { 0: 'efficiency', 1: 'efficiency', 2: 'efficiency', 4: 'efficiency', 3: 'mercy', 5: 'mercy' };
    expect(alive(play(base(7), { ballots: eff }).state)).toEqual([0, 1, 2, 4, 5]);
    const safe = play(base(8), { ballots: eff }).state;
    expect([alive(safe).length, safe.players[3]!.lp]).toEqual([6, 1]);
    const tie = play(base(), { ballots: { 0: 'efficiency', 1: 'efficiency', 2: 'efficiency', 3: 'mercy', 4: 'mercy', 5: 'mercy' } }).state;
    expect([tie.eh, tie.players[3]!.lp]).toEqual([17, 1]);
  });

  card('MAN-16', 'Inquisition: the target cannot Sabotage or Salvage next turn', () => {
    let r = play(mandateGame('MAN-16'), { ballots: allVote(0, 1) }).state;
    expect(r.players[0]!.status.noSabotageSalvageUntil).toBe(4);
    stackCrisis(r, NO_EFFECT);
    r = toDials(send(r, { type: 'Advance' }).state).state;
    const open = dialOptions(r, 0).filter((o) => o.available).map((o) => o.action);
    expect(open).toEqual(['gather', 'contribute']);
  });

  card('MAN-17', 'Emergency Overdrive: Aye: one turn is skipped; tie: EH -5', () => {
    const r = play(mandateGame('MAN-17'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'aye' } }).state;
    expect(r.turn).toBe(3);
    const next = send(r, { type: 'Advance' });
    expect(next.state.turn).toBe(5);
    expect(next.events).toContainEqual({ type: 'TurnSkipped', turn: 4 });
    expect(next.events.find((e) => e.type === 'TurnStarted')).toMatchObject({ turn: 5, stage: 2 });
    const tie = play(mandateGame('MAN-17'), { ballots: { 0: 'aye', 1: 'aye', 2: 'aye', 3: 'nay', 4: 'nay', 5: 'nay' } }).state;
    expect(tie.eh).toBe(15);
  });

  card('MAN-18', 'Siphon Mandate: each rival takes 1 Influence from the target, in turn order, until it runs out', () => {
    const s = mandateGame('MAN-18');
    s.players[0]!.influence = 1; // 3 after Gathering
    const r = play(s, { ballots: allVote(0, 1) }).state;
    const takers = turnOrder(r).filter((seat) => seat !== 0).slice(0, 3);
    expect(r.players[0]!.influence).toBe(0);
    for (const p of r.players.slice(1)) expect(p.influence, `seat ${p.seat}`).toBe(takers.includes(p.seat) ? 8 : 7);
  });

  card('MAN-19', 'The Silent Ballot: the target swaps LP totals with the player on their LEFT', () => {
    const s = mandateGame('MAN-19');
    setLP(s, [5, 1, 3, 3, 3, 3]);
    expect(lps(play(s, { ballots: allVote(0, 1) }).state)).toEqual([1, 5, 3, 3, 3, 3]);
  });

  card('MAN-20', 'Zero Consensus: unanimous: the target loses 2 LP; otherwise EH -4 and everyone loses 1 LP', () => {
    const ok = play(mandateGame('MAN-20'), { ballots: allVote(0, 1) }).state;
    expect([ok.eh, ...lps(ok)]).toEqual([20, 1, 3, 3, 3, 3, 3]);
    const no = play(mandateGame('MAN-20'), { ballots: { ...allVote(0, 1), 5: 1 } }).state;
    expect([no.eh, ...lps(no)]).toEqual([16, 2, 2, 2, 2, 2, 2]);
  });
});
