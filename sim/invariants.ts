// State invariants checked after every intent in simulations and tests (SPEC §5.7).
import { totalBlightInPlay, type GameState } from '../src/engine';

export function checkInvariants(s: GameState): string[] {
  const bad: string[] = [];
  if (!Number.isInteger(s.eh) || s.eh < 0 || s.eh > s.maxEH) bad.push(`EH out of range: ${s.eh}`);
  if (s.turn < 0 || s.turn > s.config.totalTurns) bad.push(`turn out of range: ${s.turn}`);
  if (totalBlightInPlay(s) > s.config.blightCap) bad.push('Blight above the cap');
  for (const p of s.players) {
    const who = `seat ${p.seat}`;
    if (!Number.isInteger(p.influence) || p.influence < 0) bad.push(`${who}: negative Influence ${p.influence}`);
    if (!Number.isInteger(p.lp) || p.lp < 0) bad.push(`${who}: negative LP ${p.lp}`);
    if (p.blight.bio < 0 || p.blight.neuro < 0) bad.push(`${who}: negative Blight`);
    if (p.eliminated && (p.dial || p.dialLocked)) bad.push(`${who}: a dead player holds a dial`);
  }
  for (const d of s.pending) {
    if (s.players[d.seat]?.eliminated) bad.push(`seat ${d.seat}: a dead player is asked to decide (${d.kind})`);
  }
  for (const d of s.deals) {
    for (const seat of [d.proposer, d.partner]) if (!s.players[seat]) bad.push(`deal ${d.id}: unknown seat ${seat}`);
  }
  if (s.step === 'ended' && !s.outcome) bad.push('ended without an outcome');
  // Every Crisis card is in exactly one place.
  const all = [...s.piles.stage.flat(), ...s.piles.crisisDiscard, ...(s.crisis ? [s.crisis.cardId] : [])];
  if (new Set(all).size !== all.length) bad.push('a Crisis card exists twice');
  return bad;
}
