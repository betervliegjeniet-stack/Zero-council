import { describe, expect, it } from 'vitest';
import {
  FACTIONS, LINES, aiAcceptsDeal, aiDecide, believedLP, chooseDial, createGame, evaluateDeal, getFaction, line,
  type GameState,
} from '../src/engine';
import { NO_EFFECT, QUIET, play, send, stackCrisis, toDials, toWhisper } from './helpers';

function game(seed = 11, opts = {}): GameState {
  return createGame({ seed, playerCount: 6, ...opts }).state;
}
/** Sets every seat to the same resources and stacks a Crisis. */
function ready(card: string, seed = 11, opts = {}): GameState {
  const s = game(seed, opts);
  for (const p of s.players) {
    p.influence = 6;
    p.lp = 3;
  }
  s.ai.forEach((ai) => ai && ai.lpEstimate.fill(3));
  stackCrisis(s, card);
  return s;
}

describe('personalities (SPEC §5.1)', () => {
  it('start from the faction default with at most ±0.15 seeded jitter', () => {
    const s = game(3);
    for (const p of s.players) {
      const base = getFaction(p.factionId).aiPersonality;
      const per = s.ai[p.seat]!.personality;
      for (const k of Object.keys(base) as (keyof typeof base)[]) {
        expect(Math.abs(per[k] - base[k])).toBeLessThanOrEqual(0.15 + 1e-9);
        expect(per[k]).toBeGreaterThanOrEqual(0);
        expect(per[k]).toBeLessThanOrEqual(1);
      }
    }
    expect(game(3).ai).toEqual(s.ai);
    expect(game(4).ai).not.toEqual(s.ai);
  });

  it('gives the human seat no AI state', () => {
    const s = game(3, { humanFaction: 'choir' });
    expect(s.ai[0]).toBeNull();
    expect(s.ai.slice(1).every((a) => a !== null)).toBe(true);
    expect(() => aiDecide(s, { id: 'x', seat: 0, kind: 'dial', options: [] })).toThrow();
  });
});

describe('beliefs (SPEC §5.2)', () => {
  it('start from the public faction pools, not from hidden values', () => {
    const s = game(5);
    s.players[2]!.lp = 40; // a hidden change no event announced
    expect(believedLP(s, 0, 2)).toBe(getFaction(s.players[2]!.factionId).start.lp);
    expect(believedLP(s, 2, 2)).toBe(40); // everyone knows their own LP
  });

  it('do not let hidden LP steer a decision, unless the AIs are allowed to cheat', () => {
    const a = toDials(ready(NO_EFFECT, 21)).state;
    const b = structuredClone(a);
    b.players[3]!.lp = 30;
    for (const seat of [0, 1, 2, 4, 5]) expect(chooseDial(b, seat)).toEqual(chooseDial(a, seat));
    const cheat = game(5, { difficulty: 'merciless', aiCheats: true });
    cheat.players[2]!.lp = 40;
    expect(believedLP(cheat, 0, 2)).toBe(40);
    expect(game(5, { difficulty: 'normal', aiCheats: true }).aiCheats).toBe(false);
  });

  it('follow public LP changes: a Salvage or a Sabotage seen at the reveal', () => {
    const s = ready(NO_EFFECT);
    const r = play(s, { dials: { 0: { action: 'salvage' }, 1: { action: 'sabotage', target: 2 } } }).state;
    expect(r.ai[4]!.lpEstimate.slice(0, 3)).toEqual([4, 3, 2]);
  });

  it('take a revealed LP as fact (Subpoena), and a private disclosure only for the one told', () => {
    const s = toWhisper(ready(QUIET)).state;
    s.players[0]!.factionId = 'directorate';
    s.players[3]!.lp = 9;
    const r = send(s, { type: 'UseAbility', seat: 0, ability: 'subpoena', target: 3 }).state;
    expect([1, 2, 4, 5].map((seat) => r.ai[seat]!.lpEstimate[3])).toEqual([9, 9, 9, 9]);
    const offered = send(s, { type: 'ProposeDeal', seat: 3, partner: 1, terms: [{ kind: 'revealLP', who: 3 }] }).state;
    const told = send(offered, { type: 'RespondDeal', seat: 1, dealId: offered.deals[0]!.id, accept: true }).state;
    expect([told.ai[1]!.lpEstimate[3], told.ai[2]!.lpEstimate[3]]).toEqual([9, 3]);
  });

  it('turn a Sabotage into hostility and lost trust in the victim', () => {
    const s = ready(NO_EFFECT);
    const r = play(s, { dials: { 1: { action: 'sabotage', target: 2 } } }).state;
    const victim = r.ai[2]!;
    expect(victim.hostility[1]!).toBeGreaterThan(s.ai[2]!.hostility[1]! + 0.1);
    expect(victim.trust[1]!).toBeLessThan(0);
    expect(victim.recentHarm[1]!).toBe(1);
    expect(r.ai[4]!.hostility[1]!).toBeLessThanOrEqual(s.ai[4]!.hostility[1]!); // bystanders only watch
  });

  it('reward kept deals with trust and punish betrayal', () => {
    const offer = (s: GameState) => {
      const o = send(toWhisper(s).state, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'willContribute', who: 1, min: 2 }] }).state;
      return send(o, { type: 'RespondDeal', seat: 1, dealId: o.deals[0]!.id, accept: true }).state;
    };
    const kept = play(offer(ready(QUIET)), { dials: { 1: { action: 'contribute', amount: 2 } } }).state;
    expect(kept.ai[0]!.trust[1]!).toBeGreaterThan(0.15);
    const broken = play(offer(ready(QUIET)), { dials: { 1: { action: 'gather' } } }).state;
    expect(broken.ai[0]!.trust[1]!).toBeLessThan(-0.4);
    expect(broken.ai[0]!.hostility[1]!).toBeGreaterThan(0.3);
  });

  it('punish the human for leaving during the Whisper, up to a cap', () => {
    const s = toWhisper(ready(QUIET, 11, { humanFaction: 'iron' })).state;
    const before = s.ai[2]!.hostility[0]!;
    const short = send(s, { type: 'HumanAbsent', seconds: 20 }).state;
    expect(short.ai[2]!.hostility[0]!).toBeCloseTo(before + 0.3, 5);
    const long = send(s, { type: 'HumanAbsent', seconds: 300 }).state;
    expect(long.ai[2]!.hostility[0]!).toBeCloseTo(before + 0.6, 5);
    expect(long.ai[2]!.hostility[1]!).toBe(s.ai[2]!.hostility[1]!);
  });
});

describe('decisions (SPEC §5.3 - §5.6)', () => {
  it('are deterministic for a given state', () => {
    const s = toDials(ready('CR-18', 8)).state;
    for (const d of s.pending) expect(aiDecide(s, d)).toEqual(aiDecide(structuredClone(s), d));
  });

  it('always produce a legal dial', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = toDials(ready(['CR-18', 'CR-33', 'CR-27', 'CR-24', 'BS-03'][seed % 5]!, seed)).state;
      for (const d of s.pending.slice()) s = send(s, ...aiDecide(s, d)).state;
      expect(s.players.every((p) => p.dial !== null)).toBe(true);
    }
  });

  it('contribute more often when the bunker is close to collapse', () => {
    const contributors = (eh: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = ready('CR-05', seed); // Water Leaking: only EH -1, so it is a real choice
        s.eh = eh;
        const d = toDials(s).state;
        n += d.pending.filter((x) => chooseDial(d, x.seat).action === 'contribute').length;
      }
      return n;
    };
    expect(contributors(4)).toBeGreaterThan(contributors(20));
  });

  it('nearly always keep a binding promise', () => {
    let kept = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = toWhisper(ready(QUIET, seed)).state;
      const o = send(w, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'willContribute', who: 1, min: 3 }] }).state;
      const a = send(o, { type: 'RespondDeal', seat: 1, dealId: o.deals[0]!.id, accept: true }).state;
      a.deals[0]!.binding = true;
      const dial = chooseDial(toDials(a).state, 1);
      if (dial.action === 'contribute' && (dial.amount ?? 0) >= 3) kept++;
    }
    expect(kept).toBeGreaterThanOrEqual(36);
  });

  it('never accept a deal that has them Sabotaged, or that they cannot pay for', () => {
    const s = toWhisper(ready(QUIET)).state;
    expect(evaluateDeal(s, 1, { proposer: 0, partner: 1, terms: [{ kind: 'willSabotage', who: 0, target: 1 }] })).toBeLessThan(0);
    s.players[1]!.influence = 1;
    const o = send(s, { type: 'ProposeDeal', seat: 0, partner: 1, terms: [{ kind: 'willContribute', who: 1, min: 4 }] }).state;
    expect(aiAcceptsDeal(o, 1, o.deals[0]!.id)).toBe(false);
  });

  it('like free Influence and trust-discount a partner\'s promise', () => {
    const s = toWhisper(ready('CR-18')).state;
    const gift = { proposer: 0, partner: 1, terms: [{ kind: 'giveInfluenceNow' as const, from: 0, amount: 2 }] };
    expect(evaluateDeal(s, 1, gift)).toBeGreaterThan(0);
    const promise = { proposer: 0, partner: 1, terms: [{ kind: 'willContribute' as const, who: 0, min: 3 }] };
    const neutral = evaluateDeal(s, 1, promise);
    s.ai[1]!.trust[0] = -1;
    expect(evaluateDeal(s, 1, promise)).toBeLessThan(neutral);
  });

  it('bid everything in the last Crucible round, and nothing when a rival is known to be empty', () => {
    const s = ready(NO_EFFECT);
    s.turn = 10;
    s.mainOver = { cause: 'turnLimit', turn: 10 };
    s.step = 'crucibleStart';
    [2, 3, 4, 5].forEach((seat) => (s.players[seat]!.eliminated = true));
    s.players[0]!.lp = 5;
    const duel = send(s, { type: 'Advance' }).state;
    expect(aiDecide(duel, duel.pending[0]!)).toEqual([{ type: 'SubmitBid', seat: 0, amount: 5 }]);

    const three = ready(NO_EFFECT);
    three.turn = 10;
    three.mainOver = { cause: 'turnLimit', turn: 10 };
    three.step = 'crucibleStart';
    [3, 4, 5].forEach((seat) => (three.players[seat]!.eliminated = true));
    three.players[2]!.lp = 0;
    three.ai.forEach((ai) => ai && (ai.lpEstimate[2] = 0));
    const round = send(three, { type: 'Advance' }).state;
    expect(aiDecide(round, round.pending[0]!)).toEqual([{ type: 'SubmitBid', seat: 0, amount: 0 }]);
  });
});

describe('flavor lines (SPEC §5.4)', () => {
  it('has 5 to 8 lines per faction and message type', () => {
    for (const f of FACTIONS) {
      for (const [kind, lines] of Object.entries(LINES[f.id])) {
        expect(lines.length, `${f.id}.${kind}`).toBeGreaterThanOrEqual(5);
        expect(lines.length).toBeLessThanOrEqual(8);
        expect(new Set(lines).size).toBe(lines.length);
      }
    }
  });
  it('fills in the names', () => {
    const s = game(2);
    const text = line(s, 1, 'hit', { target: 'the Quiet Choir' });
    expect(text).not.toContain('{target}');
    expect(line(s, 1, 'hit', { target: 'the Quiet Choir' })).toBe(text);
  });
});
