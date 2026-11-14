// The Bunker: Collapse Tracker, rivals row, Crisis zone and the player's Faction Mat (SPEC §7.1 screen 3).
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  abilitiesActive, getCard, getFaction, isActive, poolThreshold, stageForTurn, type GameState, type PlayerState, type Seat,
} from '../../engine';
import { CardBack, CardView } from '../CardView';
import { Sheet } from '../common';
import { Cog, Cube, Flip, Lock, Mouth, Sigil, Skull, Urn } from '../icons';
import { DURATION } from '../../fx/animations';
import type { View } from '../../fx/view';
import { FACTION_SHORT, useGameStore, type LogEntry } from '../../store/gameStore';
import { seatFx } from './Fx';
import { ACTION_LABEL, STATUS_LABEL, termText } from '../text';

const STAGE_NAME = ['', 'Stage I', 'Stage II', 'Stage III', 'Stage IV'];

export function Tracker({ g, view }: { g: GameState; view: View }) {
  const stage = stageForTurn(g.config, Math.max(1, view.turn));
  const eh = view.eh;
  const danger = eh <= 5 ? 'eh-red' : eh <= 10 ? 'eh-amber' : 'eh-bone';
  const mandateTurn = (t: number) => g.config.mandateTurns.includes(t);
  // Segments drain (or refill) one by one: each waits for the ones before it.
  const prev = useRef(eh);
  const from = prev.current;
  useEffect(() => {
    prev.current = eh;
  }, [eh]);
  const delay = (i: number) => (eh < from ? Math.max(0, from - 1 - i) : Math.max(0, i - from)) * DURATION.ehPerSegment;
  return (
    <section className={`tracker${eh !== from ? (eh < from ? ' eh-losing' : ' eh-healing') : ''}`} aria-label="Collapse Tracker">
      <ol className="turns" aria-label={`Turn ${view.turn} of ${g.config.totalTurns}`}>
        {Array.from({ length: g.config.totalTurns }, (_, i) => i + 1).map((t) => (
          <li key={t} className={`turn-slot${t === view.turn ? ' now' : ''}${t < view.turn ? ' past' : ''}`} aria-current={t === view.turn ? 'step' : undefined}>
            {mandateTurn(t) ? <Urn size={12} /> : t}
          </li>
        ))}
      </ol>
      <div className={`eh ${danger}`} role="meter" aria-label="Earth Health" aria-valuemin={0} aria-valuemax={g.maxEH} aria-valuenow={eh}>
        <span className="eh-skull"><Skull size={14} /></span>
        <div className="eh-bar">
          {Array.from({ length: g.maxEH }, (_, i) => <i key={i} className={i < eh ? 'on' : ''} style={{ transitionDelay: `${delay(i)}ms` }} />)}
        </div>
        <span className="eh-num">{eh}</span>
      </div>
      <div className="tracker-foot">
        <span>{STAGE_NAME[stage]}</span>
        {g.config.collapsePenalty && <span className="warn">If the bunker fails, everyone bleeds.</span>}
      </div>
    </section>
  );
}

/** What the human may know of a rival's LP: a public reveal, a private disclosure, or nothing. */
export function knownLP(g: GameState, seat: Seat, me: Seat | null): { value: number; turn: number } | null {
  const p = g.players[seat]!;
  const shown = me !== null ? p.lpShownTo[String(me)] : undefined;
  const best = [p.lpRevealed, shown].filter((x): x is { value: number; turn: number } => !!x).sort((a, b) => b.turn - a.turn)[0];
  return best ?? null;
}

export function statusIcons(g: GameState, p: PlayerState) {
  const st = p.status;
  const out: { key: string; icon: React.ReactNode; label: string }[] = [];
  const cubes = p.blight.bio + p.blight.neuro;
  if (cubes > 0) out.push({ key: 'blight', icon: <span className="st st-blight"><Cube size={12} />{cubes}</span>, label: `${cubes} Blight` });
  if (isActive(g, st.embargoedUntil)) out.push({ key: 'emb', icon: <span className="st"><Lock size={12} /></span>, label: 'Embargoed' });
  if (st.exiled) out.push({ key: 'ex', icon: <span className="st st-bad"><Flip size={12} /></span>, label: 'Exiled' });
  else if (isActive(g, st.abilitiesDisabledUntil)) out.push({ key: 'dis', icon: <span className="st"><Flip size={12} /></span>, label: 'Abilities disabled' });
  if (isActive(g, st.silencedUntil) || isActive(g, st.noTradeUntil)) out.push({ key: 'sil', icon: <span className="st"><Mouth size={12} /></span>, label: 'Cannot deal' });
  return out;
}

export function Rivals({ g, me, onPick, view, playing }: { g: GameState; me: Seat | null; onPick: (seat: Seat) => void; view: View; playing: LogEntry[] }) {
  const rivals = g.players.filter((p) => p.seat !== me);
  return (
    <section className="rivals" aria-label="Rival Councilors">
      {rivals.map((p) => {
        const f = getFaction(p.factionId);
        const lp = knownLP(g, p.seat, me);
        const trust = g.ai[p.seat] && me !== null ? g.ai[p.seat]!.trust[me]! - g.ai[p.seat]!.hostility[me]! : 0;
        const hue = Math.round(60 + Math.max(-1, Math.min(1, trust)) * 60); // 0 red .. 120 green
        const icons = statusIcons(g, p);
        const dead = view.dead[p.seat]!;
        const dial = view.dials[String(p.seat)];
        const label = `${FACTION_SHORT[p.factionId]}. ${dead ? 'Deleted.' : `${view.influence[p.seat]} Influence, ${lp ? `${lp.value} LP as of turn ${lp.turn}` : 'LP unknown'}. ${icons.map((i) => i.label).join(', ')}`}`;
        return (
          <button key={p.seat} type="button" data-seat={p.seat} className={`rival${dead ? ' dead' : ''}${g.firstSeat === p.seat && !dead ? ' first' : ''} ${seatFx(playing, p.seat)}`}
            style={{ '--accent': f.palette.accent } as React.CSSProperties} onClick={() => onPick(p.seat)} aria-label={label}>
            <span className="rival-sigil"><Sigil faction={p.factionId} size={26} /></span>
            <span className="rival-name">{FACTION_SHORT[p.factionId].split(' ').slice(0, 2).join(' ')}</span>
            {dead ? <span className="rival-dead">DELETED</span> : (
              <>
                <span className="rival-res">
                  <span><Cog size={12} />{view.influence[p.seat]}</span>
                  <span className={lp ? (g.turn - lp.turn > 1 ? 'lp old' : 'lp') : 'lp unknown'}><Skull size={12} />{lp ? lp.value : '?'}{lp && <small>t{lp.turn}</small>}</span>
                </span>
                {dial
                  ? <span className="rival-dial">{ACTION_LABEL[dial.action].replace('Self-', '')}{dial.action === 'contribute' ? ` ${dial.amount}` : ''}{dial.target !== undefined ? (dial.target === me ? ' → YOU' : ' →') : ''}</span>
                  : <span className="rival-status">{icons.map((i) => <span key={i.key} title={i.label}>{i.icon}</span>)}</span>}
                <span className="trust" style={{ background: `hsl(${hue} 70% 45%)` }} />
              </>
            )}
          </button>
        );
      })}
    </section>
  );
}

function modifierChips(g: GameState): string[] {
  const m = g.modifiers;
  const out: string[] = [];
  if (m.salvageBlocked || m.noLPGain) out.push('SALVAGE LOCKED');
  if (m.noLPGain) out.push('NO LP GAIN');
  if (m.gatherBlocked) out.push('GATHER LOCKED');
  if (m.gatherYield !== null) out.push(`GATHER +${m.gatherYield}`);
  if (m.sabotageCost !== null) out.push(`SABOTAGE COSTS ${m.sabotageCost}`);
  if (m.sabotageDamageSet !== null) out.push(`SABOTAGE x${m.sabotageDamageSet}`);
  if (m.sabotageDamageBonus) out.push(`SABOTAGE x${g.config.sabotageDamage + m.sabotageDamageBonus}`);
  if (m.contributeSurcharge) out.push(`CONTRIBUTE +${m.contributeSurcharge} COST`);
  if (m.contributeRewardLP) out.push('CONTRIBUTE: +1 LP');
  if (m.abilitiesDisabledAll) out.push('ABILITIES OFF');
  if (m.randomActions) out.push('RANDOM DIALS');
  if (m.delayActions) out.push('ACTIONS DELAYED');
  if (m.revealSequential) out.push('ONE AT A TIME');
  if (m.announceActions) out.push('ANNOUNCE ACTIONS');
  if (m.cannibalSalvage) out.push('CANNIBAL SALVAGE');
  if (m.sabotageInfects) out.push('SABOTAGE INFECTS');
  if (m.skipWhisper) out.push('NO WHISPER');
  if (m.poolLeak) out.push(`POOL LEAKS ${m.poolLeak}`);
  return out;
}

export function CrisisZone({ g, view }: { g: GameState; view: View }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const reduced = useGameStore((s) => s.settings.reducedMotion);
  const fast = useGameStore((s) => s.settings.fast);
  const crisis = g.crisis;
  const threshold = crisis && !crisis.faceDown ? poolThreshold(g) : null;
  const hidden = crisis?.faceDown ?? false;
  const chips = hidden || view.crisisHidden ? [] : modifierChips(g);
  const mandate = g.mandate ? getCard(g.mandate.cardId) : null;
  return (
    <section className="crisis" aria-label="Current Crisis">
      <div className="crisis-card">
        {crisis && !view.crisisHidden ? (
          // Draw: the card back slides in from the deck and turns edge-on; then the face turns in.
          // (Two half-turns, so it does not depend on backface-visibility.)
          <div key={`${crisis.cardId}${hidden ? '-down' : ''}`} className="flipper">
            {(() => {
              const k = fast ? 0.5 : 1;
              const draw = (DURATION.crisisDraw / 1000) * k;
              const half = (DURATION.crisisFlip / 2000) * k;
              const face = hidden ? <CardBack label="???" /> : <CardView card={getCard(crisis.cardId)} onClick={() => setZoom(crisis.cardId)} />;
              if (reduced) return <motion.div className="flip-face" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>{face}</motion.div>;
              return (
                <>
                  <motion.div className="flip-back" initial={{ x: '55%', y: '-60%', scale: 0.35, rotateY: 0, opacity: 0 }}
                    animate={{ x: 0, y: 0, scale: 1, rotateY: 90, opacity: [0, 1, 1, 1] }}
                    transition={{ x: { duration: draw, ease: 'easeOut' }, y: { duration: draw, ease: 'easeOut' }, scale: { duration: draw }, opacity: { duration: draw },
                      rotateY: { delay: draw, duration: half, ease: 'easeIn' } }}>
                    <CardBack />
                  </motion.div>
                  <motion.div className="flip-face" initial={{ rotateY: -90 }} animate={{ rotateY: 0 }} transition={{ delay: draw + half, duration: half, ease: 'easeOut' }}>
                    {face}
                  </motion.div>
                </>
              );
            })()}
          </div>
        ) : crisis ? <div className="deck-stack"><CardBack /></div> : <div className="card-empty">The deck is silent.</div>}
      </div>
      <div className="crisis-side">
        {(threshold !== null || hidden) && crisis && !view.crisisHidden && (
          <div data-anchor="pool" className={`pool${view.mitigated ? ' ok' : view.mitigated === false ? ' fail' : ''}`} role="status" aria-label="Global Pool">
            <span className="pool-label">GLOBAL POOL</span>
            <span className="pool-num"><Cog size={14} />{hidden ? '?' : view.pool} / {hidden ? '?' : threshold}</span>
            {!hidden && threshold !== null && <span className="pool-bar"><i style={{ width: `${Math.min(100, (100 * view.pool) / threshold)}%` }} /></span>}
          </div>
        )}
        {mandate && (
          <button type="button" className="mandate-chip" onClick={() => setZoom(mandate.id)}>
            <Urn size={14} /><span><small>{mandate.deck === 'finale' ? 'FINALE THIS TURN' : 'MANDATE THIS TURN'}</small>{mandate.title}</span>
          </button>
        )}
        {chips.length > 0 && <ul className="chips" aria-label="Turn modifiers">{chips.map((c) => <li key={c}>{c}</li>)}</ul>}
      </div>
      {zoom && <CardZoom cardId={zoom} onClose={() => setZoom(null)} />}
    </section>
  );
}

export function CardZoom({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = getCard(cardId);
  return (
    <Sheet title={card.title} kind="full" onClose={onClose} className="zoom-panel">
      <div className="zoom-card"><CardView card={card} size="zoom" /></div>
      <dl className="ruling">
        <dt>Type</dt><dd>{card.type}</dd>
        <dt>Digital ruling</dt><dd>{card.digitalRuling}</dd>
      </dl>
    </Sheet>
  );
}

interface MatProps {
  g: GameState;
  me: Seat;
  phaseLabel: string;
  onPhase: () => void;
  phaseDisabled?: boolean;
  onLog: () => void;
  onMenu: () => void;
  view: View;
  playing: LogEntry[];
}

export function Mat({ g, me, phaseLabel, onPhase, phaseDisabled, onLog, onMenu, view, playing }: MatProps) {
  const p = g.players[me]!;
  const f = getFaction(p.factionId);
  const [info, setInfo] = useState(false);
  const active = abilitiesActive(g, me);
  const icons = statusIcons(g, p);
  const flags = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).filter((k) => {
    if (k === 'eliminated') return false;
    const v = p.status[k as keyof typeof p.status];
    return typeof v === 'boolean' ? v : isActive(g, v);
  });
  return (
    <section data-seat={me} className={`mat${p.status.exiled ? ' mat-exiled' : ''} ${seatFx(playing, me)}`} style={{ '--accent': f.palette.accent } as React.CSSProperties} aria-label="Your Faction Mat">
      <div className="mat-top">
        <button type="button" className="mat-id" onClick={() => setInfo(true)} aria-label={`${f.name}: abilities`}>
          <Sigil faction={p.factionId} size={30} />
          <span><b>{FACTION_SHORT[p.factionId]}</b><small>{active ? 'abilities ready' : 'abilities locked'}{g.firstSeat === me ? ' · first player' : ''}</small></span>
          {!active && <Lock size={14} />}
        </button>
        <div className="mat-res">
          <span className="res" aria-label={`${view.influence[me]} Influence`}><Cog size={18} /><b>{view.influence[me]}</b></span>
          <span className="res res-lp" aria-label={`${view.lp[me]} Legacy Points`}><Skull size={18} /><b>{view.lp[me]}</b></span>
          {icons.map((i) => <span key={i.key} aria-label={i.label}>{i.icon}</span>)}
        </div>
      </div>
      {flags.length > 0 && <div className="mat-flags">{flags.map((k) => <span key={k}>{STATUS_LABEL[k]}</span>)}</div>}
      <div className="mat-actions">
        <button type="button" className="btn btn-small" onClick={onLog}>Log</button>
        <button type="button" className="btn btn-primary btn-phase" onClick={onPhase} disabled={phaseDisabled}>{phaseLabel}</button>
        <button type="button" className="btn btn-small" onClick={onMenu}>Menu</button>
      </div>
      {info && (
        <Sheet title={f.name} onClose={() => setInfo(false)}>
          <p className="serif">{f.role}</p>
          <h3>Passive — {f.passive.name}</h3><p>{f.passive.text}</p>
          <h3>Active — {f.active.name}</h3><p>{f.active.text}</p>
          {!active && <p className="warn">Your abilities are locked ({p.status.exiled ? 'Exiled' : 'disabled this turn'}).</p>}
        </Sheet>
      )}
    </section>
  );
}

export function RivalSheet({ g, seat, me, onClose }: { g: GameState; seat: Seat; me: Seat | null; onClose: () => void }) {
  const p = g.players[seat]!;
  const f = getFaction(p.factionId);
  const lp = knownLP(g, seat, me);
  const deals = g.deals.filter((d) => me !== null && [d.proposer, d.partner].includes(me) && [d.proposer, d.partner].includes(seat) && d.status !== 'offered');
  return (
    <Sheet title={f.name} onClose={onClose}>
      <p className="serif">{f.role}</p>
      <ul className="facts">
        <li><Cog size={14} /> {p.influence} Influence</li>
        <li><Skull size={14} /> {lp ? `${lp.value} LP (as of turn ${lp.turn})` : 'LP unknown'}</li>
        {statusIcons(g, p).map((i) => <li key={i.key}>{i.icon} {i.label}</li>)}
        {p.eliminated && <li className="warn">DELETED on turn {p.eliminatedTurn}</li>}
      </ul>
      <h3>Passive — {f.passive.name}</h3><p>{f.passive.text}</p>
      <h3>Active — {f.active.name}</h3><p>{f.active.text}</p>
      <h3>Deals with you</h3>
      {deals.length === 0 ? <p className="dim">None yet.</p> : (
        <ul className="deal-history">
          {deals.slice(-6).reverse().map((d) => (
            <li key={d.id} className={`dh dh-${d.status}`}>
              <b>Turn {d.turn}: {d.status === 'broken' ? `BETRAYED by ${d.breakers.map((b) => (b === me ? 'you' : 'them')).join(' and ')}` : d.status}</b>
              {d.terms.map((t, i) => <span key={i}>{termText(g, t, me)}</span>)}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
