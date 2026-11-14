// The Secret Action Dial overlay (SPEC §7.1 screen 5).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  abilitiesActive, actionCost, dialOptions, type ActionKind, type Dial, type DialOption, type GameState, type Seat,
} from '../../engine';
import { Sheet, Stepper } from '../common';
import { Cog, Lock } from '../icons';
import { FACTION_SHORT, useGameStore } from '../../store/gameStore';
import { ACTION_LABEL, dialText } from '../text';
import { play } from '../../audio/sfx';
import { DURATION } from '../../fx/animations';
import { haptic } from '../../fx/haptics';

const HOLD_MS = DURATION.holdToSeal;
const BLURB: Record<ActionKind, string> = {
  gather: 'Take Influence from the supply.',
  salvage: 'Forge 1 Legacy Point.',
  sabotage: 'Destroy a rival\'s Legacy.',
  contribute: 'Put Influence into the Global Pool.',
  quarantine: 'Remove 1 Blight Cube. Voids your promises this turn.',
  repair: 'Fix your Gather sector.',
  medicalTax: 'Pay to cure your Paralysis.',
  idle: 'Nothing is possible. You wait.',
};

function wedge(i: number, n: number, r0: number, r1: number): string {
  const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n;
  const a1 = a0 + (Math.PI * 2) / n;
  const p = (a: number, r: number) => `${150 + r * Math.cos(a)} ${150 + r * Math.sin(a)}`;
  return `M${p(a0, r0)} L${p(a0, r1)} A${r1} ${r1} 0 0 1 ${p(a1, r1)} L${p(a1, r0)} A${r0} ${r0} 0 0 0 ${p(a0, r0)}Z`;
}

interface Props {
  g: GameState;
  me: Seat;
  onClose: () => void;
}

export function DialOverlay({ g, me, onClose }: Props) {
  const dispatch = useGameStore((s) => s.dispatch);
  const deadline = useGameStore((s) => s.dialDeadline);
  const log = useGameStore((s) => s.log);
  const p = g.players[me]!;
  const options = useMemo(() => dialOptions(g, me).filter((o) => o.action !== 'idle' || o.available), [g, me]);
  const firstOpen = options.find((o) => o.available) ?? options[0]!;
  const [action, setAction] = useState<ActionKind>(p.dial?.action ?? firstOpen.action);
  const opt: DialOption = options.find((o) => o.action === action) ?? firstOpen;
  const [target, setTarget] = useState<Seat | undefined>(p.dial?.target);
  const [amount, setAmount] = useState<number>(p.dial?.amount ?? opt.minAmount ?? 1);
  const [transfer, setTransfer] = useState(false);
  const [hold, setHold] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(0);

  const canTransfer = action === 'sabotage' && p.factionId === 'wardens' && abilitiesActive(g, me) && p.blight.bio + p.blight.neuro > 0;
  const needsTarget = !!opt.targets;
  const safeTarget = needsTarget && target !== undefined && opt.targets!.includes(target) ? target : undefined;
  const safeAmount = action === 'contribute' ? Math.max(opt.minAmount ?? 1, Math.min(opt.maxAmount ?? 1, amount)) : undefined;
  const dial: Dial = {
    action,
    ...(safeTarget !== undefined ? { target: safeTarget } : {}),
    ...(safeAmount !== undefined ? { amount: safeAmount } : {}),
    ...(canTransfer && transfer ? { transferBlight: true } : {}),
  };
  const cost = actionCost(g, me, dial);
  const ready = opt.available && (!needsTarget || safeTarget !== undefined) && cost <= p.influence;
  const peek = [...log].reverse().find((l) => l.turn === g.turn && l.event.type === 'DialPeeked' && l.event.seat === me);

  const [slam, setSlam] = useState(false);
  function seal() {
    if (!ready || slam) return;
    // The dial slams face-down, then the choice is locked in.
    setSlam(true);
    play('dialSeal');
    haptic('seal');
    window.setTimeout(() => {
      if (dispatch({ type: 'SetDial', seat: me, dial }) && dispatch({ type: 'LockDial', seat: me })) onClose();
      else setSlam(false);
    }, DURATION.dialSlam);
  }
  function choose(a: ActionKind) {
    if (a === action) return;
    setAction(a);
    play('dialTick');
    haptic('dialSnap');
  }
  // Drag to rotate: the sector under the finger is selected, with a tick for each one passed.
  const dragging = useRef(false);
  function sectorAt(e: React.PointerEvent<SVGSVGElement>): ActionKind | null {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    const r = Math.hypot(x, y) / (box.width / 2);
    if (r < 0.4 || r > 1.05) return null;
    const turn = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return options[Math.round((turn / (Math.PI * 2)) * options.length) % options.length]!.action;
  }
  function stopHold() {
    if (timer.current !== null) cancelAnimationFrame(timer.current);
    timer.current = null;
    setHold(0);
  }
  function startHold() {
    if (!ready) return;
    started.current = performance.now();
    const tick = () => {
      const t = (performance.now() - started.current) / HOLD_MS;
      if (t >= 1) {
        stopHold();
        seal();
        return;
      }
      setHold(t);
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
  }
  useEffect(() => stopHold, []);

  // After the Whisper ran out while the app was away: 5 seconds, then a random legal action.
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms > 0) return;
      window.clearInterval(id);
      const open = options.filter((o) => o.available);
      const o = open[Math.floor(Math.random() * open.length)]!;
      const d: Dial = { action: o.action, ...(o.targets ? { target: o.targets[0] } : {}), ...(o.action === 'contribute' ? { amount: o.minAmount } : {}) };
      if (dispatch({ type: 'SetDial', seat: me, dial: d }) && dispatch({ type: 'LockDial', seat: me })) onClose();
    }, 200);
    return () => window.clearInterval(id);
  }, [deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = options.length;
  const index = options.findIndex((o) => o.action === action);
  return (
    <Sheet title="Secret Action Dial" kind="full" onClose={onClose} className="dial-panel">
      {left !== null && <p className="warn dial-deadline">The Whisper ended while you were away. {left}s to choose.</p>}
      {peek && peek.event.type === 'DialPeeked' && (
        <p className="peek">You peeked: the {FACTION_SHORT[g.players[peek.event.target]!.factionId]} chose <b>{dialText(g, peek.event.dial, me)}</b>. You may change your dial.</p>
      )}
      <div className="dial-wrap">
        <svg className={`dial${slam ? ' slam' : ''}`} viewBox="0 0 300 300" role="radiogroup" aria-label="Action sectors"
          onPointerDown={(e) => { dragging.current = true; const a = sectorAt(e); if (a) choose(a); }}
          onPointerMove={(e) => { if (!dragging.current) return; const a = sectorAt(e); if (a) choose(a); }}
          onPointerUp={() => { dragging.current = false; }} onPointerLeave={() => { dragging.current = false; }}>
          <circle cx="150" cy="150" r="148" className="dial-rim" />
          {options.map((o, i) => {
            const mid = (i / n) * Math.PI * 2 - Math.PI / 2;
            const tx = 150 + 104 * Math.cos(mid);
            const ty = 150 + 104 * Math.sin(mid);
            const on = o.action === action;
            return (
              <g key={o.action} role="radio" aria-checked={on} aria-disabled={!o.available} tabIndex={0}
                aria-label={`${ACTION_LABEL[o.action]}${o.available ? `, costs ${o.cost} Influence` : `, locked: ${o.reason}`}`}
                className={`sector${on ? ' on' : ''}${o.available ? '' : ' locked'}`}
                onClick={() => choose(o.action)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose(o.action)}>
                <path d={wedge(i, n, 62, 146)} />
                <text x={tx} y={ty - 4} textAnchor="middle">{ACTION_LABEL[o.action].replace('Self-', '')}</text>
                <text x={tx} y={ty + 13} textAnchor="middle" className="sector-cost">{o.available ? (o.action === 'contribute' ? 'X' : o.cost) : '🔒'}</text>
              </g>
            );
          })}
          <g className="pointer" style={{ transform: `rotate(${(index / n) * 360}deg)` }}>
            <path d="M150 17l-9-15h18z" />
          </g>
          <circle cx="150" cy="150" r="58" className="dial-hub" />
          <text x="150" y="142" textAnchor="middle" className="hub-action">{ACTION_LABEL[action].replace('Self-', '')}</text>
          <text x="150" y="168" textAnchor="middle" className="hub-cost">{opt.available ? `${cost} Influence` : 'LOCKED'}</text>
        </svg>
      </div>

      <div className="dial-detail">
        <p className="dial-blurb">
          {opt.available ? BLURB[action] : <><Lock size={14} /> {opt.reason}</>}
        </p>
        {opt.available && needsTarget && (
          <div className="targets" role="radiogroup" aria-label="Target">
            {opt.targets!.map((t) => {
              const c = actionCost(g, me, { action, target: t });
              return (
                <button key={t} type="button" role="radio" aria-checked={safeTarget === t} disabled={c > p.influence}
                  className={safeTarget === t ? 'target on' : 'target'} onClick={() => setTarget(t)}>
                  {FACTION_SHORT[g.players[t]!.factionId]}<small><Cog size={11} />{c}</small>
                </button>
              );
            })}
          </div>
        )}
        {opt.available && action === 'contribute' && (
          <Stepper label="Influence to contribute" value={safeAmount ?? 1} min={opt.minAmount ?? 1} max={opt.maxAmount ?? 1} onChange={setAmount} unit="into the pool" />
        )}
        {canTransfer && (
          <label className="check"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} /> Transfer 1 Blight Cube to the target</label>
        )}
      </div>

      <button type="button" className="btn btn-primary seal-btn" disabled={!ready}
        onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && seal()} onContextMenu={(e) => e.preventDefault()}>
        <span className="seal-fill" style={{ transform: `scaleX(${hold})` }} />
        <span className="seal-text">{ready ? 'Hold to Seal' : needsTarget && opt.available && safeTarget === undefined ? 'Pick a target' : 'Choose an open sector'}</span>
      </button>
      <p className="dim center">You have <Cog size={12} /> {p.influence} Influence.</p>
    </Sheet>
  );
}
