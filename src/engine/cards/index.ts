// Card registry: every one of the 71 card ids maps to a handler (SPEC §6).
import { CARDS } from '../data';
import { CRISIS_HANDLERS } from './crisis';
import { FINALE_HANDLERS } from './finale';
import { MANDATE_HANDLERS } from './mandates';
import { SCHISM_HANDLERS } from './schism';
import type { CardHandler } from './types';

export type { CardHandler } from './types';
export { applyModifierTags } from './modifiers';

export const HANDLERS: Readonly<Record<string, CardHandler>> = {
  ...CRISIS_HANDLERS,
  ...SCHISM_HANDLERS,
  ...FINALE_HANDLERS,
  ...MANDATE_HANDLERS,
};

/** Throws if a card in cards.json has no handler, or a handler has no card. */
export function assertRegistryComplete(): void {
  const ids = new Set(CARDS.map((c) => c.id));
  const missing = [...ids].filter((id) => !(id in HANDLERS));
  const unknown = Object.keys(HANDLERS).filter((id) => !ids.has(id));
  if (missing.length || unknown.length) {
    throw new Error(`Card registry mismatch. Missing handlers: [${missing.join(', ')}]. Unknown ids: [${unknown.join(', ')}]`);
  }
  for (const c of CARDS) {
    const h = HANDLERS[c.id]!;
    const wantsVote = c.tags.some((t) => t.startsWith('vote:'));
    if (wantsVote !== (h.vote !== undefined)) throw new Error(`${c.id}: vote tag and handler disagree`);
  }
}

// Startup assertion.
assertRegistryComplete();

export function getHandler(cardId: string): CardHandler {
  const h = HANDLERS[cardId];
  if (!h) throw new Error(`No handler for card ${cardId}`);
  return h;
}
