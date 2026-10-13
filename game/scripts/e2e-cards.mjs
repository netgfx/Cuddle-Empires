// E2E: card hand + forced trade through the UI. Injects a state where the current human holds 5 cards
// (one valid set guaranteed), then trades via the must-trade modal. Usage: node scripts/e2e-cards.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = 'e2e-cards'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript(() => { try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 1, showLabels: true }, version: 0 })); } catch { /* */ } });
const failures = []; const check = (c, m) => { (c ? console.log('  ✓', m) : (failures.push(m), console.log('  ✗', m))); };
const tid = (id) => page.locator(`[data-testid="${id}"]`);
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForTimeout(2000);
const inj = await page.evaluate(() => {
  const R = window.__risk; const g0 = R.game.getState();
  g0.startLocal([{ id: 'p1', name: 'Ann', color: '#E63946', kind: 'human' }, { id: 'p2', name: 'Robo', color: '#3A86FF', kind: 'bot' }, { id: 'p3', name: 'Kiki', color: '#6CC24A', kind: 'bot' }], { setup: 'auto' }, 42);
  const st = structuredClone(R.game.getState().game);
  // make Ann current, give her 5 cards: infantry/cavalry/artillery of territories she owns + 2 others
  st.current = st.players.findIndex((p) => p.id === 'p1');
  const ann = st.players[st.current];
  const owned = Object.keys(st.territories).filter((t) => st.territories[t].owner === 'p1');
  const pick = [];
  for (const unit of ['infantry', 'cavalry', 'artillery']) { const id = st.deck.find((c) => st.cards[c].unit === unit && owned.includes(st.cards[c].territory) && !pick.includes(c)); pick.push(id); }
  for (const c of st.deck) { if (pick.length >= 5) break; if (!pick.includes(c) && st.cards[c].unit !== 'wild') pick.push(c); }
  st.deck = st.deck.filter((c) => !pick.includes(c)); ann.cards = pick;
  st.phase = 'reinforce'; st.mustTrade = true; st.reinforcements = 3; st.pendingOccupy = null;
  R.game.getState().attachTransport(new R.LocalTransport(st), st);
  return { cards: pick, sets: st.setsTraded };
});
console.log('injected', JSON.stringify(inj));
await page.waitForTimeout(2500);
if (await tid('handoff-continue').count()) await tid('handoff-continue').click();
await page.waitForTimeout(800);
check(await tid('must-trade').isVisible().catch(() => false), 'must-trade modal is shown with 5 cards');
await page.screenshot({ path: `${out}/01_must_trade.png` });
const cardsShown = await page.locator('[data-testid^="card-card-"], [data-testid^="card-wild-"]').count();
check(cardsShown >= 5, `hand shows the 5 cards (${cardsShown} card elements)`);
// try to dismiss: backdrop click must not close it
await tid('must-trade-backdrop').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.waitForTimeout(400);
check(await tid('must-trade').isVisible().catch(() => false), 'must-trade modal cannot be dismissed');
await tid('suggest-set').first().click();
await page.waitForTimeout(400);
const tradeEnabled = await tid('trade-btn').first().isEnabled();
check(tradeEnabled, 'Trade button enabled for the suggested set');
await page.screenshot({ path: `${out}/02_set_selected.png` });
await tid('trade-btn').first().click();
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/03_trade_anim.png` });
await page.waitForTimeout(3500);
const after = await page.evaluate(() => { const g = window.__risk.game.getState().game; const a = g.players.find((p) => p.id === 'p1'); return { sets: g.setsTraded, hand: a.cards.length, reinf: g.reinforcements, must: g.mustTrade }; });
check(after.sets === 1, 'setsTraded = 1');
check(after.hand === 2, `hand down to 2 (${after.hand})`);
check(after.reinf === 3 + 4, `reinforcements 3 + 4 = ${after.reinf}`);
check(!after.must && !(await tid('must-trade').isVisible().catch(() => false)), 'must-trade cleared and modal closed');
await page.screenshot({ path: `${out}/04_after_trade.png` });
console.log(`checks failed: ${failures.length}`); console.log(logs.length ? [...new Set(logs)].join('\n') : 'no console errors');
await browser.close(); process.exit(failures.length ? 1 : 0);
