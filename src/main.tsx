import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getAudio, play, setAudioPaused, setVolumes, unlockAudio } from './audio/sfx';
import { setHaptics } from './fx/haptics';
import { useGameStore } from './store/gameStore';
import { App } from './ui/App';
import './ui/styles.css';

// Sound, haptics and motion follow the Settings.
function syncSettings(): void {
  const s = useGameStore.getState().settings;
  setVolumes({ sfx: s.sfxVolume, ambience: s.ambienceVolume, muted: s.muted });
  setHaptics(s.haptics);
  document.documentElement.classList.toggle('rm', s.reducedMotion);
  document.documentElement.classList.toggle('fast', s.fast);
}
syncSettings();
useGameStore.subscribe((state, prev) => {
  if (state.settings !== prev.settings) syncSettings();
});

// The AudioContext must be created and resumed inside a user gesture (iOS Safari).
const unlock = () => unlockAudio();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('touchend', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });
// A soft click on every button.
window.addEventListener('pointerdown', (e) => {
  if ((e.target as Element | null)?.closest?.('button, [role="radio"], [role="tab"], select')) play('uiTap');
});
// No sound while the app is in the background.
document.addEventListener('visibilitychange', () => setAudioPaused(document.hidden));

// For bug reports and automated checks: the state of the audio engine.
(window as unknown as { zcAudioState: () => string }).zcAudioState = () => getAudio()?.ctx.state ?? 'locked';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
