// Codex (SPEC §7.1 screen 10): all 71 cards, the rules, the factions.
import { useMemo, useState } from 'react';
import { CARDS, FACTIONS, type Card } from '../../engine';
import { CardView } from '../CardView';
import { CardZoom } from '../game/Board';
import { Cog, Sigil, Skull } from '../icons';
import { useGameStore } from '../../store/gameStore';

type Filter = 'all' | 's1' | 's2' | 's3' | 's4' | 'schism' | 'finale' | 'mandate';
const FILTERS: { id: Filter; label: string; test: (c: Card) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 's1', label: 'Crisis I', test: (c) => c.deck === 'crisis' && c.stage === 1 },
  { id: 's2', label: 'Crisis II', test: (c) => c.deck === 'crisis' && c.stage === 2 },
  { id: 's3', label: 'Crisis III', test: (c) => c.deck === 'crisis' && c.stage === 3 },
  { id: 's4', label: 'Crisis IV', test: (c) => c.deck === 'crisis' && c.stage === 4 },
  { id: 'schism', label: 'Biological Schism', test: (c) => c.expansion },
  { id: 'finale', label: 'Finale', test: (c) => c.deck === 'finale' },
  { id: 'mandate', label: 'Mandates', test: (c) => c.deck === 'mandate' },
];

const RULES: [string, string][] = [
  ['The goal', 'There are no winners. Ten turns of crisis, then the Crucible. The last Councilor standing is the Last Survivor. If nobody is left, silence wins.'],
  ['A turn', '1. A Crisis is revealed. 2. The Whisper Campaign: a timed round of deals. 3. Everyone secretly sets one action on their dial. 4. Dials are revealed and resolve in turn order, the Crisis is checked, deals are judged. Turns 3 and 6 end with an Apex Mandate vote; turn 9 with a Finale card.'],
  ['Earth Health (EH)', 'The bunker starts at 20 (18 with four Councilors). Crises lower it, mostly when the Council fails to mitigate them. If it hits 0 the main game ends and everyone loses half their LP; the lowest contributors lose 1 more.'],
  ['Influence and Legacy (LP)', 'Influence is public and pays for actions. Legacy Points are hidden: rivals show "?" until a card or ability reveals them. Only LP counts in the Crucible.'],
  ['Actions', 'Gather: +2 Influence. Salvage: 3 Influence for +1 LP. Sabotage: 2 Influence, a rival loses 1 LP. Contribute: put X Influence into the Global Pool. Self-Quarantine: remove 1 Blight Cube (voids your promises this turn). You pay when the action resolves; if you cannot, it fizzles.'],
  ['The Global Pool', 'Pool crises need a total of Influence from the whole Council. Reach the threshold and nothing happens; fall short and the penalty lands. Influence beyond the threshold is lost.'],
  ['Statuses', 'Infected: lose 1 LP per bio cube (1 Influence per neuro cube) every turn. Embargoed: every action costs 1 more. Exiled: faction abilities are gone for good. Silenced: no deals. Paralyzed: no Salvage until you pay 5. Gather broken: Repair for 3.'],
  ['Deals', 'Deals are promises: Contribute, Sabotage, do not Sabotage, vote, Inoculate. Influence handed over is gone at once. After the turn each promise is checked; a broken one is stamped BETRAYED. Only a Quiet Choir Binding Oath has teeth: the breaker loses 2 LP.'],
  ['The Black Urn', 'Every living Councilor votes, never for themselves. The most votes decides. A tie fails the Mandate and costs Earth Health, unless the Black Urn Directorate breaks it.'],
  ['Ties', 'A penalty or reward for "the player with the most or least" of something hits every tied player.'],
  ['The Crucible', 'Influence becomes worthless. Each round everyone secretly bids LP. The lowest bidder is deleted; among tied lowest bidders, the one with the fewest LP left goes, and if that is tied too, all of them go. Every bid is destroyed.'],
];

export function CodexScreen() {
  const s = useGameStore();
  const [tab, setTab] = useState<'cards' | 'rules' | 'factions'>('cards');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const cards = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    const q = query.trim().toLowerCase();
    return CARDS.filter((c) => test(c) && (!q || `${c.id} ${c.title} ${c.digitalRuling} ${c.type}`.toLowerCase().includes(q)));
  }, [filter, query]);
  return (
    <main className="screen codex">
      <div className="noise" aria-hidden="true" />
      <header className="top-bar">
        <button type="button" className="btn btn-small" onClick={() => s.go(s.backTo)}>Back</button>
        <h1>Codex</h1>
      </header>
      <div className="tabs" role="tablist">
        {(['cards', 'rules', 'factions'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
            {t === 'cards' ? `Cards (${CARDS.length})` : t === 'rules' ? 'Rules' : 'Factions'}
          </button>
        ))}
      </div>
      {tab === 'cards' && (
        <>
          <div className="filters">
            <input type="search" placeholder="Search cards" aria-label="Search cards" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="filter-row" role="radiogroup" aria-label="Deck">
              {FILTERS.map((f) => <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={filter === f.id ? 'chip on' : 'chip'} onClick={() => setFilter(f.id)}>{f.label}</button>)}
            </div>
          </div>
          <div className="scroll">
            <p className="dim">{cards.length} card{cards.length === 1 ? '' : 's'}</p>
            <div className="card-grid">
              {cards.map((c) => <CardView key={c.id} card={c} size="mini" onClick={() => setZoom(c.id)} />)}
            </div>
          </div>
        </>
      )}
      {tab === 'rules' && (
        <div className="scroll rules">
          {RULES.map(([h, body]) => <section key={h}><h2>{h}</h2><p>{body}</p></section>)}
        </div>
      )}
      {tab === 'factions' && (
        <div className="scroll">
          {FACTIONS.map((f) => (
            <section key={f.id} className="faction-entry" style={{ '--accent': f.palette.accent } as React.CSSProperties}>
              <h2><Sigil faction={f.id} size={28} /> {f.name}</h2>
              <p className="serif">{f.role}</p>
              <p><Cog size={14} /> {f.start.influence} Influence · <Skull size={14} /> {f.start.lp} LP</p>
              <p><b>{f.passive.name}.</b> {f.passive.text}</p>
              <p><b>{f.active.name}.</b> {f.active.text}</p>
            </section>
          ))}
        </div>
      )}
      {zoom && <CardZoom cardId={zoom} onClose={() => setZoom(null)} />}
    </main>
  );
}
