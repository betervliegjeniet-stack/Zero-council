import { describe, expect, it } from 'vitest';
import cardsJson from '../data/cards.json';
import factionsJson from '../data/factions.json';
import { CARDS, FACTIONS, cardSchema, cardsFileSchema, factionsFileSchema, getCard } from '../src/engine';

describe('data files', () => {
  it('validates all 71 cards', () => {
    const parsed = cardsFileSchema.parse(cardsJson);
    expect(parsed.cards).toHaveLength(71);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(71);
  });

  it('has the deck sizes from the spec', () => {
    const core = CARDS.filter((c) => c.deck === 'crisis' && !c.expansion);
    expect(core).toHaveLength(40);
    for (const stage of [1, 2, 3, 4]) expect(core.filter((c) => c.stage === stage)).toHaveLength(10);
    expect(CARDS.filter((c) => c.deck === 'crisis' && c.expansion && c.stage === null)).toHaveLength(7);
    expect(CARDS.filter((c) => c.deck === 'finale')).toHaveLength(4);
    expect(CARDS.filter((c) => c.deck === 'mandate')).toHaveLength(20);
  });

  it('validates all 6 factions with their starting pools', () => {
    expect(factionsFileSchema.parse(factionsJson).factions).toHaveLength(6);
    const start = Object.fromEntries(FACTIONS.map((f) => [f.id, [f.start.influence, f.start.lp]]));
    expect(start).toEqual({
      archivists: [4, 4], scrubbers: [6, 2], choir: [5, 3], iron: [5, 3], wardens: [4, 3], directorate: [6, 2],
    });
  });

  it('every pool card has a threshold and an unmitigated EH change or a handler-only effect', () => {
    for (const c of CARDS.filter((x) => x.mitigation.kind === 'pool_influence')) {
      expect(c.mitigation.amount, c.id).toBeGreaterThan(0);
    }
  });

  it('rejects a malformed card', () => {
    const bad = { ...getCard('CR-01'), eh: { op: 'explode', value: 1, timing: null } };
    expect(cardSchema.safeParse(bad).success).toBe(false);
    expect(cardSchema.safeParse({ ...getCard('CR-01'), id: 'XX-1' }).success).toBe(false);
  });
});
