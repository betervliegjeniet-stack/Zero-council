// Synthesized sound effects (SPEC §11). No audio files: every effect is built from oscillators,
// noise buffers and envelopes. One shared AudioContext, unlocked on the first user tap.
export type SfxName =
  | 'cardDraw' | 'cardFlip' | 'catastrophe' | 'ehDrop' | 'ehHeal' | 'cogClink' | 'skullForge' | 'skullCrack'
  | 'dialTick' | 'dialSeal' | 'revealAll' | 'poolLocked' | 'poolFailed' | 'blight' | 'ballotDrop' | 'toll'
  | 'glitch' | 'timerTick' | 'heartbeat' | 'vaultDoor' | 'staticCrackle' | 'uiTap';

export const SFX_NAMES: SfxName[] = [
  'cardDraw', 'cardFlip', 'catastrophe', 'ehDrop', 'ehHeal', 'cogClink', 'skullForge', 'skullCrack', 'dialTick', 'dialSeal',
  'revealAll', 'poolLocked', 'poolFailed', 'blight', 'ballotDrop', 'toll', 'glitch', 'timerTick', 'heartbeat', 'vaultDoor',
  'staticCrackle', 'uiTap',
];

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  noise: AudioBuffer;
  reverb: ConvolverNode;
}

let engine: Engine | null = null;
let volumes = { sfx: 0.8, ambience: 0.5, muted: false };

function build(): Engine | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  const sfx = ctx.createGain();
  const ambience = ctx.createGain();
  sfx.connect(master);
  ambience.connect(master);
  master.connect(ctx.destination);
  // Two seconds of white noise, reused by every noisy effect.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // Reverb: an impulse of decaying noise (a concrete vault).
  const impulse = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.5;
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  reverb.connect(sfx);
  return { ctx, master, sfx, ambience, noise, reverb };
}

function applyVolumes(): void {
  if (!engine) return;
  const t = engine.ctx.currentTime;
  engine.master.gain.setTargetAtTime(volumes.muted ? 0 : 1, t, 0.02);
  engine.sfx.gain.setTargetAtTime(volumes.sfx, t, 0.02);
  engine.ambience.gain.setTargetAtTime(volumes.ambience, t, 0.05);
}

/** Creates (once) and resumes the AudioContext. Must be called from a user gesture on iOS. */
export function unlockAudio(): Engine | null {
  if (typeof window === 'undefined') return null;
  if (!engine) {
    engine = build();
    applyVolumes();
  }
  if (engine && engine.ctx.state === 'suspended') void engine.ctx.resume();
  return engine;
}

export function getAudio(): Engine | null {
  return engine;
}

export function setVolumes(v: { sfx: number; ambience: number; muted: boolean }): void {
  volumes = v;
  applyVolumes();
}

/** Pauses all sound while the app is in the background. */
export function setAudioPaused(paused: boolean): void {
  if (!engine) return;
  if (paused) void engine.ctx.suspend();
  else void engine.ctx.resume();
}

// ---- small building blocks ----
function tone(e: Engine, type: OscillatorType, from: number, to: number, t: number, dur: number, peak: number, dest: AudioNode = e.sfx, attack = 0.005): void {
  const o = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(e: Engine, t: number, dur: number, peak: number, filter: { type: BiquadFilterType; from: number; to?: number; q?: number }, dest: AudioNode = e.sfx, attack = 0.003): void {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const f = e.ctx.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 1;
  f.frequency.setValueAtTime(filter.from, t);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}

function distortion(e: Engine, amount: number): WaveShaperNode {
  const ws = e.ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = curve;
  ws.connect(e.sfx);
  return ws;
}

const RECIPES: Record<SfxName, (e: Engine, t: number) => void> = {
  // band-passed noise sweep 400 -> 2000 Hz, 180 ms
  cardDraw: (e, t) => noise(e, t, 0.18, 0.35, { type: 'bandpass', from: 400, to: 2000, q: 1.2 }),
  // two short high-passed clicks 60 ms apart
  cardFlip: (e, t) => {
    noise(e, t, 0.03, 0.4, { type: 'highpass', from: 1500 });
    noise(e, t + 0.06, 0.03, 0.3, { type: 'highpass', from: 1500 });
  },
  // sine 55 -> 35 Hz over 1.2 s plus a distorted noise rumble
  catastrophe: (e, t) => {
    tone(e, 'sine', 55, 35, t, 1.2, 0.9);
    noise(e, t, 1.1, 0.5, { type: 'lowpass', from: 220, to: 60 }, distortion(e, 8));
  },
  // triangle 220 -> 110 Hz glide with a short distortion
  ehDrop: (e, t) => tone(e, 'triangle', 220, 110, t, 0.3, 0.45, distortion(e, 4)),
  // two soft sine notes rising a fifth
  ehHeal: (e, t) => {
    tone(e, 'sine', 330, 330, t, 0.22, 0.25);
    tone(e, 'sine', 495, 495, t + 0.18, 0.3, 0.25);
  },
  // two detuned squares with a 70 ms decay and a random +-8% pitch
  cogClink: (e, t) => {
    const k = 1 + (Math.random() * 0.16 - 0.08);
    tone(e, 'square', 2100 * k, 2100 * k, t, 0.07, 0.07);
    tone(e, 'square', 2900 * k, 2900 * k, t, 0.07, 0.05);
  },
  // a low hollow knock plus a noise tick
  skullForge: (e, t) => {
    tone(e, 'sine', 180, 150, t, 0.12, 0.5);
    noise(e, t, 0.02, 0.2, { type: 'highpass', from: 2500 });
  },
  // a 40 ms high-passed burst and a 90 Hz thump
  skullCrack: (e, t) => {
    noise(e, t, 0.04, 0.5, { type: 'highpass', from: 3000 });
    tone(e, 'sine', 90, 60, t, 0.15, 0.6);
  },
  // a very short 3 kHz click
  dialTick: (e, t) => tone(e, 'square', 3000, 3000, t, 0.012, 0.08, e.sfx, 0.001),
  // a 70 Hz thump and a slowly decaying metallic ring
  dialSeal: (e, t) => {
    tone(e, 'sine', 70, 50, t, 0.2, 0.8);
    tone(e, 'sine', 900, 900, t, 0.9, 0.12);
    tone(e, 'sine', 1357, 1357, t, 0.6, 0.05);
  },
  // a reversed-cymbal swell, then a click
  revealAll: (e, t) => {
    const src = e.ctx.createBufferSource();
    src.buffer = e.noise;
    const f = e.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(6000, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.6);
    const g = e.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.58);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    src.connect(f).connect(g).connect(e.sfx);
    src.start(t);
    src.stop(t + 0.65);
    noise(e, t + 0.6, 0.03, 0.5, { type: 'highpass', from: 2000 });
  },
  // three rising square blips and a bolt thump
  poolLocked: (e, t) => {
    [440, 554, 659].forEach((f, i) => tone(e, 'square', f, f, t + i * 0.08, 0.07, 0.12));
    tone(e, 'sine', 80, 55, t + 0.26, 0.22, 0.8);
  },
  // a detuned minor-second sine pair, 800 ms
  poolFailed: (e, t) => {
    tone(e, 'sine', 196, 190, t, 0.8, 0.3);
    tone(e, 'sine', 207.6, 203, t, 0.8, 0.3);
  },
  // a wet low-passed "gloop" bending down
  blight: (e, t) => {
    noise(e, t, 0.28, 0.5, { type: 'lowpass', from: 900, to: 140, q: 6 });
    tone(e, 'sine', 260, 90, t, 0.25, 0.25);
  },
  // a paper flick and a muffled thud
  ballotDrop: (e, t) => {
    noise(e, t, 0.03, 0.3, { type: 'bandpass', from: 3500, q: 0.8 });
    tone(e, 'sine', 110, 70, t + 0.09, 0.12, 0.4);
  },
  // a bell: inharmonic sines with a 2.5 s decay
  toll: (e, t) => {
    [[1, 0.5], [2.76, 0.25], [5.4, 0.12]].forEach(([m, p]) => tone(e, 'sine', 220 * m!, 220 * m!, t, 2.5, p!, e.reverb));
    [[1, 0.35], [2.76, 0.15]].forEach(([m, p]) => tone(e, 'sine', 220 * m!, 220 * m!, t, 2.2, p!));
  },
  // sample-and-hold "bit-crushed" noise with random 20 ms gaps
  glitch: (e, t) => {
    const len = Math.floor(e.ctx.sampleRate * 0.6);
    const buf = e.ctx.createBuffer(1, len, e.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const gap = Math.floor(e.ctx.sampleRate * 0.02);
    let hold = 0;
    for (let i = 0; i < len; i++) {
      if (i % 24 === 0) hold = Math.round((Math.random() * 2 - 1) * 4) / 4;
      const silent = Math.floor(i / gap) % 5 === Math.floor(Math.random() * 40);
      d[i] = silent ? 0 : hold * (1 - i / len);
    }
    const src = e.ctx.createBufferSource();
    src.buffer = buf;
    const g = e.ctx.createGain();
    g.gain.value = 0.3;
    src.connect(g).connect(e.sfx);
    src.start(t);
  },
  // one low thump (the Whisper's last ten seconds)
  timerTick: (e, t) => tone(e, 'sine', 70, 50, t, 0.1, 0.5),
  // a low double thump
  heartbeat: (e, t) => {
    tone(e, 'sine', 62, 45, t, 0.14, 0.7);
    tone(e, 'sine', 56, 42, t + 0.22, 0.16, 0.5);
  },
  // a long metallic thud: noise, a 50 Hz sine and the vault reverb
  vaultDoor: (e, t) => {
    noise(e, t, 0.5, 0.7, { type: 'lowpass', from: 900, to: 90 }, e.reverb);
    noise(e, t, 0.25, 0.5, { type: 'lowpass', from: 600, to: 100 });
    tone(e, 'sine', 50, 38, t, 1.4, 0.9);
    tone(e, 'sine', 311, 300, t, 1.0, 0.06, e.reverb);
  },
  // sparse random noise bursts
  staticCrackle: (e, t) => {
    for (let i = 0; i < 9; i++) noise(e, t + Math.random() * 0.7, 0.01 + Math.random() * 0.03, 0.1 + Math.random() * 0.2, { type: 'highpass', from: 1800 + Math.random() * 3000 });
  },
  // a very soft click
  uiTap: (e, t) => tone(e, 'square', 1400, 1400, t, 0.01, 0.03, e.sfx, 0.001),
};

let clinks: number[] = [];

/** Plays a named effect. Safe to call before audio is unlocked (it is then silent). */
export function play(name: SfxName, delay = 0): void {
  const e = engine;
  if (!e || e.ctx.state !== 'running' || volumes.muted) return;
  if (name === 'cogClink') {
    // Throttle: at most 8 clinks per 100 ms.
    const now = performance.now();
    clinks = clinks.filter((x) => now - x < 100);
    if (clinks.length >= 8) return;
    clinks.push(now);
  }
  try {
    RECIPES[name](e, e.ctx.currentTime + delay);
  } catch {
    /* a failed effect must never break the game */
  }
}
