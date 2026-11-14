import { describe, expect, it } from 'vitest';
import { applyIntent, createGame, getCard, getFaction, leftOf, rightOf, stageForTurn, turnOrder, DEFAULT_CONFIG } from '../src/engine';
import { runGame } from '../sim/runner';
import { newGame, playTurn, send, stackCrisis, QUIET } from './helpers';

describe('setup (SPEC §2.1)', () => {
  it('starts at EH 20, or 18 with 4 players', () => {
    expect(newGame({ playerCount: 6 }).eh).toBe(20);
    expect(newGame({ playerCount: 5 }).eh).toBe(20);
    const four = newGame({ playerCount: 4 });
    expect([four.eh, four.maxEH, four.players.length]).toEqual([18, 18, 4]);
  });

  it('seats the human at seat 0 with the chosen faction and gives faction starting pools', () => {
    const { state } = createGame({ seed: 3, humanFaction: 'wardens', playerCount: 5 });
    expect(state.players[0]).toMatchObject({ factionId: 'wardens', isHuman: true, influence: 4, lp: 3 });
    expect(new Set(state.players.map((p) => p.factionId)).size).toBe(5);
    for (const p of state.players) {
      const f = getFaction(p.factionId);
      expect([p.influence, p.lp]).toEqual([f.start.influence, f.start.lp]);
    }
    expect(state.players.slice(1).every((p) => !p.isHuman)).toBe(true);
  });

  it('builds four stage piles with the expansion split 3/4 over Stage II and III', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = newGame({ seed });
      const sizes = s.piles.stage.map((p) => p.length);
      expect(sizes[0]).toBe(10);
      expect(sizes[3]).toBe(10);
      expect([13, 14]).toContain(sizes[1]);
      expect(sizes[1]! + sizes[2]!).toBe(27);
      expect(s.piles.mandates).toHaveLength(20);
      expect(s.piles.finale).toHaveLength(4);
    }
    const off = newGame({ config: { expansionEnabled: false, finaleMode: 'off' } });
    expect(off.piles.stage.map((p) => p.length)).toEqual([10, 10, 10, 10]);
    expect(off.piles.finale).toHaveLength(0);
  });

  it('is deterministic: same seed and same intents give the same game', () => {
    const a = runGame({ seed: 42 });
    const b = runGame({ seed: 42 });
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(runGame({ seed: 43 }).events).not.toEqual(a.events);
  });

  it('never mutates the input state', () => {
    const s = newGame();
    const frozen = JSON.stringify(s);
    applyIntent(s, { type: 'Advance' });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('seats and turn order (SPEC §2.1)', () => {
  it('LEFT is seat+1, RIGHT is seat-1, eliminated players are skipped', () => {
    const s = newGame();
    expect([leftOf(s, 5), rightOf(s, 0), leftOf(s, 2)]).toEqual([0, 5, 3]);
    s.players[3]!.eliminated = true;
    expect([leftOf(s, 2), rightOf(s, 4)]).toEqual([4, 2]);
  });

  it('rotates the first player clockwise each turn', () => {
    let s = newGame();
    const firsts: number[] = [];
    for (let t = 0; t < 3; t++) {
      stackCrisis(s, QUIET);
      s = playTurn(s).state;
      firsts.push(s.firstSeat);
      if (t === 0) expect(turnOrder(s)).toEqual([0, 1, 2, 3, 4, 5]);
      s = send(s, { type: 'Advance' }).state;
    }
    expect(firsts).toEqual([0, 1, 2]);
  });
});

describe('crisis deck (SPEC §2.2)', () => {
  it('maps turns to stages', () => {
    const stages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => stageForTurn(DEFAULT_CONFIG, t));
    expect(stages).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4]);
  });

  it('draws each turn from the pile of its stage', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { events } = runGame({ seed });
      let stage = 0;
      for (const e of events) {
        if (e.type === 'DeckReshuffled') break; // System Reboot mixes old cards into Stage III
        if (e.type === 'TurnStarted') stage = e.stage;
        if (e.type === 'CardRevealed' && e.deck === 'crisis') {
          const card = getCard(e.cardId);
          if (card.expansion) expect([2, 3]).toContain(stage);
          else expect(card.stage).toBe(stage);
        }
      }
    }
  });

  it('falls through to the next stage when a pile is empty', () => {
    const s = newGame();
    s.piles.stage[0] = [];
    const top = s.piles.stage[1]!.at(-1);
    const r = send(s, { type: 'Advance' });
    expect(r.state.crisis?.cardId).toBe(top);
  });

  it('reveals a Mandate at the start of turns 3 and 6 and a Finale card on turn 9', () => {
    const { events } = runGame({ seed: 5, config: { collapsePenalty: false } });
    let turn = 0;
    const seen: Record<number, string> = {};
    for (const e of events) {
      if (e.type === 'TurnStarted') turn = e.turn;
      if (e.type === 'CardRevealed' && e.deck !== 'crisis') seen[turn] = e.deck;
    }
    for (const [t, deck] of Object.entries(seen)) {
      expect(deck).toBe(Number(t) === 9 ? 'finale' : 'mandate');
      expect([3, 6, 9]).toContain(Number(t));
    }
    expect(Object.keys(seen).length).toBeGreaterThan(0);
  });
});
