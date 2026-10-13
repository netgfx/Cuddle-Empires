// E2E: a full all-bot game in Chrome (real scene, dice, UI, director) until the Game Over screen.
// Usage: node scripts/e2e-botgame.mjs <outDir> [players=3] [speed=4] [maxMinutes=25]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = 'e2e-bot', np = '3', speed = '4', maxMin = '25'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript((sp) => { try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: sp, showLabels: true }, version: 0 })); } catch { /* */ } }, +speed);
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate((np) => {
  const cols = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#34495E'];
  window.__risk.game.getState().startLocal(Array.from({ length: np }, (_, i) => ({ name: ['Lena', 'Max', 'Kiki', 'Bo', 'Ivy', 'Rex'][i], color: cols[i], kind: 'bot' })), { setup: 'auto' }, 777);
}, +np);
const t0 = Date.now(); let last = -1, stuck = 0, n = 0;
while (Date.now() - t0 < +maxMin * 60000) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => { const g = window.__risk.game.getState(); return { v: g.game.version, phase: g.view.phase, turn: g.game.turn, winner: g.game.winner, busy: g.busy, playing: g.playing?.type, err: g.lastError, owned: g.game.players.map((p) => `${p.name}:${Object.values(g.game.territories).filter((t) => t.owner === p.id).length}`).join(' ') }; });
  if (++n % 6 === 0) { console.log(`${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(s)); await page.screenshot({ path: `${out}/mid_${n}.png` }); }
  if (s.phase === 'gameOver') { console.log('GAME OVER', JSON.stringify(s)); break; }
  stuck = s.v === last ? stuck + 1 : 0; last = s.v;
  if (stuck >= 12) { console.log('STUCK', JSON.stringify(s)); break; }
}
await page.waitForTimeout(2500);
const over = await page.locator('[data-testid="game-over"]').isVisible().catch(() => false);
const winner = over ? await page.locator('[data-testid="winner-name"]').textContent() : null;
console.log('game-over screen visible:', over, 'winner:', winner, `elapsed ${Math.round((Date.now() - t0) / 1000)}s`);
await page.screenshot({ path: `${out}/final.png` });
console.log(logs.length ? [...new Set(logs)].slice(0, 20).join('\n') : 'no console errors');
await browser.close();
process.exit(over ? 0 : 1);
