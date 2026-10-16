// use_figma script — stage 3e: Panels & dialogs board. Panel and Dialog shells expose a SLOT for their
// body (like React children); every concrete panel / dialog is a component that fills that slot.
// Source: src/ui/common.tsx (PanelBox), Panels.tsx, Scoreboard.tsx, TerritoryInfo.tsx, Dialogs.tsx.
/*LIB*/
// Elevation styles (mirrors extract-tokens.mjs; created here if the foundations sync has not run yet)
for (const [name, shadow, blur] of [['Elevation/Glass panel', 'Shadow/Panel', 14], ['Elevation/Glass setup', 'Shadow/Setup card', 16], ['Elevation/Backdrop', null, 4]]) {
  if (ES[name]) continue;
  const s = figma.createEffectStyle(); s.name = name;
  s.effects = [...(shadow ? ES[shadow].effects : []), { type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: blur, visible: true }];
  ES[name] = s;
}
const S = await components({ iconButton: 'Icon button', button: 'Button', buttonSmall: 'Button Small', select: 'Select', slider: 'Slider', checkbox: 'Checkbox', segOption: 'Seg option', segControl: 'Segmented control', unit: 'Unit icon', die: 'Die button', chipTag: 'Chip tag', dot: 'Chip dot', playerChip: 'Player chip', contChip: 'Continent chip', armyStack: 'Army stack', scoreRow: 'Score row', neighbour: 'Neighbour button', logItem: 'Log item', odds: 'Odds bar', countPicker: 'Count picker', vsSide: 'VS side' }); // by name — no node ids
const vOf = (k, name) => (S[k].type === 'COMPONENT_SET' ? (name ? S[k].children.find((c) => c.name === name) : S[k].defaultVariant) : S[k]);
const I = (k, name) => { const m = vOf(k, name); if (!m) throw new Error(`variant "${name}" not found in ${S[k].name}`); return m.createInstance(); };
const pk = (k, name) => { const owner = S[k].type === 'COMPONENT_SET' ? S[k] : S[k]; return Object.keys(owner.componentPropertyDefinitions).find((x) => x.startsWith(name + '#')); };
const setP = (inst, k, props) => { const o = {}; for (const [n, v] of Object.entries(props)) o[pk(k, n)] = v; inst.setProperties(o); return inst; };
const btn = (k, style, label, state = 'Default') => setP(I(k, `Style=${style}, State=${state}`), k, { Label: label });
const ids = {};
const B = await board('Panels & dialogs', 'Glass panels (PanelBox) and top-centre dialogs. Panel and Dialog expose a Body / Content slot — drop any content in. Glass = 82% cream + 14px backdrop blur + soft violet shadow + 1px white rim. Panels pop in with panelIn .35s (translateY(-10px) scale(.96) → none).');

// ---------------------------------------------------------------- shells with slots
let panelC, dialogC;
{
  const g = await group(B, 'Panel shell', 'PanelBox (src/ui/common.tsx): header (title 18/600 + optional ✕) and a scrollable body slot (padding 4 18 16). Width comes from the placement: right column 290 (260 ≤1280), settings 300, saves 600, help 860.');
  panelC = CMP('V', { name: 'Panel', r: 20, fill: 'surface/panel', w: 290, clip: true, description: '<section class="panel"> — PanelBox. Fill the Body slot with content; toggle Close.' });
  stroke(panelC, 'border/glass', 1, 'INSIDE'); await fx(panelC, 'Elevation/Glass panel');
  const head = AL('H', { name: 'Header', main: 'SPACE_BETWEEN', pad: [12, 14, 6, 18] });
  const title = await T('🗺️ Territory', 'Heading/Panel 18', 'text/primary', { name: 'Title' });
  const close = setP(I('iconButton', 'Size=Small, State=Default'), 'iconButton', { Icon: '✕' }); close.name = 'Close';
  add(head, title, close); panelC.appendChild(head); grow(head);
  textProp(panelC, 'Title', '🗺️ Territory', title); boolProp(panelC, 'Close', true, close);
  const body = panelC.createSlot(); body.name = 'Body';
  body.layoutMode = 'VERTICAL'; body.primaryAxisSizingMode = 'AUTO'; body.counterAxisSizingMode = 'FIXED'; body.fills = [];
  body.paddingTop = 4; body.paddingRight = 18; body.paddingBottom = 16; body.paddingLeft = 18; body.itemSpacing = 0;
  grow(body);
  add(body, await T('Hover or click a territory on the map to see its details.', 'Body/Default 15', 'text/secondary', { name: 'Placeholder', w: 254 }));
  g.appendChild(panelC); ids.panel = panelC.id;

  const g2 = await group(B, 'Dialog shell', '.dialog — top-centre (under the HUD instruction) so the dice tray stays visible: radius 24, padding 14 20 16, min-width 380 (320 ≤1100), max min(520, 100vw − 600), centred column gap 10. Pops in (.35s overshoot).');
  dialogC = CMP('V', { name: 'Dialog', r: 24, fill: 'surface/panel', pad: [14, 20, 16, 20], cross: 'CENTER', gap: 10, description: '<div class="dialog"> — attack / occupy / fortify. Fill the Content slot.' });
  dialogC.minWidth = 380; dialogC.maxWidth = 520;
  stroke(dialogC, 'border/glass', 1, 'INSIDE'); await fx(dialogC, 'Elevation/Glass panel');
  const content = dialogC.createSlot(); content.name = 'Content';
  content.layoutMode = 'VERTICAL'; content.primaryAxisSizingMode = 'AUTO'; content.counterAxisSizingMode = 'AUTO'; content.counterAxisAlignItems = 'CENTER'; content.itemSpacing = 10; content.fills = [];
  add(content, await T('Dialog content', 'Body/Default 15', 'text/secondary'));
  g2.appendChild(dialogC); ids.dialog = dialogC.id;
}

/** Instance of a shell with its slot filled. */
async function shell(comp, kids, o = {}) {
  const i = comp.createInstance();
  if (o.w) i.resize(o.w, i.height);
  if (o.title != null) i.setProperties({ [Object.keys(comp.componentPropertyDefinitions).find((k) => k.startsWith('Title#'))]: o.title });
  if (o.close === false) i.setProperties({ [Object.keys(comp.componentPropertyDefinitions).find((k) => k.startsWith('Close#'))]: false });
  const slot = i.findAllWithCriteria({ types: ['SLOT'] })[0];
  for (const c of [...slot.children]) c.remove();
  for (const k of kids) { slot.appendChild(k); if (o.fill !== false && 'layoutSizingHorizontal' in k && k.type !== 'TEXT') { try { k.layoutSizingHorizontal = 'FILL'; } catch { /* hug */ } } }
  return i;
}
/** Component that wraps one shell instance (so variants can differ by slot content). */
function wrap(name, inner, description) {
  const c = CMP('V', { name, description }); c.appendChild(inner); return c;
}

// ---------------------------------------------------------------- Scoreboard
{
  const g = await group(B, 'Scoreboard', '.scoreboard — top-left, 250px (220 ≤1280), max-height 100vh − 300. Header toggles; the body collapses with grid-template-rows 1fr → 0fr (.4s). Rows: current player first-class, neutral shown only in 2-player games.');
  const cs = [];
  for (const state of ['Open', 'Closed']) {
    const c = CMP('V', { name: `State=${state}`, r: 20, fill: 'surface/panel', clip: true, w: 250 });
    c.setBoundVariable('width', vr('layout/desktop/scoreboard-w'));
    stroke(c, 'border/glass', 1, 'INSIDE'); await fx(c, 'Elevation/Glass panel');
    const head = AL('H', { name: 'Header', main: 'SPACE_BETWEEN', pad: [10, 16] });
    add(head, await T('🏆 Players', 'Body/Strong 16', 'text/primary', { name: 'Title' }), await T(state === 'Open' ? '▴' : '▾', 'Body/Strong 16', 'text/primary', { name: 'Caret' }));
    c.appendChild(head); grow(head);
    if (state === 'Open') {
      const body = AL('V', { name: 'Body', gap: 4, pad: [0, 8, 8, 8] });
      for (const [name, team, st, terr, arm, cards, next, bot, cont] of [['Lena', 'Crimson', 'Current', 14, 35, 3, '+4', false, false], ['Max', 'Azure', 'Default', 14, 35, 0, '+6', true, true], ['Biscuit', 'Lime', 'Default', 14, 35, 0, '+4', true, false]]) {
        const r = setP(I('scoreRow', `State=${st}`), 'scoreRow', { Name: name, Territories: `🗺️ ${terr}`, Armies: `🐶 ${arm}`, Cards: `🃏 ${cards}`, Next: next, Bot: bot, 'Holds continent': cont });
        if (team !== 'Crimson') retint(r, 'Crimson', team);
        if (cont) retint(r, 'Asia', 'Australia', 'cont');
        body.appendChild(r); grow(r);
      }
      c.appendChild(body); grow(body);
    }
    cs.push(c);
  }
  ids.scoreboard = variantSet(cs, 'Scoreboard', g, { w: 620, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Territory panel
{
  const g = await group(B, 'Territory panel', 'TerritoryInfo — right column. Empty: hint. Selected / hovered: continent key + bonus + how much of it the owner holds, owner chip, armies (big number + army stack), neighbour buttons (click selects, hover highlights) and 🎯 Focus (camera).');
  const empty = await shell(panelC, [await T('Hover or click a territory on the map to see its details.', 'Body/Default 15', 'text/secondary', { w: 254 })], { title: '🗺️ Territory' });
  const rows = [];
  const cont = AL('H', { name: 'Continent', gap: 6, wrap: true, pad: [0, 0, 8, 0] });
  const key = I('contChip', 'Shape=Square'); retint(key, 'Asia', 'SouthAmerica', 'cont');
  const ct = await T('South America', 'Body/Default 15', 'text/primary', { name: 'Continent' });
  const bonus = await T('· bonus +2', 'Body/Default 15', 'text/secondary', { name: 'Bonus' });
  const holds = await T('· Lena holds 2/4', 'Caption/12', 'text/secondary', { name: 'Holds' });
  add(cont, key, ct, bonus, holds); rows.push(cont);
  const owner = AL('H', { name: 'Owner', gap: 10, pad: [6, 0] });
  const ol = await T('Owner', 'Label/13', 'text/secondary'); ol.resize(54, ol.height); ol.textAutoResize = 'HEIGHT';
  add(owner, ol, setP(I('playerChip', 'Size=Small'), 'playerChip', { Name: 'Lena' })); rows.push(owner);
  const armies = AL('H', { name: 'Armies', gap: 10, pad: [6, 0] });
  const al = await T('Armies', 'Label/13', 'text/secondary'); al.resize(54, al.height); al.textAutoResize = 'HEIGHT';
  const stack = setP(I('armyStack'), 'armyStack', { 'Show panda': false, 'Pony count': '×1', 'Dog count': '×2' });
  add(armies, al, await T('7', 'Number/Big 22', 'text/primary', { name: 'Count' }), stack); rows.push(armies);
  rows.push(await T('Neighbours', 'Label/13', 'text/secondary', { name: 'Neighbours title' }));
  const ng = AL('H', { name: 'Neighbours', gap: 5, wrap: true, wrapGap: 5, pad: [4, 0, 10, 0] });
  for (const [n, a, team] of [['Venezuela', '3', 'Azure'], ['Brazil', '2', 'Azure'], ['Argentina', '4', 'Crimson']]) {
    const b = setP(I('neighbour'), 'neighbour', { Name: n, Armies: a }); if (team !== 'Crimson') retint(b, 'Crimson', team); ng.appendChild(b);
  }
  rows.push(ng);
  const focus = btn('buttonSmall', 'Ghost', '🎯 Focus'); rows.push(focus);
  const sel = await shell(panelC, rows, { title: 'Peru' });
  const selTitle = sel.findOne((n) => n.name === 'Title'); if (selTitle) { await selTitle.setTextStyleIdAsync(TS['Heading/Territory 20'].id); }
  const fixW = (n) => { try { n.layoutSizingHorizontal = 'HUG'; } catch { /* */ } };
  fixW(focus);
  const cs = [wrap('State=Empty', empty), wrap('State=Selected', sel)];
  ids.territoryPanel = variantSet(cs, 'Territory panel', g, { w: 680, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Log panel
{
  const g = await group(B, 'Log panel', 'LogPanel — "📜 Battle log", newest first (max 200), max-height 45% of the column with scrolling.');
  const items = [];
  for (const [r, text, team] of [['R4', 'Lena conquered Peru', 'Crimson'], ['R4', 'Lena attacked Peru from Brazil', 'Crimson'], ['R3', 'Biscuit fortified Ural', 'Lime'], ['R3', 'Max traded a set for 6 armies', 'Azure'], ['R3', 'Max placed 6 armies on Siam', 'Azure']]) {
    const li = I('logItem'); setP(li, 'logItem', { Round: r, Text: text }); if (team !== 'Crimson') retint(li, 'Crimson', team); items.push(li);
  }
  const list = AL('V', { name: 'Log list' }); add(list, items); for (const li of items) grow(li);
  const empty = await shell(panelC, [await T('Nothing happened yet.', 'Body/Default 15', 'text/secondary')], { title: '📜 Battle log' });
  const full = await shell(panelC, [list], { title: '📜 Battle log' });
  ids.logPanel = variantSet([wrap('State=Entries', full), wrap('State=Empty', empty)], 'Log panel', g, { w: 680, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Settings panel
{
  const g = await group(B, 'Settings panel', 'SettingsPanel — 300px, top-right under the HUD (z 50). Music track, volumes, animation speed (1× 2× 4×), territory labels, and Leave game (in game only, with an inline confirm).');
  async function row(label, control) { const r = AL('H', { name: label, main: 'SPACE_BETWEEN', gap: 12, pad: [10, 0, 0, 0] }); add(r, await T(label, 'Body/Small 14', 'text/primary', { name: 'Label' }), control); return r; }
  async function settings(variant) {
    const speed = I('segControl');
    const slot = speed.findAllWithCriteria({ types: ['SLOT'] })[0]; for (const c of [...slot.children]) c.remove();
    for (const [s, on] of [['1×', true], ['2×', false], ['4×', false]]) slot.appendChild(setP(I('segOption', `Kind=Seg, State=${on ? 'On' : 'Off'}`), 'segOption', { Label: s }));
    const sl = (v) => { const i = I('slider', `Value=${v}`); return i; };
    const kids = [
      await row('Music', setP(I('select'), 'select', { Value: variant === 'Setup' ? '🌼 Meadow' : 'Off' })),
      await row('Music volume', sl('Mid')), await row('Sound effects', sl('High')), await row('Animation speed', speed),
      await row('Territory labels', I('checkbox', 'Checked=On')),
    ];
    if (variant === 'In game') { const b = btn('button', 'Danger', '🚪 Leave game'); const w = AL('V', { name: 'Leave', pad: [18, 0, 0, 0] }); w.appendChild(b); kids.push(w); }
    if (variant === 'Leave confirm') {
      const r = AL('H', { name: 'Leave confirm', gap: 8, main: 'CENTER', pad: [18, 0, 0, 0] });
      add(r, await T('Leave this game?', 'Body/Default 15', 'text/secondary'), btn('buttonSmall', 'Ghost', 'Stay'), btn('buttonSmall', 'Danger', 'Leave')); kids.push(r);
    }
    const p = await shell(panelC, kids, { title: '⚙️ Settings', w: 300 });
    const leave = p.findOne((n) => n.name === 'Leave'); if (leave) { const b = leave.children[0]; b.layoutSizingHorizontal = 'FILL'; }
    return wrap(`State=${variant}`, p);
  }
  ids.settingsPanel = variantSet([await settings('In game'), await settings('Leave confirm'), await settings('Setup')], 'Settings panel', g, { w: 1060, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Help panel
{
  const g = await group(B, 'Help panel', 'HelpPanel — "❓ How to play" modal over a soft scrim, min(860px, 100vw − 40). Two columns (one column ≤1100px). Headings 16 bold pink, body 14 / 1.45.');
  async function section(title, body) {
    const s = AL('V', { name: title, gap: 2, pad: [12, 0, 0, 0] });
    s.appendChild(await T(title, 'Heading/Section 16', 'text/accent'));
    for (const b of [].concat(body)) { if (typeof b === 'string') { const t = await T(b, 'Body/Help 14', 'text/primary', { w: 399 }); t.lineHeight = { unit: 'PERCENT', value: 145 }; s.appendChild(t); grow(t); } else { s.appendChild(b); } }
    return s;
  }
  async function rich(parts) { // [[text, bold]]
    const full = parts.map(([t]) => t).join('');
    const t = await T(full, 'Body/Help 14', 'text/primary', { w: 380 }); t.lineHeight = { unit: 'PERCENT', value: 145 };
    let i = 0; for (const [s, b] of parts) { if (b) t.setRangeFontName(i, i + s.length, { family: 'Fredoka', style: 'SemiBold' }); i += s.length; }
    return t;
  }
  async function help(cols) {
    const ol = AL('V', { name: 'Steps', pad: [0, 0, 0, 20] });
    ol.appendChild(await rich([['1. ', false], ['Reinforce', true], [' — trade cards, then place your new armies.', false]]));
    ol.appendChild(await rich([['2. ', false], ['Attack', true], [' — as often as you like (optional).', false]]));
    ol.appendChild(await rich([['3. ', false], ['Fortify', true], [' — one move of armies, then your turn ends (optional).', false]]));
    const table = AL('V', { name: 'Animal table', gap: 4, pad: [4, 0, 0, 0] });
    for (const [a, n, label] of [['Dog', '1', 'army'], ['Pony', '5', 'armies'], ['Panda', '10', 'armies']]) {
      const r = AL('H', { name: a, gap: 0, r: 12, fill: 'surface/glass-70' });
      const c1 = AL('H', { name: 'Icon', pad: [2, 10] }); const ic = I('unit', `Animal=${a}`); ic.resize(36, 36); c1.appendChild(ic);
      const c2 = AL('H', { name: 'Name', pad: [2, 10], w: 60 }); c2.appendChild(await T(a, 'Body/Help 14', 'text/primary'));
      const c3 = AL('H', { name: 'Value', pad: [2, 10] }); const v = await T(`${n} ${label}`, 'Body/Help 14', 'text/primary'); v.setRangeFontName(0, n.length, { family: 'Fredoka', style: 'SemiBold' }); c3.appendChild(v);
      add(r, c1, c2, c3); table.appendChild(r);
    }
    const left = AL('V', { name: 'Column 1', w: cols === 2 ? 399 : 824 });
    add(left,
      await section('🎯 Goal', 'Conquer every territory on the map. Last army standing wins!'),
      await section('🔁 Your turn', [ol]),
      await section('🐶 Reinforcements', 'Territories ÷ 3 (minimum 3) + continent bonuses: North America 5, Europe 5, Asia 7, Africa 3, South America 2, Australia 2.'),
      await section('🃏 Cards', 'Capture at least one territory in a turn to earn a card. Trade a set of 3 — three of a kind, one of each, or any two + a wild. Classic sets are worth 4, 6, 8, 10, 12, 15, then +5 each; expert sets 4, 5, 6, 7… If a traded card shows a territory you own, +2 armies go there. With 5+ cards you must trade.'));
    const right = AL('V', { name: 'Column 2', w: cols === 2 ? 399 : 824 });
    add(right,
      await section('🎲 Attacking', 'Attack a neighbour from a territory with 2+ armies. Roll 1–3 dice (one less than your armies); the defender rolls 1–2. Highest dice are compared in pairs — the defender wins ties. Blitz ⚡ keeps rolling until you win or can\'t continue. Capture a territory and move at least as many armies in as dice you rolled.'),
      await section('🏰 Fortify', 'Move armies once from one territory to an adjacent one you own (or through a chain of your territories with the "connected" rule). Always leave one behind.'),
      await section('🏆 Winning', 'Eliminate a player and you take their cards. Own all 42 territories to win.'),
      await section('🐾 The animals', [table]));
    for (const col of [left, right]) for (const s of col.children) { grow(s); for (const t of s.children) if (t.type === 'TEXT') grow(t); }
    const grid = AL(cols === 2 ? 'H' : 'V', { name: 'Help grid', gap: cols === 2 ? 26 : 6, cross: 'MIN' }); add(grid, left, right);
    const foot = await T('Shortcuts: Esc closes panels and clears the selection · shift-click places all armies.', 'Caption/12', 'text/secondary', { name: 'Shortcuts' });
    const footW = AL('V', { name: 'Footer', pad: [12, 0, 0, 0] }); footW.appendChild(foot);
    const p = await shell(panelC, [grid, footW], { title: '❓ How to play', w: 860 });
    return wrap(`Columns=${cols}`, p);
  }
  ids.helpPanel = variantSet([await help(2), await help(1)], 'Help panel', g, { w: 1860, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- Dialogs: attack / occupy / fortify
{
  const g = await group(B, 'Dialogs', 'AttackPanel (VS line, dice picker, blitz odds, Attack / Blitz / Cancel), OccupyDialog (captured! + count picker, Min / Max / Move N in) and FortifyDialog (count picker, "Fortifying ends your turn").');
  async function vsLine(a, aN, d, dN, dTeam) {
    const l = AL('H', { name: 'VS line', gap: 10, main: 'CENTER' });
    const s1 = setP(I('vsSide'), 'vsSide', { Territory: a, Armies: `(${aN})` });
    const s2 = setP(I('vsSide'), 'vsSide', { Territory: d, Armies: `(${dN})` }); retint(s2, 'Crimson', dTeam);
    add(l, s1, await T('➜', 'Heading/Must trade 24', 'text/accent', { name: 'Arrow' }), s2); return l;
  }
  async function attack(state) {
    const dice = AL('H', { name: 'Dice row', gap: 10 });
    dice.appendChild(await T('Dice', 'Body/Default 15', 'text/secondary'));
    const sel = state === 'Risky' ? 2 : 3;
    for (const n of [1, 2, 3]) dice.appendChild(I('die', `Pips=${n}, State=${state === 'Waiting' ? 'Disabled' : n === sel ? 'Selected' : n > (state === 'Risky' ? 2 : 3) ? 'Disabled' : 'Default'}`));
    const odds = I('odds', state === 'Risky' ? 'Odds=Long shot' : 'Odds=Great odds');
    const [oddsLabel, pct] = state === 'Risky' ? ['Long shot · 2% to conquer (blitz)', 0.02] : ['Great odds · 86% to conquer (blitz)', 0.86]; // = scenario fixture
    odds.findOne((n) => n.type === 'TEXT').characters = oddsLabel; odds.findOne((n) => n.name === 'Fill').resize(Math.max(4, Math.round(272 * pct)), 8);
    const btns = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER' });
    const dis = state === 'Waiting' ? 'Disabled' : 'Default';
    add(btns, btn('button', 'Primary', '🎲 Attack', dis), btn('button', 'Warm', '⚡ Blitz', dis), btn('button', 'Ghost', 'Cancel'));
    const kids = [await vsLine('Peru', state === 'Risky' ? 3 : 7, 'Venezuela', state === 'Risky' ? 6 : 3, 'Azure'), dice, odds, btns];
    const d = await shell(dialogC, kids, { fill: false });
    return wrap(`Dialog=Attack, State=${state}`, d);
  }
  async function occupy() {
    const kids = [await T('🎉 Venezuela captured!', 'Heading/Dialog 19', 'text/primary'), await T('Move armies from Peru into Venezuela (at least 3).', 'Body/Default 15', 'text/secondary', { align: 'CENTER' })];
    const cp = setP(I('countPicker'), 'countPicker', { Value: '7' }); kids.push(cp);
    const b = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER' }); add(b, btn('buttonSmall', 'Ghost', 'Min'), btn('buttonSmall', 'Ghost', 'Max'), btn('button', 'Primary', 'Move 7 in ➜')); kids.push(b);
    return wrap('Dialog=Occupy, State=Ready', await shell(dialogC, kids, { fill: false }));
  }
  async function fortify() {
    const kids = [await T('🏰 Fortify', 'Heading/Dialog 19', 'text/primary'), await T('Brazil (9) ➜ Peru (3)', 'Body/Default 15', 'text/secondary')];
    kids.push(setP(I('countPicker'), 'countPicker', { Value: '8' }));
    kids.push(await T('Fortifying ends your turn.', 'Caption/12', 'text/secondary'));
    const b = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER' }); add(b, btn('button', 'Ghost', 'Cancel'), btn('button', 'Primary', 'Move 8 & end turn')); kids.push(b);
    return wrap('Dialog=Fortify, State=Ready', await shell(dialogC, kids, { fill: false }));
  }
  const cs = [await attack('Ready'), await attack('Risky'), await attack('Waiting'), await occupy(), await fortify()];
  for (const c of cs) { const cp = c.findOne((n) => n.name === 'Count picker' || (n.type === 'INSTANCE' && n.mainComponent?.name === 'Count picker')); if (cp) cp.resize(340, cp.height); }
  ids.dialogs = variantSet(cs, 'Dialogs', g, { w: 1500, gap: 28, pad: 28, cross: 'MIN' }).id;
}

await snap(B, 0.4);
return { ids, made: made.length, board: B.id };
