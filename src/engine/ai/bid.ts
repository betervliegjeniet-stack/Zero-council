// Bids and pledges (SPEC §5.6): the Crucible, the Finale Influence bids, and the LP Pledge.
import { living, player } from '../selectors';
import type { GameState, PendingDecision } from '../types';
import { believedLP } from './beliefs';
import { aiRng, clamp } from './personality';
import { nextFloat, randInt } from '../rng';

export function chooseBid(s: GameState, d: PendingDecision): number {
  const seat = d.seat;
  const per = s.ai[seat]!.personality;
  const p = player(s, seat);
  const rng = aiRng(s, seat, `bid${d.id}`);
  const max = d.max ?? 0;
  const n = living(s).length;
  const noise = randInt(rng, -1, 1);
  switch (d.kind) {
    case 'crucibleBid': {
      if (n <= 2) return max; // the last round: everything
      // Only the lowest bidder dies, and a tie for lowest kills whoever has the least LP left.
      // So with a rival believed to be at 0 LP, bidding 0 is safe and keeps everything.
      const rivals = living(s).filter((o) => o.seat !== seat).map((o) => believedLP(s, seat, o.seat));
      if (p.lp > 0 && rivals.some((lp) => lp <= 0)) return 0;
      // Otherwise bid just enough not to stand alone at the bottom, keeping a reserve for later rounds.
      const reserve = Math.floor((p.lp * (n - 2)) / n);
      // An extra LP now and then breaks the symmetry when several rivals hold the same LP
      // (identical bids with identical LP left would delete all of them).
      const extra = p.lp >= 2 && nextFloat(rng) < 0.25 + (1 - per.risk) * 0.25 ? 1 : 0;
      return clamp(1 + extra, 0, Math.max(Math.min(1, p.lp), p.lp - reserve));
    }
    case 'finaleBid': {
      // FIN-02: the top bidder takes all LP of the two lowest. Influence has one turn of use left.
      return clamp(Math.round(max * (0.45 + 0.5 * per.greed)) + noise, 0, max);
    }
    case 'finalePool': {
      // FIN-03: a fair share of 15, if this Councilor still has abilities worth protecting.
      if (p.status.exiled || per.cooperation < 0.3) return clamp(noise, 0, max);
      return clamp(Math.ceil(15 / Math.max(1, n - 1.5)) + (per.cooperation > 0.6 ? 1 : 0) + noise, 0, max);
    }
    default:
      return 0;
  }
}

/** CR-26: pledges are refunded on failure, so a fair share is cheap insurance. */
export function choosePledge(s: GameState, d: PendingDecision): number {
  const per = s.ai[d.seat]!.personality;
  const p = player(s, d.seat);
  const n = living(s).length;
  if (per.cooperation < 0.35 || p.lp <= 1) return 0;
  const fair = Math.ceil(5 / n);
  const extra = per.cooperation > 0.6 && p.lp >= 4 ? 1 : 0;
  return clamp(fair + extra, 0, Math.min(d.max ?? 0, p.lp - 1));
}
