// Registers a Crisis card's turn modifiers from its `mod:*` tags.
import type { Card } from '../data';
import type { TurnModifiers } from '../types';

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
      case 'randomActions': mods.randomActions = true; break;
      case 'delayActions': mods.delayActions = true; break;
      case 'revealSequential': mods.revealSequential = true; break;
      case 'announceActions': mods.announceActions = true; break;
      case 'cannibalSalvage': mods.cannibalSalvage = true; break;
      case 'sabotageInfects': mods.sabotageInfects = true; break;
      case 'abilitiesDisabledLeader': break; // applied by the CR-13 handler at reveal
      default: throw new Error(`Unknown modifier tag "${tag}" on ${card.id}`);
    }
  }
}
