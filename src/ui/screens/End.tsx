// End screen (SPEC §2.11): there are no winners.
import { getFaction } from '../../engine';
import { humanSeat, useGameStore } from '../../store/gameStore';

const CAUSE: Record<string, string> = {
  crucible: 'Outbid in the Crucible', 'CR-37': 'The Great Filter', 'CR-40': 'Total Crucible', 'FIN-04': 'Total Crucible', 'MAN-15': 'Mercy Killing: efficiency',
};

export function EndScreen() {
  const s = useGameStore();
  const g = s.game;
  if (!g || !g.outcome) return null;
  const me = humanSeat(g);
  const p = me !== null ? g.players[me]! : null;
  const survived = !!p && g.outcome.kind === 'survivor' && g.outcome.seat === me;
  const extinct = g.outcome.kind === 'extinction';
  const headline = survived ? 'You are the Last Survivor.' : extinct ? 'TOTAL EXTINCTION.' : 'DELETED.';
  const sub = survived ? 'The bunker hums for no one.' : extinct ? 'Silence wins.' : 'The Council does not remember your name.';
  const lastTurn = g.mainOver?.turn ?? g.turn;
  const mainEnd = { turnLimit: 'Turn 10 ran out', collapse: 'Earth Health reached 0', card: 'A card ended the main game', attrition: 'The Council emptied' }[g.outcome.mainEndCause];
  const stats: [string, string | number][] = p ? [
    ['Turns survived', p.eliminatedTurn !== null && p.eliminatedCause !== 'crucible' ? p.eliminatedTurn : lastTurn],
    ['LP forged', p.stats.lpForged],
    ['LP destroyed', p.stats.lpDestroyed],
    ['Influence contributed', p.contributedTotal],
    ['Deals made', p.stats.dealsMade],
    ['Deals you broke', p.stats.dealsBroken],
    ['Times you were betrayed', p.stats.timesBetrayed],
    ['Cause of death', survived ? 'None. Yet.' : p.eliminated ? (CAUSE[p.eliminatedCause ?? ''] ?? p.eliminatedCause ?? 'Unknown') : 'Unknown'],
  ] : [];
  return (
    <main className={`screen end${survived ? ' end-survivor' : ''}`}>
      <div className="noise" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="scroll">
        <h1 className="end-head">{headline}</h1>
        <p className="end-sub serif">{sub}</p>
        {!survived && g.outcome.kind === 'survivor' && <p className="center">Last Survivor: {getFaction(g.players[g.outcome.seat]!.factionId).name}</p>}
        <p className="center dim">{mainEnd}. Earth Health at the end: {g.eh}.</p>
        <dl className="stats">
          {stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="center dim">Seed {g.seed}</p>
      </div>
      <nav className="menu">
        <button type="button" className="btn btn-primary" onClick={() => s.go('setup')}>Again</button>
        <button type="button" className="btn" onClick={() => s.go('codex')}>Codex</button>
        <button type="button" className="btn" onClick={() => s.go('title')}>Return to the Bunker</button>
      </nav>
    </main>
  );
}
