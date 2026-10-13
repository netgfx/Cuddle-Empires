// UI store: selection, panels, camera focus and user preferences (persisted).
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TerritoryId } from '../game/types';

export type PanelId = 'scoreboard' | 'cards' | 'log' | 'help' | 'settings' | 'territory';
export type MusicTrackId = 'off' | 'meadow' | 'march' | 'lullaby' | 'adventure';
export type CameraFocus = { kind: 'overview' } | { kind: 'territory'; id: TerritoryId } | { kind: 'battle'; from: TerritoryId; to: TerritoryId };

export interface UIStore {
  hovered: TerritoryId | null;
  /** Source territory (attack from / fortify from / last placed). */
  selected: TerritoryId | null;
  /** Target territory (attack to / fortify to). */
  target: TerritoryId | null;
  attackDice: 1 | 2 | 3;
  /** Armies placed per click in reinforce/setup. */
  placeCount: number;
  panels: Record<PanelId, boolean>;
  camera: CameraFocus;

  // preferences (persisted)
  music: MusicTrackId;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  /** Animation speed multiplier (1 normal, 2 fast, 4 very fast). */
  animSpeed: number;
  showLabels: boolean;

  setHovered(t: TerritoryId | null): void;
  select(t: TerritoryId | null): void;
  setTarget(t: TerritoryId | null): void;
  clearSelection(): void;
  setAttackDice(n: 1 | 2 | 3): void;
  setPlaceCount(n: number): void;
  togglePanel(p: PanelId): void;
  setPanel(p: PanelId, open: boolean): void;
  focus(c: CameraFocus): void;
  setPrefs(p: Partial<Pick<UIStore, 'music' | 'musicVolume' | 'sfxVolume' | 'animSpeed' | 'showLabels'>>): void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = '__risk_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } };
  }
});

export const useUI = create<UIStore>()(
  persist(
    (set) => ({
      hovered: null,
      selected: null,
      target: null,
      attackDice: 3,
      placeCount: 1,
      panels: { scoreboard: true, cards: false, log: false, help: false, settings: false, territory: false },
      camera: { kind: 'overview' },

      music: 'meadow',
      musicVolume: 0.5,
      sfxVolume: 0.8,
      animSpeed: 1,
      showLabels: true,

      setHovered: (hovered) => set({ hovered }),
      select: (selected) => set({ selected, target: null }),
      setTarget: (target) => set({ target }),
      clearSelection: () => set({ selected: null, target: null }),
      setAttackDice: (attackDice) => set({ attackDice }),
      setPlaceCount: (placeCount) => set({ placeCount: Math.max(1, Math.floor(placeCount)) }),
      togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
      setPanel: (p, open) => set((s) => ({ panels: { ...s.panels, [p]: open } })),
      focus: (camera) => set({ camera }),
      setPrefs: (p) => set(p),
    }),
    {
      name: 'risk3d-prefs',
      storage: safeStorage,
      partialize: (s) => ({ music: s.music, musicVolume: s.musicVolume, sfxVolume: s.sfxVolume, animSpeed: s.animSpeed, showLabels: s.showLabels }),
    },
  ),
);
