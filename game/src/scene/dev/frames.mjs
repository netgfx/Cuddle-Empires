// Captures a strip of frames from a running bot game (event animations check).
// Usage: node src/scene/dev/frames.mjs <outPrefix> [count] [intervalMs]
import { chromium } from 'playwright';
const [prefix = 'frame', count = '8', interval = '350'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(4000);
await page.evaluate(() => window.__risk.game.getState().startLocal([
  { name: 'Red', color: '#E63946', kind: 'bot' }, { name: 'Blue', color: '#3A86FF', kind: 'bot' }, { name: 'Lime', color: '#6CC24A', kind: 'bot' },
], { setup: 'auto' }, 3));
await page.waitForTimeout(+(process.env.START_DELAY ?? 2500));
for (let i = 0; i < +count; i++) {
  const playing = await page.evaluate(() => window.__risk.game.getState().playing?.type ?? null);
  await page.screenshot({ path: `${prefix}${i}.png` });
  console.log(i, playing);
  await page.waitForTimeout(+interval);
}
const hist = await page.evaluate(() => window.__risk.game.getState().history.map((e) => e.type));
console.log('events so far:', hist.length, [...new Set(hist)].join(','));
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no page errors');
await browser.close();
