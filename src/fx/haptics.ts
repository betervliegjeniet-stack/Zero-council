// Haptics (SPEC §12): navigator.vibrate where supported (Android). On Capacitor (M8) this module
// switches to @capacitor/haptics.
export type HapticName = 'dialSnap' | 'seal' | 'ehLoss' | 'deletion' | 'tap';

const PATTERNS: Record<HapticName, number | number[]> = {
  dialSnap: 5,
  seal: 30,
  ehLoss: [20, 40, 20],
  deletion: [60, 40, 120],
  tap: 8,
};

let enabled = true;

export function setHaptics(on: boolean): void {
  enabled = on;
}

export function haptic(name: HapticName): void {
  if (!enabled || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[name]);
  } catch {
    /* not allowed without a user gesture: ignore */
  }
}
