// Wire protocol between the room server (server/) and OnlineTransport (src/net/online.ts).
// Plain JSON over a WebSocket, one object per frame, every frame carries `v: 1`.
// Type-only module (plus a few constants) so both the browser bundle and Node can import it.
import type { ActionEnvelope, GameEvent, GameSettings, GameState, PlayerId } from '../src/game/types';

export const PROTOCOL_VERSION = 1 as const;

/** Room codes: 5 chars from an alphabet without look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;
export const TEAM_COLORS = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#34495E'] as const;

export type SeatKind = 'human' | 'bot';
export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface SeatInfo {
  /** Becomes the PlayerId in GameState (p1..p6). Stable once the game started. */
  seatId: PlayerId;
  name: string;
  color: string;
  kind: SeatKind;
  /** clientId of the human owning the seat (null for bots and taken-over seats). */
  ownerId: string | null;
  connected: boolean;
  ready: boolean;
  /** True when a disconnected / departed human's seat is being played by the server bot. */
  botControlled?: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  seats: SeatInfo[];
  phase: RoomPhase;
  maxPlayers: number;
  settings: Partial<GameSettings>;
  isPublic: boolean;
}

export interface RoomListing {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  phase: RoomPhase;
}

// ---------------------------------------------------------------- client → server

/** `rid` (optional) is echoed back on the direct answer (`room` / `rooms` / `error`) so a client can await it. */
export type ClientBody =
  | { type: 'hello'; name: string; color: string; token?: string }
  | { type: 'createRoom'; settings?: Partial<GameSettings>; maxPlayers?: number; isPublic?: boolean }
  | { type: 'joinRoom'; room: string }
  | { type: 'listRooms' }
  | { type: 'setReady'; ready?: boolean }
  | { type: 'addBot' }
  | { type: 'kick'; seat: PlayerId }
  | { type: 'startGame' }
  | { type: 'action'; envelope: ActionEnvelope }
  | { type: 'chat'; text: string }
  | { type: 'leave' }
  | { type: 'ping'; t?: number };

export type ClientMessage = ClientBody & { v: typeof PROTOCOL_VERSION; rid?: string };

// ---------------------------------------------------------------- server → client

export interface ChatLine { from: string; name: string; text: string; at: number; system?: boolean }

export type ServerBody =
  | { type: 'welcome'; clientId: string; token: string; room: string | null }
  | { type: 'room'; room: RoomInfo }
  | { type: 'rooms'; rooms: RoomListing[] }
  /** Sent when a game starts and again as a fresh snapshot after a reconnect. */
  | { type: 'started'; gameId: string; state: GameState; yourSeats: PlayerId[] }
  | { type: 'state'; state: GameState; events: GameEvent[]; actionId?: string }
  | { type: 'error'; error: string; actionId?: string }
  | { type: 'chat'; line: ChatLine }
  /** You are no longer in the room (left, kicked or the room was closed). */
  | { type: 'left'; room: string; reason: 'left' | 'kicked' | 'closed' }
  | { type: 'pong'; t?: number };

export type ServerMessage = ServerBody & { v: typeof PROTOCOL_VERSION; rid?: string };
