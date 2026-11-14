import { useGameStore } from '../../store/gameStore';

export function TitleScreen() {
  const s = useGameStore();
  return (
    <main className="screen title-screen">
      <div className="noise" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="title-block">
        <p className="broadcast">“This is the last broadcast. The surface is gone. The Council convenes.”</p>
        <h1 className="wordmark">ZERO<br />COUNCIL</h1>
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
