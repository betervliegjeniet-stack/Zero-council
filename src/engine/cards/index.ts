// Card registry. Generic behaviour (reveal EH, `mod:*` tags, Influence pools) is driven by the
// JSON fields in phases/crisis.ts and phases/resolve.ts; handlers implement only the special parts.
// M1 ships the generic layer; the per-card handlers and the completeness assertion arrive in M2.
import type { Card } from '../data';
import type { Ctx, TurnModifiers } from '../types';

export interface CardHandler {
  onReveal?(ctx: Ctx): void;
  /** `mitigated` is null for cards that have no mitigation. */
  onResolve?(ctx: Ctx, mitigated: boolean | null): void;
}

export const HANDLERS: Record<string, CardHandler> = {};

/** Cards whose whole digitalRuling is covered by the generic layer. */
export const GENERIC_ONLY: ReadonlySet<string> = new Set([
  'CR-03', 'CR-04', 'CR-06', 'CR-07', 'CR-10', 'CR-12', 'CR-14', 'CR-18', 'CR-21',
  'CR-24', 'CR-27', 'CR-29', 'CR-32', 'CR-36', 'CR-38',
]);

export function isImplemented(card: Card): boolean {
  return GENERIC_ONLY.has(card.id) || card.id in HANDLERS;
}

/** Registers the turn modifiers of a card from its `mod:*` tags. */
export function applyModifierTags(mods: TurnModifiers, card: Card): void {
  for (const tag of card.tags) {
    if (!tag.startsWith('mod:')) continue;
    const m = /^mod:([A-Za-z]+)(?:([=+])(\d+))?$/.exec(tag);
    const name = m?.[1];
    const op = m?.[2];
    const n = m?.[3] === undefined ? null : Number(m[3]);
    switch (name) {
      case 'salvageBlocked': mods.salvageBlocked = true; break;
      case 'gatherBlocked': mods.gatherBlocked = true; break;
      case 'gatherYield': mods.gatherYield = n; break;
      case 'sabotageCost': mods.sabotageCost = n; break;
      case 'sabotageDamage':
        if (op === '+') mods.sabotageDamageBonus += n ?? 0;
        else mods.sabotageDamageSet = n;
        break;
      case 'contributeSurcharge': mods.contributeSurcharge = n ?? 0; break;
      case 'contributeRewardLP': mods.contributeRewardLP = n ?? 0; break;
      case 'noLPGain': mods.noLPGain = true; break;
      case 'skipWhisper': mods.skipWhisper = true; break;
      case 'poolLeak': mods.poolLeak = n ?? 0; break;
      case 'abilitiesDisabledAll': mods.abilitiesDisabledAll = true; break;
      default: mods.other.push(tag);
    }
  }
}
