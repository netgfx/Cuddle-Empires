// Stage 2: render every UI scenario in the real app (real components + CSS) with Playwright.
//   ref/<id>@<vp>.png        ground-truth screenshot
//   dom/<id>@<vp>.json       geometry + computed styles of every visible element under config.ui.roots
//   backdrops/<id>@<vp>.jpg  (--backdrop) the page with the UI roots hidden — the canvas / scene behind the UI
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function dumpDom(roots) {
  const keep = ['color', 'backgroundColor', 'backgroundImage', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',
    'borderRadius', 'borderTopWidth', 'borderTopColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'boxShadow', 'opacity',
    'display', 'flexDirection', 'alignItems', 'justifyContent', 'transform', 'backdropFilter', 'textShadow', 'webkitTextStroke'];
  const rows = [];
  for (const root of document.querySelectorAll(roots.join(','))) {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join('');
      const style = {};
      for (const k of keep) { const v = cs[k]; if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') style[k] = v; }
      rows.push({ tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className.trim() : '', testid: el.dataset.testid,
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], text: text || undefined, style });
    }
  }
  return rows;
}

export async function capture(cfg, opt = {}) {
  const sc = await import(pathToFileURL(cfg.paths.scenarios).href);
  const VIEWPORTS = cfg.viewports ?? sc.VIEWPORTS;
  const only = opt.only ? new Set(String(opt.only).split(',')) : null;
  const onlyVp = opt.vp ? new Set(String(opt.vp).split(',')) : null;
  const roots = cfg.ui?.roots ?? ['body'];
  for (const d of ['ref', 'dom', 'backdrops']) fs.mkdirSync(cfg.paths[d], { recursive: true });
  const { chromium } = cfg.require('playwright');
  const browser = await chromium.launch({ channel: cfg.playwright?.channel ?? 'chrome', headless: true, args: cfg.playwright?.args ?? [] });
  const problems = [];
  let n = 0;
  for (const s of sc.SCENARIOS) {
    if (only && !only.has(s.id)) continue;
    const isBackdrop = (cfg.backdrops?.scenarios ?? []).includes(s.id);
    if (!!opt.backdrop !== isBackdrop && !only) continue; // backdrop scenarios only render in --backdrop mode
    for (const vp of s.viewports) {
      if (onlyVp && !onlyVp.has(vp)) continue;
      const key = `${s.id}@${vp}`;
      const page = await browser.newPage({ viewport: VIEWPORTS[vp] });
      page.on('pageerror', (e) => problems.push(`${key}: [pageerror] ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${key}: [console] ${m.text()}`); });
      if (sc.initScript) await page.addInitScript(sc.initScript);
      await page.goto(opt.url || cfg.url, { waitUntil: 'load' });
      if (cfg.ready) await page.waitForFunction(cfg.ready, null, { timeout: 30000 });
      if (sc.prelude) await page.evaluate(sc.prelude);
      await page.evaluate(async (code) => { const AF = Object.getPrototypeOf(async () => {}).constructor; await new AF(code)(); }, s.setup || '');
      await page.waitForTimeout(500);
      for (const [kind, sel, val] of s.actions ?? []) {
        if (kind === 'click') await page.locator(sel).first().click({ force: true });
        else if (kind === 'fill') await page.locator(sel).first().fill(val);
        else if (kind === 'focus') await page.locator(sel).first().focus();
        else if (kind === 'wait') await page.waitForTimeout(sel);
        else if (kind === 'eval') await page.evaluate(sel);
        else if (sc.actions?.[kind]) await sc.actions[kind](page, sel, val);
        await page.waitForTimeout(250);
      }
      const hide = opt.backdrop ? `${roots.join(',')}{visibility:hidden!important}` : '';
      await page.addStyleTag({ content: (sc.FREEZE_CSS ?? '') + (s.css ?? '') + hide });
      await page.waitForTimeout(900);
      if (opt.backdrop) await page.screenshot({ path: path.join(cfg.paths.backdrops, `${key}.jpg`), type: 'jpeg', quality: 78 });
      else {
        await page.screenshot({ path: path.join(cfg.paths.ref, `${key}.png`) });
        fs.writeFileSync(path.join(cfg.paths.dom, `${key}.json`), JSON.stringify({ scenario: s.id, title: s.title, viewport: VIEWPORTS[vp], elements: await page.evaluate(dumpDom, roots) }, null, 1));
      }
      console.log(`✓ ${opt.backdrop ? 'backdrop ' : ''}${key}`); n++;
      await page.close();
    }
  }
  await browser.close();
  console.log(problems.length ? `\n${problems.length} page problems:\n${[...new Set(problems)].join('\n')}` : `\n${n} renders, no page errors`);
}
