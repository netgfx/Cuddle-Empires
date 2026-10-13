// E2E: hotseat game driven only through the real UI (setup screen, canvas clicks, buttons) in Chrome.
// 2 humans (Ann, Ben) + 1 bot. Plays N human turns: reinforce (canvas click), attack (canvas clicks +
// attack panel), occupy, end attack, fortify, end turn, handoff curtain, forced card trades.
// Usage: node scripts/e2e-hotseat.mjs <outDir> [humanTurns=6]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [out = 'e2e-out', turnsArg = '6'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const HUMAN_TURNS = +turnsArg;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(() => {
  try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 4, showLabels: true }, version: 0 })); } catch { /* ignore */ }
});

const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
let shotN = 0;
const shot = async (name) => { const p = `${out}/${String(shotN++).padStart(2, '0')}_${name}.png`; await page.screenshot({ path: p }); return p; };
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const visible = async (id) => (await tid(id).count()) > 0 && (await tid(id).first().isVisible());
const S = () => page.evaluate(() => {
  const g = window.__risk.game.getState();
  return { game: g.game, busy: g.busy, err: g.lastError, ui: { selected: window.__risk.ui.getState().selected, target: window.__risk.ui.getState().target } };
});

async function waitIdle(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await visible('handoff-continue')) { await tid('handoff-continue').click(); await page.waitForTimeout(300); continue; }
    const s = await S();
    if (!s.busy) { await page.waitForTimeout(150); const s2 = await S(); if (!s2.busy) return s2; }
    await page.waitForTimeout(150);
  }
  throw new Error('timeout waiting for idle');
}

async function clickTerritory(id) {
  await page.keyboard.press('Home');
  await page.waitForTimeout(700);
  const p = await page.evaluate((id) => window.__riskScene.project(id), id);
  // click slightly below the marker so we hit the tile, not the badge
  await page.mouse.click(p.x, p.y + 10);
  await page.waitForTimeout(250);
}

const ADJ = await (async () => {
  await page.goto('http://localhost:5173/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return page.evaluate(async () => (await import('/src/game/mapData.ts')).ADJACENT);
})();

// ---------------------------------------------------------------- setup screen
console.log('SETUP');
check(await visible('start-game'), 'setup screen shows Start');
await tid('setup-player-1-name').fill('Ann');
await tid('setup-player-2-name').fill('Ben');
await tid('setup-player-2-kind').click(); // bot → human
await tid('setup-player-3-name').fill('Robo');
await shot('setup');
await tid('start-game').click();
await page.waitForTimeout(2500);
let s = await waitIdle();
check(s.game && s.game.players.length === 3, 'game created with 3 players');
check(s.game.phase === 'reinforce', `first phase is reinforce (got ${s.game.phase})`);
await shot('game-start');

// ---------------------------------------------------------------- play
let humanTurns = 0, attacksDone = 0, conquests = 0, fortifies = 0, trades = 0, placements = 0;
let lastTurnKey = '';
const t0 = Date.now();
while (humanTurns < HUMAN_TURNS && Date.now() - t0 < 8 * 60_000) {
  s = await waitIdle();
  const g = s.game;
  if (g.phase === 'gameOver') break;
  const me = g.players[g.current];
  if (me.kind !== 'human') { await page.waitForTimeout(400); continue; }
  const key = `${g.turn}-${me.id}`;
  if (key !== lastTurnKey) { lastTurnKey = key; humanTurns++; attacksDone = 0; console.log(`TURN ${g.turn} ${me.name} (${g.phase}, +${g.reinforcements})`); }
  const mine = Object.entries(g.territories).filter(([, t]) => t.owner === me.id).map(([id]) => id);
  const enemyNbrs = (id) => ADJ[id].filter((n) => g.territories[n].owner !== me.id);

  if (g.mustTrade || (await visible('must-trade'))) {
    check(await visible('must-trade'), 'must-trade modal shown when required');
    if (await visible('suggest-set')) await tid('suggest-set').first().click();
    await page.waitForTimeout(200);
    await tid('trade-btn').first().click();
    await page.waitForTimeout(400);
    const s2 = await waitIdle();
    check(s2.game.setsTraded === g.setsTraded + 1, `traded a set (sets ${g.setsTraded} → ${s2.game.setsTraded})`);
    trades++;
    if (trades === 1) await shot('after-trade');
    continue;
  }

  if (g.phase === 'reinforce' || (g.phase === 'attack' && g.reinforcements > 0)) {
    const front = mine.filter((t) => enemyNbrs(t).length).sort((a, b) => g.territories[b].armies - g.territories[a].armies)[0] ?? mine[0];
    if (await visible('place-count-all')) await tid('place-count-all').click();
    const before = g.territories[front].armies, left = g.reinforcements;
    await clickTerritory(front);
    const s2 = await waitIdle();
    const placed = s2.game.territories[front].armies - before;
    check(placed > 0 && placed <= left, `placed ${placed} on ${front} by clicking the board`);
    placements++;
    if (placements === 1) await shot('reinforced');
    continue;
  }

  if (g.phase === 'attack') {
    const options = mine.filter((t) => g.territories[t].armies >= 3 && enemyNbrs(t).length)
      .flatMap((f) => enemyNbrs(f).map((to) => ({ f, to, diff: g.territories[f].armies - g.territories[to].armies })))
      .sort((a, b) => b.diff - a.diff);
    if (attacksDone < 3 && options.length && options[0].diff >= 1) {
      const { f, to } = options[0];
      await clickTerritory(f);
      let st = await S();
      check(st.ui.selected === f, `selected attack source ${f}`);
      await clickTerritory(to);
      await page.waitForTimeout(300);
      st = await S();
      check(st.ui.target === to, `selected attack target ${to}`);
      check(await visible('attack-panel'), 'attack panel opened');
      if (attacksDone === 0) await shot('attack-panel');
      const blitz = attacksDone > 0;
      const btn = tid(blitz ? 'blitz-btn' : 'attack-btn');
      for (let i = 0; i < 60 && !(await btn.isEnabled().catch(() => false)); i++) {
        if (i % 10 === 0) console.log('    waiting for enabled', JSON.stringify(await page.evaluate(() => { const g = window.__risk.game.getState(); return { busy: g.busy, playing: g.playing?.type, phase: g.game.phase, v: g.game.version, vv: g.view.version }; })));
        await page.waitForTimeout(250);
      }
      await btn.click();
      attacksDone++;
      await page.waitForTimeout(blitz ? 300 : 900);
      if (attacksDone === 1) await shot('dice-rolling');
      const s2 = await waitIdle(60000);
      check(s2.game.version > g.version, `${blitz ? 'blitz' : 'attack'} ${f} → ${to} applied (v${g.version}→v${s2.game.version})`);
      if (s2.game.phase === 'occupy') {
        conquests++;
        check(await visible('occupy-dialog'), 'occupy dialog shown after capture');
        if (conquests === 1) await shot('occupy');
        await tid('occupy-confirm').click();
        const s3 = await waitIdle();
        check(s3.game.phase === 'attack' && s3.game.territories[to].owner === me.id, `occupied ${to}`);
      } else if (s2.game.territories[to].owner === me.id) conquests++;
      continue;
    }
    await tid('end-attack').click();
    const s2 = await waitIdle();
    check(s2.game.phase === 'fortify' || s2.game.players[s2.game.current].id !== me.id, `end attack → ${s2.game.phase}`);
    if (g.conqueredThisTurn) check(s2.game.players.find((p) => p.id === me.id).cards.length === me.cards.length + 1, 'drew a card after conquering');
    continue;
  }

  if (g.phase === 'fortify') {
    const src = mine.filter((t) => g.territories[t].armies > 1 && !enemyNbrs(t).length && ADJ[t].some((n) => g.territories[n].owner === me.id && enemyNbrs(n).length))[0];
    if (src && fortifies < 3) {
      const dst = ADJ[src].find((n) => g.territories[n].owner === me.id && enemyNbrs(n).length);
      await clickTerritory(src);
      await clickTerritory(dst);
      await page.waitForTimeout(300);
      if (await visible('fortify-dialog')) {
        if (fortifies === 0) await shot('fortify');
        await tid('fortify-confirm').click();
        const s2 = await waitIdle();
        check(s2.game.territories[dst].armies > g.territories[dst].armies, `fortified ${src} → ${dst}`);
        fortifies++;
        continue;
      }
      check(false, `fortify dialog for ${src} → ${dst}`);
    }
    await tid('end-turn').click();
    const s2 = await waitIdle();
    check(s2.game.players[s2.game.current].id !== me.id || s2.game.turn > g.turn, 'turn passed to the next player');
    continue;
  }
  await page.waitForTimeout(300);
}

s = await waitIdle();
await shot('end-state');
// panels
for (const p of ['log', 'territory', 'help', 'settings']) {
  if (!(await visible(`${p}-panel`))) await tid(`panel-toggle-${p}`).click();
  await page.waitForTimeout(500);
  check(await visible(`${p === 'territory' ? 'territory' : p}-panel`), `${p} panel opens`);
  await shot(`panel-${p}`);
  if (p === 'help' || p === 'settings') { await page.keyboard.press('Escape'); await page.waitForTimeout(400); check(!(await visible(`${p}-panel`)), `${p} panel closes with Esc`); }
}
console.log(`\nSUMMARY human turns ${humanTurns}, conquests ${conquests}, fortifies ${fortifies}, trades ${trades}, placements ${placements}, round ${s.game.turn}`);
console.log(`checks failed: ${failures.length}`); failures.forEach((f) => console.log('  -', f));
console.log(logs.length ? [...new Set(logs)].slice(0, 20).join('\n') : 'no console errors');
await browser.close();
process.exit(failures.length ? 1 : 0);
