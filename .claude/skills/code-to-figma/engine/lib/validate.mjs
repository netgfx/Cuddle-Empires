// Stage 6: pixel comparison of Figma screen exports (runner-out/snaps/99-verify) vs the code renders (ref/).
// Pairs come from config.validate.pairs { "<Figma screen name>": "<scenario>@<viewport>" }.
// Per screen: MAD (mean absolute RGB difference) and the share of pixels over the threshold, plus a
// reference | figma | heat-map image in validation/, all computed in a headless Chrome canvas.
import fs from 'node:fs';
import path from 'node:path';

const safe = (s) => String(s).replace(/[^\w.@ -]+/g, '_').slice(0, 80);

export async function validate(cfg, opt = {}) {
  const threshold = +(opt.threshold || cfg.validate?.threshold || 0.12);
  const snaps = path.join(cfg.paths.runnerOut, 'snaps', opt.script || '99-verify');
  if (!fs.existsSync(snaps)) throw new Error(`no Figma exports in ${snaps} — run 99-verify in the runner first`);
  fs.mkdirSync(cfg.paths.validation, { recursive: true });
  const { chromium } = cfg.require('playwright');
  const browser = await chromium.launch({ channel: cfg.playwright?.channel ?? 'chrome', headless: true });
  const page = await browser.newPage();
  const rows = [];
  for (const [screen, key] of Object.entries(cfg.validate?.pairs ?? {})) {
    const a = path.join(cfg.paths.ref, `${key}.png`), b = path.join(snaps, `${safe(screen)}.png`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) { rows.push({ screen, key, missing: !fs.existsSync(a) ? 'reference' : 'figma export' }); continue; }
    const res = await page.evaluate(async ({ a, b, threshold }) => {
      const load = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width, h = ia.height;
      const px = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; };
      const da = px(ia), db = px(ib);
      const out = new OffscreenCanvas(w * 3, h); const o = out.getContext('2d');
      o.drawImage(ia, 0, 0, w, h); o.drawImage(ib, w, 0, w, h);
      const heat = o.createImageData(w, h); let sum = 0, over = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 765;
        sum += d; if (d > threshold) over++;
        heat.data[i] = 255; heat.data[i + 1] = heat.data[i + 2] = 255 - Math.min(255, d * 4 * 255); heat.data[i + 3] = 255;
      }
      o.putImageData(heat, w * 2, 0);
      const buf = new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { mad: sum / (da.length / 4), diff: over / (da.length / 4), png: btoa(bin) };
    }, { a: `data:image/png;base64,${fs.readFileSync(a).toString('base64')}`, b: `data:image/png;base64,${fs.readFileSync(b).toString('base64')}`, threshold });
    fs.writeFileSync(path.join(cfg.paths.validation, `${safe(screen)}.png`), Buffer.from(res.png, 'base64'));
    rows.push({ screen, key, mad: res.mad, diff: res.diff });
    console.log(`${screen.padEnd(34)} MAD ${(res.mad * 100).toFixed(1).padStart(5)}%   over threshold ${(res.diff * 100).toFixed(1).padStart(5)}%`);
  }
  await browser.close();
  const budget = cfg.validate?.budget ?? { mad: 0.05, diff: 0.1 };
  const md = ['# Figma vs code — visual validation', '', `Per-pixel threshold ${threshold * 100}% · budget: MAD ≤ ${budget.mad * 100}%, pixels over threshold ≤ ${budget.diff * 100}%.`,
    'Images in this folder: reference (code) | Figma | heat-map.', '', '| Screen | Capture | MAD | Over threshold | |', '|---|---|---|---|---|',
    ...rows.map((r) => (r.missing ? `| ${r.screen} | ${r.key} | — | — | missing ${r.missing} |`
      : `| ${r.screen} | ${r.key} | ${(r.mad * 100).toFixed(1)}% | ${(r.diff * 100).toFixed(1)}% | ${r.mad <= budget.mad && r.diff <= budget.diff ? '✅' : '⚠️'} |`))];
  fs.writeFileSync(path.join(cfg.paths.validation, 'report.md'), md.join('\n') + '\n');
  const bad = rows.filter((r) => !r.missing && (r.mad > budget.mad || r.diff > budget.diff));
  console.log(`\n${rows.length - bad.length}/${rows.length} within budget → ${path.join(cfg.paths.validation, 'report.md')}`);
  return rows;
}
