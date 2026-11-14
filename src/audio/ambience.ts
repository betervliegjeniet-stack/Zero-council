// The ambience loop (SPEC §11): a low drone, an air-recycler hum, far-off metallic clanks.
// It gets darker with each stage; in the Crucible there is only a heartbeat.
import { getAudio, play } from './sfx';

interface Loop {
  stop: () => void;
  filter: BiquadFilterNode;
  hum: BiquadFilterNode;
  out: GainNode;
}

let loop: Loop | null = null;
let clankTimer: number | null = null;
let beatTimer: number | null = null;
let mode: { stage: number; crucible: boolean } = { stage: 1, crucible: false };

function brownNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function clank(): void {
  const e = getAudio();
  if (!e || e.ctx.state !== 'running' || mode.crucible) return;
  const t = e.ctx.currentTime;
  const f = 500 + Math.random() * 900;
  for (const m of [1, 2.3, 3.9]) {
    const o = e.ctx.createOscillator();
    const g = e.ctx.createGain();
    o.frequency.value = f * m;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 / m, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(e.reverb);
    o.start(t);
    o.stop(t + 1.5);
  }
}

function schedule(): void {
  if (clankTimer !== null) window.clearTimeout(clankTimer);
  clankTimer = window.setTimeout(() => {
    clank();
    schedule();
  }, 8000 + Math.random() * 12000);
}

function applyMode(): void {
  const e = getAudio();
  if (!e || !loop) return;
  const t = e.ctx.currentTime;
  // Darker each stage: lower cutoffs. The Crucible: total silence except heartbeats.
  loop.filter.frequency.setTargetAtTime([0, 160, 130, 100, 75][mode.stage] ?? 120, t, 1.5);
  loop.hum.frequency.setTargetAtTime([0, 420, 340, 260, 190][mode.stage] ?? 300, t, 1.5);
  loop.out.gain.setTargetAtTime(mode.crucible ? 0 : 1, t, 0.8);
  if (beatTimer !== null) window.clearInterval(beatTimer);
  beatTimer = null;
  if (mode.crucible || mode.stage >= 4) {
    beatTimer = window.setInterval(() => play('heartbeat'), mode.crucible ? 1100 : 1700);
  }
}

/** Starts the loop (idempotent). Call after the audio is unlocked. */
export function startAmbience(): void {
  const e = getAudio();
  if (!e || loop) return;
  const { ctx } = e;
  const out = ctx.createGain();
  out.connect(e.ambience);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 160;
  const drone = ctx.createGain();
  drone.gain.value = 0.5;
  const oscs = [41, 41.7].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(drone);
    o.start();
    return o;
  });
  // A quiet octave so the drone is audible on phone speakers, which cannot reproduce 41 Hz.
  const upper = ctx.createOscillator();
  upper.type = 'triangle';
  upper.frequency.value = 82.6;
  const upperGain = ctx.createGain();
  upperGain.gain.value = 0.12;
  upper.connect(upperGain).connect(filter);
  upper.start();
  drone.connect(filter).connect(out);
  const src = ctx.createBufferSource();
  src.buffer = brownNoise(ctx);
  src.loop = true;
  const hum = ctx.createBiquadFilter();
  hum.type = 'lowpass';
  hum.frequency.value = 420;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.35;
  src.connect(hum).connect(humGain).connect(out);
  src.start();
  loop = {
    filter, hum, out,
    stop: () => {
      [...oscs, upper].forEach((o) => o.stop());
      src.stop();
      out.disconnect();
    },
  };
  schedule();
  applyMode();
}

export function setAmbienceMode(stage: number, crucible: boolean): void {
  mode = { stage, crucible };
  applyMode();
}

export function stopAmbience(): void {
  loop?.stop();
  loop = null;
  if (clankTimer !== null) window.clearTimeout(clankTimer);
  if (beatTimer !== null) window.clearInterval(beatTimer);
  clankTimer = beatTimer = null;
}
