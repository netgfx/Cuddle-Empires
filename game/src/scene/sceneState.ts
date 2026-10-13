// Scene-local state.
// - `useDisplay`: per-territory overrides on top of `view`, so the board updates mid-batch
//   while the director animates events (view only catches up at the end of a batch).
// - `fx`: mutable per-territory animation channels read in useFrame loops (no React renders).
// - `travellers`: pawns hopping between territories.
// - `useEffectsStore`: transient floating texts and bursts.
import { Color, Vector3 } from 'three';
import { create } from 'zustand';
import { TERRITORY_IDS } from '../game/mapData';
import type { GameState, PlayerId, TerritoryId, TerritoryState } from '../game/types';
import { useGame } from '../state/gameStore';
import type { PawnKind } from './sceneConfig';

interface DisplayStore {
  overrides: Partial<Record<TerritoryId, TerritoryState>>;
  /** Battle being animated (arc shown even when the local user has no selection, e.g. bots / remote players). */
  battle: { from: TerritoryId; to: TerritoryId; player: PlayerId } | null;
  setOverride(id: TerritoryId, t: TerritoryState): void;
  setBattle(b: DisplayStore['battle']): void;
  clear(): void;
}

export const useDisplay = create<DisplayStore>((set) => ({
  overrides: {},
  battle: null,
  setOverride: (id, t) => set((s) => ({ overrides: { ...s.overrides, [id]: t } })),
  setBattle: (battle) => set({ battle }),
  clear: () => set({ overrides: {}, battle: null }),
}));

// When view catches up, the overrides are stale.
useGame.subscribe((s, prev) => { if (s.view !== prev.view) useDisplay.getState().clear(); });

/** Territory state as currently displayed (override ?? view). */
export function displayed(view: GameState | null, id: TerritoryId): TerritoryState | null {
  return useDisplay.getState().overrides[id] ?? view?.territories[id] ?? null;
}

/** React hook: merged territories record (stable while nothing changes). */
export function useDisplayedTerritories(): Record<TerritoryId, TerritoryState> | null {
  const view = useGame((s) => s.view);
  const overrides = useDisplay((s) => s.overrides);
  if (!view) return null;
  if (Object.keys(overrides).length === 0) return view.territories;
  return { ...view.territories, ...overrides };
}

export interface TerritoryFx {
  /** 0..1 eased hover amount. */
  hover: number;
  /** Cluster pop scale multiplier (1 = rest). */
  pop: number;
  /** 0..1 loss flash. */
  flash: number;
  /** Ring colour animation: colour = lerp(ringFrom, owner, ringMix). */
  ringFrom: Color;
  ringMix: number;
  /** Extra ring scale pulse (0 = rest). */
  ringPulse: number;
}

export const fx: Record<TerritoryId, TerritoryFx> = Object.fromEntries(
  TERRITORY_IDS.map((id) => [id, { hover: 0, pop: 1, flash: 0, ringFrom: new Color('#ffffff'), ringMix: 1, ringPulse: 0 }]),
) as Record<TerritoryId, TerritoryFx>;

export interface Traveller {
  kind: PawnKind;
  color: string;
  pos: Vector3;
  scale: number;
  /** Heading around Y (radians). */
  yaw: number;
}
export const travellers: Traveller[] = [];

export type SceneEffect =
  | { id: number; kind: 'text'; text: string; color: string; pos: [number, number, number] }
  | { id: number; kind: 'burst'; color: string; pos: [number, number, number] };

interface EffectsStore {
  effects: SceneEffect[];
  add(e: Omit<SceneEffect, 'id'> & Record<string, unknown>): number;
  remove(id: number): void;
}
let nextId = 1;
export const useEffectsStore = create<EffectsStore>((set) => ({
  effects: [],
  add: (e) => { const id = nextId++; set((s) => ({ effects: [...s.effects, { ...e, id } as SceneEffect] })); return id; },
  remove: (id) => set((s) => ({ effects: s.effects.filter((x) => x.id !== id) })),
}));

/** Player id -> colour lookups for displayed state need the players list; helper for animations. */
export function ownerOf(view: GameState | null, id: TerritoryId): PlayerId | null {
  return displayed(view, id)?.owner ?? null;
}
