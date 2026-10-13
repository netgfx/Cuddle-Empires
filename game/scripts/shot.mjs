// Screenshot helper that drives the real Chrome over CDP (Playwright).
// Usage: node scripts/shot.mjs <url> <out.png> [--wait=ms] [--eval="js expression run before the shot"] [--w=1600 --h=900]
// Prints console errors/warnings and page errors so you can verify there are none.
import { chromium } from 'playwright';
const [url = 'http://localhost:5173/', out = 'shot.png', ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(opt.w || 1600), height: +(opt.h || 900) } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+(opt.wait || 4000));
if (opt.eval) { const r = await page.evaluate(opt.eval); if (r !== undefined) console.log('eval →', JSON.stringify(r)); await page.waitForTimeout(+(opt.after || 1500)); }
await page.screenshot({ path: out });
console.log('saved', out);
console.log(logs.length ? logs.slice(0, 40).join('\n') : 'no console errors');
await browser.close();
