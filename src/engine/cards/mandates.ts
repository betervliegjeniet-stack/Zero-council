// Handlers for the 20 Apex Mandates (MAN-01..MAN-20). They resolve in Phase 4 of turns 3 and 6.
import {
  addBlight, applyTimedStatus, changeEH, changeInfluence, changeLP, eliminate, emit, removeBlight, revealLP,
} from '../effects';
import { shuffle } from '../rng';
import { leftOf, living, player, turnOrder } from '../selectors';
import type { VoteResult } from '../types';
import { exileNow, seatOf } from './shared';
import type { CardHandler } from './types';

const passed = (r: VoteResult) => !r.tie && r.winners[0] === 'aye';
const target = (r: VoteResult) => (r.tie || r.winners.length === 0 ? null : seatOf(r.winners[0]!));

export const MANDATE_HANDLERS: Record<string, CardHandler> = {
  'MAN-01': { // Decree of Exile
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t !== null) exileNow(ctx, t);
    },
  },
  'MAN-02': { // Blood Tithe: everyone loses 2 LP, EH +4
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      if (!passed(r)) return;
      living(ctx.s).forEach((p) => changeLP(ctx, p.seat, -2, 'MAN-02'));
      changeEH(ctx, 4, 'MAN-02');
    },
  },
  'MAN-03': { // Asset Seizure: the target's Influence is shared out among living rivals
    vote: 'target',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      const t = target(r);
      if (t === null) return;
      const rivals = living(s).filter((p) => p.seat !== t);
      const total = player(s, t).influence;
      changeInfluence(ctx, t, -total, 'MAN-03');
      const share = rivals.length ? Math.floor(total / rivals.length) : 0;
      if (share > 0) rivals.forEach((p) => changeInfluence(ctx, p.seat, share, 'MAN-03'));
    },
  },
  'MAN-04': { // Quarantine Seal: 2 Bio cubes and NoTrade for 2 turns
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t === null) return;
      addBlight(ctx, t, 'bio', 2, 'MAN-04');
      applyTimedStatus(ctx, t, 'noTradeUntil', ctx.s.turn + 2);
    },
  },
  'MAN-05': { // The Scapegoat: the target loses 3 LP, everyone else gains 1
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t === null) return;
      changeLP(ctx, t, -3, 'MAN-05');
      living(ctx.s).filter((p) => p.seat !== t).forEach((p) => changeLP(ctx, p.seat, 1, 'MAN-05'));
    },
  },
  'MAN-06': { // Austerity Protocol: EH +3, Gather yields 0 next turn
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      if (!passed(r)) return;
      changeEH(ctx, 3, 'MAN-06');
      living(ctx.s).forEach((p) => applyTimedStatus(ctx, p.seat, 'gatherYield0Until', ctx.s.turn + 1));
    },
  },
  'MAN-07': { // Public Execution: with 4+ votes the target loses half their LP, rounded up
    vote: 'target',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      const t = target(r);
      if (t === null || (r.tally[String(t)] ?? 0) < s.config.publicExecutionVotes) return;
      changeLP(ctx, t, -Math.ceil(player(s, t).lp / 2), 'MAN-07');
    },
  },
  'MAN-08': { // Amnesty of Ash: remove every Blight Cube and Embargo
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      if (!passed(r)) return;
      for (const p of living(ctx.s)) {
        removeBlight(ctx, p.seat, p.blight.bio + p.blight.neuro, 'MAN-08');
        if (p.status.embargoedUntil >= ctx.s.turn) {
          p.status.embargoedUntil = 0;
          emit(ctx, { type: 'StatusCleared', seat: p.seat, status: 'embargoedUntil' });
        }
      }
    },
  },
  'MAN-09': { // Forced Conscription: the top 2 are Conscripted next turn
    vote: 'twoTargets',
    voteResult: (ctx, r) => {
      if (r.tie) return;
      r.winners.forEach((w) => applyTimedStatus(ctx, seatOf(w), 'conscriptedUntil', ctx.s.turn + 1));
    },
  },
  'MAN-10': { // Blackout Decree: next turn's Crisis is dealt face-down
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      if (passed(r)) ctx.s.blackoutTurn = ctx.s.turn + 1 + ctx.s.skipTurns;
    },
  },
  'MAN-11': { // Legacy Audit: LP revealed, lose floor(Influence / 3) LP
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t === null) return;
      revealLP(ctx, t, 'all');
      changeLP(ctx, t, -Math.floor(player(ctx.s, t).influence / 3), 'MAN-11', { hidden: false });
      revealLP(ctx, t, 'all');
    },
  },
  'MAN-12': { // Oxygen Rationing: Embargoed for the next 2 turns
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t !== null) applyTimedStatus(ctx, t, 'embargoedUntil', ctx.s.turn + 2);
    },
  },
  'MAN-13': { // The Judas Kiss: anyone picked by BOTH neighbours loses 4 LP
    vote: 'judas',
    voteResult: (ctx, r) => r.winners.forEach((w) => changeLP(ctx, seatOf(w), -4, 'MAN-13')),
  },
  'MAN-14': { // System Reboot: every discarded Crisis is shuffled into the Stage III pile
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      if (!passed(r)) return;
      const count = s.piles.crisisDiscard.length;
      s.piles.stage[2] = shuffle(s, [...s.piles.stage[2], ...s.piles.crisisDiscard]);
      s.piles.crisisDiscard = [];
      emit(ctx, { type: 'DeckReshuffled', pile: 'stage3', count });
    },
  },
  'MAN-15': { // Mercy Killing: +3 LP, or elimination if EH is below 8
    vote: 'mercy',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      const t = s.vote?.mercyTarget ?? null;
      if (r.tie || t === null || player(s, t).eliminated) return;
      if (r.winners[0] === 'mercy') changeLP(ctx, t, 3, 'MAN-15');
      else if (s.eh < 8) eliminate(ctx, t, 'MAN-15');
    },
  },
  'MAN-16': { // Inquisition: no Sabotage or Salvage next turn
    vote: 'target',
    voteResult: (ctx, r) => {
      const t = target(r);
      if (t !== null) applyTimedStatus(ctx, t, 'noSabotageSalvageUntil', ctx.s.turn + 1);
    },
  },
  'MAN-17': { // Emergency Overdrive: one turn is skipped
    vote: 'ayeNay',
    voteResult: (ctx, r) => {
      if (passed(r)) ctx.s.skipTurns += 1;
    },
  },
  'MAN-18': { // Siphon Mandate: each rival takes 1 Influence from the target, in turn order
    vote: 'target',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      const t = target(r);
      if (t === null) return;
      for (const seat of turnOrder(s)) {
        if (seat === t) continue;
        if (changeInfluence(ctx, t, -1, 'MAN-18') === 0) break;
        changeInfluence(ctx, seat, 1, 'MAN-18');
      }
    },
  },
  'MAN-19': { // The Silent Ballot: the target swaps LP totals with the player on their LEFT
    vote: 'target',
    silentVote: true,
    voteResult: (ctx, r) => {
      const s = ctx.s;
      const t = target(r);
      const left = t === null ? null : leftOf(s, t);
      if (t === null || left === null) return;
      const a = player(s, t).lp;
      const b = player(s, left).lp;
      changeLP(ctx, t, b - a, 'MAN-19', { transfer: true });
      changeLP(ctx, left, a - b, 'MAN-19', { transfer: true });
    },
  },
  'MAN-20': { // Zero Consensus: unanimous -> the target loses 2 LP; otherwise EH -4 and everyone loses 1 LP
    customEH: true,
    vote: 'unanimous',
    voteResult: (ctx, r) => {
      const s = ctx.s;
      if (r.winners.length === 1) {
        changeLP(ctx, seatOf(r.winners[0]!), -s.config.zeroConsensusSuccessLP, 'MAN-20');
      } else {
        changeEH(ctx, -4, 'MAN-20');
        living(s).forEach((p) => changeLP(ctx, p.seat, -1, 'MAN-20'));
      }
    },
  },
};
