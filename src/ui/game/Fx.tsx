// Event playback: plays the store's queue one group at a time with its animation, sound and
// haptic (SPEC §6, §10). The board reads `useView()` so its numbers change as events play.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameEvent, GameState, Seat } from '../../engine';
import { play } from '../../audio/sfx';
import { DURATION, fxFor, type FxSpec } from '../../fx/animations';
import { haptic } from '../../fx/haptics';
import { computeView, type View } from '../../fx/view';
import { Cog, Cube, Skull } from '../icons';
import { humanSeat, useGameStore, type LogEntry } from '../../store/gameStore';
import { ACTION_LABEL, optionLabel, seatName } from '../text';

/** The board as it should look right now, with queued events not yet applied. */
export function useView(g: GameState): View {
  const queue = useGameStore((s) => s.fxQueue);
  const log = useGameStore((s) => s.log);
  return useMemo(() => {
    let revealed = null;
    for (let i = log.length - 1; i >= 0 && log[i]!.turn === g.turn; i--) {
      const e = log[i]!.event;
      if (e.type === 'DialsRevealed') { revealed = e.dials; break; }
    }
    return computeView(g, queue.map((x) => x.event), g.step === 'crisisGate' || g.step === 'whisper' || g.step === 'dials' ? null : revealed);
  }, [g, queue, log]);
}

function speed(): number {
  const { fast, reducedMotion } = useGameStore.getState().settings;
  return (fast ? 0.5 : 1) * (reducedMotion ? 0.7 : 1);
}

/** Drives the queue. Returns whether anything is playing or waiting. */
export function usePlayback(g: GameState): { busy: boolean; playing: LogEntry[]; spec: FxSpec | null } {
  const playing = useGameStore((s) => s.playing);
  const waiting = useGameStore((s) => s.fxQueue.length);
  const fxNext = useGameStore((s) => s.fxNext);
  const me = humanSeat(g);
  const first = playing[0];
  const spec = useMemo(() => (first ? fxFor(first.event, g, me) : null), [first?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!first && waiting > 0) fxNext();
  }, [first, waiting, fxNext]);
  useEffect(() => {
    if (!first || !spec) return;
    if (spec.sfx) {
      play(spec.sfx);
      spec.sfxRepeat?.forEach((d) => play(spec.sfx!, d * speed()));
    }
    if (first.event.type === 'CardRevealed' && first.event.deck === 'crisis') {
      play('cardFlip', (DURATION.crisisDraw / 1000) * speed());
      if (spec.shake) play('catastrophe', ((DURATION.crisisDraw + DURATION.crisisFlip) / 1000) * speed());
    }
    if (first.event.type === 'PlayerDeleted') play('toll', 0.3 * speed());
    if (spec.haptic) haptic(spec.haptic);
    const id = window.setTimeout(fxNext, Math.max(60, spec.ms * speed()));
    return () => window.clearTimeout(id);
  }, [first?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { busy: playing.length > 0 || waiting > 0, playing, spec };
}

/** CSS classes for a seat's chip or mat while an event that concerns it is playing. */
export function seatFx(playing: LogEntry[], seat: Seat): string {
  const cls = new Set<string>();
  for (const { event: e } of playing) {
    switch (e.type) {
      case 'ActionResolved':
        if (e.seat === seat) cls.add('fx-act');
        if (e.dial.target === seat) cls.add('fx-hit');
        break;
      case 'ActionFizzled': if (e.seat === seat) cls.add('fx-act'); break;
      case 'LPChanged': if (e.seat === seat) cls.add(e.delta < 0 ? 'fx-hit' : 'fx-gain'); break;
      case 'InfluenceChanged': if (e.seat === seat) cls.add(e.delta < 0 ? 'fx-hit' : 'fx-gain'); break;
      case 'PlayerDeleted': if (e.seat === seat) cls.add('fx-delete'); break;
      case 'BlightChanged': if (e.seat === seat) cls.add('fx-blight'); break;
      case 'StatusApplied':
        if (e.seat === seat) cls.add(e.status === 'exiled' ? 'fx-exile' : e.status === 'embargoedUntil' ? 'fx-embargo' : 'fx-hit');
        break;
      case 'DialsRevealed': cls.add('fx-flip'); break;
      case 'AbilityUsed': if (e.seat === seat) cls.add('fx-act'); if (e.target === seat) cls.add('fx-hit'); break;
      case 'LPRevealed': if (e.seat === seat) cls.add('fx-hit'); break;
      default: break;
    }
  }
  return [...cls].join(' ');
}

interface Token {
  key: string;
  kind: 'cog' | 'skull' | 'crack' | 'cube' | 'ballot';
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

function subject(e: GameEvent): Seat | null {
  return 'seat' in e && typeof e.seat === 'number' ? e.seat : e.type === 'BallotsCancelled' ? e.by : null;
}

export function FxLayer({ g, playing, spec, busy }: { g: GameState; playing: LogEntry[]; spec: FxSpec | null; busy: boolean }) {
  const me = humanSeat(g);
  const reduced = useGameStore((s) => s.settings.reducedMotion);
  const fxSkip = useGameStore((s) => s.fxSkip);
  const root = useRef<HTMLDivElement>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const lastActor = useRef<Seat | null>(null);
  const first = playing[0];
  const k = speed();

  // Where things are on screen, relative to this layer.
  const at = (selector: string): { x: number; y: number } | null => {
    const box = root.current?.getBoundingClientRect();
    const el = root.current?.parentElement?.querySelector(selector)?.getBoundingClientRect();
    return box && el ? { x: el.left - box.left + el.width / 2, y: el.top - box.top + el.height / 2 } : null;
  };

  useLayoutEffect(() => {
    if (!first) return setTokens([]);
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const supply = { x: box.width / 2, y: -30 };
    const pit = { x: box.width / 2, y: box.height + 30 };
    const centre = { x: box.width / 2, y: box.height * 0.42 };
    const seatAt = (seat: Seat) => at(`[data-seat="${seat}"]`) ?? centre;
    const out: Token[] = [];
    const add = (kind: Token['kind'], from: Token['from'], to: Token['to'], count: number, key: string) => {
      for (let i = 0; i < Math.min(count, 6); i++) out.push({ key: `${key}-${i}`, kind, from, to, delay: i * 0.055 });
    };
    for (const { n, event: e } of playing) {
      switch (e.type) {
        case 'ActionResolved': lastActor.current = e.seat; break;
        case 'InfluenceChanged':
          if (e.delta > 0) add('cog', supply, seatAt(e.seat), e.delta, `i${n}`);
          else add('cog', seatAt(e.seat), supply, -e.delta, `i${n}`);
          break;
        case 'PoolChanged':
          add('cog', lastActor.current !== null ? seatAt(lastActor.current) : supply, at('[data-anchor="pool"]') ?? centre, e.to - e.from, `p${n}`);
          break;
        case 'LPChanged': {
          const p = seatAt(e.seat);
          add(e.delta > 0 ? 'skull' : 'crack', p, p, 1, `l${n}`);
          break;
        }
        case 'BlightChanged': add('cube', { x: seatAt(e.seat).x, y: seatAt(e.seat).y - 70 }, seatAt(e.seat), 1, `b${n}`); break;
        case 'BallotCast': add('ballot', seatAt(e.seat), centre, 1, `v${n}`); break;
        case 'BallotCounted': add('ballot', centre, { x: centre.x, y: centre.y - 90 }, 1, `c${n}`); break;
        case 'BidsRevealed':
        case 'InfluenceBidsRevealed':
          for (const b of e.bids) add(e.type === 'BidsRevealed' ? 'skull' : 'cog', seatAt(b.seat), pit, b.amount, `f${n}-${b.seat}`);
          break;
        default: break;
      }
    }
    setTokens(out);
    // The running tally of an Urn count.
    const e = first.event;
    if (e.type === 'VoteStarted') setTally(null);
    if (e.type === 'BallotCounted') setTally((t) => ({ ...(t ?? {}), [e.choice]: (t?.[e.choice] ?? 0) + e.weight }));
    if (e.type === 'TurnStarted' || e.type === 'CrucibleStarted') setTally(null);
  }, [first?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const seat = first ? subject(first.event) : null;
  const who = first && seat !== null && playing.length === 1 ? seatName(g, seat, me) : null;
  const action = first?.event.type === 'ActionResolved' || first?.event.type === 'ActionFizzled' ? first.event : null;

  return (
    <div className={`fx-layer${spec?.shake ? ' fx-shake' : ''}`} ref={root} aria-hidden="true">
      <AnimatePresence>
        {spec?.title && first && (
          <motion.div key={`t${first.n}`} className="fx-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 * k }}>
            <div className="fx-title-head">
              {reduced ? spec.title.head : spec.title.head.split('').map((ch, i) => (
                <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (i / spec.title!.head.length) * 1.2 * k, duration: 0.05 }}>{ch}</motion.span>
              ))}
            </div>
            {spec.title.sub && <div className="fx-title-sub">{spec.title.sub}</div>}
          </motion.div>
        )}
        {spec?.stamp && first && (
          <motion.div key={`s${first.n}`} className={`fx-stamp tone-${spec.stamp.tone}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.7, rotate: -22 }} animate={{ opacity: 1, scale: 1, rotate: -8 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 * k, ease: 'easeOut' }}>
            {who && <small>{who}</small>}
            {spec.stamp.text}
          </motion.div>
        )}
        {action && (
          <motion.div key={`a${first!.n}`} className="fx-action" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 * k }}>
            <small>{seatName(g, action.seat, me)}</small>
            {ACTION_LABEL[action.dial.action]}{action.dial.action === 'contribute' ? ` ${action.dial.amount}` : ''}
            {action.dial.target !== undefined && <span> → {seatName(g, action.dial.target, me).replace(/^The /, '')}</span>}
          </motion.div>
        )}
      </AnimatePresence>
      {tally && first && ['BallotCounted', 'VoteResult'].includes(first.event.type) && (
        <div className="fx-tally">
          {Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([o, n]) => <span key={o}><b>{n}</b> {optionLabel(g, o, me)}</span>)}
        </div>
      )}
      {tokens.map((t) => {
        const mid = { x: (t.from.x + t.to.x) / 2 + (t.to.y - t.from.y) * 0.18, y: (t.from.y + t.to.y) / 2 - 40 };
        const d = (DURATION.tokenFlight / 1000) * k;
        const icon = t.kind === 'cog' ? <Cog size={18} /> : t.kind === 'cube' ? <Cube size={20} /> : t.kind === 'ballot' ? <span className="slip" /> : <Skull size={22} />;
        if (t.kind === 'skull' || t.kind === 'crack') {
          const still = t.from.x === t.to.x && t.from.y === t.to.y;
          if (still) {
            return t.kind === 'skull' ? (
              <motion.div key={t.key} className="fx-token tok-skull" style={{ left: t.to.x, top: t.to.y }}
                initial={{ scale: reduced ? 1 : 0, opacity: 0 }} animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 1, 0] }} transition={{ duration: (DURATION.lpForged / 1000) * k }}>{icon}</motion.div>
            ) : (
              <div key={t.key} className="fx-token tok-crack" style={{ left: t.to.x, top: t.to.y }}>
                <motion.span className="half" initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={reduced ? { opacity: 0 } : { x: -12, y: 34, opacity: 0, rotate: -35 }} transition={{ duration: (DURATION.lpDestroyed / 1000) * k, ease: 'easeIn' }}><Skull size={22} /></motion.span>
                <motion.span className="half right" initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={reduced ? { opacity: 0 } : { x: 12, y: 38, opacity: 0, rotate: 35 }} transition={{ duration: (DURATION.lpDestroyed / 1000) * k, ease: 'easeIn' }}><Skull size={22} /></motion.span>
              </div>
            );
          }
        }
        return (
          <motion.div key={t.key} className={`fx-token tok-${t.kind}`} style={{ left: 0, top: 0 }}
            initial={reduced ? { x: t.to.x, y: t.to.y, opacity: 0 } : { x: t.from.x, y: t.from.y, opacity: 0, rotate: 0 }}
            animate={reduced ? { opacity: [0, 1, 0] } : { x: [t.from.x, mid.x, t.to.x], y: [t.from.y, mid.y, t.to.y], opacity: [0, 1, 1, 0], rotate: t.kind === 'cog' ? 360 : 0 }}
            transition={{ duration: d, delay: t.delay * k, ease: 'easeInOut' }}>{icon}</motion.div>
        );
      })}
      {busy && <button type="button" className="fx-skip" aria-hidden="false" onClick={fxSkip}>Skip ▸▸</button>}
    </div>
  );
}
