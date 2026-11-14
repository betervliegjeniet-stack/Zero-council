// What the board shows while events are still waiting to be played: the true state with the
// queued (unplayed) events undone, so bars and counters change when their animation runs.
import type { Dial, GameEvent, GameState, Seat } from '../engine';

export interface View {
  eh: number;
  turn: number;
  influence: number[];
  lp: number[];
  pool: number;
  dead: boolean[];
  /** The Crisis card is still in the deck (its reveal has not played yet). */
  crisisHidden: boolean;
  mitigated: boolean | null;
  /** Dials shown on the chips once this turn's reveal has played. */
  dials: Record<string, Dial>;
}

export function computeView(g: GameState, queued: GameEvent[], revealed: { seat: Seat; dial: Dial }[] | null): View {
  const influence = g.players.map((p) => p.influence);
  const lp = g.players.map((p) => p.lp);
  const dead = g.players.map((p) => p.eliminated);
  let eh: number | null = null;
  let pool: number | null = null;
  let turn = g.turn;
  let crisisHidden = false;
  let mitigationQueued = false;
  for (const e of queued) {
    switch (e.type) {
      case 'EHChanged': if (eh === null) eh = e.from; break;
      case 'PoolChanged': if (pool === null) pool = e.from; break;
      case 'InfluenceChanged': influence[e.seat]! -= e.delta; break;
      case 'LPChanged': lp[e.seat]! -= e.delta; break;
      case 'PlayerDeleted': dead[e.seat] = false; break;
      case 'TurnStarted': turn = Math.min(turn, Math.max(1, e.turn - 1)); break;
      case 'CardRevealed': if (e.deck === 'crisis' && e.cardId === g.crisis?.cardId && (e.faceDown || !g.crisis.faceDown)) crisisHidden = true; break;
      case 'MitigationResult': mitigationQueued = true; break;
      default: break;
    }
  }
  const dials: Record<string, Dial> = {};
  if (revealed && !queued.some((e) => e.type === 'DialsRevealed')) for (const d of revealed) dials[String(d.seat)] = d.dial;
  return {
    eh: eh ?? g.eh,
    turn,
    influence: influence.map((x) => Math.max(0, x)),
    lp: lp.map((x) => Math.max(0, x)),
    pool: pool ?? g.crisis?.pool ?? 0,
    dead,
    crisisHidden,
    mitigated: mitigationQueued ? null : (g.crisis?.mitigated ?? null),
    dials,
  };
}
