// Title (SPEC §7.1 screen 1): the last radio broadcast, typed out line by line with static,
// ending on a vault-door thud and the title in crimson. A tap skips it.
import { useEffect, useState } from 'react';
import { play } from '../../audio/sfx';
import { useGameStore } from '../../store/gameStore';

const BROADCAST = [
  '…this is Surface Relay Nine, to anyone still under the ash.',
  'The sky is gone. The harvest is gone. Do not come up.',
  'Bunker Zero holds. Barely. The scrubbers cough. The lights lie.',
  'Six factions share what air is left. They call themselves a Council.',
  'They will vote. They will bargain. They will remember every slight.',
  'There is no rescue. There is only who is left to be remembered.',
  'Seal the door.',
];
const CHAR_MS = 28;
const LINE_PAUSE_MS = 520;
let introPlayed = false;

export function TitleScreen() {
  const s = useGameStore();
  const reduced = s.settings.reducedMotion;
  const [done, setDone] = useState(introPlayed || reduced);
  const [lineAt, setLineAt] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (done) return;
    const line = BROADCAST[lineAt];
    if (line === undefined) {
      introPlayed = true;
      play('vaultDoor');
      setDone(true);
      return;
    }
    if (chars === 0) play('staticCrackle');
    const id = window.setTimeout(() => {
      if (chars < line.length) setChars(chars + 1);
      else {
        setLineAt(lineAt + 1);
        setChars(0);
      }
    }, chars < line.length ? CHAR_MS : LINE_PAUSE_MS);
    return () => window.clearTimeout(id);
  }, [done, lineAt, chars]);

  if (!done) {
    return (
      <main className="screen title-screen intro" onClick={() => { introPlayed = true; play('vaultDoor'); setDone(true); }}>
        <div className="noise" aria-hidden="true" />
        <h1 className="sr-only">Zero Council</h1>
        <div className="radio" aria-live="polite">
          {BROADCAST.slice(0, lineAt).map((l) => <p key={l}>{l}</p>)}
          {BROADCAST[lineAt] && <p className="typing">{BROADCAST[lineAt]!.slice(0, chars)}<i /></p>}
        </div>
        <button type="button" className="btn btn-small skip-intro">Tap to skip</button>
      </main>
    );
  }
  return (
    <main className="screen title-screen">
      <div className="noise" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="title-block">
        <p className="broadcast">“There is only who is left to be remembered. Seal the door.”</p>
        <h1 className="wordmark thud">ZERO<br />COUNCIL</h1>
        <p className="tagline">There are no winners.</p>
      </div>
      <nav className="menu" aria-label="Main menu">
        <button type="button" className="btn btn-primary" onClick={() => s.go('setup')}>Enter the Bunker</button>
        <button type="button" className="btn" onClick={s.continueGame} disabled={!s.hasSave}>Continue</button>
        <button type="button" className="btn" onClick={() => s.go('codex')}>Codex</button>
        <button type="button" className="btn" onClick={() => s.go('settings')}>Settings</button>
      </nav>
    </main>
  );
}
