// Phase 2, the Whisper Campaign (SPEC §4). M1 only runs the timer; deals arrive in M2.
// The engine never reads a clock: wall-clock time enters through the Advance intent.
import { emit } from '../effects';
import type { Ctx } from '../types';

export function openWhisper(ctx: Ctx, now: number): void {
  const s = ctx.s;
  if (s.modifiers.skipWhisper) {
    emit(ctx, { type: 'WhisperSkipped' });
    s.step = 'dialsOpen';
    return;
  }
  s.whisper = { startedAt: now, endsAt: now + s.config.whisperSeconds * 1000 };
  s.step = 'whisper';
  emit(ctx, { type: 'WhisperStarted', endsAt: s.whisper.endsAt });
}

/** Ends the Whisper if the timer ran out or the Council was sealed. Returns true if it ended. */
export function tryCloseWhisper(ctx: Ctx, now: number, seal: boolean): boolean {
  const s = ctx.s;
  if (!s.whisper) return false;
  if (!seal && now < s.whisper.endsAt) return false;
  s.step = 'dialsOpen';
  return true;
}
