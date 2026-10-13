// Render film.html frame by frame. Usage: node render.mjs <outDir> [fps=30] [t1,t2,...] (stills mode if times given)
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [out = 'frames', fpsArg = '30', times] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(pathToFileURL(path.resolve('film.html')).href, { waitUntil: 'load' });
await page.evaluate(() => window.ready);
const fps = +fpsArg;
const list = times ? times.split(',').map(Number) : Array.from({ length: Math.round(await page.evaluate(() => window.DURATION) * fps) }, (_, i) => i / fps);
const t0 = Date.now();
for (let i = 0; i < list.length; i++) {
  await page.evaluate((t) => window.renderAt(t), list[i]);
  const name = times ? `still_${list[i].toFixed(2)}.jpg` : `f${String(i).padStart(5, '0')}.png`;
  await page.screenshot({ path: `${out}/${name}`, type: times ? 'jpeg' : 'png', ...(times ? { quality: 90 } : {}) });
  if (!times && i % 150 === 0) console.log(`frame ${i}/${list.length}`);
}
console.log(`rendered ${list.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s; errors: ${errs.length ? errs.slice(0, 5).join(' | ') : 'none'}`);
await browser.close();
