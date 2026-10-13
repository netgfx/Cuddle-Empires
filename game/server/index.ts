// Entry point: `npm run server` (tsx server/index.ts). Configuration via env vars — see server/README.md.
import { startServer } from './app';

const num = (name: string, def: number) => {
  const v = process.env[name];
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : def;
};

const botDelayMs = num('BOT_DELAY_MS', 600);

const srv = await startServer({
  port: num('PORT', 8787),
  host: process.env.HOST || '0.0.0.0',
  botDelayMs,
  // per battle event; defaults to 2.5 × BOT_DELAY_MS (600 → 1500) so BOT_DELAY_MS=0 makes bots instant
  botBattleDelayMs: num('BOT_BATTLE_DELAY_MS', botDelayMs * 2.5),
  botMaxDelayMs: num('BOT_MAX_DELAY_MS', 12_000),
  seatTimeoutMs: num('SEAT_TIMEOUT_MS', 120_000),
  roomTtlMs: num('ROOM_TTL_MS', 600_000),
  maxRooms: num('MAX_ROOMS', 1000),
  rateLimit: num('RATE_LIMIT', 20),
  heartbeatMs: num('HEARTBEAT_MS', 30_000),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  log: process.env.LOG !== '0',
});

console.log(`[risk-server] listening on :${srv.port}  ws path /ws  ·  GET /health  ·  GET /rooms`);

const shutdown = () => { console.log('[risk-server] shutting down'); void srv.close().then(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
