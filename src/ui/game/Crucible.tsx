// The Crucible (SPEC §7.1 screen 8): blind bids until one or nobody is left.
import { useState } from 'react';
import type { GameState, PendingDecision, Seat } from '../../engine';
import { Sigil, Skull } from '../icons';
import { FACTION_SHORT, useGameStore } from '../../store/gameStore';

export function Crucible({ g, me, d }: { g: GameState; me: Seat | null; d: PendingDecision | null }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const log = useGameStore((s) => s.log);
  const [bid, setBid] = useState(0);
  const max = d?.max ?? 0;
  const value = Math.min(bid, max);
  const lastBids = [...log].reverse().find((l) => l.event.type === 'BidsRevealed');
  const deleted = lastBids ? log.filter((l) => l.n > lastBids.n && l.event.type === 'PlayerDeleted').map((l) => (l.event.type === 'PlayerDeleted' ? l.event.seat : -1)) : [];
  const my = me !== null ? g.players[me]! : null;
  return (
    <section className="crucible" aria-label="The Crucible">
      <h2>THE CRUCIBLE</h2>
      <p className="serif">Influence is dust. Bid your Legacy in a closed fist. The lowest bidder is deleted. Every bid burns.</p>
      {d && my && (
        <div className="bid-box">
          <div className="skull-stack" aria-label={`You hold ${my.lp} Legacy Points`}>
            {Array.from({ length: Math.min(my.lp, 24) }, (_, i) => <Skull key={i} size={18} className={i < value ? 'bid' : ''} />)}
            {my.lp === 0 && <span className="dim">You have no Legacy left.</span>}
          </div>
          <div className="bid-row">
            <button type="button" className="step-btn big" onClick={() => setBid(Math.max(0, value - 1))} disabled={value <= 0} aria-label="Bid less">−</button>
            <output className="bid-value" aria-live="polite">{value}<small> of {max} LP</small></output>
            <button type="button" className="step-btn big" onClick={() => setBid(Math.min(max, value + 1))} disabled={value >= max} aria-label="Bid more">+</button>
          </div>
          <input type="range" min={0} max={max} value={value} onChange={(e) => setBid(Number(e.target.value))} aria-label="Bid" disabled={max === 0} />
          <button type="button" className="btn btn-primary wide" onClick={() => { dispatch({ type: 'SubmitBid', seat: d.seat, amount: value }); setBid(0); }}>Close Fist</button>
        </div>
      )}
      <ul className="fists">
        {g.players.map((p) => {
          const shown = lastBids && lastBids.event.type === 'BidsRevealed' ? lastBids.event.bids.find((b) => b.seat === p.seat) : undefined;
          const waiting = g.pending.some((x) => x.seat === p.seat);
          return (
            <li key={p.seat} className={`fist${p.eliminated ? ' dead' : ''}${deleted.includes(p.seat) ? ' just' : ''}`}>
              <Sigil faction={p.factionId} size={24} />
              <span className="fist-name">{p.seat === me ? 'You' : FACTION_SHORT[p.factionId]}</span>
              <span className="fist-state">
                {p.eliminated ? 'DELETED' : waiting ? '✊ deciding' : '✊ closed'}
                {shown && <small>last bid {shown.amount}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
