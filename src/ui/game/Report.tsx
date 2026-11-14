// The event log drawer and the end-of-turn report.
import { useMemo } from 'react';
import type { GameState, Seat } from '../../engine';
import { Sheet } from '../common';
import { useGameStore, type LogEntry } from '../../store/gameStore';
import { describe } from '../text';

function Lines({ entries, g, me }: { entries: LogEntry[]; g: GameState; me: Seat | null }) {
  const lines = useMemo(() => entries.map((l) => ({ n: l.n, line: describe(l.event, g, me) })).filter((x) => x.line), [entries, g, me]);
  if (lines.length === 0) return <p className="dim">Nothing yet.</p>;
  return <ol className="log">{lines.map((x) => <li key={x.n} className={`tone-${x.line!.tone}`}>{x.line!.text}</li>)}</ol>;
}

export function LogSheet({ g, me, onClose, turnOnly }: { g: GameState; me: Seat | null; onClose: () => void; turnOnly?: boolean }) {
  const log = useGameStore((s) => s.log);
  const entries = turnOnly ? log.filter((l) => l.turn === g.turn) : log;
  return (
    <Sheet title={turnOnly ? `Turn ${g.turn}: what happened` : 'Council log'} tall onClose={onClose}>
      <Lines entries={entries} g={g} me={me} />
    </Sheet>
  );
}

/** Shown at the end-of-turn gate: this turn's events from the reveal onward. */
export function TurnReport({ g, me }: { g: GameState; me: Seat | null }) {
  const log = useGameStore((s) => s.log);
  const turn = log.filter((l) => l.turn === g.turn);
  const from = turn.findIndex((l) => l.event.type === 'DialsRevealed' || l.event.type === 'DialSpun' || l.event.type === 'DialRevealedEarly');
  const entries = from >= 0 ? turn.slice(from) : turn;
  return (
    <section className="report" aria-label="What happened this turn">
      <h2>Resolution</h2>
      <Lines entries={entries} g={g} me={me} />
    </section>
  );
}
