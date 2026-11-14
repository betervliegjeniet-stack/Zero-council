// Settings (SPEC §7.1 screen 11).
import { Segmented, Toggle } from '../common';
import { useGameStore } from '../../store/gameStore';

export function SettingsScreen() {
  const s = useGameStore();
  const set = s.setSettings;
  return (
    <main className="screen settings">
      <div className="noise" aria-hidden="true" />
      <header className="top-bar">
        <button type="button" className="btn btn-small" onClick={() => s.go(s.backTo)}>Back</button>
        <h1>Settings</h1>
      </header>
      <div className="scroll">
        <label className="slider"><span>Sound effects</span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.sfxVolume} onChange={(e) => set({ sfxVolume: Number(e.target.value) })} />
        </label>
        <label className="slider"><span>Ambience</span>
          <input type="range" min={0} max={1} step={0.05} value={s.settings.ambienceVolume} onChange={(e) => set({ ambienceVolume: Number(e.target.value) })} />
        </label>
        <Toggle label="Mute all sound" value={s.settings.muted} onChange={(v) => set({ muted: v })} />
        <Toggle label="Haptics" hint="Vibration on supported phones" value={s.settings.haptics} onChange={(v) => set({ haptics: v })} />
        <Toggle label="Reduced motion" hint="Fades instead of movement" value={s.settings.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        <Toggle label="Fast animations" value={s.settings.fast} onChange={(v) => set({ fast: v })} />
        <Segmented label="Whisper timer (next game)" value={s.settings.whisperSeconds} onChange={(v) => set({ whisperSeconds: v })}
          options={[{ value: 30, label: '30s' }, { value: 45, label: '45s' }, { value: 90, label: '90s' }, { value: 180, label: 'Tabletop' }]} />
        <section className="about">
          <h2>Current game</h2>
          {s.game ? <p>Seed <code>{s.game.seed}</code> · {s.game.players.length} Councilors · {s.game.difficulty}<br /><small>Quote the seed in a bug report so the game can be replayed.</small></p> : <p className="dim">No game in progress.</p>}
          <button type="button" className="btn btn-danger" onClick={() => { if (window.confirm('Delete the saved game?')) s.resetSave(); }} disabled={!s.hasSave}>Reset save</button>
        </section>
      </div>
    </main>
  );
}
