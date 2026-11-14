// Zustand store: owns the GameState, runs the AI Councilors between the human's inputs,
// keeps the event log, and saves after every change.
import { create } from 'zustand';
import {
  IllegalIntentError, STATE_VERSION, aiAcceptsDeal, aiAfterDeal, aiDecide, aiWhisperIntents, applyIntent, createGame,
  dialOptions, line, turnOrder, type Deal, type Dial, type Difficulty, type FactionId, type GameEvent, type GameState,
  type Intent, type LineKind, type PendingDecision, type Seat,
} from '../engine';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

export type Screen = 'title' | 'setup' | 'game' | 'codex' | 'settings' | 'end';

export interface SetupOptions {
  faction: FactionId;
  playerCount: 4 | 5 | 6;
  difficulty: Difficulty;
  expansion: boolean;
  finale: boolean;
  collapsePenalty: boolean;
}

export interface LogEntry {
  n: number;
  turn: number;
  event: GameEvent;
}

interface SaveFile {
  version: number;
  game: GameState;
  log: LogEntry[];
  dealLines: Record<string, string>;
}

const SAVE_KEY = 'zc.save';

function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as SaveFile;
    // A save from another state schema is thrown away (SPEC §12).
    if (save.version !== STATE_VERSION || save.game?.version !== STATE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return save;
  } catch {
    return null;
  }
}

function writeSave(game: GameState | null, log: LogEntry[], dealLines: Record<string, string>): void {
  try {
    if (!game || game.step === 'ended') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ version: STATE_VERSION, game, log: log.slice(-400), dealLines } satisfies SaveFile));
  } catch {
    /* storage full or unavailable: play on without saving */
  }
}

interface GameStore {
  screen: Screen;
  /** Where Codex and Settings return to. */
  backTo: Screen;
  settings: Settings;
  setup: SetupOptions;
  game: GameState | null;
  log: LogEntry[];
  /** What an AI said about a deal (offer line, or its answer to yours). */
  dealLines: Record<string, string>;
  /** AI seats that have not acted yet in this Whisper. */
  whisperQueue: Seat[];
  /** Shown after the app was in the background during a Whisper. */
  awayReport: { seconds: number; fromLog: number } | null;
  /** After the Whisper ran out while away: the dial must be set by this time. */
  dialDeadline: number | null;
  hasSave: boolean;
  error: string | null;

  go: (screen: Screen) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setSetup: (patch: Partial<SetupOptions>) => void;
  newGame: () => void;
  continueGame: () => void;
  abandon: () => void;
  resetSave: () => void;
  /** Sends one of the human's intents, then lets the AI Councilors answer. Returns false if it was illegal. */
  dispatch: (intent: Intent) => boolean;
  /** Presses the phase button: opens the next gate. */
  advance: () => void;
  /** One AI Councilor takes its Whisper turn (called on a timer). */
  whisperAct: () => void;
  /** Ends the Whisper: the AIs get one last round, then the Council is sealed. */
  sealCouncil: () => void;
  /** Human offers a deal; the AI partner answers at once. Returns the deal, or null if it was illegal. */
  proposeDeal: (partner: Seat, terms: Deal['terms']) => Deal | null;
  respondDeal: (dealId: string, accept: boolean) => void;
  reportAbsence: (seconds: number) => void;
  dismissAway: () => void;
  /** Runs the rest of the game without the human (after deletion). */
  watchTheEnd: () => void;
  clearError: () => void;
}

export const humanSeat = (g: GameState | null): Seat | null => g?.players.find((p) => p.isHuman)?.seat ?? null;

export const useGameStore = create<GameStore>((set, get) => {
  let counter = 0;

  /** Applies one intent to the current game and records its events. Throws on an illegal intent. */
  function apply(intent: Intent): GameEvent[] {
    const game = get().game;
    if (!game) return [];
    const { state, events } = applyIntent(game, intent);
    const log = get().log.concat(events.map((event) => ({ n: counter++, turn: state.turn, event })));
    const patch: Partial<GameStore> = { game: state, log };
    if (events.some((e) => e.type === 'WhisperStarted')) {
      patch.whisperQueue = turnOrder(state).filter((seat) => state.ai[seat]);
    }
    set(patch);
    return events;
  }

  function attempt(intent: Intent): boolean {
    try {
      apply(intent);
      return true;
    } catch (err) {
      if (err instanceof IllegalIntentError) return false;
      throw err;
    }
  }

  function setLine(dealId: string, seat: Seat, kind: LineKind, target?: Seat): void {
    const g = get().game!;
    const name = (s: Seat) => factionLabel(g, s);
    const text = line(g, seat, kind, { target: target !== undefined ? name(target) : undefined }, dealId);
    set({ dealLines: { ...get().dealLines, [dealId]: text } });
  }

  function answerAI(d: PendingDecision): void {
    const g = get().game!;
    const intents = aiDecide(g, d);
    if (d.kind !== 'dial') {
      intents.forEach(apply);
      return;
    }
    if (intents.every(attempt)) return;
    // The planned dial became unaffordable (e.g. after a peek): take the first sector that works.
    for (const o of dialOptions(get().game!, d.seat).filter((x) => x.available)) {
      const tries: Dial[] = o.targets?.length
        ? o.targets.map((target) => ({ action: o.action, target }))
        : [{ action: o.action, ...(o.action === 'contribute' ? { amount: o.minAmount } : {}) }];
      for (const dial of tries) {
        if (attempt({ type: 'SetDial', seat: d.seat, dial }) && attempt({ type: 'LockDial', seat: d.seat })) return;
      }
    }
  }

  /** Lets every AI Councilor answer what the engine is waiting on. Stops at the human's decisions. */
  function pump(): void {
    for (let guard = 0; guard < 2000; guard++) {
      const g = get().game;
      if (!g || g.step === 'ended') break;
      const d = g.pending.find((x) => g.ai[x.seat]);
      if (!d) break;
      answerAI(d);
    }
    const g = get().game;
    writeSave(g, get().log, get().dealLines);
    set({ hasSave: !!g && g.step !== 'ended' });
    if (g?.step === 'ended') set({ screen: 'end' });
  }

  /** One AI seat's Whisper: abilities, then at most one offer. AI partners answer at once. */
  function aiWhisperTurn(seat: Seat): void {
    const g = get().game;
    if (!g || g.step !== 'whisper' || g.players[seat]!.eliminated) return;
    const { intents, offer } = aiWhisperIntents(g, seat);
    for (const intent of intents) {
      if (!attempt(intent)) continue;
      pumpAIOnly();
      if (intent.type !== 'ProposeDeal') continue;
      const now = get().game!;
      const deal = now.deals.at(-1)!;
      if (offer) {
        const third = offer.terms.find((t) => (t.kind === 'willSabotage' || t.kind === 'willVote') && typeof t.target === 'number');
        setLine(deal.id, seat, offer.kind, third && 'target' in third && typeof third.target === 'number' ? third.target : undefined);
      }
      if (!now.ai[deal.partner]) continue; // offered to the human: it waits on the Whisper board
      const accept = aiAcceptsDeal(now, deal.partner, deal.id);
      if (attempt({ type: 'RespondDeal', seat: deal.partner, dealId: deal.id, accept }) && accept) followUp(deal.id);
    }
  }

  function followUp(dealId: string): void {
    const g = get().game!;
    const deal = g.deals.find((d) => d.id === dealId);
    if (!deal) return;
    for (const intent of aiAfterDeal(g, deal)) {
      if (attempt(intent)) pumpAIOnly();
    }
  }

  function pumpAIOnly(): void {
    for (let guard = 0; guard < 200; guard++) {
      const g = get().game;
      const d = g?.pending.find((x) => g.ai[x.seat]);
      if (!g || !d) return;
      answerAI(d);
    }
  }

  /** Answers the human's open prompts with their default (used when a timer runs out). */
  function defaultHumanAnswers(): void {
    for (let guard = 0; guard < 20; guard++) {
      const g = get().game;
      const me = humanSeat(g);
      const d = g?.pending.find((x) => x.seat === me);
      if (!g || !d || d.kind === 'dial' || d.kind === 'ballot') return;
      if (d.kind === 'lpPledge') apply({ type: 'PledgeLP', seat: d.seat, amount: 0 });
      else if (d.kind === 'crucibleBid' || d.kind === 'finaleBid' || d.kind === 'finalePool') apply({ type: 'SubmitBid', seat: d.seat, amount: 0 });
      else apply({ type: 'ChooseOption', seat: d.seat, decisionId: d.id, option: d.defaultOption ?? d.options.at(-1)! });
      pumpAIOnly();
    }
  }

  const saved = typeof localStorage === 'undefined' ? null : readSave();

  return {
    screen: 'title',
    backTo: 'title',
    settings: typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : loadSettings(),
    setup: { faction: 'archivists', playerCount: 6, difficulty: 'normal', expansion: true, finale: true, collapsePenalty: true },
    game: null,
    log: [],
    dealLines: {},
    whisperQueue: [],
    awayReport: null,
    dialDeadline: null,
    hasSave: saved !== null,
    error: null,

    go: (screen) => set((s) => ({ screen, backTo: screen === 'codex' || screen === 'settings' ? (s.screen === 'codex' || s.screen === 'settings' ? s.backTo : s.screen) : s.backTo })),
    setSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      saveSettings(settings);
      set({ settings });
    },
    setSetup: (patch) => set({ setup: { ...get().setup, ...patch } }),

    newGame: () => {
      const { setup, settings } = get();
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const { state, events } = createGame({
        seed,
        playerCount: setup.playerCount,
        humanFaction: setup.faction,
        difficulty: setup.difficulty,
        config: {
          expansionEnabled: setup.expansion,
          finaleMode: setup.finale ? 'replaceTurn9Mandate' : 'off',
          collapsePenalty: setup.collapsePenalty,
          whisperSeconds: settings.whisperSeconds,
        },
      });
      counter = 0;
      set({
        game: state, log: events.map((event) => ({ n: counter++, turn: 0, event })), dealLines: {}, whisperQueue: [],
        awayReport: null, dialDeadline: null, screen: 'game', error: null,
      });
      apply({ type: 'Advance' }); // deal the first Crisis
      pump();
    },
    continueGame: () => {
      const save = readSave();
      if (!save) return set({ hasSave: false });
      counter = (save.log.at(-1)?.n ?? 0) + 1;
      const g = save.game;
      set({
        game: g, log: save.log, dealLines: save.dealLines ?? {}, screen: 'game', awayReport: null, dialDeadline: null,
        whisperQueue: g.step === 'whisper' ? turnOrder(g).filter((seat) => g.ai[seat]) : [],
      });
      pump();
    },
    abandon: () => set({ screen: 'title' }),
    resetSave: () => {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch { /* nothing to remove */ }
      set({ hasSave: false, game: null, log: [] });
    },

    dispatch: (intent) => {
      try {
        apply(intent);
      } catch (err) {
        if (!(err instanceof IllegalIntentError)) throw err;
        set({ error: err.message });
        return false;
      }
      if (intent.type === 'LockDial') set({ dialDeadline: null });
      pump();
      return true;
    },
    advance: () => {
      const g = get().game;
      if (!g || g.step === 'ended') return;
      if (g.step === 'whisper') return get().sealCouncil();
      apply({ type: 'Advance', now: Date.now() });
      pump();
    },
    whisperAct: () => {
      const [seat, ...rest] = get().whisperQueue;
      if (seat === undefined) return;
      set({ whisperQueue: rest });
      aiWhisperTurn(seat);
      pump();
    },
    sealCouncil: () => {
      const g = get().game;
      if (!g || g.step !== 'whisper') return;
      // "SEAL THE COUNCIL": the AIs get one last round of offers.
      for (const seat of get().whisperQueue) aiWhisperTurn(seat);
      set({ whisperQueue: [] });
      defaultHumanAnswers();
      apply({ type: 'Advance', now: Date.now(), seal: true });
      pump();
    },
    proposeDeal: (partner, terms) => {
      const g = get().game;
      const me = humanSeat(g);
      if (!g || me === null) return null;
      if (!attempt({ type: 'ProposeDeal', seat: me, partner, terms })) {
        set({ error: 'That offer is not possible right now.' });
        return null;
      }
      const now = get().game!;
      const deal = now.deals.at(-1)!;
      const accept = aiAcceptsDeal(now, partner, deal.id);
      setLine(deal.id, partner, accept ? 'accept' : 'reject');
      if (attempt({ type: 'RespondDeal', seat: partner, dealId: deal.id, accept }) && accept) followUp(deal.id);
      pump();
      return get().game!.deals.find((d) => d.id === deal.id) ?? null;
    },
    respondDeal: (dealId, accept) => {
      const me = humanSeat(get().game);
      if (me === null) return;
      if (attempt({ type: 'RespondDeal', seat: me, dealId, accept }) && accept) followUp(dealId);
      else if (accept) set({ error: 'That deal can no longer be sealed.' });
      pump();
    },
    reportAbsence: (seconds) => {
      const g = get().game;
      if (!g || g.step !== 'whisper' || seconds < 3) return;
      const fromLog = get().log.at(-1)?.n ?? 0;
      attempt({ type: 'HumanAbsent', seconds });
      // The Council conspired while you were gone: every Councilor who was due has acted.
      const due = Math.ceil(seconds / 4);
      for (const seat of get().whisperQueue.slice(0, due)) aiWhisperTurn(seat);
      set({ whisperQueue: get().whisperQueue.slice(due), awayReport: { seconds, fromLog } });
      if (Date.now() >= (get().game!.whisper?.endsAt ?? Infinity)) {
        get().sealCouncil();
        set({ dialDeadline: Date.now() + 5000 }); // 5 seconds to choose, then a random legal action
      }
      pump();
    },
    dismissAway: () => set({ awayReport: null }),
    watchTheEnd: () => {
      for (let guard = 0; guard < 500; guard++) {
        const g = get().game;
        if (!g || g.step === 'ended') break;
        if (g.step === 'whisper') {
          for (const seat of get().whisperQueue) aiWhisperTurn(seat);
          set({ whisperQueue: [] });
        }
        pumpAIOnly();
        const after = get().game!;
        if (after.step !== 'ended' && after.pending.length === 0) apply({ type: 'Advance', now: Date.now(), seal: true });
      }
      pump();
    },
    clearError: () => set({ error: null }),
  };
});

/** "Iron Remnant" for a seat, or "You" is left to the caller. */
export function factionLabel(g: GameState, seat: Seat): string {
  return FACTION_SHORT[g.players[seat]!.factionId];
}

export const FACTION_SHORT: Record<FactionId, string> = {
  archivists: 'Archivists of Ash',
  scrubbers: 'Scrubber Guild',
  choir: 'Quiet Choir',
  iron: 'Iron Remnant',
  wardens: 'Blight Wardens',
  directorate: 'Black Urn Directorate',
};
