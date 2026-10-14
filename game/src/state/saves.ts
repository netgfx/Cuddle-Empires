// Local save games (hotseat / vs-bots only — online games live on the room server).
//
// Each save is two localStorage entries: a small summary in the shared index (so the list
// opens without parsing every game) and the full file under its own key. The file keeps a
// readable per-player snapshot ({ "player-1": { name, data: { territories: [...] } } }) next to
// the complete engine state, which is what a load restores — deck, cards, rng and phase included.
import { create } from 'zustand';
import { TERRITORIES, TERRITORY_IDS } from '../game/mapData';
import type { GameState, Phase, PlayerKind } from '../game/types';
import { LocalTransport } from '../net/transport';
import { useGame } from './gameStore';

export const SAVE_FORMAT = 'risk3d-save';
export const SAVE_VERSION = 1;
const INDEX_KEY = 'risk3d-saves';
const fileKey = (id: string) => `risk3d-save:${id}`;

export interface SavedTerritory { id: string; name: string; armies: number }

export interface SavedPlayer {
  id: string;
  name: string;
  color: string;
  kind: PlayerKind;
  neutral: boolean;
  eliminated: boolean;
  cards: number;
  data: { territories: SavedTerritory[] };
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  id: string;
  label: string;
  /** ms since epoch */
  savedAt: number;
  round: number;
  phase: Phase;
  /** Id of the player whose turn it is. */
  current: string;
  /** "player-1", "player-2", … in seat order. */
  players: Record<string, SavedPlayer>;
  state: GameState;
}

export interface SaveSummary {
  id: string;
  label: string;
  savedAt: number;
  round: number;
  phase: Phase;
  current: string;
  players: { id: string; name: string; color: string; kind: PlayerKind; neutral: boolean; eliminated: boolean; territories: number; armies: number }[];
}

export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

let memory: Map<string, string> | null = null;
/** localStorage when usable, else an in-memory fallback (private mode, blocked storage). */
export function defaultStorage(): KV {
  try {
    const k = '__risk_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    memory ??= new Map();
    const m = memory;
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
  }
}

export function defaultLabel(state: GameState): string {
  const names = state.players.filter((p) => !p.isNeutral).map((p) => p.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? 'Saved game';
}

export function buildSave(state: GameState, label?: string, now = Date.now()): SaveFile {
  const players: Record<string, SavedPlayer> = {};
  state.players.forEach((p, i) => {
    players[`player-${i + 1}`] = {
      id: p.id,
      name: p.name,
      color: p.color,
      kind: p.kind,
      neutral: p.isNeutral,
      eliminated: p.eliminated,
      cards: p.cards.length,
      data: {
        territories: TERRITORY_IDS.filter((t) => state.territories[t].owner === p.id)
          .map((t) => ({ id: t, name: TERRITORIES[t].name, armies: state.territories[t].armies })),
      },
    };
  });
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: label?.trim() || defaultLabel(state),
    savedAt: now,
    round: state.turn,
    phase: state.phase,
    current: state.players[state.current].id,
    players,
    state: structuredClone(state),
  };
}

export function summarize(save: SaveFile): SaveSummary {
  return {
    id: save.id,
    label: save.label,
    savedAt: save.savedAt,
    round: save.round,
    phase: save.phase,
    current: save.current,
    players: Object.values(save.players).map((p) => ({
      id: p.id, name: p.name, color: p.color, kind: p.kind, neutral: p.neutral, eliminated: p.eliminated,
      territories: p.data.territories.length,
      armies: p.data.territories.reduce((n, t) => n + t.armies, 0),
    })),
  };
}

const PHASES: Phase[] = ['setupClaim', 'setupReinforce', 'reinforce', 'attack', 'occupy', 'fortify', 'gameOver'];

/** Rejects anything that would crash the engine; returns the reason or null. */
export function validateSave(x: unknown): string | null {
  const s = x as Partial<SaveFile> | null;
  if (!s || typeof s !== 'object' || s.format !== SAVE_FORMAT) return 'Not a Risk save file';
  if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return 'This save was made by a newer version of the game';
  const g = s.state as Partial<GameState> | undefined;
  if (!g || !Array.isArray(g.players) || g.players.length < 2) return 'Save is missing its players';
  if (typeof g.current !== 'number' || !g.players[g.current]) return 'Save has no current player';
  if (!g.phase || !PHASES.includes(g.phase)) return 'Save has an unknown phase';
  if (!g.territories || TERRITORY_IDS.some((t) => typeof g.territories![t]?.armies !== 'number')) return 'Save is missing territories';
  if (!g.cards || !Array.isArray(g.deck) || !Array.isArray(g.discard)) return 'Save is missing the card deck';
  return null;
}

function readIndex(kv: KV): SaveSummary[] {
  try {
    const raw = kv.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SaveSummary[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const writeIndex = (kv: KV, list: SaveSummary[]) => kv.setItem(INDEX_KEY, JSON.stringify(list));

/** Newest first. */
export function listSaves(kv: KV = defaultStorage()): SaveSummary[] {
  return readIndex(kv).sort((a, b) => b.savedAt - a.savedAt);
}

export function writeSave(save: SaveFile, kv: KV = defaultStorage()): void {
  try {
    kv.setItem(fileKey(save.id), JSON.stringify(save));
    writeIndex(kv, [summarize(save), ...readIndex(kv).filter((s) => s.id !== save.id)]);
  } catch (e) {
    kv.removeItem(fileKey(save.id));
    const full = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new Error(full ? 'Storage is full — delete a few old saves and try again' : `Could not save: ${(e as Error).message}`);
  }
}

export function readSave(id: string, kv: KV = defaultStorage()): SaveFile {
  const raw = kv.getItem(fileKey(id));
  if (!raw) throw new Error('This save no longer exists');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('This save is corrupted'); }
  const bad = validateSave(parsed);
  if (bad) throw new Error(bad);
  return parsed as SaveFile;
}

export function deleteSave(id: string, kv: KV = defaultStorage()): void {
  kv.removeItem(fileKey(id));
  writeIndex(kv, readIndex(kv).filter((s) => s.id !== id));
}

/** Engine state ready to run on a LocalTransport (every non-neutral seat is local again). */
export function restoreState(save: SaveFile): GameState {
  const state = structuredClone(save.state);
  state.players = state.players.map((p) => (p.kind === 'remote' ? { ...p, kind: 'human' } : p));
  return state;
}

// ---------------------------------------------------------------- store

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SavesStore {
  saves: SaveSummary[];
  status: SaveStatus;
  error: string | null;
  /** Id of the save that just completed (highlighted in the list). */
  lastSavedId: string | null;
  refresh(): void;
  /** Saves the running local game. Resolves with the new save, or null when it failed (see `error`). */
  save(label?: string): Promise<SaveFile | null>;
  remove(id: string): void;
  /** Replaces whatever is running with the saved game. Throws if the save cannot be read. */
  load(id: string): SaveFile;
}

/** True when the running game may be saved (local transport, game not over). */
export function canSaveNow(): boolean {
  const { transport, game } = useGame.getState();
  return !!game && transport?.mode === 'local' && game.phase !== 'gameOver';
}

const MIN_SAVING_MS = 350; // long enough to register as "saving", short enough to feel instant
const SAVED_MS = 2200;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
const nextPaint = () => new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));

export const useSaves = create<SavesStore>((set, get) => ({
  saves: listSaves(),
  status: 'idle',
  error: null,
  lastSavedId: null,

  refresh() { set({ saves: listSaves() }); },

  async save(label) {
    if (get().status === 'saving') return null;
    clearTimeout(statusTimer);
    const { transport, game } = useGame.getState();
    if (!game || transport?.mode !== 'local') {
      set({ status: 'error', error: 'Only local games can be saved' });
      return null;
    }
    const started = performance.now();
    set({ status: 'saving', error: null });
    await nextPaint(); // let the spinner render before the synchronous write
    let file: SaveFile | null = null;
    try {
      file = buildSave(game, label);
      writeSave(file);
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
      return null;
    }
    const left = MIN_SAVING_MS - (performance.now() - started);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
    set({ status: 'saved', lastSavedId: file.id, saves: listSaves() });
    statusTimer = setTimeout(() => set({ status: 'idle' }), SAVED_MS);
    return file;
  },

  remove(id) {
    deleteSave(id);
    set({ saves: listSaves(), lastSavedId: get().lastSavedId === id ? null : get().lastSavedId });
  },

  load(id) {
    const file = readSave(id);
    const state = restoreState(file);
    useGame.getState().attachTransport(new LocalTransport(state), state);
    return file;
  },
}));
