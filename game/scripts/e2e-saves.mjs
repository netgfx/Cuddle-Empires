// E2E: save / load through the real UI. Starts a local game (human + bots), saves from the 💾 modal
// (spinner → "Saved!"), quick-saves with Ctrl+S, plays on, loads the first save back (warning → confirm),
// deletes a save, and loads from the setup screen after leaving the game.
// Usage: node scripts/e2e-saves.mjs <url> [outDir=e2e-saves]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url = 'http://localhost:4170', out = 'e2e-saves'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(() => {
  try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 4, showLabels: true }, version: 1 })); } catch { /* ignore */ }
});

const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
let shotN = 0;
const shot = async (name) => page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}_${name}.png` });
const tid = (id) => page.locator(`[data-testid="${id}"]`);
const game = () => page.evaluate(() => window.__risk.game.getState().game);
const saves = () => page.evaluate(() => JSON.parse(localStorage.getItem('risk3d-saves') ?? '[]'));

await page.goto(url);
await tid('start-game').waitFor();
check(await tid('open-saves').count() === 0, 'no "Load game" button before anything is saved');

// 2 humans, no bots, so nothing moves unless the test acts
await tid('setup-player-3-remove').click();
await tid('setup-player-2-kind').click();
await tid('start-game').click();
await tid('hud').waitFor();
const idle = async () => {
  for (let i = 0; i < 100; i++) {
    if (await tid('handoff-continue').count()) { await tid('handoff-continue').click(); await page.waitForTimeout(200); continue; }
    if (!(await page.evaluate(() => window.__risk.game.getState().busy))) return;
    await page.waitForTimeout(150);
  }
};
await page.waitForTimeout(500);
await idle();
const g0 = await game();

console.log('save from the modal');
await tid('panel-toggle-saves').click();
await tid('saves-panel').waitFor();
check(await tid('saves-empty').isVisible(), 'empty state shown');
await shot('modal-empty');
await tid('save-label').fill('Before the war');
await tid('save-game').click();
check(await tid('save-game').textContent().then((t) => t.includes('Saving')), 'button shows "Saving…" while saving');
check(await tid('save-indicator').count() === 1, 'HUD save button shows the spinner ring');
await shot('saving');
await page.locator('[data-testid="save-game"]:has-text("Saved!")').waitFor({ timeout: 3000 });
check(true, 'button acknowledges "Saved!"');
check(await tid('save-row').count() === 1, 'save appears in the list');
check(await page.locator('.save-row.fresh').count() === 1, 'new row is highlighted');
await shot('saved');
let list = await saves();
check(list[0]?.label === 'Before the war', 'index stores the custom name');
const firstId = list[0].id;
const file = await page.evaluate((id) => JSON.parse(localStorage.getItem(`risk3d-save:${id}`)), list[0].id);
check(file.players['player-1']?.data?.territories?.length > 0 && 'armies' in file.players['player-1'].data.territories[0], 'file has { player-1: { name, data: { territories: [{ name, armies }] } } }');
check(file.state.version === g0.version, 'file holds the full engine state');
await page.keyboard.press('Escape');
check(await tid('saves-panel').count() === 0, 'Esc closes the modal');

console.log('play on, then Ctrl+S');
// place all reinforcements on the first own territory via the store (UI flow covered by e2e-hotseat)
await page.evaluate(() => {
  const s = window.__risk.game.getState();
  const g = s.game;
  const me = g.players[g.current].id;
  const t = Object.keys(g.territories).find((k) => g.territories[k].owner === me);
  if (g.phase === 'reinforce' && g.reinforcements > 0) s.dispatch({ type: 'placeReinforcements', territory: t, count: g.reinforcements });
});
await page.waitForTimeout(300);
await idle();
const gPlayed = await game();
check(gPlayed.version !== g0.version, `game moved on (version ${g0.version} → ${gPlayed.version})`);
await page.keyboard.press('Control+s');
await page.locator('[data-testid="popup"]:has-text("Game saved")').waitFor({ timeout: 3000 });
check(true, 'Ctrl+S shows a "Game saved!" popup');
await shot('quicksave');
list = await saves();
check(list.length === 2, 'two saves stored');

console.log('load the first save over the running game');
await tid('panel-toggle-saves').click();
const rows = tid('save-row');
check(await rows.count() === 2, 'list shows both saves');
check(await rows.first().textContent().then((t) => !t.includes('Before the war')), 'newest save is listed first');
await rows.nth(1).locator('[data-testid="save-load"]').click();
await tid('load-confirm').waitFor();
check(true, 'loading over a running game asks for confirmation');
await page.waitForTimeout(450);
await shot('confirm');
await tid('load-confirm-cancel').click();
check(await tid('load-confirm').count() === 0 && (await game()).version === gPlayed.version, '"Keep playing" leaves the game untouched');
await rows.nth(1).locator('[data-testid="save-load"]').click();
await tid('load-confirm-ok').click();
await page.waitForTimeout(400);
const gLoaded = await game();
check(JSON.stringify(gLoaded) === JSON.stringify(file.state), 'game state restored exactly to the first save');
check(gLoaded.version !== gPlayed.version, 'progress since that save is gone (replaced)');
check(await tid('saves-panel').count() === 0, 'modal closes after loading');
check(await page.locator('[data-testid="popup"]:has-text("Loaded")').count() === 1, 'load is acknowledged with a popup');
await shot('loaded');
check(await tid('handoff-curtain').count() === 1, 'hotseat: loaded game hands over to the current player first');
await idle();

console.log('delete');
await tid('panel-toggle-saves').click();
await tid('save-row').first().locator('[data-testid="save-delete"]').click();
await tid('save-delete-confirm').click();
check(await tid('save-row').count() === 1 && (await saves()).length === 1, 'delete removes the save (after confirm)');
await page.keyboard.press('Escape');

console.log('load from the setup screen');
await tid('panel-toggle-settings').click();
await tid('leave-game').click();
await tid('leave-game-confirm').click();
await tid('open-saves').waitFor();
check(await tid('open-saves').textContent().then((t) => t.includes('1')), 'setup screen offers "Load game" with the save count');
await tid('open-saves').click();
await tid('saves-panel').waitFor();
check(await tid('save-game').count() === 0, 'no save bar outside a game');
await page.waitForTimeout(450);
await shot('setup-modal');
await tid('save-load').first().click();
check(await tid('load-confirm').count() === 0, 'no warning when no game is running');
await tid('hud').waitFor();
check(!!(await game()), 'saved game starts from the setup screen');

// let bots play a little to make sure the loaded game runs
await page.waitForTimeout(2500);
await shot('running');

console.log(logs.length ? logs.join('\n') : 'no console errors');
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures.length || logs.some((l) => l.includes('pageerror')) ? 1 : 0);
