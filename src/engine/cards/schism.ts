// Handlers for the 7 Biological Schism expansion cards (BS-01..BS-07).
import { changeInfluence, changeLP, emit } from '../effects';
import { ask, queueNext } from '../flow';
import { living, player, turnOrder } from '../selectors';
import { hitBlight, hitFlag, hitLP, hitTimed } from './hit';
import { seatOf } from './shared';
import type { CardHandler } from './types';

export const SCHISM_HANDLERS: Record<string, CardHandler> = {
  'BS-01': {}, // Night Terror (reveal EH, mod:randomActions)
  'BS-02': { // Permanent Paralysis: whoever put the least into the pool this turn is Paralyzed
    resolve: (ctx) => {
      const alive = living(ctx.s);
      const least = Math.min(...alive.map((p) => p.contributedThisTurn));
      alive.filter((p) => p.contributedThisTurn === least).forEach((p) => hitFlag(ctx, p.seat, 'paralyzed'));
    },
  },
  'BS-03': {}, // Cancer of the Soul (reveal EH, mod:sabotageInfects)
  'BS-04': { // The Critical Debility: the target gains 1 NEURO cube
    vote: 'target',
    voteResult: (ctx, r) => r.winners.forEach((w) => hitBlight(ctx, seatOf(w), 'neuro', 1, 'BS-04')),
  },
  'BS-05': { // The Withered Vein: the richest player sacrifices 3 LP, or everyone is Infected
    flowStart: 'ask',
    flow: (ctx, stage) => {
      const s = ctx.s;
      if (stage !== 'ask') return;
      const order = turnOrder(s);
      const most = Math.max(...order.map((seat) => player(s, seat).influence));
      const chooser = order.find((seat) => player(s, seat).influence === most)!;
      s.scratch.choices.chooser = String(chooser);
      if (player(s, chooser).lp >= 3) {
        ask(ctx, { seat: chooser, kind: 'cardChoice', options: ['sacrifice', 'blight'], sourceCardId: 'BS-05' });
      } else {
        s.scratch.choices[String(chooser)] = 'blight';
      }
      queueNext(ctx, { k: 'effect', cardId: 'BS-05', hook: 'final' });
    },
    final: (ctx) => {
      const s = ctx.s;
      const chooser = Number(s.scratch.choices.chooser);
      const choice = s.scratch.choices[String(chooser)] ?? 'blight';
      emit(ctx, { type: 'CardChoice', seat: chooser, cardId: 'BS-05', choice });
      // The sacrifice is a price the chooser decided to pay, so Martial Law does not refund it.
      if (choice === 'sacrifice') changeLP(ctx, chooser, -3, 'BS-05');
      else living(s).forEach((p) => hitBlight(ctx, p.seat, 'bio', 1, 'BS-05'));
    },
  },
  'BS-06': { // Liquid Oblivion: pay 5 Influence, or lose 2 LP and your abilities for 2 turns
    flowStart: 'ask',
    flow: (ctx, stage) => {
      const s = ctx.s;
      if (stage !== 'ask') return;
      for (const p of living(s)) {
        if (p.influence >= 5) ask(ctx, { seat: p.seat, kind: 'cardChoice', options: ['pay', 'suffer'], sourceCardId: 'BS-06' });
        else s.scratch.choices[String(p.seat)] = 'suffer';
      }
      queueNext(ctx, { k: 'effect', cardId: 'BS-06', hook: 'final' });
    },
    final: (ctx) => {
      const s = ctx.s;
      for (const p of living(s)) {
        const choice = s.scratch.choices[String(p.seat)] === 'pay' && p.influence >= 5 ? 'pay' : 'suffer';
        emit(ctx, { type: 'CardChoice', seat: p.seat, cardId: 'BS-06', choice });
        if (choice === 'pay') {
          changeInfluence(ctx, p.seat, -5, 'BS-06');
        } else {
          hitLP(ctx, p.seat, 2, 'BS-06');
          hitTimed(ctx, p.seat, 'abilitiesDisabledUntil', s.turn + 2);
        }
      }
    },
  },
  'BS-07': { // The Hollow Echo: the target is Silenced next turn
    vote: 'target',
    voteResult: (ctx, r) => r.winners.forEach((w) => hitTimed(ctx, seatOf(w), 'silencedUntil', ctx.s.turn + 1)),
  },
};
