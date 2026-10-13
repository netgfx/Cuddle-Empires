// UI-only transient state (banners, curtain, privacy) + reactive "who am I" hooks.
import { create } from 'zustand';
import type { PlayerId, ReinforcementBreakdown } from '../game/types';
import { useGame } from '../state/gameStore';

export interface Banner { key: number; player: PlayerId; turn: number; reinforcements: ReinforcementBreakdown }
export interface Popup { key: number; text: string; color?: string }

interface LocalUI {
  banner: Banner | null;
  curtain: { player: PlayerId; resolve: () => void } | null;
  /** Hotseat privacy: hide card faces. */
  hideCards: boolean;
  /** Last human seat that had the turn (for hotseat handoff + whose hand to show). */
  lastHuman: PlayerId | null;
  popups: Popup[];
  showGameOver: boolean;
  set(p: Partial<LocalUI>): void;
  popup(text: string, color?: string, ms?: number): void;
}

let popupKey = 0;
export const useLocal = create<LocalUI>((set, get) => ({
  banner: null,
  curtain: null,
  hideCards: false,
  lastHuman: null,
  popups: [],
  showGameOver: false,
  set: (p) => set(p),
  popup(text, color, ms = 2600) {
    const key = ++popupKey;
    set({ popups: [...get().popups, { key, text, color }] });
    setTimeout(() => set({ popups: get().popups.filter((x) => x.key !== key) }), ms);
  },
}));

/** True when the local user may act now (reactive version of canInteract()). */
export function useCanAct(): boolean {
  return useGame((s) => {
    const g = s.game;
    if (!g || s.busy || !s.transport || g.phase === 'gameOver') return false;
    const p = g.players[g.current];
    return p.kind === 'human' && s.transport.seats.includes(p.id);
  });
}

/** True when the current seat belongs to a local human (ignores `busy`). */
export function useMySeat(): boolean {
  return useGame((s) => {
    const g = s.view;
    if (!g || !s.transport) return false;
    const p = g.players[g.current];
    return p.kind === 'human' && s.transport.seats.includes(p.id);
  });
}

/** Player whose hand this screen shows: online → my seat; hotseat → current human, else the last human. */
export function useHandOwner(): PlayerId | null {
  const lastHuman = useLocal((s) => s.lastHuman);
  return useGame((s) => computeHandOwner(s, lastHuman));
}

export function handOwnerNow(): PlayerId | null {
  return computeHandOwner(useGame.getState(), useLocal.getState().lastHuman);
}

/** Number of human seats this device controls (hotseat privacy matters when > 1). */
export function localHumanCount(): number {
  const s = useGame.getState();
  return s.view?.players.filter((p) => p.kind === 'human' && (s.transport?.seats.includes(p.id) ?? true)).length ?? 0;
}

function computeHandOwner(s: ReturnType<typeof useGame.getState>, lastHuman: PlayerId | null): PlayerId | null {
  const v = s.view;
  if (!v) return null;
  const humans = v.players.filter((p) => p.kind === 'human' && (s.transport?.seats.includes(p.id) ?? true));
  if (s.transport?.mode === 'online') return humans[0]?.id ?? null;
  const cur = v.players[v.current];
  if (cur.kind === 'human') return cur.id;
  if (lastHuman && humans.some((h) => h.id === lastHuman)) return lastHuman;
  return humans.length === 1 ? humans[0].id : null;
}
