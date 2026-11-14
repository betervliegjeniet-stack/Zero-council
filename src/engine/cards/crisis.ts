// Handlers for the 40 Core Crisis cards (CR-01..CR-40). Each follows its `digitalRuling`.
import { changeEH, changeInfluence, changeLP, eliminate, endMainGame } from '../effects';
import { pick } from '../rng';
import { isInfected, leftOf, living, lpLeaders, lpLowest, rightOf } from '../selectors';
import { hitBlight, hitFlag, hitInfluence, hitLP, hitTimed } from './hit';
import { exile, seatOf, totalCrucible } from './shared';
import type { CardHandler } from './types';

export const CRISIS_HANDLERS: Record<string, CardHandler> = {
  // ---- Stage I ----
  'CR-01': { // Flickering Grid
    reveal: (ctx) => living(ctx.s).forEach((p) => hitInfluence(ctx, p.seat, 1, 'CR-01')),
  },
  'CR-02': { // Oxygen Scrubber Failure: on failure everyone loses 1 LP; 0 LP -> Embargoed for 1 turn
    resolve: (ctx, mitigated) => {
      if (mitigated) return;
      for (const p of living(ctx.s)) {
        if (p.lp > 0) hitLP(ctx, p.seat, 1, 'CR-02');
        else hitTimed(ctx, p.seat, 'embargoedUntil', ctx.s.turn + 1);
      }
    },
  },
  'CR-03': {}, // Ration Shortage (mod:salvageBlocked)
  'CR-04': {}, // Data Corruption (mod:abilitiesDisabledAll)
  'CR-05': { // Water Leaking: on failure the LP leader(s) lose 2 Influence
    resolve: (ctx, mitigated) => {
      if (mitigated) return;
      for (const seat of lpLeaders(ctx.s)) hitInfluence(ctx, seat, 2, 'CR-05');
    },
  },
  'CR-06': {}, // Supply Chain Snap (mod:gatherYield=1)
  'CR-07': {}, // Minor Tremor (reveal EH, mod:poolLeak=3)
  'CR-08': { // The First Cough: open vote, most votes (all tied) gain 1 Bio Blight Cube
    vote: 'open',
    voteResult: (ctx, r) => r.winners.forEach((w) => hitBlight(ctx, seatOf(w), 'bio', 1, 'CR-08')),
  },
  'CR-09': {}, // Static Interference (mod:revealSequential)
  'CR-10': {}, // Waste Overflow (pool, mod:contributeRewardLP=1)

  // ---- Stage II ----
  'CR-11': {}, // Mass Paranoia (mod:delayActions)
  'CR-12': {}, // Medical Collapse (pool, mod:sabotageDamage+1)
  'CR-13': { // Shadow Embargo: the LP leader(s) lose their abilities until end of turn
    reveal: (ctx) => lpLeaders(ctx.s).forEach((seat) => hitTimed(ctx, seat, 'abilitiesDisabledUntil', ctx.s.turn)),
  },
  'CR-14': {}, // Fuel Depletion (pool, mod:contributeSurcharge=1)
  'CR-15': { // Vault Breach: everyone with LP gives 1 LP to their LEFT, all at once
    reveal: (ctx) => {
      const s = ctx.s;
      const moves = living(s).filter((p) => p.lp > 0).map((p) => ({ from: p.seat, to: leftOf(s, p.seat) }));
      for (const m of moves) {
        if (m.to === null) continue;
        if (hitLP(ctx, m.from, 1, 'CR-15', { transfer: true }) > 0) changeLP(ctx, m.to, 1, 'CR-15', { transfer: true });
      }
    },
  },
  'CR-16': { // The Blighted Harvest: Infected players always lose 1 extra LP
    skipFailEH: (s) => s.config.harshMode,
    resolve: (ctx, mitigated) => {
      const s = ctx.s;
      for (const p of living(s)) if (isInfected(p)) hitLP(ctx, p.seat, 1, 'CR-16');
      if (!mitigated && s.config.harshMode) {
        // Optional variant: 4 single-LP hits on random living players instead of EH -2.
        for (let i = 0; i < 4; i++) {
          const alive = living(s);
          if (alive.length) hitLP(ctx, pick(s, alive).seat, 1, 'CR-16');
        }
      }
    },
  },
  'CR-17': { // Signal Flare: the lowest-LP player(s) gain 3 Influence (this leaks who is poorest)
    reveal: (ctx) => lpLowest(ctx.s).forEach((seat) => changeInfluence(ctx, seat, 3, 'CR-17')),
  },
  'CR-18': {}, // Structural Cracks (pool)
  'CR-19': {}, // Whisper Campaign (mod:announceActions)
  'CR-20': {}, // Air Lock Malfunction (volunteer mitigation, handled in the mitigation step)

  // ---- Stage III ----
  'CR-21': {}, // Zero Hour (pool, endsGameOnFail)
  'CR-22': { // The Culling: the player(s) with the least Influence are Exiled
    reveal: (ctx) => {
      const alive = living(ctx.s);
      const least = Math.min(...alive.map((p) => p.influence));
      alive.filter((p) => p.influence === least).forEach((p) => exile(ctx, p.seat));
    },
  },
  'CR-23': {}, // Neural Decay (mod:randomActions)
  'CR-24': {}, // Total Darkness (mod:gatherBlocked)
  'CR-25': { // The Loyalty Purge
    vote: 'target',
    voteResult: (ctx, r) => r.winners.forEach((w) => exile(ctx, seatOf(w))),
  },
  'CR-26': {}, // Atmospheric Flare (LP pledge mitigation, handled in the mitigation step)
  'CR-27': {}, // Resource War (mod:sabotageCost=0)
  'CR-28': { // Hemorrhage: lose floor(Influence / 5) LP
    reveal: (ctx) => living(ctx.s).forEach((p) => hitLP(ctx, p.seat, Math.floor(p.influence / 5), 'CR-28')),
  },
  'CR-29': {}, // Echoes of the Surface (pool, mod:noLPGain)
  'CR-30': { // Psychotic Break: everyone passes ALL Influence to their RIGHT, all at once
    reveal: (ctx) => {
      const s = ctx.s;
      const moves = living(s).map((p) => ({ from: p.seat, to: rightOf(s, p.seat), amount: p.influence }));
      const received = new Map<number, number>();
      for (const m of moves) {
        if (m.to === null) continue;
        const lost = hitInfluence(ctx, m.from, m.amount, 'CR-30');
        received.set(m.to, (received.get(m.to) ?? 0) + lost);
      }
      for (const [seat, amount] of received) changeInfluence(ctx, seat, amount, 'CR-30');
    },
  },

  // ---- Stage IV ----
  'CR-31': { // Total Infrastructure Collapse: everyone is GatherLocked until they Repair
    reveal: (ctx) => living(ctx.s).forEach((p) => hitFlag(ctx, p.seat, 'gatherLocked')),
  },
  'CR-32': {}, // The Final Silence (EH set to 1)
  'CR-33': {}, // Cannibalism (mod:cannibalSalvage)
  'CR-34': { // Void Pulse: all Influence and the pool become 0
    reveal: (ctx) => {
      living(ctx.s).forEach((p) => hitInfluence(ctx, p.seat, p.influence, 'CR-34'));
      if (ctx.s.crisis) ctx.s.crisis.pool = 0;
    },
  },
  'CR-35': { // The Last Breath: at EH 1 go straight to the Crucible, otherwise EH -4
    customEH: true,
    reveal: (ctx) => {
      if (ctx.s.eh === 1) endMainGame(ctx, 'card');
      else changeEH(ctx, -4, 'CR-35');
    },
  },
  'CR-36': {}, // Dead Frequency (mod:skipWhisper)
  'CR-37': { // The Great Filter: everyone with fewer than 3 LP is eliminated (cannot be ignored)
    reveal: (ctx) => living(ctx.s).filter((p) => p.lp < 3).forEach((p) => eliminate(ctx, p.seat, 'CR-37')),
  },
  'CR-38': {}, // Entropy Strike (mod:sabotageDamage=3)
  'CR-39': { // Hallucireality
    vote: 'target',
    voteResult: (ctx, r) => r.winners.forEach((w) => exile(ctx, seatOf(w))),
  },
  'CR-40': { // FINALE: Total Crucible
    customEH: true,
    reveal: (ctx) => totalCrucible(ctx, 'CR-40'),
  },
};

