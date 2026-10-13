// E2E: two Chrome pages play online through the real Online tab (create room → join → add bot → ready → start),
// then the seat whose turn it is acts by clicking the board, and both pages must stay in sync.
// Needs: Vite on :5173 and `PORT=8787 npm run server`. Usage: node scripts/e2e-online.mjs <outDir> [actions=6]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [out = 'e2e-online', nArg = '6'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const failures = [];
const check = (c, m) => { (c ? console.log('  ✓', m) : (failures.push(m), console.log('  ✗', m))); };
const logs = [];

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name} error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[${name} pageerror] ${e.message}`));
  await page.addInitScript(() => { try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 4, showLabels: true }, version: 0 })); } catch { /* */ } });
  await page.goto('http://localhost:5173/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return page;
}
const tid = (p, id) => p.locator(`[data-testid="${id}"]`);
const G = (p) => p.evaluate(() => { const g = window.__risk.game.getState(); return { v: g.game?.version, phase: g.game?.phase, cur: g.game?.players[g.game.current]?.id, seats: g.transport?.seats, mode: g.transport?.mode, busy: g.busy }; });

const A = await open('A'), B = await open('B');
console.log('LOBBY');
await tid(A, 'setup-tab-online').click();
await tid(A, 'online-name').fill('Ann');
await tid(A, 'online-create').click();
await A.waitForTimeout(1500);
const code = (await tid(A, 'online-room-code').textContent())?.trim();
check(!!code && code.length === 5, `room created: ${code}`);
await tid(B, 'setup-tab-online').click();
await tid(B, 'online-name').fill('Ben');
await tid(B, 'online-color-crimson').click();
await tid(B, 'online-room').fill(code);
await tid(B, 'online-join').click();
await B.waitForTimeout(1500);
check(await tid(B, 'online-lobby').isVisible(), 'B joined the lobby');
await tid(A, 'online-add-bot').click();
await A.waitForTimeout(800);
const rowsA = await A.locator('.lobby .player-row').count();
check(rowsA === 3, `lobby lists 3 seats (got ${rowsA})`);
await A.screenshot({ path: `${out}/lobby_A.png` });
await tid(A, 'online-ready').click();
await tid(B, 'online-ready').click();
await A.waitForTimeout(600);
await tid(A, 'online-start').click();
await A.waitForTimeout(3500);
check(await tid(A, 'hud').isVisible() && await tid(B, 'hud').isVisible(), 'both pages show the game HUD');
let a = await G(A), b = await G(B);
check(a.mode === 'online' && b.mode === 'online', 'both on the online transport');
check(a.seats?.length === 1 && b.seats?.length === 1 && a.seats[0] !== b.seats[0], `distinct seats A=${a.seats} B=${b.seats}`);

console.log('PLAY');
const ADJ = await A.evaluate(async () => (await import('/src/game/mapData.ts')).ADJACENT);
let acted = 0;
const t0 = Date.now();
while (acted < +nArg && Date.now() - t0 < 180000) {
  for (const p of [A, B]) {
    if (await tid(p, 'handoff-continue').count()) await tid(p, 'handoff-continue').click().catch(() => {});
  }
  a = await G(A);
  const page = a.cur === a.seats?.[0] ? A : a.cur === (await G(B)).seats?.[0] ? B : null;
  if (!page) { await A.waitForTimeout(500); continue; } // server bot's turn
  const st = await G(page);
  if (st.busy) { await page.waitForTimeout(300); continue; }
  const g = await page.evaluate(() => window.__risk.game.getState().game);
  const me = g.players[g.current].id;
  if (g.phase === 'reinforce' && g.reinforcements > 0 && !g.mustTrade) {
    const mine = Object.keys(g.territories).filter((t) => g.territories[t].owner === me);
    const front = mine.find((t) => ADJ[t].some((n) => g.territories[n].owner !== me)) ?? mine[0];
    if (await tid(page, 'place-count-all').count()) await tid(page, 'place-count-all').click();
    await page.keyboard.press('Home'); await page.waitForTimeout(600);
    const pos = await page.evaluate((id) => window.__riskScene.project(id), front);
    await page.mouse.click(pos.x, pos.y + 10);
  } else if (g.phase === 'attack') {
    await tid(page, 'end-attack').click();
  } else if (g.phase === 'fortify') {
    await tid(page, 'end-turn').click();
  } else if (g.mustTrade) {
    await tid(page, 'suggest-set').first().click().catch(() => {}); await tid(page, 'trade-btn').first().click();
  } else { await page.waitForTimeout(400); continue; }
  acted++;
  // wait for both pages to reach the same new version
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await A.waitForTimeout(250);
    const [x, y] = [await G(A), await G(B)];
    ok = x.v === y.v && x.v > g.version;
  }
  a = await G(A); b = await G(B);
  check(ok, `action ${acted} (${g.phase}) synced: A v${a.v} = B v${b.v}`);
}
await A.screenshot({ path: `${out}/play_A.png` });
await B.screenshot({ path: `${out}/play_B.png` });
// hidden information: B must not see A's real card ids
const hidden = await B.evaluate(() => { const g = window.__risk.game.getState().game; const mine = window.__risk.game.getState().transport.seats[0]; return g.players.filter((p) => p.id !== mine).flatMap((p) => p.cards).every((c) => c.startsWith('hidden-')); });
check(hidden, "B cannot see other players' card ids");
console.log(`\nchecks failed: ${failures.length}`); failures.forEach((f) => console.log('  -', f));
console.log(logs.length ? [...new Set(logs)].slice(0, 20).join('\n') : 'no console errors');
await browser.close();
process.exit(failures.length ? 1 : 0);
