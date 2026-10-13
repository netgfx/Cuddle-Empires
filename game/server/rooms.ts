// Room manager: lobby, seats, the authoritative GameState of every room, server-side bots,
// reconnects and seat take-over. Transport-agnostic — app.ts plugs WebSockets into it.
import { randomBytes, randomInt } from 'node:crypto';
import { chooseBotAction } from '../src/game/bot';
import { createGame, legalActions, reduce } from '../src/game/engine';
import type { Action, GameEvent, GameSettings, GameState, PlayerId, ReduceResult } from '../src/game/types';
import { eventsFor, viewFor } from './hidden';
import {
  MAX_CHAT_LENGTH, MAX_NAME_LENGTH, PROTOCOL_VERSION, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, TEAM_COLORS,
  type ChatLine, type ClientMessage, type RoomInfo, type RoomListing, type RoomPhase, type SeatInfo, type ServerBody,
} from './protocol';

export interface RoomConfig {
  /** Base think time of a server bot before each action. */
  botDelayMs: number;
  /** Extra wait per `battle` event in the previous update so clients can animate the dice. */
  botBattleDelayMs: number;
  /** Upper bound for a single bot wait. */
  botMaxDelayMs: number;
  /** A disconnected human's seat is handed to the bot after this long. */
  seatTimeoutMs: number;
  /** A room with no connected human is deleted after this long. */
  roomTtlMs: number;
  maxRooms: number;
  log: boolean;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  botDelayMs: 600,
  botBattleDelayMs: 1500,
  botMaxDelayMs: 12000,
  seatTimeoutMs: 120_000,
  roomTtlMs: 600_000,
  maxRooms: 1000,
  log: false,
};

/** What the manager needs from a connection. */
export interface Conn {
  send(json: string): void;
  close(code?: number, reason?: string): void;
}

export interface ConnHandle {
  message(msg: ClientMessage): void;
  closed(): void;
}

interface Client {
  id: string;
  token: string;
  name: string;
  color: string;
  conn: Conn | null;
  room: string | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  hostId: string;
  maxPlayers: number;
  settings: Partial<GameSettings>;
  isPublic: boolean;
  phase: RoomPhase;
  seats: SeatInfo[];
  members: Set<string>;
  state: GameState | null;
  gameId: string | null;
  botTimer: ReturnType<typeof setTimeout> | null;
  deleteTimer: ReturnType<typeof setTimeout> | null;
  seatTimers: Map<string, ReturnType<typeof setTimeout>>;
  chat: ChatLine[];
}

const BOT_NAMES = ['Biscuit', 'Waffles', 'Pickles', 'Noodle', 'Mochi', 'Pudding', 'Sprout', 'Bean'];

class Reject extends Error {}
const reject = (msg: string): never => { throw new Reject(msg); };

// oxlint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanName(x: unknown): string {
  const s = typeof x === 'string' ? x.replace(CONTROL, '').replace(/[<>]/g, '').trim().slice(0, MAX_NAME_LENGTH) : '';
  return s || 'Player';
}
const isColor = (x: unknown): x is string => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);

export function sanitizeSettings(x: unknown): Partial<GameSettings> {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Partial<GameSettings> = {};
  if (o.setup === 'manual' || o.setup === 'auto') out.setup = o.setup;
  if (o.cardProgression === 'classic' || o.cardProgression === 'expert') out.cardProgression = o.cardProgression;
  if (o.fortify === 'adjacent' || o.fortify === 'connected') out.fortify = o.fortify;
  return out;
}

export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return s;
}

export class RoomManager {
  readonly cfg: RoomConfig;
  private clients = new Map<string, Client>();
  private byToken = new Map<string, Client>();
  private rooms = new Map<string, Room>();

  constructor(cfg: Partial<RoomConfig> = {}) {
    this.cfg = { ...DEFAULT_ROOM_CONFIG, ...cfg };
  }

  get stats() { return { rooms: this.rooms.size, clients: this.clients.size, connected: [...this.clients.values()].filter((c) => c.conn).length }; }

  listRooms(): RoomListing[] {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.phase === 'lobby')
      .map((r) => ({
        code: r.code,
        host: this.clients.get(r.hostId)?.name ?? '?',
        players: r.seats.length,
        maxPlayers: r.maxPlayers,
        phase: r.phase,
      }));
  }

  /** Test / debug helper: the full authoritative state of a room. */
  debugRoom(code: string): { state: GameState | null; seats: SeatInfo[]; phase: RoomPhase } | null {
    const r = this.rooms.get(code);
    return r ? { state: r.state, seats: r.seats, phase: r.phase } : null;
  }

  dispose() {
    for (const r of this.rooms.values()) this.clearRoomTimers(r);
    for (const c of this.clients.values()) if (c.gcTimer) clearTimeout(c.gcTimer);
    this.rooms.clear();
    this.clients.clear();
    this.byToken.clear();
  }

  attach(conn: Conn): ConnHandle {
    let client: Client | null = null;
    const send = (body: ServerBody, rid?: string) => conn.send(JSON.stringify({ v: PROTOCOL_VERSION, ...body, ...(rid ? { rid } : {}) }));
    return {
      message: (msg) => {
        const rid = typeof msg.rid === 'string' ? msg.rid.slice(0, 64) : undefined;
        try {
          if (msg.type === 'ping') { send({ type: 'pong', t: typeof msg.t === 'number' ? msg.t : undefined }, rid); return; }
          if (msg.type === 'hello') { client = this.hello(conn, msg, rid); return; }
          if (!client || client.conn !== conn) reject('Say hello first.');
          this.handle(client!, msg, rid);
        } catch (e) {
          if (!(e instanceof Reject)) {
            console.error('[rooms] handler crashed', e);
          }
          const actionId = msg.type === 'action' && typeof msg.envelope?.id === 'string' ? msg.envelope.id : undefined;
          send({ type: 'error', error: e instanceof Reject ? e.message : 'Internal server error.', ...(actionId ? { actionId } : {}) }, rid);
        }
      },
      closed: () => {
        if (client && client.conn === conn) this.disconnected(client);
      },
    };
  }

  // ---------------------------------------------------------------- plumbing

  private send(c: Client, body: ServerBody, rid?: string) {
    c.conn?.send(JSON.stringify({ v: PROTOCOL_VERSION, ...body, ...(rid ? { rid } : {}) }));
  }

  private log(...a: unknown[]) { if (this.cfg.log) console.log('[rooms]', ...a); }

  private roomInfo(r: Room): RoomInfo {
    return {
      code: r.code, hostId: r.hostId, phase: r.phase, maxPlayers: r.maxPlayers, settings: r.settings, isPublic: r.isPublic,
      seats: r.seats.map((s) => ({ ...s })),
    };
  }

  private broadcastRoom(r: Room) {
    const info = this.roomInfo(r);
    for (const id of r.members) { const c = this.clients.get(id); if (c) this.send(c, { type: 'room', room: info }); }
  }

  private ownedSeats(r: Room, clientId: string): PlayerId[] {
    return r.seats.filter((s) => s.ownerId === clientId).map((s) => s.seatId);
  }

  private sendSnapshot(r: Room, c: Client) {
    if (!r.state || !r.gameId) return;
    const seats = this.ownedSeats(r, c.id);
    this.send(c, { type: 'started', gameId: r.gameId, state: viewFor(r.state, seats), yourSeats: seats });
  }

  private requireRoom(c: Client): Room {
    const r = c.room ? this.rooms.get(c.room) : undefined;
    if (!r) return reject('You are not in a room.');
    return r;
  }

  private requireHost(c: Client): Room {
    const r = this.requireRoom(c);
    if (r.hostId !== c.id) reject('Only the host can do that.');
    return r;
  }

  // ---------------------------------------------------------------- connection lifecycle

  private hello(conn: Conn, msg: Extract<ClientMessage, { type: 'hello' }>, rid?: string): Client {
    let c = typeof msg.token === 'string' ? this.byToken.get(msg.token) : undefined;
    if (c) {
      if (c.conn && c.conn !== conn) c.conn.close(4000, 'Replaced by a newer connection');
      if (c.gcTimer) { clearTimeout(c.gcTimer); c.gcTimer = null; }
      c.conn = conn;
      if (!c.room) { c.name = cleanName(msg.name); if (isColor(msg.color)) c.color = msg.color; }
    } else {
      c = {
        id: randomBytes(8).toString('hex'),
        token: randomBytes(24).toString('base64url'),
        name: cleanName(msg.name),
        color: isColor(msg.color) ? msg.color : TEAM_COLORS[0],
        conn, room: null, gcTimer: null,
      };
      this.clients.set(c.id, c);
      this.byToken.set(c.token, c);
    }
    const room = c.room ? this.rooms.get(c.room) : undefined;
    if (c.room && !room) c.room = null;
    this.send(c, { type: 'welcome', clientId: c.id, token: c.token, room: c.room }, rid);
    if (room) this.rejoin(room, c);
    this.log('hello', c.id, c.name, room ? `→ ${room.code}` : '');
    return c;
  }

  private rejoin(r: Room, c: Client) {
    const t = r.seatTimers.get(c.id);
    if (t) { clearTimeout(t); r.seatTimers.delete(c.id); }
    for (const s of r.seats) {
      if (s.ownerId !== c.id) continue;
      s.connected = true;
      if (s.botControlled) this.setBotControl(r, s, false);
    }
    this.checkEmpty(r);
    this.broadcastRoom(r);
    if (r.chat.length) for (const line of r.chat.slice(-20)) this.send(c, { type: 'chat', line });
    this.sendSnapshot(r, c);
    this.scheduleBot(r);
  }

  private disconnected(c: Client) {
    c.conn = null;
    const r = c.room ? this.rooms.get(c.room) : undefined;
    if (r) {
      for (const s of r.seats) if (s.ownerId === c.id) s.connected = false;
      const old = r.seatTimers.get(c.id);
      if (old) clearTimeout(old);
      r.seatTimers.set(c.id, setTimeout(() => this.seatTimedOut(r, c), this.cfg.seatTimeoutMs));
      this.broadcastRoom(r);
      this.checkEmpty(r);
    }
    this.scheduleClientGc(c);
    this.log('disconnected', c.id);
  }

  private scheduleClientGc(c: Client) {
    if (c.gcTimer) clearTimeout(c.gcTimer);
    c.gcTimer = setTimeout(() => {
      c.gcTimer = null;
      if (c.conn || (c.room && this.rooms.has(c.room))) return;
      this.clients.delete(c.id);
      this.byToken.delete(c.token);
    }, this.cfg.roomTtlMs + this.cfg.seatTimeoutMs);
  }

  private seatTimedOut(r: Room, c: Client) {
    r.seatTimers.delete(c.id);
    if (c.conn || c.room !== r.code || !this.rooms.has(r.code)) return;
    this.log('seat timeout', c.id, r.code);
    if (r.phase === 'lobby') { this.leaveRoom(c, 'left'); return; }
    // Keep ownership so the player can reclaim the seat on reconnect, but let the bot play it meanwhile.
    for (const s of r.seats) if (s.ownerId === c.id && !s.botControlled) this.setBotControl(r, s, true);
    this.systemChat(r, `${c.name} timed out — a bot takes over until they return.`);
    this.broadcastRoom(r);
    this.scheduleBot(r);
  }

  private setBotControl(r: Room, s: SeatInfo, on: boolean) {
    s.botControlled = on || undefined;
    if (r.state) {
      const kind = on || s.kind === 'bot' ? 'bot' : 'human';
      r.state = { ...r.state, players: r.state.players.map((p) => (p.id === s.seatId ? { ...p, kind } : p)) };
    }
  }

  // ---------------------------------------------------------------- messages

  private handle(c: Client, msg: ClientMessage, rid?: string) {
    switch (msg.type) {
      case 'createRoom': return this.createRoom(c, msg, rid);
      case 'joinRoom': return this.joinRoom(c, msg.room, rid);
      case 'listRooms': return this.send(c, { type: 'rooms', rooms: this.listRooms() }, rid);
      case 'setReady': {
        const r = this.requireRoom(c);
        if (r.phase !== 'lobby') reject('The game already started.');
        for (const s of r.seats) if (s.ownerId === c.id) s.ready = typeof msg.ready === 'boolean' ? msg.ready : !s.ready;
        this.broadcastRoom(r);
        return this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
      }
      case 'addBot': {
        const r = this.requireHost(c);
        if (r.phase !== 'lobby') reject('Bots can only be added in the lobby.');
        if (r.seats.length >= r.maxPlayers) reject('The room is full.');
        const used = new Set(r.seats.map((s) => s.name));
        const name = BOT_NAMES.find((n) => !used.has(`Bot ${n}`)) ?? 'Buddy';
        r.seats.push({ seatId: '', name: `Bot ${name}`, color: this.freeColor(r), kind: 'bot', ownerId: null, connected: true, ready: true });
        this.renumber(r);
        this.broadcastRoom(r);
        return this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
      }
      case 'kick': return this.kick(c, msg.seat, rid);
      case 'startGame': return this.startGame(c, rid);
      case 'action': return this.action(c, msg.envelope);
      case 'chat': {
        const r = this.requireRoom(c);
        const text = typeof msg.text === 'string' ? msg.text.replace(CONTROL, ' ').trim().slice(0, MAX_CHAT_LENGTH) : '';
        if (!text) reject('Empty message.');
        this.pushChat(r, { from: c.id, name: c.name, text, at: Date.now() });
        return;
      }
      case 'leave': {
        if (c.room) this.leaveRoom(c, 'left', rid);
        else this.send(c, { type: 'left', room: '', reason: 'left' }, rid);
        return;
      }
      default: reject(`Unknown message type "${String((msg as { type?: unknown }).type)}".`);
    }
  }

  private freeColor(r: Room, wanted?: string): string {
    const used = new Set(r.seats.map((s) => s.color.toLowerCase()));
    if (wanted && !used.has(wanted.toLowerCase())) return wanted;
    return TEAM_COLORS.find((col) => !used.has(col.toLowerCase())) ?? TEAM_COLORS[r.seats.length % TEAM_COLORS.length];
  }

  /** Lobby seat ids are positional (p1..pN) until the game starts. */
  private renumber(r: Room) { r.seats.forEach((s, i) => { s.seatId = `p${i + 1}`; }); }

  private createRoom(c: Client, msg: Extract<ClientMessage, { type: 'createRoom' }>, rid?: string) {
    if (this.rooms.size >= this.cfg.maxRooms) reject('The server is full, try again later.');
    if (c.room) this.leaveRoom(c, 'left');
    let code = makeRoomCode();
    while (this.rooms.has(code)) code = makeRoomCode();
    const maxPlayers = Math.min(6, Math.max(2, Number.isInteger(msg.maxPlayers) ? (msg.maxPlayers as number) : 6));
    const r: Room = {
      code, hostId: c.id, maxPlayers, settings: sanitizeSettings(msg.settings), isPublic: msg.isPublic !== false,
      phase: 'lobby', seats: [], members: new Set([c.id]), state: null, gameId: null,
      botTimer: null, deleteTimer: null, seatTimers: new Map(), chat: [],
    };
    r.seats.push({ seatId: 'p1', name: c.name, color: c.color, kind: 'human', ownerId: c.id, connected: true, ready: false });
    this.rooms.set(code, r);
    c.room = code;
    this.log('room created', code, 'by', c.id);
    this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
  }

  private joinRoom(c: Client, rawCode: unknown, rid?: string) {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const r = this.rooms.get(code);
    if (!r) return reject('Room not found.');
    if (r.members.has(c.id)) {
      this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
      this.sendSnapshot(r, c);
      return;
    }
    if (r.phase !== 'lobby') reject('That game has already started.');
    if (r.seats.length >= r.maxPlayers) reject('The room is full.');
    if (c.room) this.leaveRoom(c, 'left');
    r.members.add(c.id);
    c.room = code;
    r.seats.push({ seatId: '', name: c.name, color: this.freeColor(r, c.color), kind: 'human', ownerId: c.id, connected: true, ready: false });
    this.renumber(r);
    this.checkEmpty(r);
    this.broadcastRoom(r);
    this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
    for (const line of r.chat.slice(-20)) this.send(c, { type: 'chat', line });
  }

  private kick(c: Client, seatId: unknown, rid?: string) {
    const r = this.requireHost(c);
    const seat = r.seats.find((s) => s.seatId === seatId);
    if (!seat) return reject('No such seat.');
    if (seat.ownerId === c.id) reject('You cannot kick yourself — use leave.');
    const owner = seat.ownerId ? this.clients.get(seat.ownerId) : undefined;
    if (owner) {
      this.leaveRoom(owner, 'kicked');
    } else if (r.phase === 'lobby') {
      r.seats = r.seats.filter((s) => s !== seat);
      this.renumber(r);
      this.broadcastRoom(r);
    } else {
      reject('Bots cannot be removed during a game.');
    }
    this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
  }

  private leaveRoom(c: Client, reason: 'left' | 'kicked', rid?: string) {
    const r = c.room ? this.rooms.get(c.room) : undefined;
    c.room = null;
    if (!r) return;
    r.members.delete(c.id);
    const t = r.seatTimers.get(c.id);
    if (t) { clearTimeout(t); r.seatTimers.delete(c.id); }
    if (r.phase === 'lobby') {
      r.seats = r.seats.filter((s) => s.ownerId !== c.id);
      this.renumber(r);
    } else {
      for (const s of r.seats) {
        if (s.ownerId !== c.id) continue;
        s.ownerId = null;
        s.kind = 'bot';
        s.connected = true;
        this.setBotControl(r, s, true);
      }
      if (r.phase === 'playing') this.systemChat(r, `${c.name} left — a bot takes over.`);
    }
    if (r.hostId === c.id) {
      const next = r.seats.find((s) => s.ownerId && r.members.has(s.ownerId))?.ownerId ?? [...r.members][0];
      if (next) r.hostId = next;
    }
    this.send(c, { type: 'left', room: r.code, reason }, rid);
    if (!c.conn) this.scheduleClientGc(c);
    this.log('left', c.id, r.code, reason);
    if (r.members.size === 0 && r.phase === 'lobby') { this.deleteRoom(r); return; }
    this.broadcastRoom(r);
    this.checkEmpty(r);
    this.scheduleBot(r);
  }

  private startGame(c: Client, rid?: string) {
    const r = this.requireHost(c);
    if (r.phase === 'playing') reject('The game is already running.');
    if (r.seats.length < 2) reject('You need at least 2 players.');
    const notReady = r.seats.filter((s) => s.kind === 'human' && s.ownerId !== c.id && !s.ready && !s.botControlled);
    if (notReady.length) reject(`Waiting for ${notReady.map((s) => s.name).join(', ')} to be ready.`);
    const seed = randomInt(0, 2 ** 31 - 1);
    const state = createGame(
      r.seats.map((s) => ({ id: s.seatId, name: s.name, color: s.color, kind: s.kind === 'bot' || s.botControlled ? 'bot' : 'human' })),
      r.settings,
      seed,
    );
    r.state = state;
    r.gameId = randomBytes(6).toString('hex');
    r.phase = 'playing';
    this.log('game started', r.code, r.gameId);
    this.broadcastRoom(r);
    for (const id of r.members) { const m = this.clients.get(id); if (m) this.sendSnapshot(r, m); }
    if (rid) this.send(c, { type: 'room', room: this.roomInfo(r) }, rid);
    this.scheduleBot(r);
  }

  private action(c: Client, env: unknown) {
    const r = this.requireRoom(c);
    const e = (env && typeof env === 'object' ? env : {}) as { action?: unknown; actor?: unknown; id?: unknown };
    const actionId = typeof e.id === 'string' ? e.id.slice(0, 64) : undefined;
    const err = (error: string) => this.send(c, { type: 'error', error, ...(actionId ? { actionId } : {}) });
    if (r.phase !== 'playing' || !r.state) return err('No game is running.');
    if (!e.action || typeof e.action !== 'object' || typeof e.actor !== 'string') return err('Malformed action.');
    const seat = r.seats.find((s) => s.seatId === e.actor);
    if (!seat || seat.ownerId !== c.id || seat.kind !== 'human' || seat.botControlled) return err(`You do not control seat "${e.actor}".`);
    const res = reduce(r.state, e.action as Action, e.actor);
    if (!res.ok) return err(res.error);
    this.apply(r, res, actionId);
  }

  private apply(r: Room, res: Extract<ReduceResult, { ok: true }>, actionId?: string) {
    // reduce() copies players, so bot take-over kinds set by setBotControl carry over.
    r.state = res.state;
    for (const id of r.members) {
      const m = this.clients.get(id);
      if (!m?.conn) continue;
      const seats = this.ownedSeats(r, m.id);
      this.send(m, { type: 'state', state: viewFor(res.state, seats), events: eventsFor(res.events, seats), ...(actionId ? { actionId } : {}) });
    }
    if (res.state.phase === 'gameOver') {
      r.phase = 'finished';
      this.clearBot(r);
      this.broadcastRoom(r);
      return;
    }
    this.scheduleBot(r, res.events);
  }

  // ---------------------------------------------------------------- bots

  private clearBot(r: Room) { if (r.botTimer) { clearTimeout(r.botTimer); r.botTimer = null; } }

  private botTurnSeat(r: Room): SeatInfo | null {
    if (r.phase !== 'playing' || !r.state || r.state.phase === 'gameOver') return null;
    // Pause when no human is connected (the room will be collected).
    if (![...r.members].some((id) => this.clients.get(id)?.conn)) return null;
    const cur = r.state.players[r.state.current];
    const seat = r.seats.find((s) => s.seatId === cur.id);
    return seat && (seat.kind === 'bot' || seat.botControlled) ? seat : null;
  }

  private scheduleBot(r: Room, lastEvents: readonly GameEvent[] = []) {
    if (r.botTimer || !this.botTurnSeat(r)) return;
    const battles = lastEvents.filter((e) => e.type === 'battle').length;
    const delay = Math.min(this.cfg.botMaxDelayMs, this.cfg.botDelayMs + this.cfg.botBattleDelayMs * battles);
    r.botTimer = setTimeout(() => { r.botTimer = null; this.runBot(r); }, delay);
  }

  private runBot(r: Room) {
    if (!this.rooms.has(r.code)) return;
    const seat = this.botTurnSeat(r);
    if (!seat || !r.state) return;
    const state = r.state;
    const id = seat.seatId;
    let res: ReduceResult = { ok: false, error: 'no action' };
    try { res = reduce(state, chooseBotAction(state, id), id); } catch (e) { console.error('[rooms] bot crashed', e); }
    if (!res.ok) {
      for (const a of [...legalActions(state, id), { type: 'endTurn' } as Action, { type: 'resign' } as Action]) {
        res = reduce(state, a, id);
        if (res.ok) break;
      }
    }
    if (res.ok) this.apply(r, res);
  }

  // ---------------------------------------------------------------- chat + cleanup

  private pushChat(r: Room, line: ChatLine) {
    r.chat.push(line);
    if (r.chat.length > 50) r.chat.splice(0, r.chat.length - 50);
    for (const id of r.members) { const m = this.clients.get(id); if (m) this.send(m, { type: 'chat', line }); }
  }

  private systemChat(r: Room, text: string) {
    this.pushChat(r, { from: '', name: 'Server', text, at: Date.now(), system: true });
  }

  private checkEmpty(r: Room) {
    const anyone = [...r.members].some((id) => this.clients.get(id)?.conn);
    if (anyone) {
      if (r.deleteTimer) { clearTimeout(r.deleteTimer); r.deleteTimer = null; }
    } else if (!r.deleteTimer) {
      this.clearBot(r);
      r.deleteTimer = setTimeout(() => this.deleteRoom(r), this.cfg.roomTtlMs);
    }
  }

  private clearRoomTimers(r: Room) {
    this.clearBot(r);
    if (r.deleteTimer) clearTimeout(r.deleteTimer);
    r.deleteTimer = null;
    for (const t of r.seatTimers.values()) clearTimeout(t);
    r.seatTimers.clear();
  }

  private deleteRoom(r: Room) {
    this.clearRoomTimers(r);
    for (const id of r.members) {
      const m = this.clients.get(id);
      if (m && m.room === r.code) { m.room = null; this.send(m, { type: 'left', room: r.code, reason: 'closed' }); }
    }
    this.rooms.delete(r.code);
    this.log('room deleted', r.code);
  }
}
