// Phase 2, the Whisper Campaign (SPEC §4). The engine never reads a clock: wall-clock time
// enters through the Advance intent.
import { expireOffers } from '../deals';
import { emit } from '../effects';
import { ask } from '../flow';
import { living } from '../selectors';
import type { Ctx } from '../types';
import { dialOptions } from './actions';

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
  expireOffers(ctx);
  s.step = 'dialsOpen';
  if (s.modifiers.announceActions) {
    // CR-19: everyone publicly announces an action before the dials are set. Lying is allowed.
    for (const p of living(s)) {
      const options = dialOptions(s, p.seat).filter((o) => o.available).map((o) => o.action);
      ask(ctx, { seat: p.seat, kind: 'announceAction', options, sourceCardId: s.crisis?.cardId });
    }
  }
  return true;
}
