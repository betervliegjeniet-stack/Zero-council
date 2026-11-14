// Headless balance tool (SPEC §5.7):
//   npm run sim -- --games 1000 --players 6 --seed 1 [--difficulty easy|normal|merciless] [--policy ai|random]
//                  [--verbose] [--brief] [--ai '{"weight":value}']
import { DEFAULT_AI, FACTIONS, getCard, getFaction, startingPool, type AIConfig, type Difficulty, type GameEvent, type GameState } from '../src/engine';
import { aiPolicy, randomPolicy, runGame } from './runner';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : fallback;
}
const games = Number(arg('games', '100'));
const players = Number(arg('players', '6')) as 4 | 5 | 6;
const seed0 = Number(arg('seed', '1'));
const difficulty = arg('difficulty', 'normal') as Difficulty;
const policyName = arg('policy', 'ai');
const policy = policyName === 'random' ? randomPolicy : aiPolicy;
const verbose = process.argv.includes('--verbose');
// Try AI weights without editing config.ts: --ai '{"sabotageAggression":0.4}'
const ai: AIConfig = { ...DEFAULT_AI, ...(JSON.parse(arg('ai', '{}')) as Partial<AIConfig>) };
const brief = process.argv.includes('--brief');
// Try rule values without editing config.ts: --config '{"poolScalesWithPlayers":true}'
const configOverride = JSON.parse(arg('config', '{}')) as Record<string, unknown>;

function name(s: GameState, seat: number): string {
  return getFaction(s.players[seat]!.factionId).name.replace(/^The /, '');
}

function describe(e: GameEvent, s: GameState): string | null {
  switch (e.type) {
    case 'TurnStarted': return `\n== TURN ${e.turn} (Stage ${['I', 'II', 'III', 'IV'][e.stage - 1]}) first player: ${name(s, e.firstSeat)}`;
    case 'CardRevealed': return `  ${e.deck.toUpperCase()}: ${e.cardId} ${getCard(e.cardId).title}${e.faceDown ? ' (face-down)' : ''}`;
    case 'CardSkipped': return `  (${e.cardId} skipped: ${e.reason})`;
    case 'EHChanged': return `  EH ${e.from} -> ${e.to} (${e.cause})`;
    case 'ActionResolved': {
      const d = e.dial;
      const extra = d.target !== undefined ? ` -> ${name(s, d.target)}` : d.action === 'contribute' ? ` ${d.amount}` : '';
      return `  ${name(s, e.seat)}: ${d.action}${extra}`;
    }
    case 'ActionFizzled': return `  ${name(s, e.seat)}: ${e.dial.action} FIZZLED (${e.reason})`;
    case 'MitigationResult': return `  Pool ${e.pool}/${e.threshold}: ${e.success ? 'MITIGATED' : 'FAILED'}`;
    case 'VoteResult': return `  VOTE ${e.cardId}: ${e.result.tie ? 'TIE' : e.result.winners.map((w) => (/^\d+$/.test(w) ? name(s, Number(w)) : w.toUpperCase())).join(' + ') || 'no result'}${e.result.brokenBy !== null ? ' (tie broken by the Directorate)' : ''}`;
    case 'AbilityUsed': return `  ${name(s, e.seat)} uses ${e.ability}${e.target !== undefined ? ` on ${name(s, e.target)}` : ''}`;
    case 'DealAccepted': return `  Deal sealed: ${name(s, e.proposer)} + ${name(s, e.partner)}`;
    case 'DealBroken': return `  BETRAYED by ${e.breakers.map((b) => name(s, b)).join(', ')}${e.binding ? ' (Binding Oath: -2 LP)' : ''}`;
    case 'StatusApplied': return `  ${name(s, e.seat)}: ${e.status}`;
    case 'MainGameOver': return `  MAIN GAME OVER (${e.cause})`;
    case 'CollapsePenalty': return '  TOTAL COLLAPSE: everyone bleeds';
    case 'CrucibleStarted': return `\n== THE CRUCIBLE: ${e.seats.map((x) => name(s, x)).join(', ')}`;
    case 'BidsRevealed': return `  Round ${e.round} bids: ${e.bids.map((b) => `${name(s, b.seat)} ${b.amount}`).join(', ')}`;
    case 'PlayerDeleted': return `  DELETED: ${name(s, e.seat)} (${e.cause})`;
    case 'GameEnded': return e.outcome.kind === 'survivor' ? `\nLAST SURVIVOR: ${name(s, e.outcome.seat)}` : '\nTOTAL EXTINCTION';
    default: return null;
  }
}

const bump = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');

const survivors = new Map<string, number>();
const seated = new Map<string, number>();
const endCauses = new Map<string, number>();
const actions = new Map<string, number>();
const cardSeen = new Map<string, number>();
const cardMitigated = new Map<string, number>();
const deals = new Map<string, number>();
let extinctions = 0, finalEH = 0, turnsPlayed = 0, violations = 0, errors = 0;
let crucibleLP = 0, crucibleEntrants = 0, crucibles = 0;
let votes = 0, voteTies = 0, tiesBroken = 0, executions = 0, executionHits = 0, offers = 0;
const t0 = Date.now();

for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  try {
    const r = runGame({ seed, playerCount: players, difficulty, config: { ...configOverride, ai } }, policy);
    violations += r.violations.length;
    if (r.violations.length) console.error(`seed ${seed}:`, r.violations.slice(0, 3));
    for (const p of r.state.players) bump(seated, p.factionId);
    const o = r.state.outcome!;
    bump(endCauses, o.mainEndCause);
    if (o.kind === 'survivor') bump(survivors, r.state.players[o.seat]!.factionId);
    else extinctions++;
    finalEH += r.state.eh;
    turnsPlayed += r.state.mainOver?.turn ?? r.state.turn;
    for (const d of r.state.deals) bump(deals, d.status);
    // LP per seat, replayed from the event stream, to read the totals at the door of the Crucible.
    const lp = r.state.players.map((p) => startingPool(r.state.config, p.factionId).lp);
    let inCrucible = false;
    for (const e of r.events) {
      if (e.type === 'LPChanged') lp[e.seat]! += e.delta;
      else if (e.type === 'CrucibleStarted') {
        inCrucible = true;
        crucibles++;
        crucibleEntrants += e.seats.length;
        crucibleLP += e.seats.reduce((sum, seat) => sum + lp[seat]!, 0);
      } else if (e.type === 'ActionResolved' && !inCrucible) bump(actions, e.dial.action);
      else if (e.type === 'ActionFizzled') bump(actions, 'fizzled');
      else if (e.type === 'DealProposed') offers++;
      else if (e.type === 'MitigationResult') {
        bump(cardSeen, e.cardId);
        if (e.success) bump(cardMitigated, e.cardId);
      } else if (e.type === 'VoteResult') {
        votes++;
        if (e.result.tie) voteTies++;
        if (e.result.brokenBy !== null) tiesBroken++;
        if (e.cardId === 'MAN-07') {
          executions++;
          const w = e.result.winners[0];
          const need = r.state.config.publicExecutionVotesByPlayers[String(players)] ?? r.state.config.publicExecutionVotes;
          if (!e.result.tie && w !== undefined && (e.result.tally[w] ?? 0) >= need) executionHits++;
        }
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

const who = policyName === 'random' ? 'random-action players' : `AI Councilors, ${difficulty}`;
console.log(`ZERO COUNCIL balance report: ${games} games, ${players} players, ${who}, seeds ${seed0}..${seed0 + games - 1} (${Date.now() - t0} ms)`);
console.log(`Errors: ${errors}   Invariant violations: ${violations}`);
console.log('\nHOW THE MAIN GAME ENDED');
const label: Record<string, string> = { turnLimit: 'Turn 10 reached', collapse: 'Earth Health hit 0', card: 'A card ended it', attrition: 'One or no player left' };
for (const [k, v] of [...endCauses].sort((a, b) => b[1] - a[1])) console.log(`  ${(label[k] ?? k).padEnd(24)} ${pct(v, games)}`);
console.log(`  Average final EH: ${(finalEH / games).toFixed(1)}   Average last turn played: ${(turnsPlayed / games).toFixed(1)}`);
console.log('\nLAST SURVIVOR RATE (of games in which the faction was seated)');
for (const f of FACTIONS) console.log(`  ${f.name.padEnd(28)} ${pct(survivors.get(f.id) ?? 0, seated.get(f.id) ?? 0)}`);
console.log(`  ${'Total Extinction'.padEnd(28)} ${pct(extinctions, games)}`);
console.log(`\nTHE CRUCIBLE: average ${(crucibleEntrants / Math.max(1, crucibles)).toFixed(1)} entrants with ${(crucibleLP / Math.max(1, crucibleEntrants)).toFixed(1)} LP each`);
if (!brief) console.log('\nMITIGATION (how often each card was averted)');
let seenPool = 0, okPool = 0;
for (const id of [...cardSeen.keys()].sort()) {
  const card = getCard(id);
  const seen = cardSeen.get(id)!;
  const ok = cardMitigated.get(id) ?? 0;
  if (card.mitigation.kind === 'pool_influence' && card.deck === 'crisis') {
    seenPool += seen;
    okPool += ok;
  }
  if (!brief) console.log(`  ${id} ${card.title.padEnd(26)} ${card.mitigation.kind.padEnd(14)} ${String(card.mitigation.amount).padStart(2)}  ${pct(ok, seen).padStart(6)} of ${seen}`);
}
console.log(`  All Influence pool crises: ${pct(okPool, seenPool)} of ${seenPool}`);
const totalActions = [...actions.values()].reduce((a, b) => a + b, 0);
console.log('\nACTIONS CHOSEN');
console.log(`  ${[...actions].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, totalActions)}`).join(', ')}`);
const d = (k: string) => deals.get(k) ?? 0;
const sealed = d('kept') + d('broken') + d('voided') + d('accepted');
console.log('\nDEALS');
console.log(`  Offered ${offers} (${(offers / games).toFixed(1)} per game), sealed ${pct(sealed, offers)}; of those kept ${pct(d('kept'), sealed)}, broken ${pct(d('broken'), sealed)}, voided ${pct(d('voided'), sealed)}`);
console.log('\nVOTES');
console.log(`  ${votes} votes, ${pct(voteTies, votes)} ended tied, ${tiesBroken} ties broken by the Directorate; Public Execution reached its vote count in ${pct(executionHits, executions)} of ${executions}`);
if (errors || violations) process.exit(1);
