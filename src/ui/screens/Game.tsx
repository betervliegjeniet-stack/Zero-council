// The main game screen: wires the Bunker board, the overlays and the phase button to the engine.
import { useEffect, useState } from 'react';
import { type GameState, type Seat } from '../../engine';
import { Sheet } from '../common';
import { CrisisZone, Mat, Rivals, RivalSheet, Tracker } from '../game/Board';
import { Crucible } from '../game/Crucible';
import { DialOverlay } from '../game/Dial';
import { ChoicePrompt, NumberPrompt, UrnPrompt } from '../game/Prompts';
import { LogSheet, TurnReport } from '../game/Report';
import { WhisperSheet } from '../game/Whisper';
import { humanSeat, useGameStore } from '../../store/gameStore';
import { describe } from '../text';

function phase(g: GameState, me: Seat | null, deleted: boolean): { label: string; kind: 'advance' | 'dial' | 'whisper' | 'watch' | 'wait' } {
  if (deleted) return { label: 'Watch the end', kind: 'watch' };
  const d = g.pending.find((x) => x.seat === me);
  if (d?.kind === 'dial') return { label: 'Set Your Dial', kind: 'dial' };
  if (d?.kind === 'crucibleBid') return { label: 'Close your fist above', kind: 'wait' };
  if (d) return { label: 'Decide', kind: 'wait' };
  switch (g.step) {
    case 'crisisGate': return { label: g.modifiers.skipWhisper ? 'Set Your Dial' : 'Begin Whisper', kind: 'advance' };
    case 'whisper': return { label: 'Back to the Whispers', kind: 'whisper' };
    case 'turnEndGate': return { label: g.mainOver ? 'Enter the Crucible' : g.turn >= g.config.totalTurns ? 'Enter the Crucible' : 'Continue', kind: 'advance' };
    default: return { label: 'The Council deliberates…', kind: 'wait' };
  }
}

export function GameScreen() {
  const s = useGameStore();
  const g = s.game!;
  const me = humanSeat(g);
  const my = me !== null ? g.players[me]! : null;
  const deleted = !!my?.eliminated;
  const decision = deleted ? undefined : g.pending.find((x) => x.seat === me);
  const [dialOpen, setDialOpen] = useState(false);
  const [whisperOpen, setWhisperOpen] = useState(g.step === 'whisper');
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rival, setRival] = useState<Seat | null>(null);

  useEffect(() => {
    if (decision?.kind === 'dial') setDialOpen(true);
  }, [decision?.id, decision?.kind]);
  useEffect(() => {
    setWhisperOpen(g.step === 'whisper');
  }, [g.step, g.turn]);

  const inCrucible = g.step.startsWith('crucible');
  const ph = phase(g, me, deleted);
  const onPhase = () => {
    if (ph.kind === 'advance') s.advance();
    else if (ph.kind === 'dial') setDialOpen(true);
    else if (ph.kind === 'whisper') setWhisperOpen(true);
    else if (ph.kind === 'watch') s.watchTheEnd();
  };
  const crucibleDecision = decision?.kind === 'crucibleBid' ? decision : null;

  return (
    <main className={`screen game${g.eh <= 5 ? ' critical' : ''}${inCrucible ? ' in-crucible' : ''}`}>
      <div className="noise" aria-hidden="true" />
      <h1 className="sr-only">Zero Council — turn {g.turn}</h1>
      <Tracker g={g} />
      {!inCrucible && <Rivals g={g} me={me} onPick={setRival} />}
      <div className="centre">
        {deleted && (
          <div className="deleted-banner" role="alert">
            <b>DELETED.</b> The Council does not remember your name.
            <div className="choices">
              <button type="button" className="btn btn-primary" onClick={() => s.watchTheEnd()}>Watch the end</button>
              <button type="button" className="btn" onClick={() => s.abandon()}>Return to the Bunker</button>
            </div>
          </div>
        )}
        {inCrucible
          ? <Crucible g={g} me={me} d={crucibleDecision} />
          : g.step === 'turnEndGate'
            ? <TurnReport g={g} me={me} />
            : <CrisisZone g={g} />}
      </div>
      {me !== null && (
        <Mat g={g} me={me} phaseLabel={ph.label} onPhase={onPhase} phaseDisabled={ph.kind === 'wait'} onLog={() => setLogOpen(true)} onMenu={() => setMenuOpen(true)} />
      )}

      {whisperOpen && g.step === 'whisper' && me !== null && !deleted && <WhisperSheet g={g} me={me} onHide={() => setWhisperOpen(false)} />}
      {dialOpen && decision?.kind === 'dial' && me !== null && <DialOverlay g={g} me={me} onClose={() => setDialOpen(false)} />}
      {decision && me !== null && decision.kind === 'ballot' && <UrnPrompt g={g} d={decision} me={me} />}
      {decision && me !== null && ['lpPledge', 'finaleBid', 'finalePool'].includes(decision.kind) && <NumberPrompt key={decision.id} g={g} d={decision} me={me} />}
      {decision && me !== null && !['dial', 'ballot', 'lpPledge', 'finaleBid', 'finalePool', 'crucibleBid'].includes(decision.kind) && (
        <ChoicePrompt key={decision.id} g={g} d={decision} me={me} />
      )}
      {rival !== null && <RivalSheet g={g} seat={rival} me={me} onClose={() => setRival(null)} />}
      {logOpen && <LogSheet g={g} me={me} onClose={() => setLogOpen(false)} />}
      {menuOpen && (
        <Sheet title="Menu" onClose={() => setMenuOpen(false)}>
          <div className="choices">
            <button type="button" className="btn" onClick={() => s.go('codex')}>Codex</button>
            <button type="button" className="btn" onClick={() => s.go('settings')}>Settings</button>
            <button type="button" className="btn" onClick={() => s.abandon()}>Save and return to the Bunker</button>
          </div>
          <p className="dim center">Seed {g.seed} · {g.difficulty}</p>
        </Sheet>
      )}
      {s.awayReport && (
        <Sheet title="While you were gone…" kind="modal" onClose={s.dismissAway}>
          <p>You left the table for {Math.round(s.awayReport.seconds)} seconds. The timer kept running, and the Council used the time.</p>
          <ol className="log">
            {s.log.filter((l) => l.n > s.awayReport!.fromLog).map((l) => ({ n: l.n, line: describe(l.event, g, me) })).filter((x) => x.line).slice(0, 12)
              .map((x) => <li key={x.n} className={`tone-${x.line!.tone}`}>{x.line!.text}</li>)}
          </ol>
          <button type="button" className="btn btn-primary wide" onClick={s.dismissAway}>Face them</button>
        </Sheet>
      )}
      {s.error && (
        <div className="toast" role="alert" onClick={s.clearError}>{s.error}</div>
      )}
    </main>
  );
}
