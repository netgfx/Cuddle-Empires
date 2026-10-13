// Transport abstraction: the client never applies rules itself, it sends actions
// through a transport and renders whatever state comes back. LocalTransport runs
// the engine in-process (hotseat); OnlineTransport (online.ts) talks to the room
// server in /server, which runs the very same engine authoritatively.
import { reduce } from '../game/engine';
import type { ActionEnvelope, GameEvent, GameState, PlayerId } from '../game/types';

export type ServerMessage =
  | { kind: 'state'; state: GameState; events: GameEvent[]; actionId?: string }
  | { kind: 'error'; error: string; actionId?: string };

export interface GameTransport {
  readonly mode: 'local' | 'online';
  /** Seats this client is allowed to act for. */
  readonly seats: PlayerId[];
  send(env: ActionEnvelope): void;
  subscribe(fn: (msg: ServerMessage) => void): () => void;
  close(): void;
}

export class LocalTransport implements GameTransport {
  readonly mode = 'local' as const;
  private state: GameState;
  private listeners = new Set<(m: ServerMessage) => void>();
  readonly seats: PlayerId[];

  constructor(initial: GameState) {
    this.state = initial;
    this.seats = initial.players.filter((p) => !p.isNeutral).map((p) => p.id);
  }

  getState() { return this.state; }

  send(env: ActionEnvelope) {
    const res = reduce(this.state, env.action, env.actor);
    if (!res.ok) {
      this.emit({ kind: 'error', error: res.error, actionId: env.id });
      return;
    }
    this.state = res.state;
    this.emit({ kind: 'state', state: res.state, events: res.events, actionId: env.id });
  }

  subscribe(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  close() { this.listeners.clear(); }

  private emit(m: ServerMessage) {
    // async so a dispatch from inside a listener never re-enters synchronously
    queueMicrotask(() => this.listeners.forEach((l) => l(m)));
  }
}
