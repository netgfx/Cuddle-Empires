// Integration test: real server on a random port, real `ws` clients, real games.
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { chooseBotAction } from '../src/game/bot';
import type { GameState, PlayerId } from '../src/game/types';
import { startServer, type RunningServer } from './app';
import type { ClientBody, RoomInfo, ServerMessage } from './protocol';

process.env.BOT_DELAY_MS = '0';

type Msg = ServerMessage;

class TestClient {
  ws!: WebSocket;
  msgs: Msg[] = [];
  private waiters: (() => void)[] = [];
  clientId = '';
  token = '';
  seats: PlayerId[] = [];
  state: GameState | null = null;
  versions: number[] = [];
  autoplay = false;
  sent = 0;
  private actedVersion = -1;
  violations: string[] = [];

  url: string;
  name: string;
  color: string;
  constructor(url: string, name: string, color: string) { this.url = url; this.name = name; this.color = color; }

  async connect(token?: string) {
    this.ws = new WebSocket(this.url);
    this.ws.on('message', (d) => this.onMessage(JSON.parse(d.toString()) as Msg));
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    const mark = this.msgs.length;
    this.send({ type: 'hello', name: this.name, color: this.color, token });
    const w = await this.waitFor((m) => m.type === 'welcome', mark);
    if (w.type === 'welcome') { this.clientId = w.clientId; this.token = w.token; }
    return w;
  }

  send(body: ClientBody, rid?: string) { this.ws.send(JSON.stringify({ v: 1, ...body, ...(rid ? { rid } : {}) })); }

  close() { return new Promise<void>((res) => { if (this.ws.readyState === WebSocket.CLOSED) res(); else { this.ws.once('close', () => res()); this.ws.close(); } }); }

  private onMessage(m: Msg) {
    this.msgs.push(m);
    if (m.type === 'started') { this.seats = m.yourSeats; this.state = m.state; this.checkHidden(m.state); this.maybePlay(); }
    if (m.type === 'state') {
      this.state = m.state;
      this.versions.push(m.state.version);
      this.checkHidden(m.state);
      for (const e of m.events) if (e.type === 'cardDrawn' && !this.seats.includes(e.player) && e.card !== '') this.violations.push(`saw ${e.player}'s drawn card`);
      this.maybePlay();
    }
    this.waiters.splice(0).forEach((w) => w());
  }

  private checkHidden(s: GameState) {
    if (s.rng !== 0) this.violations.push('rng leaked');
    if (!s.deck.every((c) => c.startsWith('hidden-'))) this.violations.push('deck leaked');
    for (const p of s.players) {
      const mine = this.seats.includes(p.id);
      for (const c of p.cards) {
        if (!mine && !c.startsWith('hidden-')) this.violations.push(`saw ${p.id}'s card ${c}`);
        if (mine && c.startsWith('hidden-')) this.violations.push(`own card hidden ${c}`);
      }
    }
  }

  private maybePlay() {
    const s = this.state;
    if (!this.autoplay || !s || s.phase === 'gameOver' || this.actedVersion === s.version) return;
    const me = s.players[s.current].id;
    if (!this.seats.includes(me)) return;
    this.actedVersion = s.version;
    this.sent++;
    this.send({ type: 'action', envelope: { action: chooseBotAction(s, me), actor: me, id: `a${this.sent}` } });
  }

  /** Resolves with the first message at index >= from matching pred. */
  waitFor(pred: (m: Msg) => boolean, from = 0, timeoutMs = 5000): Promise<Msg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${this.name}: timeout waiting (got ${this.msgs.slice(from).map((m) => m.type).join(',')})`)), timeoutMs);
      const check = () => {
        const hit = this.msgs.slice(from).find(pred);
        if (hit) { clearTimeout(t); resolve(hit); } else this.waiters.push(check);
      };
      check();
    });
  }

  async request(body: ClientBody): Promise<Msg> {
    const rid = `r${Math.random().toString(36).slice(2)}`;
    this.send(body, rid);
    const m = await this.waitFor((x) => x.rid === rid);
    if (m.type === 'error') throw new Error(m.error);
    return m;
  }

  async room(body: ClientBody): Promise<RoomInfo> {
    const m = await this.request(body);
    if (m.type !== 'room') throw new Error(`expected room, got ${m.type}`);
    return m.room;
  }
}

let srv: RunningServer | null = null;
const clients: TestClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) await c.close().catch(() => undefined);
  await srv?.close();
  srv = null;
});

async function setup(opts: Parameters<typeof startServer>[0] = {}) {
  srv = await startServer({ port: 0, host: '127.0.0.1', botDelayMs: Number(process.env.BOT_DELAY_MS), botBattleDelayMs: 0, rateLimit: 1000, ...opts });
  const a = new TestClient(srv.url, 'Alice', '#E63946');
  const b = new TestClient(srv.url, 'Bob', '#E63946'); // same colour on purpose → server picks another
  clients.push(a, b);
  await a.connect();
  await b.connect();
  const created = await a.room({ type: 'createRoom', settings: { setup: 'auto' }, maxPlayers: 4 });
  expect(created.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  const listed = await a.request({ type: 'listRooms' });
  expect(listed.type === 'rooms' && listed.rooms.some((r) => r.code === created.code)).toBe(true);
  const joined = await b.room({ type: 'joinRoom', room: created.code.toLowerCase() });
  expect(joined.seats).toHaveLength(2);
  expect(new Set(joined.seats.map((s) => s.color)).size).toBe(2);
  await expect(b.room({ type: 'addBot' })).rejects.toThrow(/host/);
  await a.room({ type: 'addBot' });
  await expect(a.room({ type: 'startGame' })).rejects.toThrow(/ready/);
  await b.room({ type: 'setReady', ready: true });
  const ma = a.msgs.length, mb = b.msgs.length;
  const room = await a.room({ type: 'startGame' });
  expect(room.phase).toBe('playing');
  const sa = await a.waitFor((m) => m.type === 'started', ma);
  const sb = await b.waitFor((m) => m.type === 'started', mb);
  if (sa.type !== 'started' || sb.type !== 'started') throw new Error('no start');
  const seatA = room.seats.find((s) => s.ownerId === a.clientId)!.seatId;
  const seatB = room.seats.find((s) => s.ownerId === b.clientId)!.seatId;
  const seatBot = room.seats.find((s) => s.kind === 'bot')!.seatId;
  expect(sa.yourSeats).toEqual([seatA]);
  expect(sb.yourSeats).toEqual([seatB]);
  expect(sa.state.players.map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
  return { a, b, code: room.code, seatA, seatB, seatBot };
}

async function waitUntil(fn: () => boolean, timeoutMs = 20000, label = 'condition') {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('room server', () => {
  it('health + rooms endpoints', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1' });
    const base = `http://127.0.0.1:${srv.port}`;
    const h = (await (await fetch(`${base}/health`)).json()) as { ok: boolean };
    expect(h.ok).toBe(true);
    const r = (await (await fetch(`${base}/rooms`)).json()) as { rooms: unknown[] };
    expect(r.rooms).toEqual([]);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it('plays a full 2 humans + 1 bot game with consistent, hidden-information-safe broadcasts', async () => {
    const { a, b, code, seatA, seatB, seatBot } = await setup();

    // wrong seat (someone else's, and the bot's) is rejected, only to the sender
    const mb = b.msgs.length;
    for (const actor of [seatB, seatBot]) {
      const m = a.msgs.length;
      a.send({ type: 'action', envelope: { action: { type: 'endTurn' }, actor, id: `bad-${actor}` } });
      const err = await a.waitFor((x) => x.type === 'error' && x.actionId === `bad-${actor}`, m);
      expect(err.type === 'error' && err.error).toMatch(/do not control/);
    }
    expect(b.msgs.slice(mb).some((x) => x.type === 'error')).toBe(false);

    a.autoplay = true;
    b.autoplay = true;
    // kick the loop off if it is already one of our turns
    for (const c of [a, b]) c.send({ type: 'ping' });
    (a as unknown as { maybePlay(): void }).maybePlay();
    (b as unknown as { maybePlay(): void }).maybePlay();

    const server = srv!;
    await waitUntil(() => server.manager.debugRoom(code)?.state?.phase === 'gameOver' || a.sent + b.sent > 6000, 60000, 'game over').catch((e) => {
      const st = server.manager.debugRoom(code)!.state!;
      console.log('STALL', st.version, st.phase, st.players[st.current].id, a.sent, b.sent, JSON.stringify(a.msgs.filter((m) => m.type === 'error').slice(-3)), JSON.stringify(b.msgs.filter((m) => m.type === 'error').slice(-3)), a.state?.version, b.state?.version);
      throw e;
    });
    await waitUntil(() => a.state?.version === server.manager.debugRoom(code)!.state!.version && b.state?.version === a.state?.version, 5000, 'clients caught up');

    const full = server.manager.debugRoom(code)!;
    expect(full.state!.phase).toBe('gameOver');
    expect(full.phase).toBe('finished');
    expect(a.versions.length).toBeGreaterThan(20);
    expect(a.versions).toEqual(b.versions);
    // strictly increasing, no gaps
    a.versions.forEach((v, i) => { if (i) expect(v).toBe(a.versions[i - 1] + 1); });
    expect(a.violations).toEqual([]);
    expect(b.violations).toEqual([]);
    // the views agree with the authoritative state on everything public
    for (const c of [a, b]) {
      expect(c.state!.territories).toEqual(full.state!.territories);
      expect(c.state!.players.map((p) => p.cards.length)).toEqual(full.state!.players.map((p) => p.cards.length));
      expect(c.state!.deck.length).toBe(full.state!.deck.length);
    }
    // the bot really played
    expect(a.msgs.some((m) => m.type === 'state' && m.events.some((e) => 'player' in e && e.player === seatBot))).toBe(true);
    expect(a.sent).toBeGreaterThan(0);
    expect(b.sent).toBeGreaterThan(0);
    expect([seatA, seatB, seatBot]).toContain(full.state!.winner);
  }, 90000);

  it('a disconnected client reconnects with its token and gets its seat + a snapshot', async () => {
    const { a, b, code, seatB } = await setup();
    const oldToken = b.token;
    const oldId = b.clientId;
    const ma = a.msgs.length;
    const versionAtDisconnect = srv!.manager.debugRoom(code)!.state!.version;
    await b.close();
    await a.waitFor((m) => m.type === 'room' && m.room.seats.some((s) => s.seatId === seatB && !s.connected), ma);

    const b2 = new TestClient(srv!.url, 'Bob', '#3A86FF');
    clients.push(b2);
    const w = await b2.connect(oldToken);
    expect(w.type === 'welcome' && w.clientId).toBe(oldId);
    expect(w.type === 'welcome' && w.room).toBe(code);
    const snap = await b2.waitFor((m) => m.type === 'started');
    if (snap.type !== 'started') throw new Error();
    expect(snap.yourSeats).toEqual([seatB]);
    expect(snap.state.version).toBeGreaterThanOrEqual(versionAtDisconnect);
    // the snapshot plus the following broadcasts bring the client exactly up to date
    const server = srv!;
    await waitUntil(() => b2.state?.version === server.manager.debugRoom(code)!.state!.version && a.state?.version === b2.state?.version, 5000, 'b2 synced');
    expect(b2.state!.territories).toEqual(server.manager.debugRoom(code)!.state!.territories);
    await a.waitFor((m) => m.type === 'room' && m.room.seats.every((s) => s.connected), ma);
    expect(b2.violations).toEqual([]);
    // a bogus token just makes a fresh identity
    const c = new TestClient(srv!.url, 'Eve', '#000000');
    clients.push(c);
    const wc = await c.connect('not-a-token');
    expect(wc.type === 'welcome' && wc.room).toBe(null);
    await expect(c.room({ type: 'joinRoom', room: code })).rejects.toThrow(/already started/);
  });

  it('hands a timed-out seat to the bot so the game finishes', async () => {
    const { a, b, code, seatB } = await setup({ seatTimeoutMs: 150 });
    const ma = a.msgs.length;
    await b.close();
    await a.waitFor((m) => m.type === 'room' && m.room.seats.some((s) => s.seatId === seatB && s.botControlled === true), ma, 3000);
    const takeoverAt = a.msgs.length;
    a.autoplay = true;
    (a as unknown as { maybePlay(): void }).maybePlay();
    const server = srv!;
    await waitUntil(() => server.manager.debugRoom(code)?.state?.phase === 'gameOver' || a.sent > 6000, 60000, 'game over after takeover');
    expect(server.manager.debugRoom(code)!.state!.phase).toBe('gameOver');
    expect(a.msgs.slice(takeoverAt).some((m) => m.type === 'state' && m.events.some((e) => 'player' in e && e.player === seatB))).toBe(true);
    expect(a.violations).toEqual([]);
  }, 90000);

  it('rejects bad frames and enforces the size cap', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', rateLimit: 5 });
    const c = new TestClient(srv.url, 'Mallory', '#E63946');
    clients.push(c);
    await c.connect();
    c.ws.send('not json');
    await c.waitFor((m) => m.type === 'error' && /JSON/.test(m.error));
    c.ws.send(JSON.stringify({ v: 2, type: 'ping' }));
    await c.waitFor((m) => m.type === 'error' && /version/.test(m.error));
    for (let i = 0; i < 30; i++) c.send({ type: 'ping' });
    await c.waitFor((m) => m.type === 'error' && /Slow down/.test(m.error));
    const closed = new Promise<number>((res) => c.ws.once('close', (code) => res(code)));
    c.ws.send('x'.repeat(70 * 1024));
    expect(await closed).toBe(1009);
  });
});
