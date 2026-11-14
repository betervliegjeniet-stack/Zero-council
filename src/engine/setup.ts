// Game creation: seats, factions, starting pools and the shuffled decks (SPEC §2.1, §2.2).
import { DEFAULT_CONFIG, type RulesConfig } from './config';
import { CARDS, FACTIONS, getFaction, type FactionId } from './data';
import { randInt, seedToState, shuffle } from './rng';
import { emptyModifiers } from './selectors';
import type { CardId, GameEvent, GameState, PlayerState } from './types';

export const STATE_VERSION = 2;

export interface GameOptions {
  seed: number;
  playerCount?: 4 | 5 | 6;
  /** The human's faction (seat 0). Null or omitted = every seat is an AI (headless sims). */
  humanFaction?: FactionId | null;
  config?: Partial<RulesConfig>;
}

export function createGame(options: GameOptions): { state: GameState; events: GameEvent[] } {
  const config: RulesConfig = { ...DEFAULT_CONFIG, ...options.config };
  const playerCount = options.playerCount ?? 6;
  if (![4, 5, 6].includes(playerCount)) throw new Error(`playerCount must be 4, 5 or 6 (got ${playerCount})`);
  const holder = { rng: seedToState(options.seed) };

  // Factions: the human picks, the AIs are drawn at random from the rest.
  const human = options.humanFaction ?? null;
  const rest = shuffle(holder, FACTIONS.map((f) => f.id).filter((id) => id !== human));
  const factionIds: FactionId[] = human ? [human, ...rest.slice(0, playerCount - 1)] : rest.slice(0, playerCount);

  const players: PlayerState[] = factionIds.map((factionId, seat) => {
    const f = getFaction(factionId);
    return {
      seat,
      factionId,
      isHuman: human !== null && seat === 0,
      influence: f.start.influence,
      lp: f.start.lp,
      blight: { bio: 0, neuro: 0 },
      status: {
        embargoedUntil: 0,
        abilitiesDisabledUntil: 0,
        silencedUntil: 0,
        noTradeUntil: 0,
        noGatherUntil: 0,
        noSabotageSalvageUntil: 0,
        gatherYield0Until: 0,
        conscriptedUntil: 0,
        exiled: false,
        gatherLocked: false,
        paralyzed: false,
      },
      eliminated: false,
      eliminatedCause: null,
      eliminatedTurn: null,
      dial: null,
      dialLocked: false,
      queuedDial: null,
      acted: null,
      contributedThisTurn: 0,
      lpPledge: 0,
      contributedTotal: 0,
      abilityUsedThisTurn: false,
      abilityUsesThisGame: 0,
      oathUsedThisTurn: false,
      lpRevealed: null,
      lpShownTo: {},
      stats: { lpForged: 0, lpDestroyed: 0, dealsMade: 0, dealsBroken: 0, timesBetrayed: 0 },
    };
  });

  // Four stage piles; the 7 expansion cards go 3/4 into Stage II and III (DQ-18).
  const stage: [CardId[], CardId[], CardId[], CardId[]] = [[], [], [], []];
  for (const c of CARDS) {
    if (c.deck === 'crisis' && c.stage !== null) stage[c.stage - 1]!.push(c.id);
  }
  if (config.expansionEnabled) {
    const schism = shuffle(holder, CARDS.filter((c) => c.deck === 'crisis' && c.stage === null).map((c) => c.id));
    const toStage2 = Math.floor(schism.length / 2) + randInt(holder, 0, schism.length % 2);
    stage[1].push(...schism.slice(0, toStage2));
    stage[2].push(...schism.slice(toStage2));
  }
  for (let i = 0; i < 4; i++) stage[i] = shuffle(holder, stage[i]!);

  const mandates = shuffle(holder, CARDS.filter((c) => c.deck === 'mandate').map((c) => c.id));
  const finale = config.finaleMode === 'off' ? [] : shuffle(holder, CARDS.filter((c) => c.deck === 'finale').map((c) => c.id));

  const startEH = playerCount === 4 ? config.startEH4Players : config.startEH;
  const state: GameState = {
    version: STATE_VERSION,
    seed: options.seed,
    rng: holder.rng,
    config,
    turn: 0,
    step: 'turnStart',
    firstSeat: 0,
    eh: startEH,
    maxEH: startEH,
    players,
    piles: { stage, crisisDiscard: [], mandates, mandateDiscard: [], finale },
    crisis: null,
    mandate: null,
    modifiers: emptyModifiers(),
    blackoutTurn: 0,
    whisper: null,
    crucible: null,
    vote: null,
    votesThisTurn: [],
    deals: [],
    inoculations: [],
    announced: {},
    skipTurns: 0,
    tasks: [],
    scratch: { choices: {}, bids: {}, shield: [] },
    pending: [],
    nextId: 1,
    mainOver: null,
    outcome: null,
  };
  return { state, events: [{ type: 'GameCreated', seed: options.seed, playerCount }] };
}
