// Loads and validates data/cards.json and data/factions.json. Pure TypeScript.
import { z } from 'zod';
import cardsJson from '../../data/cards.json';
import factionsJson from '../../data/factions.json';

export const FACTION_IDS = ['archivists', 'scrubbers', 'choir', 'iron', 'wardens', 'directorate'] as const;
export const factionIdSchema = z.enum(FACTION_IDS);

export const cardSchema = z.object({
  id: z.string().regex(/^(CR|BS|FIN|MAN)-\d{2}$/),
  deck: z.enum(['crisis', 'mandate', 'finale']),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.null()]),
  expansion: z.boolean(),
  title: z.string().min(1),
  type: z.string(),
  printed: z.object({ ehImpact: z.string(), mitigation: z.string(), effect: z.string() }),
  eh: z.object({
    op: z.enum(['none', 'delta', 'set', 'end']),
    value: z.number().int(),
    timing: z.enum(['reveal', 'unmitigated', 'tie', 'resolve']).nullable(),
  }),
  mitigation: z.object({
    kind: z.enum([
      'none', 'pool_influence', 'pool_lp', 'volunteer_lp', 'urn_vote', 'open_vote',
      'influence_auction', 'personal_choice', 'blind_bid',
    ]),
    amount: z.number().int().min(0),
  }),
  tags: z.array(z.string()),
  digitalRuling: z.string().min(1),
  flavor: z.string(),
  artDirection: z.string(),
  artFile: z.string().nullable(),
  shortText: z.string().max(140).optional(),
});

const personalitySchema = z.object({
  greed: z.number().min(0).max(1),
  aggression: z.number().min(0).max(1),
  cooperation: z.number().min(0).max(1),
  honesty: z.number().min(0).max(1),
  vengefulness: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
});

export const factionSchema = z.object({
  id: factionIdSchema,
  name: z.string().min(1),
  role: z.string(),
  start: z.object({ influence: z.number().int().min(0), lp: z.number().int().min(0) }),
  passive: z.object({ id: z.string(), name: z.string(), text: z.string() }),
  active: z.object({
    id: z.string(),
    name: z.string(),
    text: z.string(),
    cost: z.object({ influence: z.number().int().min(0), lp: z.number().int().min(0) }),
    usesPerGame: z.number().int().optional(),
    usesPerTurn: z.number().int().optional(),
    window: z.string(),
    designNote: z.string().optional(),
  }),
  palette: z.object({ primary: z.string(), accent: z.string() }),
  sigil: z.string(),
  aiPersonality: personalitySchema,
});

export const cardsFileSchema = z.object({ version: z.number(), source: z.unknown().optional(), cards: z.array(cardSchema) });
export const factionsFileSchema = z.object({ version: z.number(), factions: z.array(factionSchema) });

export type Card = z.infer<typeof cardSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type FactionId = z.infer<typeof factionIdSchema>;
export type Personality = z.infer<typeof personalitySchema>;

export const CARDS: readonly Card[] = cardsFileSchema.parse(cardsJson).cards;
export const FACTIONS: readonly Faction[] = factionsFileSchema.parse(factionsJson).factions;

const cardIndex = new Map(CARDS.map((c) => [c.id, c]));
const factionIndex = new Map(FACTIONS.map((f) => [f.id, f]));

export function getCard(id: string): Card {
  const c = cardIndex.get(id);
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}

export function getFaction(id: FactionId): Faction {
  const f = factionIndex.get(id);
  if (!f) throw new Error(`Unknown faction id: ${id}`);
  return f;
}
