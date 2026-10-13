// Logs the director timeline (event type + duration) of a bot game for N seconds.
import { chromium } from 'playwright';
const secs = +(process.argv[2] ?? 12);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[tl]')) errors.push(m.text()); });
await page.goto('http://localhost:5173/');
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const G = window.__risk.game; let t0 = performance.now(); let last = null;
  window.__tl = [];
  G.subscribe((s) => {
    const p = s.playing ? s.playing.type + (s.playing.type === 'battle' ? ` ${s.playing.roll.from}>${s.playing.roll.to} -${s.playing.roll.attackerLosses}/-${s.playing.roll.defenderLosses}` : '') : null;
    if (p !== last) { window.__tl.push(`${Math.round(performance.now() - t0)}ms ${p}`); last = p; }
  });
  G.getState().startLocal([
    { name: 'Red', color: '#E63946', kind: 'bot' }, { name: 'Blue', color: '#3A86FF', kind: 'bot' }, { name: 'Lime', color: '#6CC24A', kind: 'bot' },
  ], { setup: 'auto' }, 3);
});
await page.waitForTimeout(secs * 1000);
console.log((await page.evaluate(() => window.__tl)).join('\n'));
console.log(errors.length ? errors.slice(0, 20).join('\n') : 'no page errors');
await browser.close();
