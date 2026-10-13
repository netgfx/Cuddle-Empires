// Measures requestAnimationFrame rate on a page (default: scene dev page) and in a running bot game.
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/src/scene/dev/scene.html?armies=big';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(url);
await page.waitForTimeout(5000);
const fps = async () => page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps idle', await fps());
if (process.argv[3] === 'game') {
  await page.evaluate(() => window.__risk.game.getState().startLocal([{ name: 'R', color: '#E63946', kind: 'bot' }, { name: 'B', color: '#3A86FF', kind: 'bot' }, { name: 'L', color: '#6CC24A', kind: 'bot' }], { setup: 'auto' }, 3));
  for (let i = 0; i < 4; i++) console.log('fps game', await fps(), await page.evaluate(() => window.__risk.game.getState().playing?.type ?? null));
}
await browser.close();
