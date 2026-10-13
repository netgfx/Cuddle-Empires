// HTTP + WebSocket front of the room server. `startServer()` is used by index.ts and by the tests.
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ClientMessage } from './protocol';
import { RoomManager, type RoomConfig } from './rooms';

export interface ServerOptions extends Partial<RoomConfig> {
  /** 0 = random free port. */
  port?: number;
  host?: string;
  /** WebSocket path (default /ws). */
  path?: string;
  /** Max inbound frame size in bytes (default 64 KB). */
  maxMessageBytes?: number;
  /** Sustained inbound messages per second per connection (default 20, burst 2×). */
  rateLimit?: number;
  /** Protocol-level ping interval; sockets that miss one pong are terminated (default 30 s). */
  heartbeatMs?: number;
  /** If non-empty, only these Origin headers may open a socket. */
  allowedOrigins?: string[];
}

export interface RunningServer {
  port: number;
  url: string;
  manager: RoomManager;
  close(): Promise<void>;
}

export function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const path = opts.path ?? '/ws';
  const maxPayload = opts.maxMessageBytes ?? 64 * 1024;
  const rate = opts.rateLimit ?? 20;
  const burst = rate * 2;
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const origins = (opts.allowedOrigins ?? []).filter(Boolean);
  const manager = new RoomManager(opts);
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (code: number, body: unknown) => {
      res.writeHead(code, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET' }); res.end(); return; }
    if (req.method !== 'GET') return json(405, { error: 'method not allowed' });
    if (url.pathname === '/health') return json(200, { ok: true, protocol: PROTOCOL_VERSION, uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...manager.stats });
    if (url.pathname === '/rooms') return json(200, { rooms: manager.listRooms() });
    return json(404, { error: 'not found' });
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const origin = req.headers.origin;
    if (url.pathname !== path || (origins.length && (!origin || !origins.includes(origin)))) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const conn = {
      send: (json: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(json); },
      close: (code?: number, reason?: string) => ws.close(code, reason),
    };
    const handle = manager.attach(conn);
    const err = (error: string) => conn.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'error', error }));
    let tokens = burst;
    let last = Date.now();
    let strikes = 0;

    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      tokens = Math.min(burst, tokens + ((now - last) / 1000) * rate);
      last = now;
      if (isBinary) return err('Binary frames are not supported.');
      let msg: unknown;
      try { msg = JSON.parse(data.toString()); } catch { msg = undefined; }
      if (tokens < 1) {
        if (++strikes > 200) { ws.close(1008, 'Rate limit exceeded'); return; }
        // echo the action id / rid so the sender knows exactly which message was dropped
        const m = (msg ?? {}) as { rid?: unknown; envelope?: { id?: unknown } };
        const actionId = typeof m.envelope?.id === 'string' ? m.envelope.id : undefined;
        const rid = typeof m.rid === 'string' ? m.rid : undefined;
        conn.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'error', error: 'Slow down — too many messages.', ...(actionId ? { actionId } : {}), ...(rid ? { rid } : {}) }));
        return;
      }
      tokens -= 1;
      if (msg === undefined) return err('Malformed JSON.');
      if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') return err('Malformed message.');
      if ((msg as { v?: unknown }).v !== PROTOCOL_VERSION) return err(`Unsupported protocol version (server speaks v${PROTOCOL_VERSION}).`);
      handle.message(msg as ClientMessage);
    });
    ws.on('close', () => handle.closed());
    ws.on('error', () => { /* close follows */ });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, heartbeatMs);
  beat.unref();

  return new Promise((resolve, rejectP) => {
    server.once('error', rejectP);
    server.listen(opts.port ?? 8787, opts.host ?? '0.0.0.0', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? 8787);
      resolve({
        port,
        url: `ws://localhost:${port}${path}`,
        manager,
        close: () => new Promise<void>((done) => {
          clearInterval(beat);
          manager.dispose();
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          server.close(() => done());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
