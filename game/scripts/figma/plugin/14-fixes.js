// runner script — stage 6b: targeted fixes from the first validation pass (figma/validation/report.md).
// Edits components and screens IN PLACE (never rebuilds a board, so every instance keeps its link).
// The same fixes are folded back into the generating scripts so a fresh build is correct by construction.
/*LIB*/
/*SCREENS*/
/*INCLUDE:_game.js*/
const IMAGES = BACKDROPS; // from _screens.js (per-viewport 3D renders)
const done = [];
const setOfName = async (n) => (await setOf(n))?.name;
const variant = (setName, v) => { const s = COMP[setName]; const c = s?.children?.find((x) => x.name === v); if (!c) throw new Error(`variant ${v} not found in ${setName}`); return c; };

// ---------------------------------------------------------------- A. per-viewport 3D backdrops
{
  const hashes = {};
  for (const [k, b64] of Object.entries(IMAGES || {})) hashes[k] = figma.createImage(figma.base64Decode(b64)).hash;
  const vp = (w) => ({ 1440: 'desktop', 1280: 'laptop', 1024: 'tablet', 1366: 'short', 480: 'mobile' })[w];
  let n = 0;
  for (const f of SCREENS_PAGE.findAllWithCriteria({ types: ['FRAME'] }).filter((x) => x.parent?.type === 'SECTION')) {
    const bg = f.children.find((c) => c.name.startsWith('3D scene') || c.name.startsWith('Scene backdrop'));
    if (!bg) continue;
    const idle = (await instancesOf(f, 'Setup backdrop')).length > 0;
    const h = hashes[`board-${idle ? 'idle' : 'game'}@${vp(f.width)}`];
    if (!h) continue;
    bg.locked = false; bg.fills = [{ type: 'IMAGE', imageHash: h, scaleMode: 'FILL' }]; bg.locked = true; n++;
  }
  done.push(`backdrops: ${n} screens`);
}

// ---------------------------------------------------------------- B. curtain: circle at 50% 40%, farthest corner; card centred
{
  const cur = COMP['Curtain'];
  cur.fills = [gradient('RADIAL', [[0, 'team/Crimson/curtain-in'], [1, 'team/Crimson/curtain-out']], [[0.8, 0, 0.1], [0, 0.5, 0.3]])];
  const card = cur.children.find((c) => c.type === 'INSTANCE'); if (card) card.y = Math.round((900 - card.height) / 2);
  done.push('curtain gradient + centring');
}

// ---------------------------------------------------------------- C. rings: Figma ignores shadow spread on non-clipping frames
{
  ES['Shadow/Icon button on'].effects = ES['Shadow/Icon button on'].effects.filter((e) => !(e.spread > 0 && e.radius === 0));
  for (const v of COMP['Icon button'].children.filter((c) => c.name.includes('State=On'))) stroke(v, 'accent/pink', 3, 'OUTSIDE');
  for (const v of [...COMP['Die button'].children, ...COMP['Swatch'].children]) v.clipsContent = true; // spread rings render once the frame clips
  done.push('rings: icon button On → 3px stroke; die + swatch clip');
}

// ---------------------------------------------------------------- D/E/F. native controls
{
  for (const v of COMP['Text input'].children.filter((c) => !c.name.includes('Focus'))) v.strokes = [];
  for (const v of COMP['Slider'].children) { const t = v.findOne((n) => n.name === 'Track'); if (t) t.fills = [{ type: 'SOLID', color: { r: 0.231, g: 0.231, b: 0.231 } }]; }
  const sel = COMP['Select']; sel.primaryAxisSizingMode = 'FIXED'; sel.resize(100, sel.height); sel.primaryAxisAlignItems = 'SPACE_BETWEEN';
  COMP['Slider'].description = 'Native <input type=range> (Chrome): accent-color pink-deep fill + thumb, #3b3b3b unfilled track (browser default, no token).';
  done.push('inputs: no idle border, Chrome slider track, select 100px');
}

// ---------------------------------------------------------------- G. saved games: fixture data + empty variants
const ROWS = {
  Autosave: { time: 'just now', meta: "Round 11 · 🏰 Fortify · Biscuit's turn", players: [['Lena', 'Default', false], ['Max', 'Default', true], ['Biscuit', 'Eliminated', true, true]] },
  'Pandas rising': { time: 'just now', meta: "Round 7 · 🐶 Reinforce · Max's turn", players: [['Lena', 'Default', false], ['Max', 'Turn', true], ['Biscuit', 'Default', true]] },
  'Sunday showdown': { time: 'just now', meta: "Round 3 · ⚔️ Attack · Lena's turn", players: [['Lena', 'Turn', false], ['Max', 'Default', true], ['Biscuit', 'Default', true]] },
  'Before the big push': { time: 'just now', meta: "Round 4 · 🐶 Reinforce · Lena's turn", players: [['Lena', 'Turn', false], ['Max', 'Default', true], ['Biscuit', 'Default', true]] },
};
async function fillRow(row, label) {
  const d = ROWS[label];
  const set = (name, text) => { const t = row.findOne((n) => n.type === 'TEXT' && n.name === name); if (t) t.characters = text; };
  set('Label', label); set('Time', d.time); set('Meta', d.meta);
  const players = await instancesOf(row, 'Save player');
  d.players.forEach(([name, state, bot, turnToo], i) => {
    const p = players[i]; if (!p) return;
    p.swapComponent(variant('Save player', `State=${state}`));
    p.setProperties(propsOf(COMP['Save player'], { Name: name, Bot: bot }));
    if (turnToo) { const arrow = p.findOne((n) => n.name === 'Turn'); if (arrow) arrow.visible = true; }
  });
  const share = (await instancesOf(row, 'Territory share'))[0];
  if (share) for (const seg of share.children) seg.resize(Math.round((300 - 4) / 3), seg.height);
}
async function panelSlot(variantName) { const v = variant('Saves panel', variantName); return v.findAllWithCriteria({ types: ['SLOT'] })[0]; }
async function rowsIn(variantName) { const v = variant('Saves panel', variantName); return instancesOf(v, 'Save row'); }
{
  // List + Mobile: Autosave, Pandas rising, Sunday showdown (newest first), all idle
  for (const vName of ['State=List', 'State=Mobile']) {
    let rows = await rowsIn(vName);
    const list = rows[0]?.parent;
    if (list && rows.length < 3) { const extra = rows[rows.length - 1].clone(); list.appendChild(extra); rows = await rowsIn(vName); }
    const labels = ['Autosave', 'Pandas rising', 'Sunday showdown'];
    for (const [i, r] of rows.entries()) { if (vName === 'State=List') r.swapComponent(variant('Save row', 'State=Default')); await fillRow(r, labels[i]); }
  }
  // Load confirm: two saves, confirming the newest
  { const rows = await rowsIn('State=Load confirm'); await fillRow(rows[0], 'Pandas rising'); await fillRow(rows[1], 'Sunday showdown');
    const v = variant('Saves panel', 'State=Load confirm'); const t = v.findOne((n) => n.type === 'TEXT' && n.characters.startsWith('Load “')); if (t) t.characters = 'Load “Pandas rising”?'; }
  // Delete confirm: just saved + asking to delete the second
  { const rows = await rowsIn('State=Delete confirm'); const labels = ['Before the big push', 'Pandas rising', 'Sunday showdown']; for (const [i, r] of rows.entries()) await fillRow(r, labels[i]); }
  for (const vName of ['State=Online', 'State=Error']) { const rows = await rowsIn(vName); const labels = ['Pandas rising', 'Sunday showdown']; for (const [i, r] of rows.entries()) await fillRow(r, labels[i]); }

  // Empty → in game (save bar + tip, no count) and a new setup variant (no bar, setup hint)
  const already = COMP['Saves panel'].children.some((c) => c.name === 'State=Empty (setup)'); // idempotent re-runs
  const empty = already ? variant('Saves panel', 'State=Empty (in game)') : variant('Saves panel', 'State=Empty');
  let setupV = already ? variant('Saves panel', 'State=Empty (setup)') : null;
  if (!already) { empty.name = 'State=Empty (in game)'; setupV = empty.clone(); COMP['Saves panel'].appendChild(setupV); setupV.name = 'State=Empty (setup)'; }
  if (!already) {
    const slot = empty.findAllWithCriteria({ types: ['SLOT'] })[0];
    const head = slot.children.find((n) => n.name === 'Head');
    const bar = use('Save bar', 'State=Idle'); slot.insertChild(0, bar); bar.layoutSizingHorizontal = 'FILL';
    if (head) { const [count] = head.children.filter((n) => n.type === 'TEXT'); if (count) count.characters = ' '; head.appendChild(await T('Tip: Ctrl+S saves instantly', 'Caption/12', 'text/secondary')); }
  }
  if (!already) {
    const slot = setupV.findAllWithCriteria({ types: ['SLOT'] })[0];
    const head = slot.children.find((n) => n.name === 'Head'); if (head) head.remove();
    const hint = setupV.findOne((n) => n.type === 'TEXT' && n.name === 'Hint'); if (hint) hint.characters = 'Start a local game and save it from the 💾 button.';
  }
  // screens: the setup-context screen uses the setup variant; add the in-game empty screen next to it
  const setupScreen = SCREENS_PAGE.findOne((n) => n.type === 'FRAME' && n.name === 'Saved games · empty (setup)');
  if (setupScreen) for (const i of await instancesOf(setupScreen, 'Saves panel')) i.swapComponent(setupV);
  if (setupScreen && !SCREENS_PAGE.findOne((n) => n.type === 'FRAME' && n.name === 'Saved games · empty')) {
    const sec = setupScreen.parent;
    const f = figma.createFrame(); f.name = 'Saved games · empty'; f.resize(1440, 900); f.clipsContent = true; f.fills = [{ type: 'SOLID', color: { r: 0.812, g: 0.89, b: 0.933 } }];
    const bg = figma.createRectangle(); bg.name = '3D scene (render · not part of the UI library)'; bg.resize(1440, 900);
    const src = setupScreen.parent.parent.findOne((n) => n.type === 'FRAME' && n.name === 'Saved games · list')?.children.find((c) => c.name.startsWith('3D scene') || c.name.startsWith('Scene backdrop'));
    bg.fills = src ? src.fills : []; f.appendChild(bg); bg.locked = true;
    sec.appendChild(f);
    let maxX = 0; for (const c of sec.children) if (c.type === 'FRAME') maxX = Math.max(maxX, c.x + c.width);
    f.x = maxX + SCREEN_GAP; f.y = setupScreen.y;
    const label = await T('Saved games · empty', 'Heading/Must trade 24', 'text/primary', { name: 'Screen label' }); sec.appendChild(label); label.x = f.x; label.y = f.y - 44; label.locked = true;
    await chrome(f, { phase: 'Attack', instruction: 'Attack' });
    at(f, use('Modal scrim'), { left: 0, top: 0 });
    at(f, use('Saves panel', 'State=Empty (in game)'), { cx: true, cy: true });
    let mx = 0, my = 0; for (const c of sec.children) { mx = Math.max(mx, c.x + c.width); my = Math.max(my, c.y + c.height); }
    sec.resizeWithoutConstraints(mx + 120, my + 120);
  }
  done.push('saves: fixture data in all list variants, Empty (in game) + Empty (setup), new in-game empty screen');
}

// ---------------------------------------------------------------- H. attack odds = the fixture's real numbers
{
  const setOdds = async (vName, oddsVariant, label, pct) => {
    const v = variant('Dialogs', vName);
    const [o] = await instancesOf(v, 'Odds bar');
    if (!o) return;
    if (oddsVariant) o.swapComponent(variant('Odds bar', oddsVariant));
    const t = o.findOne((n) => n.type === 'TEXT'); if (t) t.characters = label;
    const fillR = o.findOne((n) => n.name === 'Fill'); if (fillR) fillR.resize(Math.max(4, Math.round(272 * pct)), 8);
  };
  await setOdds('Dialog=Attack, State=Ready', null, 'Great odds · 86% to conquer (blitz)', 0.86);
  await setOdds('Dialog=Attack, State=Waiting', null, 'Great odds · 86% to conquer (blitz)', 0.86);
  await setOdds('Dialog=Attack, State=Risky', 'Odds=Long shot', 'Long shot · 2% to conquer (blitz)', 0.02);
  done.push('attack odds 86% / long shot 2%');
}

return { done };
