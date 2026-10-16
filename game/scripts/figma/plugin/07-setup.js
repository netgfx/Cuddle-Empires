// use_figma script — stage 3g: Setup board (start screen). Source: src/ui/SetupScreen.tsx + ".setup" rules.
/*LIB*/
if (!TS['Body/Lead 16']) { const s = figma.createTextStyle(); s.name = 'Body/Lead 16'; s.fontName = { family: 'Fredoka', style: 'Regular' }; s.fontSize = 16; s.lineHeight = { unit: 'AUTO' }; TS['Body/Lead 16'] = s; }
const S = await components({ swatch: 'Swatch', textInput: 'Text input', kindToggle: 'Kind toggle', iconButton: 'Icon button', addPlayer: 'Add player', segControl: 'Segmented control', segOption: 'Seg option', buttonBig: 'Button Big', button: 'Button', unit: 'Unit icon', badge: 'Badge', chipTag: 'Chip tag' }); // by name — no node ids
const vOf = (k, name) => (S[k].type === 'COMPONENT_SET' ? (name ? S[k].children.find((c) => c.name === name) : S[k].defaultVariant) : S[k]);
const I = (k, name) => { const m = vOf(k, name); if (!m) throw new Error(`variant "${name}" not found in ${S[k].name}`); return m.createInstance(); };
const pk = (k, name) => Object.keys(S[k].componentPropertyDefinitions).find((x) => x.startsWith(name + '#'));
const setP = (inst, k, props) => { const o = {}; for (const [n, v] of Object.entries(props)) o[pk(k, n)] = v; inst.setProperties(o); return inst; };
const btn = (k, style, label, state = 'Default') => setP(I(k, `Style=${style}, State=${state}`), k, { Label: label });
const TEAMS = ['Crimson', 'Azure', 'Lime', 'Sunflower', 'Violet', 'Charcoal'];
const ids = {};
const B = await board('Setup', 'Start screen (SetupScreen.tsx): title, local players (2–6, colour / name / human ⇄ bot / remove), rules, Load game (when saves exist) and Start. Online lobby is behind __RISK_DEBUG__ (npm run dev:debug).');

// ---------------------------------------------------------------- Player row
let rowSet;
{
  const g = await group(B, 'Player row', '.player-row — swatch (opens the colour popover), name input (max 16), kind toggle, remove ✕ (disabled at 2 players). Retint the row for the player colour.');
  const cs = [];
  const MATRIX = ['Default', 'Editing', 'Locked'].flatMap((state) => ['Human', 'Bot'].map((kind) => [kind, state])); // full Kind × State
  for (const [kind, state] of MATRIX) {
    const c = CMP('H', { name: `Kind=${kind}, State=${state}`, gap: 8, pad: [6, 8], r: 18, fill: 'surface/glass-75', w: 578 });
    await fx(c, 'Shadow/Soft');
    const sw = I('swatch', 'Size=Default, State=Default'); sw.name = 'Swatch';
    const input = setP(I('textInput', `Kind=Name, State=${state === 'Editing' ? 'Focus' : 'Default'}`), 'textInput', { Value: kind === 'Human' ? 'Lena' : 'Max' }); input.name = 'Name';
    const kt = I('kindToggle', `Kind=${kind}`); kt.name = 'Kind';
    const rm = setP(I('iconButton', 'Size=Small, State=Default'), 'iconButton', { Icon: '✕' }); rm.name = 'Remove';
    if (state === 'Locked') rm.opacity = 0.45;
    add(c, sw, input, kt, rm); grow(input);
    input.isExposedInstance = true; kt.isExposedInstance = true;
    cs.push(c);
  }
  rowSet = variantSet(cs, 'Player row', g, { w: 1240, cross: 'MIN' });
  ids.playerRow = rowSet.id;
}
const row = (name, team, kind, state = 'Default') => {
  const r = rowSet.children.find((v) => v.name === `Kind=${kind}, State=${state}`).createInstance();
  const input = r.findOne((n) => n.name === 'Name' && n.type === 'INSTANCE'); setP(input, 'textInput', { Value: name });
  if (team !== 'Crimson') retint(r, 'Crimson', team);
  return r;
};

// ---------------------------------------------------------------- Swatch popover
let popC;
{
  const g = await group(B, 'Colour popover', '.swatch-pop — under the swatch (top 42, left −6): the six team colours; your colour ringed, colours other players use are disabled.');
  popC = CMP('H', { name: 'Colour popover', gap: 8, pad: 10, r: 16, fill: 'surface/white', description: '.swatch-pop (z 5). Team order = TEAM_PALETTE in src/ui/util.ts.' });
  await fx(popC, 'Shadow/Panel');
  TEAMS.forEach((team, i) => { const s = I('swatch', `Size=Small, State=${i === 1 ? 'Selected' : i === 0 || i === 2 ? 'Disabled' : 'Default'}`); retint(s, 'Crimson', team); s.name = team; popC.appendChild(s); });
  g.appendChild(popC); ids.colourPopover = popC.id;
}

// ---------------------------------------------------------------- Title + tabs + options
let titleC, optionsC, tabsSet;
{
  const g = await group(B, 'Title, tabs & rules', 'Title block (hopping animals 1.8s staggered, "RISK · Cute Edition" with candy text shadows), Local / Online tabs (debug builds) and the rules grid (Seg controls).');
  titleC = CMP('V', { name: 'Setup title', cross: 'CENTER', gap: 2, w: 578, description: '.setup-title' });
  const animals = AL('H', { name: 'Animals', gap: 6, cross: 'MAX', h: 66 });
  for (const [a, s] of [['Dog', 54], ['Pony', 64], ['Panda', 54]]) { const i = I('unit', `Animal=${a}`); i.resize(s, s); animals.appendChild(i); }
  const h1 = AL('H', { name: 'Title', gap: 10, cross: 'CENTER' });
  const risk = await T('RISK', 'Display/Title 40', 'text/accent'); risk.letterSpacing = { unit: 'PERCENT', value: 2 };
  risk.effects = [{ type: 'DROP_SHADOW', color: { r: 1, g: 0.816, b: 0.871, a: 1 }, offset: { x: 0, y: 3 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' }];
  const dotT = await T('·', 'Display/Title 40', 'accent/sun');
  const cute = await T('Cute Edition', 'Display/Title 40', 'text/title-cute', { name: 'Edition' }); cute.letterSpacing = { unit: 'PERCENT', value: 2 };
  cute.effects = [{ type: 'DROP_SHADOW', color: { r: 0.851, g: 0.835, b: 1, a: 1 }, offset: { x: 0, y: 3 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' }];
  add(h1, risk, dotT, cute);
  const sub = await T('Conquer the world with dogs, ponies and pandas.', 'Body/Lead 16', 'text/secondary', { name: 'Tagline' });
  add(titleC, animals, h1, sub);
  textProp(titleC, 'Brand', 'RISK', risk); textProp(titleC, 'Edition', 'Cute Edition', cute); textProp(titleC, 'Tagline', 'Conquer the world with dogs, ponies and pandas.', sub);
  g.appendChild(titleC); ids.setupTitle = titleC.id;

  const tabs = [];
  for (const on of ['Local', 'Online']) {
    const c = CMP('H', { name: `Selected=${on}`, gap: 6, main: 'CENTER' });
    for (const label of ['Local', 'Online (beta)']) {
      const sel = label.startsWith(on);
      const t = AL('H', { name: label, pad: [7, 20], r: 999, fill: sel ? 'text/primary' : 'surface/track' });
      t.appendChild(await T(label, 'Body/Button 15', sel ? 'text/on-accent' : 'text/secondary')); c.appendChild(t);
    }
    tabs.push(c);
  }
  tabsSet = variantSet(tabs, 'Setup tabs', g, { w: 640 }); ids.setupTabs = tabsSet.id;

  optionsC = CMP('V', { name: 'Rules options', gap: 8, description: '.setup-options — grid: label 14/600 + Seg control. Hints (title attr): Auto deal = fast start; Manual claim = like the book; Classic 4, 6, 8, 10, 12, 15, +5…; Expert +1; Adjacent = book; Connected = through your chain.' });
  for (const [label, a, b] of [['Territories', 'Auto deal', 'Manual claim'], ['Card values', 'Classic', 'Expert'], ['Fortify', 'Adjacent', 'Connected']]) {
    const r = AL('H', { name: label, gap: 14 });
    const l = await T(label, 'Body/Small strong 14', 'text/primary', { name: 'Label' }); l.resize(75, l.height); l.textAutoResize = 'HEIGHT';
    const seg = I('segControl'); const slot = seg.findAllWithCriteria({ types: ['SLOT'] })[0]; for (const c of [...slot.children]) c.remove();
    slot.appendChild(setP(I('segOption', 'Kind=Seg, State=On'), 'segOption', { Label: a })); slot.appendChild(setP(I('segOption', 'Kind=Seg, State=Off'), 'segOption', { Label: b }));
    add(r, l, seg); optionsC.appendChild(r);
  }
  g.appendChild(optionsC); ids.rulesOptions = optionsC.id;
}

// ---------------------------------------------------------------- Setup card variants
{
  const g = await group(B, 'Setup card', '.setup-card — min(640px, 100%), radius 32, padding 22 30 26, glass + 16px blur, pops in .5s. Local: 3 default players (Lena human, Max + Biscuit bots), 2 players adds the neutral hint, 6 is the maximum (Add player hidden). Load game appears when saves exist.');
  async function card(name, body) {
    const c = CMP('V', { name, gap: 14, pad: [22, 30, 26, 30], r: 32, fill: 'surface/panel', w: 640 });
    stroke(c, 'surface/white', 1, 'INSIDE'); await fx(c, 'Elevation/Glass setup');
    const title = titleC.createInstance(); c.appendChild(title); title.layoutSizingHorizontal = 'FILL'; // card shrinks to 448 on phones
    for (const k of body) { c.appendChild(k); try { if (k.type !== 'TEXT') k.layoutSizingHorizontal = 'FILL'; } catch { } } // Start row too: it centres its buttons
    return c;
  }
  const rows = async (list) => { const r = AL('V', { name: 'Player rows', gap: 7 }); for (const [n, t, k, s] of list) { const x = row(n, t, k, s); r.appendChild(x); grow(x); } return r; };
  // Load game = ghost big button with a static count badge (instances cannot take extra children, so it is its own component)
  const loadC = CMP('H', { name: 'Load game button', gap: 6, pad: [14, 30], r: 999, fill: 'surface/glass-70', cross: 'CENTER', description: 'LoadButton (SetupScreen.tsx): .btn.big.ghost + .badge.static with the number of saves.' });
  stroke(loadC, 'border/line', 2, 'INSIDE');
  const loadT = await T('📂 Load game', 'Body/Button big 19', 'text/primary', { name: 'Label' });
  const loadB = setP(S.badge.defaultVariant.createInstance(), 'badge', { Count: '2' });
  add(loadC, loadT, loadB); loadB.isExposedInstance = true; // only valid once nested inside the component
  g.appendChild(loadC); ids.loadButton = loadC.id;
  const start = async (load) => { const r = AL('H', { name: 'Start', gap: 12, main: 'CENTER' }); if (load) r.appendChild(loadC.createInstance()); r.appendChild(setP(I('buttonBig', 'Style=Primary, State=Default'), 'buttonBig', { Label: 'Start game ✨' })); return r; };
  const addP = () => { const a = I('addPlayer', 'State=Default'); return a; };
  const P3 = [['Lena', 'Crimson', 'Human'], ['Max', 'Azure', 'Bot'], ['Biscuit', 'Lime', 'Bot']];
  const cs = [];
  // default (3 players)
  {
    const r3 = await rows(P3); r3.appendChild(addP()); grow(r3.children[3]);
    cs.push(await card('State=Local · 3 players', [r3, optionsC.createInstance(), await start(false)]));
  }
  // colour popover open
  {
    const r3 = await rows(P3); r3.appendChild(addP()); grow(r3.children[3]);
    const c = await card('State=Local · colour picker', [r3, optionsC.createInstance(), await start(false)]);
    const pop = popC.createInstance(); c.appendChild(pop); pop.layoutPositioning = 'ABSOLUTE'; pop.x = 26; pop.y = 268;
    cs.push(c);
  }
  // 2 players
  {
    const r2 = await rows([['Lena', 'Crimson', 'Human', 'Locked'], ['Max', 'Azure', 'Bot', 'Locked']]); r2.appendChild(addP()); grow(r2.children[2]);
    const hint = await T('2 players: a grey neutral army joins the board (book rules).', 'Label/13 regular', 'text/secondary', { align: 'CENTER', name: 'Hint' }); r2.appendChild(hint); grow(hint);
    cs.push(await card('State=Local · 2 players', [r2, optionsC.createInstance(), await start(false)]));
  }
  // 6 players + load
  {
    const r6 = await rows([['Lena', 'Crimson', 'Human', 'Editing'], ['Max', 'Azure', 'Bot'], ['Biscuit', 'Lime', 'Bot'], ['Mochi', 'Sunflower', 'Bot'], ['Pip', 'Violet', 'Bot'], ['Waffles', 'Charcoal', 'Bot']]);
    cs.push(await card('State=Local · 6 players + load', [r6, optionsC.createInstance(), await start(true)]));
  }
  // online form
  {
    const form = AL('V', { name: 'Online', gap: 14 });
    const field = async (label, value, state = 'Default') => { const f = AL('V', { name: label, gap: 4 }); f.appendChild(await T(label, 'Label/13 strong', 'text/primary')); const i = setP(I('textInput', `Kind=Field, State=${state}`), 'textInput', { Value: value }); f.appendChild(i); grow(i); return f; };
    form.appendChild(await T('Play with friends over the internet. 🌍 Online play is in beta.', 'Label/13 regular', 'text/secondary', { align: 'CENTER' }));
    form.appendChild(await field('Server URL', 'ws://localhost:8787'));
    form.appendChild(await field('Your name', 'Lena'));
    const sw = AL('H', { name: 'Colours', gap: 10, main: 'CENTER' });
    TEAMS.forEach((team, i) => { const s = I('swatch', `Size=Small, State=${i === 1 ? 'Selected' : 'Default'}`); retint(s, 'Crimson', team); sw.appendChild(s); });
    form.appendChild(sw);
    const rc = await field('Room code', 'e.g. PANDA7', 'Placeholder'); form.appendChild(rc);
    const b = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER' }); add(b, btn('button', 'Default', 'Create room'), btn('button', 'Primary', 'Join room', 'Disabled')); form.appendChild(b);
    for (const k of form.children) try { grow(k); } catch { }
    cs.push(await card('State=Online · join', [tabsSet.children.find((v) => v.name === 'Selected=Online').createInstance(), form]));
  }
  // lobby
  {
    const lobby = AL('V', { name: 'Lobby', gap: 14, cross: 'CENTER' });
    const h = AL('H', { name: 'Room', gap: 8 });
    const code = AL('H', { name: 'Room code', pad: [2, 10], r: 10, fill: 'surface/white' });
    const ct = await T('PANDA7', 'Heading/Dialog 19', 'text/accent'); ct.letterSpacing = { unit: 'PERCENT', value: 12 }; code.appendChild(ct);
    add(h, await T('Room', 'Heading/Dialog 19', 'text/primary'), code); lobby.appendChild(h);
    const seats = AL('V', { name: 'Seats', gap: 7 });
    for (const [n, team, ready, extra] of [['Lena', 'Azure', true, ' 👑'], ['Max', 'Crimson', false, ''], ['Robo', 'Lime', true, ' 🤖']]) {
      const r = AL('H', { name: n, gap: 8, pad: [6, 8], r: 18, fill: 'surface/glass-75' }); await fx(r, 'Shadow/Soft');
      const s = I('swatch', 'Size=Small, State=Default'); retint(s, 'Crimson', team);
      const nm = await T(n + extra, 'Body/Strong 16', 'text/primary');
      const tag = setP(I('chipTag', ready ? 'Tone=Ready' : 'Tone=Default'), 'chipTag', { Text: ready ? 'ready' : 'waiting' });
      add(r, s, nm, tag); nm.layoutGrow = 1; seats.appendChild(r); grow(r);
    }
    lobby.appendChild(seats); grow(seats);
    const b = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER' }); add(b, btn('button', 'Ghost', '+ Bot'), btn('button', 'Warm', '✅ Ready'), btn('button', 'Primary', 'Start game ✨')); lobby.appendChild(b);
    lobby.appendChild(await T('Room PANDA7 created — share the code!', 'Body/Default 15', 'text/secondary', { name: 'Status' }));
    cs.push(await card('State=Online · lobby', [tabsSet.children.find((v) => v.name === 'Selected=Online').createInstance(), lobby]));
  }
  ids.setupCard = variantSet(cs, 'Setup card', g, { w: 2100, gap: 32, pad: 32, cross: 'MIN' }).id;

  const bd = figma.createComponent(); bd.name = 'Setup backdrop'; bd.resize(1440, 900);
  bd.fills = [
    { type: 'SOLID', color: { r: 0.941, g: 0.925, b: 1 }, opacity: 0.35 },
    { type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, 0.3], [0, 1, 0.3]], gradientStops: [{ position: 0, color: { r: 0.745, g: 0.902, b: 1, a: 0.6 } }, { position: 1, color: { r: 0.745, g: 0.902, b: 1, a: 0 } }] },
    { type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, -0.3], [0, 1, -0.3]], gradientStops: [{ position: 0, color: { r: 1, g: 0.824, b: 0.902, a: 0.55 } }, { position: 1, color: { r: 1, g: 0.824, b: 0.902, a: 0 } }] },
  ];
  await fx(bd, 'Elevation/Backdrop');
  bd.description = '.setup-backdrop — radial pink (20% 20%) + blue (80% 80%) over 35% lavender, 4px backdrop blur over the idle board.';
  g.appendChild(bd); ids.setupBackdrop = bd.id;
}

await snap(B, 0.35);
return { ids, made: made.length, board: B.id };
