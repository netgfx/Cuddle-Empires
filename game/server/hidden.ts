// Hidden information: each client only sees what its seats are allowed to see.
// - other players' card ids become placeholders (`hidden-<n>`, count preserved)
// - the draw pile order is replaced by placeholders (only its length is visible)
// - the PRNG state is zeroed, otherwise a client could replay the engine and predict dice / draws
// - `cardDrawn.card` / `eliminated.cardsTaken` are blanked for players who must not see them
import type { GameEvent, GameState, PlayerId } from '../src/game/types';

export const HIDDEN_PREFIX = 'hidden-';

export function isHiddenCard(id: string): boolean {
  return id === '' || id.startsWith(HIDDEN_PREFIX);
}

/** The state as seen by a client owning `seats` (empty = spectator). Never mutates `state`. */
export function viewFor(state: GameState, seats: readonly PlayerId[]): GameState {
  let n = 0;
  const hide = (ids: readonly string[]) => ids.map(() => `${HIDDEN_PREFIX}${n++}`);
  return {
    ...state,
    rng: 0,
    players: state.players.map((p) => (seats.includes(p.id) ? p : { ...p, cards: hide(p.cards) })),
    deck: hide(state.deck),
  };
}

export function eventsFor(events: readonly GameEvent[], seats: readonly PlayerId[]): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'cardDrawn' && !seats.includes(e.player)) return { ...e, card: '' };
    if (e.type === 'eliminated' && !seats.includes(e.by) && !seats.includes(e.player)) {
      return { ...e, cardsTaken: e.cardsTaken.map(() => '') };
    }
    return e;
  });
}
