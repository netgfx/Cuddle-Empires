// Animation director: plays game events one at a time before the board shows the
// new state. Scene / dice / UI modules register an async player per event type;
// anything without a player resolves immediately.
import type { GameEvent, GameState } from '../game/types';

export type EventPlayer<T extends GameEvent['type'] = GameEvent['type']> = (
  ev: Extract<GameEvent, { type: T }>,
  ctx: { before: GameState | null; after: GameState; speed: number },
) => Promise<void> | void;

const players = new Map<GameEvent['type'], Set<EventPlayer>>();

/** Register an animation for an event type. Returns an unregister function. */
export function onEvent<T extends GameEvent['type']>(type: T, fn: EventPlayer<T>): () => void {
  if (!players.has(type)) players.set(type, new Set());
  players.get(type)!.add(fn as unknown as EventPlayer);
  return () => { players.get(type)?.delete(fn as unknown as EventPlayer); };
}

/** Plays every registered player for `ev` in parallel and waits for all of them. */
export async function playEvent(ev: GameEvent, ctx: { before: GameState | null; after: GameState; speed: number }) {
  const set = players.get(ev.type);
  if (!set || set.size === 0) return;
  const timeout = new Promise<void>((r) => setTimeout(r, 15000)); // never wedge the game on a broken animation
  await Promise.race([
    Promise.all([...set].map(async (p) => {
      try { await p(ev as never, ctx); } catch (e) { console.error('[director]', ev.type, e); }
    })),
    timeout,
  ]);
}
