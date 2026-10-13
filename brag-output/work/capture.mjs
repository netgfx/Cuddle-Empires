// Deterministic game footage: the page runs on a virtual clock (rAF, timers, performance.now)
// that we advance exactly 1/30 s per captured frame, so every frame is perfectly paced
// no matter how long a screenshot takes. Usage: node capture.mjs <outDir> <seconds> [seed]
import { chromium } from '../../game/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const [out = 'footage/a', secArg = '30', seedArg = '7'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const FPS = 30, DT = 1000 / FPS, FRAMES = Math.round(+secArg * FPS);

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 1, showLabels: true }, version: 0 })); } catch { /* */ }
  let vt = 0; const T0 = Date.now();
  const timers = new Map(); let nextId = 1;
  const rafs = new Map(); let rafId = 1;
  performance.now = () => vt;
  Date.now = () => T0 + vt;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = nextId++; timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, a }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (fn, ms = 0, ...a) => { const id = nextId++; const iv = Math.max(1, +ms || 0); timers.set(id, { at: vt + iv, fn, a, iv }); return id; };
  window.clearInterval = window.clearTimeout;
  window.requestAnimationFrame = (cb) => { const id = rafId++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  window.__vt = {
    step(dt) {
      const end = vt + dt;
      for (let guard = 0; guard < 10000; guard++) {
        let best = null;
        for (const e of timers) if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        const [id, t] = best;
        vt = Math.max(vt, t.at);
        if (t.iv) t.at += t.iv; else timers.delete(id);
        try { if (typeof t.fn === 'function') t.fn(...t.a); } catch (e) { console.error(e); }
      }
      vt = end;
      const cbs = [...rafs.values()]; rafs.clear();
      for (const cb of cbs) { try { cb(vt); } catch (e) { console.error(e); } }
    },
    now: () => vt,
  };
});

await page.goto('http://localhost:4170/', { waitUntil: 'load' });
const step = (n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__vt.step(1000 / 30); }, n);
// let the setup screen + assets load (real time for network, virtual frames for rendering)
for (let i = 0; i < 40; i++) { await step(3); await page.waitForTimeout(50); }

const seed = +seedArg;
await page.evaluate((seed) => {
  window.__risk.game.getState().startLocal([
    { name: 'Biscuit', color: '#E63946', kind: 'bot' },
    { name: 'Mochi', color: '#3A86FF', kind: 'bot' },
    { name: 'Pip', color: '#6CC24A', kind: 'bot' },
  ], { setup: 'auto' }, seed);
}, seed);
// warm up: textures, shaders, instanced pawns
for (let i = 0; i < 30; i++) { await step(1); await page.waitForTimeout(60); }

// slow CSS animations so they roughly match the virtual clock
const cdp = await page.context().newCDPSession(page);
await cdp.send('Animation.enable');

const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  await step(1);
  await page.screenshot({ path: `${out}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (f === 15) {
    const per = (Date.now() - t0) / 16;
    await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, DT / per) });
    console.log(`~${per.toFixed(0)} ms/frame real → CSS playbackRate ${(DT / per).toFixed(2)}`);
  }
  if (f % 150 === 0) {
    const s = await page.evaluate(() => { const g = window.__risk.game.getState(); return { phase: g.game?.phase, turn: g.game?.turn, playing: g.playing?.type, cam: window.__risk.ui.getState().camera.kind }; });
    console.log(`frame ${f}/${FRAMES}`, JSON.stringify(s));
  }
}
console.log(`done ${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s; errors: ${errors.length ? [...new Set(errors)].slice(0, 5).join(' | ') : 'none'}`);
await browser.close();
