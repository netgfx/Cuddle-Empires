// Online play: a WebSocket client for the room server in /server.
//
//   const session = await connectOnline({ url: defaultServerUrl(), name: 'Rosie', color: '#E63946' });
//   session.onStarted((transport, initial) => useGame.getState().attachTransport(transport, initial));
//   const room = await session.createRoom({ setup: 'auto' }, 4);   // or session.joinRoom('ABCDE')
//   await session.addBot(); await session.startGame();
//
// The server is authoritative: OnlineTransport only forwards actions and relays the states it gets
// back. The session reconnects automatically (exponential backoff) using the token it was given, and
// the server answers a reconnect with a fresh snapshot of the running game.
import type { ActionEnvelope, GameSettings, GameState, PlayerId } from '../game/types';
import type { GameTransport, ServerMessage } from './transport';
import {
  PROTOCOL_VERSION,
  type ChatLine, type ClientBody, type RoomInfo, type RoomListing, type ServerMessage as WireMessage,
} from '../../server/protocol';

export type { ChatLine, RoomInfo, RoomListing, SeatInfo } from '../../server/protocol';

export const DEFAULT_SERVER_PORT = 8787;

/** `VITE_RISK_SERVER` if set, else ws(s)://<page host>:8787/ws. */
export function defaultServerUrl(): string {
  let env: string | undefined;
  try { env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_RISK_SERVER; } catch { env = undefined; }
  if (env) return env;
  const loc = typeof location !== 'undefined' ? location : undefined;
  if (!loc) return `ws://localhost:${DEFAULT_SERVER_PORT}/ws`;
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.hostname || 'localhost'}:${DEFAULT_SERVER_PORT}/ws`;
}

// ---------------------------------------------------------------- transport

export class OnlineTransport implements GameTransport {
  readonly mode = 'online' as const;
  /** Seats this client controls (updated in place after a reconnect). */
  readonly seats: PlayerId[];
  readonly gameId: string;
  private listeners = new Set<(m: ServerMessage) => void>();
  private closedFlag = false;
  private session: Session;

  /** @internal created by the session when the server sends `started`. */
  constructor(session: Session, gameId: string, seats: PlayerId[]) {
    this.session = session;
    this.gameId = gameId;
    this.seats = [...seats];
  }

  get closed() { return this.closedFlag; }

  send(env: ActionEnvelope) {
    if (this.closedFlag) return;
    if (!this.session.sendBody({ type: 'action', envelope: env })) {
      this.emit({ kind: 'error', error: 'Not connected to the server — reconnecting…', actionId: env.id });
    }
  }

  subscribe(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Detaches from the store. If this is the session's running game, also leaves the room (a bot takes the seat). */
  close() {
    if (this.closedFlag) return;
    this.closedFlag = true;
    this.listeners.clear();
    this.session.transportClosed(this);
  }

  /**
   * The local store drives `kind === 'bot'` players itself (BotDriver) — online, bots run on the
   * server, so every seat this client does not control is presented as 'remote'.
   */
  localize(state: GameState): GameState {
    return {
      ...state,
      players: state.players.map((p) => {
        if (p.isNeutral) return p;
        const kind = this.seats.includes(p.id) ? 'human' : 'remote';
        return p.kind === kind ? p : { ...p, kind };
      }),
    };
  }

  /** @internal */
  setSeats(seats: PlayerId[]) { this.seats.splice(0, this.seats.length, ...seats); }

  /** @internal */
  deliver(m: ServerMessage) {
    if (this.closedFlag) return;
    this.emit(m.kind === 'state' ? { ...m, state: this.localize(m.state) } : m);
  }

  private emit(m: ServerMessage) {
    queueMicrotask(() => this.listeners.forEach((l) => l(m)));
  }
}

// ---------------------------------------------------------------- session / lobby API

export type ConnectionStatus = 'connected' | 'reconnecting' | 'closed';

export interface OnlineSession {
  readonly clientId: string;
  readonly room: RoomInfo | null;
  readonly status: ConnectionStatus;
  /** The transport of the running game, if any. */
  readonly transport: OnlineTransport | null;
  createRoom(settings?: Partial<GameSettings>, maxPlayers?: number, isPublic?: boolean): Promise<RoomInfo>;
  joinRoom(code: string): Promise<RoomInfo>;
  listRooms(): Promise<RoomListing[]>;
  addBot(): Promise<RoomInfo>;
  kick(seat: PlayerId): Promise<RoomInfo>;
  setReady(ready: boolean): Promise<RoomInfo>;
  startGame(): Promise<RoomInfo>;
  chat(text: string): void;
  leave(): Promise<void>;
  onRoom(cb: (room: RoomInfo | null) => void): () => void;
  onChat(cb: (line: ChatLine) => void): () => void;
  /** Fires when a game starts (also immediately on subscribe if one is already running and unclaimed). */
  onStarted(cb: (transport: OnlineTransport, initial: GameState) => void): () => void;
  onError(cb: (error: string) => void): () => void;
  onStatus(cb: (status: ConnectionStatus) => void): () => void;
  /** Close the socket for good (no reconnect). */
  disconnect(): void;
}

export interface ConnectOptions {
  url?: string;
  name: string;
  color: string;
  /** WebSocket implementation (defaults to the global one; pass `ws` in older Node). */
  WebSocketImpl?: typeof WebSocket;
  /** Request timeout (default 10 s). */
  timeoutMs?: number;
  /** Persist the reconnect token in sessionStorage (default true). */
  persistToken?: boolean;
}

const TOKEN_KEY = 'risk.online.token';

function loadToken(url: string): string | undefined {
  try { return sessionStorage.getItem(`${TOKEN_KEY}:${url}`) ?? undefined; } catch { return undefined; }
}
function saveToken(url: string, token: string) {
  try { sessionStorage.setItem(`${TOKEN_KEY}:${url}`, token); } catch { /* storage unavailable */ }
}

type Pending = { resolve: (m: WireMessage) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

class Session implements OnlineSession {
  clientId = '';
  room: RoomInfo | null = null;
  status: ConnectionStatus = 'reconnecting';
  transport: OnlineTransport | null = null;

  private ws: WebSocket | null = null;
  private token: string | undefined;
  private attempt = 0;
  private userClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private rid = 0;
  private pending = new Map<string, Pending>();
  private startedClaimed = false;
  private readonly url: string;
  private readonly opts: ConnectOptions;
  private readonly WS: typeof WebSocket;
  private firstWelcome: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private subs = {
    room: new Set<(r: RoomInfo | null) => void>(),
    chat: new Set<(l: ChatLine) => void>(),
    started: new Set<(t: OnlineTransport, s: GameState) => void>(),
    error: new Set<(e: string) => void>(),
    status: new Set<(s: ConnectionStatus) => void>(),
  };

  constructor(opts: ConnectOptions) {
    this.opts = opts;
    this.url = opts.url || defaultServerUrl();
    const WS = opts.WebSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WS) throw new Error('No WebSocket implementation available.');
    this.WS = WS;
    this.token = opts.persistToken === false ? undefined : loadToken(this.url);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.firstWelcome = { resolve, reject };
      this.open();
    });
  }

  // -------------------------------------------------------------- socket

  private open() {
    let ws: WebSocket;
    try { ws = new this.WS(this.url); } catch (e) { this.onSocketGone(e instanceof Error ? e.message : String(e)); return; }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'hello', name: this.opts.name, color: this.opts.color, ...(this.token ? { token: this.token } : {}) }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      let msg: WireMessage;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); } catch { return; }
      this.onMessage(msg);
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4000) this.userClosed = true; // another tab/connection took over this identity
      this.onSocketGone(ev.reason || `connection closed (${ev.code})`);
    };
  }

  private onSocketGone(reason: string) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Disconnected from the server.')); }
    this.pending.clear();
    if (this.firstWelcome) {
      this.firstWelcome.reject(new Error(`Could not connect to ${this.url}: ${reason}`));
      this.firstWelcome = null;
      this.userClosed = true;
    }
    if (this.userClosed) { this.setStatus('closed'); return; }
    this.setStatus('reconnecting');
    const delay = Math.min(15_000, 500 * 2 ** this.attempt) * (0.75 + Math.random() * 0.5);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; if (!this.userClosed) this.open(); }, delay);
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.subs.status.forEach((cb) => cb(s));
  }

  /** @internal */
  sendBody(body: ClientBody, rid?: string): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 || this.status !== 'connected') return false;
    ws.send(JSON.stringify({ v: PROTOCOL_VERSION, ...body, ...(rid ? { rid } : {}) }));
    return true;
  }

  private request(body: ClientBody): Promise<WireMessage> {
    return new Promise((resolve, reject) => {
      const rid = `r${++this.rid}`;
      const timer = setTimeout(() => { this.pending.delete(rid); reject(new Error('The server did not answer in time.')); }, this.opts.timeoutMs ?? 10_000);
      this.pending.set(rid, { resolve, reject, timer });
      if (!this.sendBody(body, rid)) {
        clearTimeout(timer);
        this.pending.delete(rid);
        reject(new Error('Not connected to the server.'));
      }
    });
  }

  private async requestRoom(body: ClientBody): Promise<RoomInfo> {
    const m = await this.request(body);
    if (m.type !== 'room') throw new Error(`Unexpected answer "${m.type}".`);
    return m.room;
  }

  private onMessage(m: WireMessage) {
    if (m.rid && this.pending.has(m.rid)) {
      const p = this.pending.get(m.rid)!;
      this.pending.delete(m.rid);
      clearTimeout(p.timer);
      if (m.type === 'error') p.reject(new Error(m.error));
      else p.resolve(m);
      if (m.type === 'error' || m.type === 'rooms' || m.type === 'pong') return; // nothing else to do
    }
    switch (m.type) {
      case 'welcome':
        this.clientId = m.clientId;
        this.token = m.token;
        if (this.opts.persistToken !== false) saveToken(this.url, m.token);
        this.attempt = 0;
        this.setStatus('connected');
        if (!m.room && this.room) { this.room = null; this.detachTransport(); this.subs.room.forEach((cb) => cb(null)); }
        if (this.firstWelcome) { this.firstWelcome.resolve(); this.firstWelcome = null; }
        return;
      case 'room':
        this.room = m.room;
        this.subs.room.forEach((cb) => cb(m.room));
        return;
      case 'started': {
        const t = this.transport;
        if (t && !t.closed && t.gameId === m.gameId) {
          // reconnect snapshot of the game we are already showing
          t.setSeats(m.yourSeats);
          t.deliver({ kind: 'state', state: m.state, events: [] });
          return;
        }
        const nt = new OnlineTransport(this, m.gameId, m.yourSeats);
        this.transport = nt;
        this.startedClaimed = this.subs.started.size > 0;
        const initial = nt.localize(m.state);
        this.subs.started.forEach((cb) => cb(nt, initial));
        this.lastInitial = initial;
        return;
      }
      case 'state':
        if (this.transport) this.lastInitial = this.transport.localize(m.state);
        this.transport?.deliver({ kind: 'state', state: m.state, events: m.events, actionId: m.actionId });
        return;
      case 'error':
        if (m.actionId && this.transport && !this.transport.closed) this.transport.deliver({ kind: 'error', error: m.error, actionId: m.actionId });
        else this.subs.error.forEach((cb) => cb(m.error));
        return;
      case 'chat':
        this.subs.chat.forEach((cb) => cb(m.line));
        return;
      case 'left':
        this.room = null;
        this.detachTransport();
        this.subs.room.forEach((cb) => cb(null));
        return;
      default:
        return;
    }
  }

  private lastInitial: GameState | null = null;

  private detachTransport() {
    const t = this.transport;
    this.transport = null;
    if (t && !t.closed) t.deliver({ kind: 'error', error: 'You left the online game.' });
  }

  /** @internal */
  transportClosed(t: OnlineTransport) {
    if (this.transport !== t) return;
    this.transport = null;
    if (this.room) void this.leave().catch(() => undefined);
  }

  // -------------------------------------------------------------- public API

  createRoom(settings?: Partial<GameSettings>, maxPlayers?: number, isPublic?: boolean) {
    return this.requestRoom({ type: 'createRoom', settings, maxPlayers, isPublic });
  }
  joinRoom(code: string) { return this.requestRoom({ type: 'joinRoom', room: code.trim().toUpperCase() }); }
  async listRooms() {
    const m = await this.request({ type: 'listRooms' });
    return m.type === 'rooms' ? m.rooms : [];
  }
  addBot() { return this.requestRoom({ type: 'addBot' }); }
  kick(seat: PlayerId) { return this.requestRoom({ type: 'kick', seat }); }
  setReady(ready: boolean) { return this.requestRoom({ type: 'setReady', ready }); }
  startGame() { return this.requestRoom({ type: 'startGame' }); }
  chat(text: string) { this.sendBody({ type: 'chat', text }); }
  async leave() {
    await this.request({ type: 'leave' });
  }

  onRoom(cb: (room: RoomInfo | null) => void) { this.subs.room.add(cb); return () => { this.subs.room.delete(cb); }; }
  onChat(cb: (line: ChatLine) => void) { this.subs.chat.add(cb); return () => { this.subs.chat.delete(cb); }; }
  onError(cb: (e: string) => void) { this.subs.error.add(cb); return () => { this.subs.error.delete(cb); }; }
  onStatus(cb: (s: ConnectionStatus) => void) { this.subs.status.add(cb); return () => { this.subs.status.delete(cb); }; }
  onStarted(cb: (t: OnlineTransport, s: GameState) => void) {
    this.subs.started.add(cb);
    // A game that started (e.g. reconnect after a page reload) before anyone listened.
    const t = this.transport;
    if (t && !t.closed && !this.startedClaimed && this.lastInitial) {
      this.startedClaimed = true;
      const initial = this.lastInitial;
      queueMicrotask(() => cb(t, initial));
    }
    return () => { this.subs.started.delete(cb); };
  }

  disconnect() {
    this.userClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'bye');
    this.ws = null;
    this.setStatus('closed');
  }
}

/** Connects and says hello; resolves once the server welcomed us (rejects if the first connection fails). */
export async function connectOnline(opts: ConnectOptions & { url: string }): Promise<OnlineSession> {
  const s = new Session(opts);
  await s.start();
  return s;
}
