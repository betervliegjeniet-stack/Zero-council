// The store runs the AI Councilors between the human's inputs. This plays whole games through it,
// with the human seat answered at random, exactly as the UI would drive it.
import { describe, expect, it } from 'vitest';
import { actionCost, dialOptions, type Dial, type Intent, type PendingDecision } from '../src/engine';
import { humanSeat, useGameStore } from '../src/store/gameStore';

function pick<T>(xs: T[], r: () => number): T {
  return xs[Math.floor(r() * xs.length)]!;
}
function rng(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function humanAnswer(d: PendingDecision, r: () => number): Intent[] {
  const g = useGameStore.getState().game!;
  switch (d.kind) {
    case 'dial': {
      const o = pick(dialOptions(g, d.seat).filter((x) => x.available), r);
      const affordable = o.targets?.filter((t) => actionCost(g, d.seat, { action: o.action, target: t }) <= g.players[d.seat]!.influence);
      const dial: Dial = { action: o.action, ...(affordable ? { target: affordable[0] } : {}), ...(o.action === 'contribute' ? { amount: o.minAmount } : {}) };
      return [{ type: 'SetDial', seat: d.seat, dial }, { type: 'LockDial', seat: d.seat }];
    }
    case 'ballot': return [{ type: 'CastBallot', seat: d.seat, choice: pick(d.options, r) }];
    case 'lpPledge': return [{ type: 'PledgeLP', seat: d.seat, amount: 0 }];
    case 'crucibleBid': case 'finaleBid': case 'finalePool':
      return [{ type: 'SubmitBid', seat: d.seat, amount: Math.floor(r() * ((d.max ?? 0) + 1)) }];
    default: return [{ type: 'ChooseOption', seat: d.seat, decisionId: d.id, option: pick(d.options, r) }];
  }
}

describe('game store', () => {
  it('plays full games with a human seat: AIs answer on their own, the human is asked', () => {
    for (let n = 0; n < 12; n++) {
      const r = rng(n + 1);
      const store = useGameStore.getState();
      store.setSetup({ faction: (['archivists', 'scrubbers', 'choir', 'iron', 'wardens', 'directorate'] as const)[n % 6], playerCount: ([6, 5, 4] as const)[n % 3] });
      store.newGame();
      let asked = 0;
      for (let step = 0; step < 3000; step++) {
        const s = useGameStore.getState();
        const g = s.game!;
        if (g.step === 'ended') break;
        const me = humanSeat(g)!;
        // The store never leaves an AI decision unanswered.
        expect(g.pending.every((d) => d.seat === me)).toBe(true);
        if (g.players[me]!.eliminated) { s.watchTheEnd(); continue; }
        const d = g.pending.find((x) => x.seat === me);
        if (d) {
          asked++;
          for (const intent of humanAnswer(d, r)) expect(s.dispatch(intent), JSON.stringify(intent)).toBe(true);
        } else if (g.step === 'whisper') {
          // Let two Councilors whisper, answer their notes at random, then seal.
          s.whisperAct();
          s.whisperAct();
          for (const deal of useGameStore.getState().game!.deals.filter((x) => x.partner === me && x.status === 'offered')) {
            useGameStore.getState().respondDeal(deal.id, r() < 0.5);
          }
          useGameStore.getState().sealCouncil();
        } else {
          s.advance();
        }
      }
      const end = useGameStore.getState();
      expect(end.game!.step).toBe('ended');
      expect(end.screen).toBe('end');
      expect(asked).toBeGreaterThan(0);
      expect(end.error).toBeNull();
    }
  });

  it('answers the human\'s offer at once and attaches a flavor line', () => {
    const store = useGameStore.getState();
    store.setSetup({ faction: 'iron', playerCount: 6 });
    store.newGame();
    for (let i = 0; i < 20 && useGameStore.getState().game!.step !== 'whisper'; i++) {
      const s = useGameStore.getState();
      const g = s.game!;
      const d = g.pending.find((x) => x.seat === 0);
      if (d) s.dispatch({ type: 'ChooseOption', seat: 0, decisionId: d.id, option: d.defaultOption ?? d.options.at(-1)! });
      else if (g.step === 'crisisGate' && g.modifiers.skipWhisper) { store.newGame(); } else s.advance();
    }
    const s = useGameStore.getState();
    expect(s.game!.step).toBe('whisper');
    const before = s.game!.players[0]!.influence;
    const deal = s.proposeDeal(1, [{ kind: 'giveInfluenceNow', from: 0, amount: 2 }]);
    expect(deal).not.toBeNull();
    expect(['accepted', 'rejected']).toContain(deal!.status);
    useGameStore.getState().clearError();
    expect(useGameStore.getState().dealLines[deal!.id]).toBeTruthy();
    if (deal!.status === 'accepted') expect(useGameStore.getState().game!.players[0]!.influence).toBe(before - 2);
  });
});
