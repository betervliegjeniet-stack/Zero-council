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

/** On Capacitor (iOS / Android apps) use the native haptics engine; elsewhere navigator.vibrate. */
async function native(name: HapticName): Promise<boolean> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return false;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (name === 'ehLoss') await Haptics.notification({ type: NotificationType.Warning });
    else if (name === 'deletion') await Haptics.notification({ type: NotificationType.Error });
    else await Haptics.impact({ style: name === 'seal' ? ImpactStyle.Heavy : ImpactStyle.Light });
    return true;
  } catch {
    return false;
  }
}

export function setHaptics(on: boolean): void {
  enabled = on;
}

export function haptic(name: HapticName): void {
  if (!enabled || typeof navigator === 'undefined') return;
  void native(name).then((used) => {
    if (used || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(PATTERNS[name]);
    } catch {
      /* not allowed without a user gesture: ignore */
    }
  });
}
