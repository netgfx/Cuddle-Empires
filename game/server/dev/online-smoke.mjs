// Browser smoke test for online play: two real Chrome pages on the Vite dev server talk to the
// room server, start a game (2 humans + 1 bot) and stay in sync after a real action.
//
//   npm run server                      # terminal 1 (room server, default :8787)
//   npm run dev                         # terminal 2 (Vite, default :5173)
//   node server/dev/online-smoke.mjs    # env: APP_URL=http://localhost:5173/  RISK_SERVER=ws://localhost:8787/ws
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:5173/';
const SERVER = process.env.RISK_SERVER || 'ws://localhost:8787/ws';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const mkPage = async (label) => {
  const ctx = await browser.newContext(); // separate sessionStorage → separate identities
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${label} pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label} console] ${m.text()}`); });
  await page.goto(APP_URL, { waitUntil: 'load' });
  return page;
};

const setupFn = async ({ url, name, color }) => {
  const { connectOnline } = await import('/src/net/online.ts');
  const { useGame } = await import('/src/state/gameStore.ts');
  const s = await connectOnline({ url, name, color });
  window.__online = s;
  window.__started = false;
  s.onStarted((t, initial) => { useGame.getState().attachTransport(t, initial); window.__started = true; });
  return s.clientId;
};

const snapshot = () => import('/src/state/gameStore.ts').then(({ useGame }) => {
  const g = useGame.getState();
  const game = g.game;
  return {
    version: game?.version ?? null,
    phase: game?.phase ?? null,
    current: game ? game.players[game.current].id : null,
    seats: g.transport ? [...g.transport.seats] : [],
    mode: g.transport?.mode ?? null,
    busy: g.busy,
    lastError: g.lastError,
  };
});

let ok = false;
try {
  const A = await mkPage('A');
  const B = await mkPage('B');
  await A.evaluate(setupFn, { url: SERVER, name: 'Ann', color: '#E63946' });
  await B.evaluate(setupFn, { url: SERVER, name: 'Ben', color: '#3A86FF' });
  const code = await A.evaluate(async () => (await window.__online.createRoom({ setup: 'auto' }, 3)).code);
  console.log('room', code);
  await B.evaluate(async (c) => { await window.__online.joinRoom(c); await window.__online.setReady(true); }, code);
  await A.evaluate(async () => { await window.__online.addBot(); await window.__online.startGame(); });
  await A.waitForFunction(() => window.__started === true, null, { timeout: 10000 });
  await B.waitForFunction(() => window.__started === true, null, { timeout: 10000 });
  let a = await A.evaluate(snapshot), b = await B.evaluate(snapshot);
  console.log('started  A', JSON.stringify(a));
  console.log('started  B', JSON.stringify(b));

  // wait until it is a human's turn (the server bot may go first) and that page is idle
  let actor = null;
  for (let i = 0; i < 200 && !actor; i++) {
    a = await A.evaluate(snapshot); b = await B.evaluate(snapshot);
    if (a.seats.includes(a.current) && !a.busy) actor = ['A', A];
    else if (b.seats.includes(b.current) && !b.busy) actor = ['B', B];
    else await A.waitForTimeout(250);
  }
  if (!actor) throw new Error('never became a human turn');
  const [label, page] = actor;
  const before = (label === 'A' ? a : b).version;
  const sent = await page.evaluate(async () => {
    const { useGame } = await import('/src/state/gameStore.ts');
    const { chooseBotAction } = await import('/src/game/bot.ts');
    const g = useGame.getState().game;
    const me = g.players[g.current].id;
    const action = chooseBotAction(g, me);
    useGame.getState().dispatch(action);
    return action;
  });
  console.log(`page ${label} dispatched`, JSON.stringify(sent), 'at version', before);

  await A.waitForFunction(async (v) => (await import('/src/state/gameStore.ts')).useGame.getState().game.version > v, before, { timeout: 10000, polling: 100 });
  await B.waitForFunction(async (v) => (await import('/src/state/gameStore.ts')).useGame.getState().game.version > v, before, { timeout: 10000, polling: 100 });
  // the bot may keep acting — compare a settled pair of reads
  for (let i = 0; i < 40; i++) {
    a = await A.evaluate(snapshot); b = await B.evaluate(snapshot);
    if (a.version === b.version) break;
    await A.waitForTimeout(100);
  }
  console.log('after    A', JSON.stringify(a));
  console.log('after    B', JSON.stringify(b));
  ok = a.version === b.version && a.version > before && a.mode === 'online' && b.mode === 'online';
  await A.screenshot({ path: process.env.SHOT || 'online-smoke.png' }).catch(() => undefined);
} catch (e) {
  console.error('SMOKE ERROR', e);
}
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no page errors');
console.log(ok ? 'ONLINE SMOKE: PASS (versions match)' : 'ONLINE SMOKE: FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
