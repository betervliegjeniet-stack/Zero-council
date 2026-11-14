// Player settings, kept in localStorage (SPEC §7.1 screen 11).
export interface Settings {
  sfxVolume: number;
  ambienceVolume: number;
  muted: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  fast: boolean;
  whisperSeconds: 30 | 45 | 90 | 180;
  tutorial: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sfxVolume: 0.8,
  ambienceVolume: 0.5,
  muted: false,
  haptics: true,
  reducedMotion: false,
  fast: false,
  whisperSeconds: 45,
  tutorial: true,
};

const KEY = 'zc.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const base = { ...DEFAULT_SETTINGS };
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) base.reducedMotion = true;
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Settings>) } : base;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}
