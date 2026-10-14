// Game store: owns the transport, the authoritative state (`game`) and the state
// the board currently shows (`view`). `view` lags behind `game` while the director
// animates the events of each update, so armies change when the dice land, not before.
import { create } from 'zustand';
import { createGame } from '../game/engine';
import type { Action, GameEvent, GameSettings, GameState, NewPlayer, PlayerId } from '../game/types';
import { LocalTransport, type GameTransport, type ServerMessage } from '../net/transport';
import { playEvent } from './director';
import { useUI } from './uiStore';

interface Batch { events: GameEvent[]; state: GameState }

export interface GameStore {
  transport: GameTransport | null;
  /** Latest authoritative state. */
  game: GameState | null;
  /** State currently displayed by the board and HUD. */
  view: GameState | null;
  /** Event currently being animated (null when idle). */
  playing: GameEvent | null;
  /** True while updates are queued or animating — input is locked. */
  busy: boolean;
  lastError: string | null;
  /** Every event in order, for the log panel and tests. */
  history: GameEvent[];

  startLocal(players: NewPlayer[], settings?: Partial<GameSettings>, seed?: number): void;
  attachTransport(t: GameTransport, initial: GameState): void;
  /** Send an action as the current player (if this client controls that seat). */
  dispatch(action: Action): void;
  leave(): void;
  clearError(): void;
}

let queue: Batch[] = [];
/** Bumped whenever the running game is replaced, so an in-flight drain stops touching the store. */
let epoch = 0;
/** Epoch of the drain loop currently running (-1 when idle). A stale loop never blocks a new game's. */
let drainingEpoch = -1;
let unsubscribe: (() => void) | null = null;

export const useGame = create<GameStore>((set, get) => {
  async function drain() {
    if (drainingEpoch === epoch) return;
    const mine = epoch;
    drainingEpoch = mine;
    set({ busy: true });
    try {
      while (queue.length && mine === epoch) {
        const batch = queue.shift()!;
        const before = get().view;
        for (const ev of batch.events) {
          set({ playing: ev, history: [...get().history, ev] });
          await playEvent(ev, { before, after: batch.state, speed: useUI.getState().animSpeed });
          if (mine !== epoch) return;
        }
        set({ view: batch.state, playing: null });
      }
    } finally {
      if (mine === epoch) {
        drainingEpoch = -1;
        set({ busy: false, playing: null });
      }
    }
  }

  function onMessage(m: ServerMessage) {
    if (m.kind === 'error') {
      set({ lastError: m.error });
      return;
    }
    set({ game: m.state, lastError: null });
    queue.push({ events: m.events, state: m.state });
    void drain();
  }

  return {
    transport: null,
    game: null,
    view: null,
    playing: null,
    busy: false,
    lastError: null,
    history: [],

    startLocal(players, settings, seed) {
      const state = createGame(players, settings, seed ?? Math.floor(Math.random() * 2 ** 31));
      get().attachTransport(new LocalTransport(state), state);
    },

    attachTransport(t, initial) {
      get().leave();
      unsubscribe = t.subscribe(onMessage);
      queue = [];
      set({ transport: t, game: initial, view: initial, history: [], lastError: null, busy: false, playing: null });
    },

    dispatch(action) {
      const { transport, game, busy } = get();
      if (!transport || !game || busy) return;
      const actor: PlayerId = game.players[game.current].id;
      if (!transport.seats.includes(actor)) {
        set({ lastError: 'Waiting for another player' });
        return;
      }
      transport.send({ action, actor, id: Math.random().toString(36).slice(2) });
    },

    leave() {
      epoch++;
      unsubscribe?.();
      unsubscribe = null;
      get().transport?.close();
      queue = [];
      set({ transport: null, game: null, view: null, busy: false, playing: null, history: [] });
    },

    clearError() { set({ lastError: null }); },
  };
});

// Expose for e2e tests and debugging (window.__risk).
if (typeof window !== 'undefined') {
  (window as unknown as { __risk: unknown }).__risk = { game: useGame, ui: useUI, LocalTransport };
}
