// Which motifs illustrate each card when no painted art exists (SPEC §9.2), chosen from the card's
// title and artDirection. The first motif is the subject; the second sits behind it.
import type { Card } from '../engine';

export type Motif =
  | 'gear' | 'skull' | 'valve' | 'biohazard' | 'radio' | 'urn' | 'padlock' | 'crack' | 'eye' | 'hand'
  | 'clock' | 'flare' | 'tunnel' | 'monitor' | 'scales' | 'noose';

export const CARD_MOTIFS: Record<string, [Motif, Motif?]> = {
  'CR-01': ['monitor', 'crack'], 'CR-02': ['valve', 'gear'], 'CR-03': ['hand', 'padlock'], 'CR-04': ['monitor', 'eye'],
  'CR-05': ['valve', 'crack'], 'CR-06': ['gear', 'crack'], 'CR-07': ['crack', 'tunnel'], 'CR-08': ['biohazard', 'hand'],
  'CR-09': ['radio', 'crack'], 'CR-10': ['valve', 'biohazard'], 'CR-11': ['eye', 'clock'], 'CR-12': ['monitor', 'skull'],
  'CR-13': ['padlock', 'eye'], 'CR-14': ['flare', 'gear'], 'CR-15': ['padlock', 'crack'], 'CR-16': ['biohazard', 'skull'],
  'CR-17': ['flare', 'radio'], 'CR-18': ['crack', 'tunnel'], 'CR-19': ['radio', 'eye'], 'CR-20': ['valve', 'hand'],
  'CR-21': ['clock', 'skull'], 'CR-22': ['scales', 'skull'], 'CR-23': ['eye', 'monitor'], 'CR-24': ['tunnel', 'eye'],
  'CR-25': ['urn', 'noose'], 'CR-26': ['flare', 'skull'], 'CR-27': ['hand', 'gear'], 'CR-28': ['skull', 'crack'],
  'CR-29': ['tunnel', 'radio'], 'CR-30': ['eye', 'crack'], 'CR-31': ['gear', 'crack'], 'CR-32': ['monitor', 'tunnel'],
  'CR-33': ['skull', 'hand'], 'CR-34': ['flare', 'clock'], 'CR-35': ['valve', 'skull'], 'CR-36': ['radio', 'crack'],
  'CR-37': ['scales', 'tunnel'], 'CR-38': ['clock', 'crack'], 'CR-39': ['eye', 'clock'], 'CR-40': ['skull', 'urn'],
  'BS-01': ['eye', 'skull'], 'BS-02': ['monitor', 'hand'], 'BS-03': ['biohazard', 'eye'], 'BS-04': ['biohazard', 'monitor'],
  'BS-05': ['hand', 'biohazard'], 'BS-06': ['valve', 'eye'], 'BS-07': ['tunnel', 'radio'],
  'FIN-01': ['urn', 'tunnel'], 'FIN-02': ['skull', 'hand'], 'FIN-03': ['clock', 'urn'], 'FIN-04': ['skull', 'urn'],
  'MAN-01': ['tunnel', 'urn'], 'MAN-02': ['skull', 'urn'], 'MAN-03': ['hand', 'gear'], 'MAN-04': ['biohazard', 'padlock'],
  'MAN-05': ['noose', 'urn'], 'MAN-06': ['scales', 'gear'], 'MAN-07': ['noose', 'skull'], 'MAN-08': ['hand', 'biohazard'],
  'MAN-09': ['gear', 'hand'], 'MAN-10': ['tunnel', 'eye'], 'MAN-11': ['scales', 'eye'], 'MAN-12': ['valve', 'padlock'],
  'MAN-13': ['hand', 'eye'], 'MAN-14': ['monitor', 'gear'], 'MAN-15': ['scales', 'skull'], 'MAN-16': ['eye', 'noose'],
  'MAN-17': ['clock', 'flare'], 'MAN-18': ['valve', 'hand'], 'MAN-19': ['urn', 'padlock'], 'MAN-20': ['urn', 'clock'],
};

export interface Tint {
  /** Frame and header colour. */
  frame: string;
  /** Ink colour of the art. */
  ink: string;
  /** Background gradient of the art window. */
  from: string;
  to: string;
  label: string;
}

/** Stage colour coding of card frames (SPEC §8). */
export function cardTint(card: Card): Tint {
  if (card.deck === 'mandate') return { frame: '#c9a227', ink: '#d9bc58', from: '#1c1a14', to: '#070605', label: 'APEX MANDATE' };
  if (card.deck === 'finale') return { frame: '#e0b93a', ink: '#f0cf62', from: '#231c08', to: '#050402', label: 'FINALE' };
  if (card.expansion) return { frame: '#b04cff', ink: '#cf9bff', from: '#2a1440', to: '#0b0612', label: 'THE BIOLOGICAL SCHISM EXPANSION' };
  switch (card.stage) {
    case 1: return { frame: '#c8742c', ink: '#e8a45c', from: '#3a2210', to: '#0f0905', label: 'STAGE I — THE FIRST CRACKS' };
    case 2: return { frame: '#8fae4a', ink: '#b7d36a', from: '#1f2a12', to: '#080b05', label: 'STAGE II — THE DEEPENING SCHISM' };
    case 3: return { frame: '#c8242e', ink: '#f06a6a', from: '#3a0d10', to: '#0d0304', label: 'STAGE III — THE TERMINAL PHASE' };
    default: return { frame: '#e8e0cc', ink: '#e8e0cc', from: '#16161a', to: '#000000', label: 'STAGE IV — THE VOID' };
  }
}
