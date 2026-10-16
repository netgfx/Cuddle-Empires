// use_figma script — stage 3c: Data display board (chips, steps, score rows, lists, pickers).
// Depends on 02-controls (ids from figma/state.json).
/*LIB*/
const sets = await components({ unit: 'Unit icon', badge: 'Badge', chipTag: 'Chip tag', roundButton: 'Round button', slider: 'Slider' }); // by name — no node ids
const inst = (k, variant) => (variant ? sets[k].children.find((c) => c.name === variant) : sets[k].defaultVariant).createInstance();
const propKey = (set, name) => Object.keys(set.componentPropertyDefinitions).find((k) => k.startsWith(name + '#') || k === name);
const ids = {};
/** ▶ / ◀ as vectors bound to the team colour — the glyphs fall back to emoji tiles in Figma (ISSUES #10). */
function tri(dir, w, h, name) {
  const d = dir === 'right' ? `M0 0 L${w} ${h / 2} L0 ${h} Z` : `M${w} 0 L0 ${h / 2} L${w} ${h} Z`;
  const n = figma.createNodeFromSvg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#E63946"/></svg>`);
  n.name = name; n.fills = []; for (const v of n.findAll((x) => x.type === 'VECTOR')) v.fills = [solid('team/Crimson/base')];
  return n;
}
// let slider instances stretch (count picker fills its row)
for (const v of sets.slider.children) for (const n of v.children) n.constraints = { horizontal: n.name === 'Track' ? 'STRETCH' : 'SCALE', vertical: 'CENTER' };
const B = await board('Data display', 'Chips, steps, rows and pickers. Player colour = team/<Colour>/* variables (CSS --pc), continent colour = cont/<Id>/* (CSS --cc). Components default to Crimson / Asia; instances are retinted.');

// ---------------------------------------------------------------- Chip dot
let dotSet;
{
  const g = await group(B, 'Chip dot', '.chip-dot — player colour dot with a white 2px ring. 14px default; 11px in neighbour / save rows; 10px in the log.');
  const cs = [];
  for (const s of [14, 11, 10]) {
    const c = figma.createComponent(); c.name = `Size=${s}`; c.resize(s, s); radius(c, 999); fill(c, 'team/Crimson/base');
    stroke(c, 'surface/white', 2, 'OUTSIDE');
    c.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: 'NORMAL' }];
    cs.push(c);
  }
  dotSet = variantSet(cs, 'Chip dot', g, { w: 200 });
  ids.dot = dotSet.id;
}
const dotI = (s = 14) => dotSet.children.find((c) => c.name === `Size=${s}`).createInstance();

// ---------------------------------------------------------------- Player chip
{
  const g = await group(B, 'Player chip', '.chip — PlayerChip (src/ui/common.tsx): tinted pill, 55% colour ring, dot, name, optional bot / you tag. HUD size is the turn chip in the top bar.');
  const cs = [], names = [], tags = [];
  for (const [size, padv, type] of [['HUD', [6, 14, 6, 8], 'Body/Strong 16'], ['Default', [4, 12, 4, 6], 'Body/Strong 16'], ['Small', [2, 9, 2, 4], 'Label/13 strong']]) {
    const c = CMP('H', { name: `Size=${size}`, gap: 6, pad: padv, r: 999, fill: 'team/Crimson/tint-18' });
    stroke(c, 'team/Crimson/ring-55', 2, 'INSIDE');
    const n = await T('Lena', type, 'text/primary', { name: 'Name' });
    const tag = inst('chipTag'); tag.name = 'Tag';
    add(c, dotI(14), n, tag);
    cs.push(c); names.push(n); tags.push(tag);
  }
  const set = variantSet(cs, 'Player chip', g, { w: 420 });
  const kN = set.addComponentProperty('Name', 'TEXT', 'Lena');
  const kT = set.addComponentProperty('Show tag', 'BOOLEAN', false);
  names.forEach((t) => { t.componentPropertyReferences = { characters: kN }; });
  tags.forEach((t) => { t.componentPropertyReferences = { visible: kT }; t.isExposedInstance = true; });
  ids.playerChip = set.id;
}

// ---------------------------------------------------------------- Continent chip
{
  const g = await group(B, 'Continent chip', '.cont-chip — continent initials (bound to cont/<Id>/abbr) on the continent colour; Square = the 14px key in the territory panel.');
  const label = CMP('H', { name: 'Shape=Label', main: 'CENTER', cross: 'CENTER', pad: [0, 4], r: 6, fill: 'cont/Asia/base' });
  label.resize(22, 18); label.primaryAxisSizingMode = 'AUTO'; label.minWidth = 22;
  const t = await T('A', 'Micro/Continent 10', 'text/on-accent', { name: 'Abbr' }); t.setBoundVariable('characters', vr('cont/Asia/abbr'));
  t.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.3 }, offset: { x: 0, y: 1 }, radius: 1, spread: 0, visible: true, blendMode: 'NORMAL' }];
  add(label, t);
  const sq = figma.createComponent(); sq.name = 'Shape=Square'; sq.resize(14, 14); radius(sq, 4); fill(sq, 'cont/Asia/base');
  ids.contChip = variantSet([label, sq], 'Continent chip', g, { w: 200 }).id;
}

// ---------------------------------------------------------------- Army stack
{
  const g = await group(B, 'Army stack', 'ArmyStack — army count broken into pandas (10), ponies (5) and dogs (1): 🐼×2 🐴×1 🐶×3.');
  const c = CMP('H', { name: 'Army stack', gap: 8, description: 'ArmyStack (src/ui/common.tsx). Toggle parts off for counts without that animal.' });
  const props = [];
  for (const [animal, n] of [['Panda', 2], ['Pony', 1], ['Dog', 3]]) {
    const part = AL('H', { name: animal, gap: 2 });
    const icon = inst('unit', `Animal=${animal}`); icon.resize(22, 22);
    const t = await T(`×${n}`, 'Body/Strong 16', 'text/primary', { name: 'Count' });
    add(part, icon, t); c.appendChild(part); props.push([animal, n, part, t]);
  }
  for (const [animal, n, part, t] of props) { textProp(c, `${animal} count`, `×${n}`, t); boolProp(c, `Show ${animal.toLowerCase()}`, true, part); }
  g.appendChild(c); ids.armyStack = c.id;
}

// ---------------------------------------------------------------- Phase step
let stepSet;
{
  const g = await group(B, 'Phase step', '.step — Reinforce → Attack → Fortify pills in the HUD. Active: pink gradient, scale(1.06); Done: opacity .6; Setup active: mint gradient (claim / deploy). Padding + size bound to layout/desktop/step-*; ≤1280px 5/10 + 14px, ≤1100px hides the icon.');
  const cs = [], labels = [], icons = [];
  for (const state of ['Idle', 'Active', 'Done', 'Setup active']) {
    const on = state.includes('Active') || state === 'Setup active';
    const c = CMP('H', { name: `State=${state}`, gap: 5, r: 999, cross: 'CENTER' });
    for (const [f, v] of [['paddingTop', 'step-pad-y'], ['paddingBottom', 'step-pad-y'], ['paddingLeft', 'step-pad-x'], ['paddingRight', 'step-pad-x']]) c.setBoundVariable(f, vr(`layout/desktop/${v}`));
    if (state === 'Active') { await paintStyle(c, 'Gradient/Step on'); await fx(c, 'Shadow/Step on'); }
    else if (state === 'Setup active') { await paintStyle(c, 'Gradient/Step setup on'); await fx(c, 'Shadow/Step setup on'); }
    else fill(c, 'surface/track-soft');
    if (state === 'Done') c.opacity = 0.6;
    const icon = await E('⚔️', 14, 'Icon');
    const t = await T('Attack', on ? 'Body/Button 15' : 'Body/Default 15', on ? 'text/on-accent' : 'text/secondary', { name: 'Label' });
    t.setBoundVariable('fontSize', vr('layout/desktop/step-font'));
    add(c, icon, t); cs.push(c); labels.push(t); icons.push(icon);
  }
  stepSet = variantSet(cs, 'Phase step', g, { w: 560 });
  const kL = stepSet.addComponentProperty('Label', 'TEXT', 'Attack');
  const kI = stepSet.addComponentProperty('Icon', 'TEXT', '⚔️');
  const kS = stepSet.addComponentProperty('Show icon', 'BOOLEAN', true);
  labels.forEach((t) => { t.componentPropertyReferences = { characters: kL }; });
  icons.forEach((t) => { t.componentPropertyReferences = { characters: kI, visible: kS }; });
  ids.step = stepSet.id;
  const arrow = await T('→', 'Body/Button 15', 'text/muted-arrow', { name: 'Step arrow' });
  const ac = CMP('H', { name: 'Step arrow', description: '.step-arrow between phase steps.' }); add(ac, arrow); g.appendChild(ac); ids.stepArrow = ac.id;
}

// ---------------------------------------------------------------- Score row
{
  const g = await group(B, 'Score row', '.score-row — one player in the scoreboard: name, territories / armies / cards, next reinforcement estimate, held continents. Current = tinted + coloured border + bobbing ▶; Eliminated = .5 + strike; Neutral = .6 + greyscale.');
  const cs = [], names = [], stats = [];
  for (const state of ['Default', 'Current', 'Eliminated', 'Neutral']) {
    const c = CMP('V', { name: `State=${state}`, gap: 3, pad: [8, 10], r: 14, w: 234 });
    if (state === 'Current') { fill(c, 'team/Crimson/tint-16'); stroke(c, 'team/Crimson/ring-60', 2, 'INSIDE'); }
    else { c.strokes = []; }
    if (state === 'Eliminated') c.opacity = 0.5;
    if (state === 'Neutral') c.opacity = 0.6;
    const head = AL('H', { name: 'Name row', gap: 7 });
    const nm = await T(state === 'Neutral' ? 'Neutral' : 'Lena', 'Body/Strong 16', 'text/primary', { name: 'Name' });
    if (state === 'Eliminated') nm.textDecoration = 'STRIKETHROUGH';
    const tag = inst('chipTag'); tag.name = 'Tag';
    const flag = tri('right', 11, 13, 'Turn flag');
    add(head, dotI(14), nm, tag, flag); c.appendChild(head); grow(head);
    flag.layoutGrow = 0; nm.layoutGrow = 1;
    flag.visible = state === 'Current';
    const st = AL('H', { name: 'Stats', gap: 10, pad: [0, 0, 0, 21] });
    const terr = await T('🗺️ 14', 'Label/13 regular', 'text/secondary', { name: 'Territories' });
    const arm = await T('🐶 35', 'Label/13 regular', 'text/secondary', { name: 'Armies' });
    const crd = await T('🃏 3', 'Label/13 regular', 'text/secondary', { name: 'Cards' });
    const nxt = await T('+4', 'Label/13 strong', 'text/success', { name: 'Next' });
    add(st, terr, arm, crd, nxt); c.appendChild(st); grow(st);
    nxt.layoutGrow = 1; nxt.textAlignHorizontal = 'RIGHT';
    if (state === 'Neutral') { crd.visible = false; nxt.visible = false; }
    const conts = AL('H', { name: 'Continents', gap: 4, pad: [1, 0, 0, 21] });
    const chip = (await figma.getNodeByIdAsync(ids.contChip)).children[0].createInstance();
    add(conts, chip); c.appendChild(conts);
    conts.visible = state === 'Current';
    cs.push(c); names.push(nm); stats.push([terr, arm, crd, nxt, tag, conts]);
  }
  const set = variantSet(cs, 'Score row', g, { w: 560, cross: 'MIN' });
  const kN = set.addComponentProperty('Name', 'TEXT', 'Lena');
  const kTr = set.addComponentProperty('Territories', 'TEXT', '🗺️ 14');
  const kAr = set.addComponentProperty('Armies', 'TEXT', '🐶 35');
  const kCa = set.addComponentProperty('Cards', 'TEXT', '🃏 3');
  const kNx = set.addComponentProperty('Next', 'TEXT', '+4');
  const kBot = set.addComponentProperty('Bot', 'BOOLEAN', false);
  const kCo = set.addComponentProperty('Holds continent', 'BOOLEAN', false);
  names.forEach((t, i) => { if (cs[i].name !== 'State=Neutral') t.componentPropertyReferences = { characters: kN }; });
  stats.forEach(([a, b, c2, d, tag, conts], i) => {
    a.componentPropertyReferences = { characters: kTr }; b.componentPropertyReferences = { characters: kAr };
    c2.componentPropertyReferences = { characters: kCa }; d.componentPropertyReferences = { characters: kNx };
    tag.componentPropertyReferences = { visible: kBot }; conts.componentPropertyReferences = { visible: kCo };
  });
  ids.scoreRow = set.id;
}

// ---------------------------------------------------------------- Neighbour button + log item
{
  const g = await group(B, 'Lists', '.neigh-btn (territory panel neighbours, hover lifts 2px) and .log-list li (battle log: round, player dot, text, dashed divider).');
  const nb = [];
  for (const state of ['Default', 'Hover']) {
    const c = CMP('H', { name: `State=${state}`, gap: 5, pad: [4, 10, 4, 5], r: 999, fill: state === 'Hover' ? 'surface/white' : 'surface/glass-80' });
    await fx(c, 'Shadow/Neighbour');
    add(c, dotI(11), await T('Venezuela', 'Label/13 regular', 'text/primary', { name: 'Name' }), await T('3', 'Label/13 regular', 'text/secondary', { name: 'Armies' }));
    nb.push(c);
  }
  const nset = variantSet(nb, 'Neighbour button', g, { w: 360 });
  const kn = nset.addComponentProperty('Name', 'TEXT', 'Venezuela'); const ka = nset.addComponentProperty('Armies', 'TEXT', '3');
  for (const v of nset.children) { v.findOne((n) => n.name === 'Name').componentPropertyReferences = { characters: kn }; v.findOne((n) => n.name === 'Armies').componentPropertyReferences = { characters: ka }; }
  ids.neighbour = nset.id;

  const li = CMP('H', { name: 'Log item', gap: 6, pad: [5, 0], w: 254, cross: 'MIN', description: '.log-list li — newest first, max 200 entries.' });
  stroke(li, 'border/line', 1, 'INSIDE', [3, 3]); li.strokeTopWeight = 0; li.strokeLeftWeight = 0; li.strokeRightWeight = 0; li.strokeBottomWeight = 1;
  const r = await T('R4', 'Caption/11', 'text/secondary', { name: 'Round' });
  const d = dotI(10);
  const tx = await T('Lena conquered Peru', 'Label/13 regular', 'text/primary', { name: 'Text' });
  add(li, r, d, tx); grow(tx); r.minWidth = 24; // minWidth only after the node is in an auto-layout parent
  textProp(li, 'Round', 'R4', r); textProp(li, 'Text', 'Lena conquered Peru', tx);
  g.appendChild(li); ids.logItem = li.id;
}

// ---------------------------------------------------------------- Odds bar + count picker + VS side
{
  const g = await group(B, 'Battle widgets', 'Attack panel odds (sun → mint gradient, label from blitz win probability), CountPicker (occupy / fortify) and the VS sides.');
  const odds = [];
  for (const [label, pct] of [['Great odds', 0.92], ['Good odds', 0.72], ['Coin flip', 0.5], ['Risky', 0.28], ['Long shot', 0.1]]) {
    const c = CMP('V', { name: `Odds=${label}`, gap: 4, cross: 'CENTER', w: 340 });
    const track = AL('H', { name: 'Track', r: 999, fill: 'surface/track-strong', clip: true, w: 272, h: 8 });
    const bar = figma.createRectangle(); bar.name = 'Fill'; bar.resize(Math.max(4, 272 * pct), 8); radius(bar, 999); await paintStyle(bar, 'Gradient/Odds');
    track.appendChild(bar);
    add(c, track, await T(`${label} · ${Math.round(pct * 100)}% to conquer (blitz)`, 'Label/13 regular', 'text/secondary', { name: 'Label' }));
    odds.push(c);
  }
  ids.odds = variantSet(odds, 'Odds bar', g, { w: 760 }).id;

  const cp = CMP('H', { name: 'Count picker', gap: 10, w: 340, description: 'CountPicker (src/ui/common.tsx): − slider + and the value (24px bold pink).' });
  const minus = inst('roundButton'); minus.setProperties({ [propKey(sets.roundButton, 'Sign')]: '−' });
  const slider = inst('slider', 'Value=High');
  const plus = inst('roundButton');
  const val = await T('7', 'Number/Count 24', 'text/accent', { name: 'Value', align: 'CENTER' }); val.textAutoResize = 'HEIGHT'; val.resize(42, val.height);
  add(cp, minus, slider, plus, val); slider.layoutGrow = 1;
  textProp(cp, 'Value', '7', val);
  g.appendChild(cp); ids.countPicker = cp.id;

  const vs = CMP('H', { name: 'VS side', gap: 6, pad: [5, 12, 5, 6], r: 999, fill: 'team/Crimson/tint-15', description: '.vs-side — attacker / defender territory with armies.' });
  const vn = await T('Peru', 'Body/VS 17', 'text/primary', { name: 'Territory' });
  const va = await T('(7)', 'Body/VS 17', 'text/primary', { name: 'Armies' }); va.fontName = { family: 'Fredoka', style: 'SemiBold' };
  add(vs, dotI(14), vn, va); textProp(vs, 'Territory', 'Peru', vn); textProp(vs, 'Armies', '(7)', va);
  g.appendChild(vs); ids.vsSide = vs.id;
}

// ---------------------------------------------------------------- Save widgets
{
  const g = await group(B, 'Save widgets', '.save-player (Turn = bold + ◀ in player colour, Eliminated = strike .5) and .save-share (territory share bar, one segment per player).');
  const sp2 = [];
  for (const state of ['Default', 'Turn', 'Eliminated']) {
    const c = CMP('H', { name: `State=${state}`, gap: 5 });
    if (state === 'Eliminated') c.opacity = 0.5;
    const n = await T('Lena', state === 'Turn' ? 'Label/13 strong' : 'Label/13', 'text/primary', { name: 'Name' });
    if (state === 'Turn') n.fontName = { family: 'Fredoka', style: 'Bold' };
    if (state === 'Eliminated') n.textDecoration = 'STRIKETHROUGH';
    const tag = inst('chipTag'); tag.name = 'Tag'; tag.visible = false;
    const arrow = tri('left', 7, 8, 'Turn'); arrow.visible = state === 'Turn';
    add(c, dotI(11), n, tag, arrow); sp2.push(c);
  }
  const s = variantSet(sp2, 'Save player', g, { w: 420 });
  const kn = s.addComponentProperty('Name', 'TEXT', 'Lena'); const kb = s.addComponentProperty('Bot', 'BOOLEAN', false);
  for (const v of s.children) { v.findOne((n) => n.name === 'Name').componentPropertyReferences = { characters: kn }; v.findOne((n) => n.name === 'Tag').componentPropertyReferences = { visible: kb }; }
  ids.savePlayer = s.id;

  const share = CMP('H', { name: 'Territory share', gap: 2, r: 999, fill: 'surface/track', clip: true, w: 300, h: 6, description: '.save-share — segment widths = territories per player (flex-grow).' });
  // layoutGrow is 0|1 in Figma, so flex-grow ratios become proportional fixed widths
  const parts = [['Crimson', 16], ['Azure', 14], ['Lime', 12]]; const total = parts.reduce((n, [, x]) => n + x, 0);
  for (const [team, n] of parts) {
    const seg = figma.createRectangle(); seg.name = team; seg.resize(Math.round((300 - 2 * (parts.length - 1)) * n / total), 6); fill(seg, `team/${team}/base`); share.appendChild(seg);
  }
  g.appendChild(share); ids.share = share.id;
}

return { ids, made: made.length, board: B.id };
