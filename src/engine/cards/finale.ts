// Handlers for the 4 Finale cards (FIN-01..FIN-04). They resolve in Phase 4 of turn 9.
import { changeEH, changeInfluence, changeLP, emit, setEH } from '../effects';
import { ask, queueNext } from '../flow';
import { pick } from '../rng';
import { living, player } from '../selectors';
import type { Ctx } from '../types';
import { exileNow, seatOf, totalCrucible } from './shared';
import type { CardHandler } from './types';

function exileTie(ctx: Ctx): void {
  const s = ctx.s;
  // "EH is set to 2" would heal a bunker at EH 1; by default it only ever lowers EH (DQ-13).
  setEH(ctx, s.config.finaleExileTieNeverHeals ? Math.min(s.eh, 2) : 2, 'FIN-01');
}

export const FINALE_HANDLERS: Record<string, CardHandler> = {
  'FIN-01': { // Mandate: Exile. The winner is Exiled unless they pay 10 LP, which forces a tie
    customEH: true,
    vote: 'target',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      if (r.tie) return exileTie(ctx);
      const target = r.winners[0];
      if (target === undefined) return;
      s.scratch.choices.target = target;
      if (player(s, seatOf(target)).lp >= 10) {
        ask(ctx, { seat: seatOf(target), kind: 'exileBuyout', options: ['pay', 'accept'], sourceCardId: 'FIN-01' });
      }
      queueNext(ctx, { k: 'cardFlow', cardId: 'FIN-01', stage: 'buyout' });
    },
    flow: (ctx, stage) => {
      const s = ctx.s;
      if (stage !== 'buyout') return;
      const target = seatOf(s.scratch.choices.target!);
      if (s.scratch.choices[String(target)] === 'pay' && player(s, target).lp >= 10) {
        emit(ctx, { type: 'CardChoice', seat: target, cardId: 'FIN-01', choice: 'pay' });
        changeLP(ctx, target, -10, 'FIN-01');
        exileTie(ctx);
      } else {
        exileNow(ctx, target);
      }
    },
  },
  'FIN-02': { // Mandate: Sacrifice. EH -5, then a blind Influence bid
    customEH: true,
    flowStart: 'bid',
    flow: (ctx, stage) => {
      const s = ctx.s;
      if (stage === 'bid') {
        changeEH(ctx, -5, 'FIN-02');
        for (const p of living(s)) {
          if (p.influence > 0) ask(ctx, { seat: p.seat, kind: 'finaleBid', options: [], min: 0, max: p.influence, sourceCardId: 'FIN-02' });
        }
        queueNext(ctx, { k: 'cardFlow', cardId: 'FIN-02', stage: 'open' });
        return;
      }
      const bids = living(s).map((p) => ({ seat: p.seat, amount: Math.min(s.scratch.bids[String(p.seat)] ?? 0, p.influence) }));
      emit(ctx, { type: 'InfluenceBidsRevealed', cardId: 'FIN-02', bids });
      for (const b of bids) changeInfluence(ctx, b.seat, -b.amount, 'FIN-02'); // every bid is spent
      if (bids.length < 2) return;
      const top = Math.max(...bids.map((b) => b.amount));
      const winners = bids.filter((b) => b.amount === top);
      if (winners.length !== 1) return; // tied top: nobody steals
      const winner = winners[0]!.seat;
      // The two lowest places, with everyone tied for them.
      const sorted = bids.map((b) => b.amount).sort((a, b) => a - b);
      const cutoff = sorted[1]!;
      for (const b of bids) {
        if (b.seat === winner || b.amount > cutoff) continue;
        const taken = -changeLP(ctx, b.seat, -player(s, b.seat).lp, 'FIN-02', { transfer: true });
        changeLP(ctx, winner, taken, 'FIN-02', { transfer: true });
      }
    },
  },
  'FIN-03': { // Apex Mandate: Purge. A one-round secret pool of 15, or a random faction is purged
    flowStart: 'pool',
    flow: (ctx, stage) => {
      const s = ctx.s;
      if (stage === 'pool') {
        for (const p of living(s)) {
          if (p.influence > 0) ask(ctx, { seat: p.seat, kind: 'finalePool', options: [], min: 0, max: p.influence, sourceCardId: 'FIN-03' });
        }
        queueNext(ctx, { k: 'cardFlow', cardId: 'FIN-03', stage: 'open' });
        return;
      }
      const bids = living(s).map((p) => ({ seat: p.seat, amount: Math.min(s.scratch.bids[String(p.seat)] ?? 0, p.influence) }));
      emit(ctx, { type: 'InfluenceBidsRevealed', cardId: 'FIN-03', bids });
      let total = 0;
      for (const b of bids) {
        changeInfluence(ctx, b.seat, -b.amount, 'FIN-03');
        player(s, b.seat).contributedTotal += b.amount;
        total += b.amount;
      }
      const success = total >= 15;
      emit(ctx, { type: 'MitigationResult', cardId: 'FIN-03', success, pool: total, threshold: 15 });
      if (success) return;
      const candidates = living(s).filter((p) => !p.status.exiled);
      if (candidates.length) exileNow(ctx, pick(s, candidates).seat);
    },
  },
  'FIN-04': { // Game Breaker: Total Crucible
    customEH: true,
    resolve: (ctx) => totalCrucible(ctx, 'FIN-04'),
  },
};
