// Headless batch runner: `npm run sim -- --games 1000 --players 6 --seed 1 [--verbose]`.
// M1: random-action players. The AI Councilors and the full balance report arrive in M3.
import { FACTIONS, getCard, getFaction, type GameEvent, type GameState } from '../src/engine';
import { runGame } from './runner';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}
const games = arg('games', 100);
const players = arg('players', 6) as 4 | 5 | 6;
const seed0 = arg('seed', 1);
const verbose = process.argv.includes('--verbose');

function name(s: GameState, seat: number): string {
  return getFaction(s.players[seat]!.factionId).name.replace(/^The /, '');
}

function describe(e: GameEvent, s: GameState): string | null {
  switch (e.type) {
    case 'TurnStarted': return `\n== TURN ${e.turn} (Stage ${'I'.repeat(e.stage).replace('IIII', 'IV')}) first player: ${name(s, e.firstSeat)}`;
    case 'CardRevealed': return `  ${e.deck.toUpperCase()}: ${e.cardId} ${getCard(e.cardId).title}`;
    case 'CardSkipped': return `  (${e.cardId} not resolved: ${e.reason})`;
    case 'EHChanged': return `  EH ${e.from} -> ${e.to} (${e.cause})`;
    case 'ActionResolved': {
      const d = e.dial;
      const extra = d.action === 'sabotage' ? ` -> ${name(s, d.target!)}` : d.action === 'contribute' ? ` ${d.amount}` : '';
      return `  ${name(s, e.seat)}: ${d.action}${extra}`;
    }
    case 'ActionFizzled': return `  ${name(s, e.seat)}: ${e.dial.action} FIZZLED (${e.reason})`;
    case 'MitigationResult': return `  Pool ${e.pool}/${e.threshold}: ${e.success ? 'MITIGATED' : 'FAILED'}`;
    case 'MainGameOver': return `  MAIN GAME OVER (${e.cause})`;
    case 'CollapsePenalty': return '  TOTAL COLLAPSE: everyone bleeds';
    case 'CrucibleStarted': return `\n== THE CRUCIBLE: ${e.seats.map((x) => name(s, x)).join(', ')}`;
    case 'BidsRevealed': return `  Round ${e.round} bids: ${e.bids.map((b) => `${name(s, b.seat)} ${b.amount}`).join(', ')}`;
    case 'PlayerDeleted': return `  DELETED: ${name(s, e.seat)} (${e.cause})`;
    case 'GameEnded': return e.outcome.kind === 'survivor' ? `\nLAST SURVIVOR: ${name(s, e.outcome.seat)}` : '\nTOTAL EXTINCTION';
    default: return null;
  }
}

const survivors = new Map<string, number>();
const seated = new Map<string, number>();
const endCauses = new Map<string, number>();
let extinctions = 0;
let finalEH = 0;
let mitigated = 0;
let poolCrises = 0;
let violations = 0;
let errors = 0;
const t0 = Date.now();

for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  try {
    const r = runGame({ seed, playerCount: players });
    violations += r.violations.length;
    if (r.violations.length) console.error(`seed ${seed}:`, r.violations.slice(0, 3));
    for (const p of r.state.players) seated.set(p.factionId, (seated.get(p.factionId) ?? 0) + 1);
    const o = r.state.outcome!;
    endCauses.set(o.mainEndCause, (endCauses.get(o.mainEndCause) ?? 0) + 1);
    if (o.kind === 'survivor') {
      const f = r.state.players[o.seat]!.factionId;
      survivors.set(f, (survivors.get(f) ?? 0) + 1);
    } else extinctions++;
    finalEH += r.state.eh;
    for (const e of r.events) {
      if (e.type === 'MitigationResult' && getCard(e.cardId).mitigation.kind === 'pool_influence') {
        poolCrises++;
        if (e.success) mitigated++;
      }
    }
    if (verbose && g === 0) {
      console.log(`Seed ${seed}, ${players} players: ${r.state.players.map((p) => name(r.state, p.seat)).join(', ')}`);
      for (const e of r.events) {
        const line = describe(e, r.state);
        if (line) console.log(line);
      }
      console.log('');
    }
  } catch (err) {
    errors++;
    console.error(`seed ${seed} threw:`, err);
  }
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
console.log(`ZERO COUNCIL sim (random-action players): ${games} games, ${players} players, seeds ${seed0}..${seed0 + games - 1}, ${Date.now() - t0} ms`);
console.log(`Errors: ${errors}   Invariant violations: ${violations}`);
console.log(`Main game ended by: ${[...endCauses].map(([k, v]) => `${k} ${pct(v, games)}`).join(', ')}`);
console.log(`Average final EH: ${(finalEH / games).toFixed(1)}   Pool crises mitigated: ${pct(mitigated, poolCrises)} of ${poolCrises}`);
console.log(`Total Extinction: ${pct(extinctions, games)}`);
console.log('Last Survivor rate per faction (of games in which it was seated):');
for (const f of FACTIONS) console.log(`  ${f.name.padEnd(28)} ${pct(survivors.get(f.id) ?? 0, seated.get(f.id) ?? 0)}`);
if (errors || violations) process.exit(1);
