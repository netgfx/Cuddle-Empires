// Playwright smoke test for the procedural audio engine.
// Requires the Vite dev server on http://localhost:5173.
// Run from the project root: node src/audio/dev/check.mjs
import { chromium } from 'playwright';

const PAGE = 'http://localhost:5173/src/audio/dev/audio.html';
const TRACKS = ['meadow', 'march', 'lullaby', 'adventure'];
const SFX = [
  'click',
  'hover',
  'place',
  'diceRoll',
  'diceLand',
  'battleWin',
  'battleLose',
  'conquer',
  'cardDraw',
  'cardTrade',
  'turn',
  'eliminated',
  'victory',
  'error',
];
const MUSIC_MIN_PEAK = 0.02; // linear, over a 2 s window at full ramp
const SFX_MIN_PEAK = 0.002; // ~ -54 dBFS; hover is intentionally very quiet
const SILENT_MAX_PEAK = 0.002;
const RENDER_MAX_PEAK = 0.95;
const RENDER_MIN_RMS = 0.02;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(ok, name, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) + ' dBFS' : '-inf');

async function main() {
  const errors = [];
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof window.__audio === 'object', null, { timeout: 60000 });

    await page.click('#unlock');
    await sleep(400);
    const s0 = await page.evaluate(() => window.__audioState());
    record(s0.state === 'running', 'AudioContext is running after unlock', `state=${s0.state}`);

    // ---- music ----
    for (const id of TRACKS) {
      await page.evaluate((id) => window.__audio.setTrack(id), id);
      await sleep(300);
      await page.evaluate(() => window.__audioLevel()); // reset peak window
      await sleep(2000);
      const peak = await page.evaluate(() => window.__audioLevel());
      const st = await page.evaluate(() => window.__audioState());
      record(
        st.state === 'running' && st.playing === id && peak > MUSIC_MIN_PEAK,
        `music ${id} audible`,
        `peak=${peak.toFixed(4)} ${db(peak)} state=${st.state} playing=${st.playing}`,
      );
    }
    await page.evaluate(() => window.__audio.setTrack('off'));
    await sleep(2200);

    // ---- SFX via the window event bus ----
    await page.evaluate(() => window.__audioLevel());
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('risk:sfx', { detail: 'place' })));
    await sleep(600);
    const evPeak = await page.evaluate(() => window.__audioLevel());
    record(evPeak > SFX_MIN_PEAK, 'risk:sfx CustomEvent plays an SFX', `peak=${evPeak.toFixed(4)}`);

    // ---- every SFX ----
    for (const name of SFX) {
      await page.evaluate(() => window.__audioLevel());
      await page.evaluate((n) => window.__audio.sfx(n), name);
      await sleep(name === 'victory' || name === 'diceRoll' ? 2300 : 900);
      const peak = await page.evaluate(() => window.__audioLevel());
      record(peak > SFX_MIN_PEAK, `sfx ${name} audible`, `peak=${peak.toFixed(4)} ${db(peak)}`);
      await sleep(150);
    }

    // ---- volume 0 is silent ----
    await sleep(1500);
    await page.evaluate(() => {
      window.__audio.setMusicVolume(0);
      window.__audio.setTrack('meadow');
    });
    await sleep(1500);
    await page.evaluate(() => window.__audioLevel());
    await sleep(1000);
    const silent = await page.evaluate(() => window.__audioLevel());
    record(silent < SILENT_MAX_PEAK, 'music volume 0 is silent', `peak=${silent.toFixed(5)}`);
    await page.evaluate(() => {
      window.__audio.setMusicVolume(0.5);
      window.__audio.setTrack('off');
    });
    await sleep(2000);

    // ---- offline renders: no clipping, reasonable level ----
    for (const id of TRACKS) {
      const r = await page.evaluate((id) => window.__renderTrack(id, 16), id);
      record(
        r.peak < RENDER_MAX_PEAK && r.rms > RENDER_MIN_RMS,
        `offline render ${id} (16 s) is not clipped`,
        `peak=${r.peak.toFixed(3)} (${db(r.peak)}) rms=${r.rms.toFixed(3)} (${db(r.rms)})`,
      );
    }
    for (const name of SFX) {
      const r = await page.evaluate((n) => window.__renderSfx(n), name);
      record(
        r.peak < RENDER_MAX_PEAK && r.peak > 0,
        `offline sfx ${name} is not clipped`,
        `peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(4)}`,
      );
    }

    record(errors.length === 0, 'no console errors or page errors', errors.length ? errors.join(' | ') : '');
  } finally {
    await browser.close();
  }

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error('FAIL  harness error:', e);
  process.exitCode = 1;
});
