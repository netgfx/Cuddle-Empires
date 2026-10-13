// OnlineTransport / connectOnline against the real room server (Node 22 global WebSocket).
import { afterEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../server/app';
import { chooseBotAction } from '../game/bot';
import type { GameState } from '../game/types';
import type { ServerMessage } from './transport';
import { connectOnline, defaultServerUrl, type OnlineSession, type OnlineTransport } from './online';

let srv: RunningServer | null = null;
const sessions: OnlineSession[] = [];
afterEach(async () => {
  sessions.splice(0).forEach((s) => s.disconnect());
  await srv?.close();
  srv = null;
});

const started = (s: OnlineSession) => new Promise<{ t: OnlineTransport; initial: GameState }>((res) => s.onStarted((t, initial) => res({ t, initial })));

describe('OnlineTransport', () => {
  it('defaultServerUrl falls back to localhost:8787', () => {
    expect(defaultServerUrl()).toMatch(/^ws:\/\/.+:8787\/ws$/);
  });

  it('lobby → start → actions reach both transports; reconnects transparently', async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', botDelayMs: 0, botBattleDelayMs: 0, rateLimit: 1000 });
    const a = await connectOnline({ url: srv.url, name: 'Ann', color: '#E63946' });
    const b = await connectOnline({ url: srv.url, name: 'Ben', color: '#3A86FF' });
    sessions.push(a, b);
    const room = await a.createRoom({ setup: 'auto' }, 3);
    expect((await a.listRooms()).map((r) => r.code)).toContain(room.code);
    await b.joinRoom(room.code);
    await a.addBot();
    await b.setReady(true);
    await expect(b.startGame()).rejects.toThrow(/host/);
    const pa = started(a), pb = started(b);
    await a.startGame();
    const [sa, sb] = await Promise.all([pa, pb]);
    expect(sa.t.mode).toBe('online');
    expect(sa.t.seats).toHaveLength(1);
    expect(sb.t.seats).toHaveLength(1);
    expect(sa.t.seats[0]).not.toBe(sb.t.seats[0]);
    // the local store must never drive other seats: they are presented as 'remote'
    expect(sa.initial.players.filter((p) => !sa.t.seats.includes(p.id)).every((p) => p.kind === 'remote')).toBe(true);

    let la: GameState = sa.initial, lb: GameState = sb.initial;
    const errors: string[] = [];
    const drive = (t: OnlineTransport, get: () => GameState) => (m: ServerMessage) => {
      if (m.kind === 'error') { errors.push(m.error); return; }
      const s = get();
      if (s.phase === 'gameOver') return;
      const me = s.players[s.current].id;
      if (t.seats.includes(me)) t.send({ action: chooseBotAction(s, me), actor: me, id: `x${s.version}` });
    };
    sa.t.subscribe((m) => { if (m.kind === 'state') la = m.state; drive(sa.t, () => la)(m); });
    sb.t.subscribe((m) => { if (m.kind === 'state') lb = m.state; drive(sb.t, () => lb)(m); });
    // kick off (current player may be a human)
    for (const [t, s] of [[sa.t, la], [sb.t, lb]] as const) {
      const me = s.players[s.current].id;
      if (t.seats.includes(me)) t.send({ action: chooseBotAction(s, me), actor: me, id: 'first' });
    }

    const waitFor = async (fn: () => boolean, ms = 30000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); } };
    await waitFor(() => la.version > 30);

    // drop B's socket under its feet: it must reconnect by itself and keep the same transport
    const versionsBefore = lb.version;
    (b as unknown as { ws: WebSocket }).ws.close();
    await waitFor(() => b.status === 'reconnecting', 3000);
    await waitFor(() => b.status === 'connected', 5000);
    expect(b.transport).toBe(sb.t);
    await waitFor(() => la.phase === 'gameOver' && lb.version === la.version, 60000).catch((e) => { console.log('STALL', la.version, lb.version, la.phase, la.players[la.current].id, sa.t.seats, sb.t.seats, errors.slice(-5)); throw e; });
    expect(lb.version).toBeGreaterThan(versionsBefore);
    expect(errors.filter((e) => !/not your turn|Not connected/i.test(e))).toEqual([]);
  }, 90000);
});
