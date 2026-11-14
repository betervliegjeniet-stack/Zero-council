// Zustand store: holds the GameState and (from M5) the event playback queue.
import { create } from 'zustand';
import { applyIntent, createGame, type GameEvent, type GameOptions, type GameState, type Intent } from '../engine';

interface GameStore {
  game: GameState | null;
  /** Events not yet played back by the UI. */
  queue: GameEvent[];
  newGame: (options: GameOptions) => void;
  dispatch: (intent: Intent) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  queue: [],
  newGame: (options) => {
    const { state, events } = createGame(options);
    set({ game: state, queue: events });
  },
  dispatch: (intent) => {
    const game = get().game;
    if (!game) return;
    const { state, events } = applyIntent(game, intent);
    set({ game: state, queue: get().queue.concat(events) });
  },
}));
