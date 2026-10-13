// Picking check: hovers + clicks territories at their projected marker positions and asserts the ui store.
// Usage: node src/scene/dev/pick.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/src/scene/dev/scene.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(5000);
let fail = 0;
for (const id of ['Brazil', 'Egypt', 'Kamchatka', 'Iceland', 'EasternAustralia', 'Ontario']) {
  const p = await page.evaluate((t) => window.__riskScene.project(t), id);
  // aim slightly south of the marker (on the tile, below the pawns)
  await page.mouse.move(p.x, p.y + 12);
  await page.waitForTimeout(150);
  const hovered = await page.evaluate(() => window.__risk.ui.getState().hovered);
  await page.mouse.click(p.x, p.y + 12);
  await page.waitForTimeout(150);
  const selected = await page.evaluate(() => window.__risk.ui.getState().selected);
  const ok = hovered === id && selected === id;
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', id, { hovered, selected });
}
// drag must not click
const p = await page.evaluate(() => window.__riskScene.project('Peru'));
await page.mouse.move(p.x, p.y + 12); await page.mouse.down(); await page.mouse.move(p.x + 80, p.y + 60, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(200);
const afterDrag = await page.evaluate(() => window.__risk.ui.getState().selected);
console.log(afterDrag !== 'Peru' ? 'ok   drag ignored' : 'FAIL drag selected', afterDrag);
if (afterDrag === 'Peru') fail++;
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
process.exit(fail ? 1 : 0);
