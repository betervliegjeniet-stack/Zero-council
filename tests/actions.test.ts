import { describe, expect, it } from 'vitest';
import { IllegalIntentError, actionCost, dialOptions, type GameState } from '../src/engine';
import { NO_EFFECT, newGame, playTurn, send, stackCrisis, toDials } from './helpers';

const PLAIN = ['choir', 'choir', 'choir', 'choir', 'choir', 'choir'] as const;

function game(card = NO_EFFECT, factions: readonly string[] = PLAIN): GameState {
  const s = newGame({ factions: factions as never });
  for (const p of s.players) {
    p.influence = 5;
    p.lp = 3;
  }
  stackCrisis(s, card);
  return s;
}
const open = (s: GameState, seat: number) => dialOptions(s, seat).filter((o) => o.available).map((o) => o.action);

describe('Gather', () => {
  it('gives +2 Influence for free', () => {
    const { state } = playTurn(game(), { 0: { action: 'gather' } });
    expect(state.players[0]!.influence).toBe(7);
  });
  it('yields 1 under Supply Chain Snap and 0 under GatherYield0', () => {
    expect(playTurn(game('CR-06')).state.players[0]!.influence).toBe(6);
    const s = game();
    s.players[0]!.status.gatherYield0Until = 1;
    expect(playTurn(s).state.players[0]!.influence).toBe(5);
  });
  it('is locked by Total Darkness', () => {
    const { state } = toDials(game('CR-24'));
    expect(open(state, 0)).not.toContain('gather');
    expect(() => send(state, { type: 'SetDial', seat: 0, dial: { action: 'gather' } })).toThrow(IllegalIntentError);
  });
});

describe('Salvage', () => {
  it('costs 3 Influence for +1 LP', () => {
    const { state } = playTurn(game(), { 0: { action: 'salvage' } });
    expect([state.players[0]!.influence, state.players[0]!.lp]).toEqual([2, 4]);
  });
  it('costs the Archivists 2, unless they are Exiled', () => {
    const s = game(NO_EFFECT, ['archivists', ...PLAIN.slice(1)]);
    expect(playTurn(s, { 0: { action: 'salvage' } }).state.players[0]!.influence).toBe(3);
    const exiled = game(NO_EFFECT, ['archivists', ...PLAIN.slice(1)]);
    exiled.players[0]!.status.exiled = true;
    expect(playTurn(exiled, { 0: { action: 'salvage' } }).state.players[0]!.influence).toBe(2);
  });
  it('is locked by Ration Shortage and by Echoes of the Surface', () => {
    for (const card of ['CR-03', 'CR-29']) {
      const { state } = toDials(game(card));
      const opt = dialOptions(state, 0).find((o) => o.action === 'salvage')!;
      expect(opt.available, card).toBe(false);
      expect(opt.reason).toBeTruthy();
    }
  });
});

describe('Sabotage', () => {
  it('costs 2 Influence and destroys 1 LP of the target', () => {
    const { state } = playTurn(game(), { 0: { action: 'sabotage', target: 2 } });
    expect([state.players[0]!.influence, state.players[2]!.lp]).toEqual([3, 2]);
    expect(state.players[2]!.stats.lpDestroyed).toBe(1);
  });
  it('wastes damage beyond 0 LP', () => {
    const s = game('CR-38');
    s.players[2]!.lp = 1;
    expect(playTurn(s, { 0: { action: 'sabotage', target: 2 } }).state.players[2]!.lp).toBe(0);
  });
  it('destroys 2 LP under Medical Collapse and 3 under Entropy Strike', () => {
    expect(playTurn(game('CR-12'), { 0: { action: 'sabotage', target: 2 } }).state.players[2]!.lp).toBe(1);
    expect(playTurn(game('CR-38'), { 0: { action: 'sabotage', target: 2 } }).state.players[2]!.lp).toBe(0);
  });
  it('is free under Resource War, but an Embargo surcharge still applies', () => {
    expect(playTurn(game('CR-27'), { 0: { action: 'sabotage', target: 2 } }).state.players[0]!.influence).toBe(5);
    const s = game('CR-27');
    s.players[0]!.status.embargoedUntil = 1;
    expect(playTurn(s, { 0: { action: 'sabotage', target: 2 } }).state.players[0]!.influence).toBe(4);
  });
  it('cannot target yourself or a dead player', () => {
    const s = game();
    s.players[3]!.eliminated = true;
    const { state } = toDials(s);
    for (const target of [0, 3]) {
      expect(() => send(state, { type: 'SetDial', seat: 0, dial: { action: 'sabotage', target } })).toThrow(IllegalIntentError);
    }
  });
  it('costs the Iron Remnant 1 against an LP leader, ties included', () => {
    const s = game(NO_EFFECT, ['iron', ...PLAIN.slice(1)]);
    s.players[0]!.lp = 1;
    s.players[1]!.lp = 6;
    s.players[2]!.lp = 6;
    const { state } = toDials(s);
    expect(actionCost(state, 0, { action: 'sabotage', target: 1 })).toBe(1);
    expect(actionCost(state, 0, { action: 'sabotage', target: 2 })).toBe(1);
    expect(actionCost(state, 0, { action: 'sabotage', target: 3 })).toBe(2);
    state.players[0]!.status.exiled = true;
    expect(actionCost(state, 0, { action: 'sabotage', target: 1 })).toBe(2);
  });
  it('lets a Blight Warden move a cube onto the target', () => {
    const s = game(NO_EFFECT, ['wardens', ...PLAIN.slice(1)]);
    s.players[0]!.blight.bio = 2;
    const { state } = playTurn(s, { 0: { action: 'sabotage', target: 1, transferBlight: true } });
    expect([state.players[0]!.blight.bio, state.players[1]!.blight.bio]).toEqual([1, 1]);
    const { state: d } = toDials(game());
    expect(() => send(d, { type: 'SetDial', seat: 0, dial: { action: 'sabotage', target: 1, transferBlight: true } })).toThrow(IllegalIntentError);
  });
});

describe('Contribute', () => {
  it('moves X Influence into the Global Pool and tracks the total', () => {
    const { state, events } = playTurn(game('CR-18'), { 0: { action: 'contribute', amount: 4 }, 1: { action: 'contribute', amount: 2 } });
    expect([state.players[0]!.influence, state.players[1]!.influence]).toEqual([1, 3]);
    expect(state.players[0]!.contributedTotal).toBe(4);
    expect(events.find((e) => e.type === 'MitigationResult')).toMatchObject({ pool: 6, threshold: 15, success: false });
  });
  it('needs X >= 1 and no more than you can pay', () => {
    const { state } = toDials(game());
    for (const amount of [0, 6, 1.5]) {
      expect(() => send(state, { type: 'SetDial', seat: 0, dial: { action: 'contribute', amount } })).toThrow(IllegalIntentError);
    }
  });
  it('adds a 1 Influence surcharge under Fuel Depletion that does not reach the pool', () => {
    const { state, events } = playTurn(game('CR-14'), { 0: { action: 'contribute', amount: 3 } });
    expect(state.players[0]!.influence).toBe(1);
    expect(events.find((e) => e.type === 'MitigationResult')).toMatchObject({ pool: 3 });
    expect(dialOptions(toDials(game('CR-14')).state, 0).find((o) => o.action === 'contribute')!.maxAmount).toBe(4);
  });
  it('pays the Scrubber Guild +1 per rival who Contributes', () => {
    const s = game(NO_EFFECT, ['scrubbers', ...PLAIN.slice(1)]);
    const { state } = playTurn(s, {
      0: { action: 'contribute', amount: 1 }, 1: { action: 'contribute', amount: 1 }, 2: { action: 'contribute', amount: 2 },
    });
    expect(state.players[0]!.influence).toBe(5 - 1 + 2);
  });
  it('rewards every Contributor with +1 LP under Waste Overflow', () => {
    const { state } = playTurn(game('CR-10'), { 0: { action: 'contribute', amount: 1 } });
    expect([state.players[0]!.lp, state.players[1]!.lp]).toEqual([4, 3]);
  });
  it('is allowed on a turn without a pool unless the flag is off', () => {
    expect(open(toDials(game()).state, 0)).toContain('contribute');
    const s = newGame({ factions: PLAIN as never, config: { contributeWithoutPool: false } });
    stackCrisis(s, NO_EFFECT);
    expect(open(toDials(s).state, 0)).not.toContain('contribute');
  });
});

describe('Embargo', () => {
  it('adds +1 to every action with a cost and makes Gather cost 1', () => {
    const s = game();
    s.players[0]!.status.embargoedUntil = 1;
    const { state } = toDials(s);
    expect(actionCost(state, 0, { action: 'salvage' })).toBe(4);
    expect(actionCost(state, 0, { action: 'sabotage', target: 1 })).toBe(3);
    expect(actionCost(state, 0, { action: 'contribute', amount: 2 })).toBe(3);
    expect(actionCost(state, 0, { action: 'gather' })).toBe(1);
    expect(actionCost(state, 0, { action: 'quarantine' })).toBe(0);
    expect(playTurn(s).state.players[0]!.influence).toBe(6);
  });
  it('lets a broke Embargoed player Gather for free (DQ-4)', () => {
    const s = game();
    s.players[0]!.status.embargoedUntil = 1;
    s.players[0]!.influence = 0;
    expect(playTurn(s).state.players[0]!.influence).toBe(2);
  });
  it('doubles costs instead under oxygenEmbargo', () => {
    const s = newGame({ factions: PLAIN as never, config: { oxygenEmbargo: true } });
    s.players[0]!.status.embargoedUntil = 1;
    expect(actionCost(s, 0, { action: 'salvage' })).toBe(6);
  });
  it('expires after the last turn it covers (DQ-10)', () => {
    let s = game();
    s.players[0]!.status.embargoedUntil = 1;
    s = send(playTurn(s).state, { type: 'Advance' }).state;
    expect(s.turn).toBe(2);
    expect(actionCost(s, 0, { action: 'salvage' })).toBe(3);
  });
});

describe('paying and fizzling', () => {
  it('fizzles an action the player can no longer pay at resolution', () => {
    let { state } = toDials(game());
    state = send(state, { type: 'SetDial', seat: 0, dial: { action: 'salvage' } }, { type: 'LockDial', seat: 0 }).state;
    for (const seat of [1, 2, 3, 4]) {
      state = send(state, { type: 'SetDial', seat, dial: { action: 'gather' } }, { type: 'LockDial', seat }).state;
    }
    state.players[0]!.influence = 1; // lost Influence after locking in
    const r = send(state, { type: 'SetDial', seat: 5, dial: { action: 'gather' } }, { type: 'LockDial', seat: 5 });
    expect(r.events.find((e) => e.type === 'ActionFizzled')).toMatchObject({ seat: 0, reason: 'Cannot pay' });
    expect([r.state.players[0]!.influence, r.state.players[0]!.lp]).toEqual([1, 3]);
  });
  it('disables sectors the player cannot afford', () => {
    const s = game();
    s.players[0]!.influence = 1;
    const o = open(toDials(s).state, 0);
    expect(o).toEqual(['gather', 'contribute']);
  });
  it('forces Idle when every sector is locked or unaffordable', () => {
    const s = game('CR-24');
    s.players[0]!.influence = 0;
    const { state } = toDials(s);
    expect(open(state, 0)).toEqual(['idle']);
    const r = playTurn(s);
    expect(r.events.some((e) => e.type === 'ActionResolved' && e.seat === 0 && e.dial.action === 'idle')).toBe(true);
  });
  it('does not offer Idle while another sector is open', () => {
    const { state } = toDials(game());
    expect(() => send(state, { type: 'SetDial', seat: 0, dial: { action: 'idle' } })).toThrow(IllegalIntentError);
  });
  it('resolves nothing until every living player has locked in', () => {
    const { state } = toDials(game());
    const r = send(state, { type: 'SetDial', seat: 0, dial: { action: 'gather' } }, { type: 'LockDial', seat: 0 });
    expect(r.state.step).toBe('dials');
    expect(r.state.players[0]!.influence).toBe(5);
    expect(() => send(r.state, { type: 'LockDial', seat: 0 })).toThrow(IllegalIntentError);
  });
});

describe('status sectors', () => {
  it('Self-Quarantine needs Blight and removes one cube, bio first', () => {
    const s = game();
    expect(open(toDials(s).state, 0)).not.toContain('quarantine');
    s.players[0]!.blight = { bio: 1, neuro: 1 };
    const { state } = playTurn(s, { 0: { action: 'quarantine' } });
    expect(state.players[0]!.blight).toEqual({ bio: 0, neuro: 1 });
  });
  it('GatherLocked swaps Gather for Repair (3 Influence), which restores Gather', () => {
    const s = game();
    s.players[0]!.status.gatherLocked = true;
    const o = open(toDials(s).state, 0);
    expect(o).toContain('repair');
    expect(o).not.toContain('gather');
    const { state } = playTurn(s, { 0: { action: 'repair' } });
    expect([state.players[0]!.influence, state.players[0]!.status.gatherLocked]).toEqual([2, false]);
  });
  it('Paralyzed swaps Salvage for Medical Tax (5 Influence), which clears it', () => {
    const s = game();
    s.players[0]!.status.paralyzed = true;
    const { state } = playTurn(s, { 0: { action: 'medicalTax' } });
    expect([state.players[0]!.influence, state.players[0]!.status.paralyzed]).toEqual([0, false]);
  });
  it('Conscripted forces the dial to Contribute all Influence', () => {
    const s = game();
    s.players[0]!.status.conscriptedUntil = 1;
    const { state } = toDials(s);
    expect(open(state, 0)).toEqual(['contribute']);
    expect(() => send(state, { type: 'SetDial', seat: 0, dial: { action: 'contribute', amount: 2 } })).toThrow(IllegalIntentError);
    expect(playTurn(s, { 0: { action: 'contribute', amount: 5 } }).state.players[0]!.influence).toBe(0);
  });
  it('the Inquisition status locks Sabotage and Salvage', () => {
    const s = game();
    s.players[0]!.status.noSabotageSalvageUntil = 1;
    const o = open(toDials(s).state, 0);
    expect(o).not.toContain('sabotage');
    expect(o).not.toContain('salvage');
  });
});
