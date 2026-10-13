// Starts an all-bot game and captures frames while it plays. Usage: node scripts/botframes.mjs <outPrefix> [frames=8] [intervalMs=700] [players=3]
import { chromium } from 'playwright';
const [prefix = 'bf', n = '8', every = '700', np = '3'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.evaluate((np) => {
  const cols = ['#E63946', '#3A86FF', '#6CC24A', '#FFBE0B', '#8E44AD', '#34495E'];
  const players = Array.from({ length: np }, (_, i) => ({ name: ['Lena', 'Max', 'Kiki', 'Bo', 'Ivy', 'Rex'][i], color: cols[i], kind: 'bot' }));
  window.__risk.game.getState().startLocal(players, { setup: 'auto' }, 1234);
}, +np);
for (let i = 0; i < +n; i++) {
  await page.waitForTimeout(+every);
  const info = await page.evaluate(() => { const g = window.__risk.game.getState(); return { phase: g.view?.phase, playing: g.playing?.type, v: g.game?.version, turn: g.game?.turn }; });
  await page.screenshot({ path: `${prefix}_${String(i).padStart(2, '0')}.png` });
  console.log(i, JSON.stringify(info));
}
console.log(logs.length ? [...new Set(logs)].slice(0, 30).join('\n') : 'no console errors');
await browser.close();
