// use_figma script — stage 3h: Save / load board. Source: src/ui/SavesPanel.tsx + "save / load" rules.
/*LIB*/
const S = await components({ panel: 'Panel', iconButton: 'Icon button', button: 'Button', buttonSmall: 'Button Small', textInput: 'Text input', spinner: 'Spinner', badge: 'Badge', unit: 'Unit icon', savePlayer: 'Save player', share: 'Territory share', chipTag: 'Chip tag' }); // by name — no node ids
const vOf = (k, name) => (S[k].type === 'COMPONENT_SET' ? (name ? S[k].children.find((c) => c.name === name) : S[k].defaultVariant) : S[k]);
const I = (k, name) => { const m = vOf(k, name); if (!m) throw new Error(`variant "${name}" not found in ${S[k].name}`); return m.createInstance(); };
const pk = (k, name) => Object.keys(S[k].componentPropertyDefinitions).find((x) => x.startsWith(name + '#'));
const setP = (inst, k, props) => { const o = {}; for (const [n, v] of Object.entries(props)) o[pk(k, n)] = v; inst.setProperties(o); return inst; };
const btn = (k, style, label, state = 'Default') => setP(I(k, `Style=${style}, State=${state}`), k, { Label: label });
const ids = {};
const B = await board('Save / load', 'Local saves (localStorage): save bar with name + Save (Ctrl+S), the list (newest first) with players, territory share and phase, Load / Delete with inline confirms, the load-over-a-running-game confirm, empty / error / online states, and the HUD 💾 status badge.');

async function shell(kids, o = {}) {
  const i = S.panel.createInstance();
  i.resize(o.w ?? 600, i.height);
  i.setProperties({ [pk('panel', 'Title')]: '💾 Saved games' });
  const slot = i.findAllWithCriteria({ types: ['SLOT'] })[0];
  for (const c of [...slot.children]) c.remove();
  slot.itemSpacing = 10;
  for (const k of kids) { slot.appendChild(k); try { if (k.type !== 'TEXT') k.layoutSizingHorizontal = 'FILL'; } catch { } }
  return i;
}
function wrap(name, inner) { const c = CMP('V', { name }); c.appendChild(inner); return c; }

// ---------------------------------------------------------------- Save button + bar
let saveBtnSet, barSet;
{
  const g = await group(B, 'Save bar', '.save-bar — optional name (max 40) + Save button (min-width 138). Saving: spinner + "Saving…" (stays fully opaque, cursor progress); Saved: mint "✅ Saved!" pops in, then returns to idle.');
  const cs = [];
  for (const [state, grad, fxName, label, spin] of [['Idle', 'Gradient/Button primary', 'Shadow/Button primary', '💾 Save game', false], ['Saving', 'Gradient/Button primary', 'Shadow/Button primary', 'Saving…', true], ['Saved', 'Gradient/Button success', 'Shadow/Button success', '✅ Saved!', false]]) {
    const c = CMP('H', { name: `State=${state}`, gap: 8, pad: [9, 18], r: 999, main: 'CENTER' });
    c.minWidth = 138; await paintStyle(c, grad); await fx(c, fxName);
    if (spin) c.appendChild(I('spinner', 'Tone=On accent'));
    c.appendChild(await T(label, 'Body/Button 15', 'text/on-accent', { name: 'Label' }));
    cs.push(c);
  }
  saveBtnSet = variantSet(cs, 'Save button', g, { w: 560 }); ids.saveButton = saveBtnSet.id;

  const bars = [];
  for (const state of ['Idle', 'Typing', 'Saving', 'Saved']) {
    const c = CMP('H', { name: `State=${state}`, gap: 8, pad: 6, r: 999, fill: 'surface/glass-75', w: 560 }); await fx(c, 'Shadow/Soft');
    const input = setP(I('textInput', state === 'Typing' ? 'Kind=Name, State=Focus' : state === 'Saving' ? 'Kind=Name, State=Disabled' : 'Kind=Name, State=Placeholder'), 'textInput', state === 'Typing' ? { Value: 'Before the big push' } : {});
    input.cornerRadius = 999;
    c.appendChild(input); input.layoutGrow = 1;
    c.appendChild(saveBtnSet.children.find((v) => v.name === `State=${state === 'Typing' ? 'Idle' : state}`).createInstance());
    bars.push(c);
  }
  barSet = variantSet(bars, 'Save bar', g, { w: 1200, cross: 'MIN' }); ids.saveBar = barSet.id;
}

// ---------------------------------------------------------------- Save row
let rowSet;
{
  const g = await group(B, 'Save row', '.save-row — label + relative time ("just now", "12 min ago", "yesterday 18:40", then a date), players (◀ = whose turn, struck = out), territory share bar, "Round N · phase · X\'s turn", Load + 🗑️. Hover lifts 2px; Fresh = just saved (mint); Delete asks inline. ≤560px the actions wrap under the content.');
  const PLAYERS = [['Lena', 'Crimson', 'Turn', false], ['Max', 'Azure', 'Default', true], ['Biscuit', 'Lime', 'Eliminated', true]];
  async function main(label, time, round, phase) {
    const m = AL('V', { name: 'Main', gap: 5 });
    const title = AL('H', { name: 'Title', gap: 10, cross: 'MAX' });
    const l = await T(label, 'Body/Strong 16', 'text/primary', { name: 'Label' });
    const t = await T(time, 'Caption/12', 'text/secondary', { name: 'Time' });
    add(title, l, t); m.appendChild(title); grow(title); l.layoutGrow = 1;
    const players = AL('H', { name: 'Players', gap: 10, wrap: true, wrapGap: 4 });
    for (const [n, team, st, bot] of PLAYERS) { const p = setP(I('savePlayer', `State=${st}`), 'savePlayer', { Name: n, Bot: bot }); if (team !== 'Crimson') retint(p, 'Crimson', team); p.name = 'Player'; players.appendChild(p); }
    m.appendChild(players); grow(players);
    const share = S.share.createInstance(); share.name = 'Territory share'; m.appendChild(share); grow(share);
    m.appendChild(await T(`Round ${round} · ${phase} · Lena's turn`, 'Caption/12', 'text/secondary', { name: 'Meta' }));
    return m;
  }
  async function actions(confirm) {
    const a = AL('H', { name: 'Actions', gap: 6 });
    if (confirm) add(a, await T('Delete?', 'Caption/12', 'text/secondary'), btn('buttonSmall', 'Ghost', 'No'), btn('buttonSmall', 'Danger', 'Delete'));
    else add(a, btn('buttonSmall', 'Primary', '📂 Load'), setP(I('iconButton', 'Size=Small, State=Default'), 'iconButton', { Icon: '🗑️' }));
    return a;
  }
  const cs = [];
  for (const [state, bg, border] of [['Default', 'surface/glass-80', null], ['Hover', 'surface/white', null], ['Fresh', 'surface/fresh', 'accent/success'], ['Confirm delete', 'surface/glass-80', null], ['Stacked', 'surface/glass-80', null]]) {
    const stacked = state === 'Stacked';
    const c = CMP(stacked ? 'V' : 'H', { name: `State=${state}`, gap: 12, pad: [10, 12, 10, 16], r: 18, fill: bg, w: stacked ? 416 : 566, cross: stacked ? 'MAX' : 'CENTER' });
    await fx(c, 'Shadow/Soft');
    if (border) stroke(c, border, 2, 'INSIDE');
    const m = await main(state === 'Fresh' ? 'Before the big push' : 'Sunday showdown', state === 'Fresh' ? 'just now' : '12 min ago', 7, '⚔️ Attack');
    c.appendChild(m); if (stacked) grow(m); else m.layoutGrow = 1;
    c.appendChild(await actions(state === 'Confirm delete'));
    cs.push(c);
  }
  rowSet = variantSet(cs, 'Save row', g, { w: 1260, cross: 'MIN' }); ids.saveRow = rowSet.id;
}

// ---------------------------------------------------------------- notes, empty, confirm
let confirmC, emptyC, noteC, errC;
{
  const g = await group(B, 'Messages & confirm', 'Online note (blue), error (red, role=alert), empty state (bobbing panda) and the load confirm shown when a game is running (sun ring; offers to save first).');
  noteC = CMP('H', { name: 'Saves note', pad: [8, 14], r: 14, fill: 'surface/note', w: 566 });
  noteC.appendChild(await T('🌍 Online games can\'t be saved — saving works in local games only.', 'Body/Small 14', 'text/info', { w: 538 }));
  errC = CMP('H', { name: 'Saves error', pad: [8, 14], r: 14, fill: 'surface/error', w: 566 }); stroke(errC, 'border/error', 2, 'INSIDE');
  errC.appendChild(await T('🙊 Could not save: storage is full. Delete an old save and try again.', 'Body/Small 14', 'text/error', { w: 538 }));
  emptyC = CMP('V', { name: 'Saves empty', cross: 'CENTER', gap: 2, pad: [22, 0, 10, 0], w: 566 });
  const panda = I('unit', 'Animal=Panda'); panda.resize(56, 56);
  const pw = AL('V', { name: 'Art', pad: [0, 0, 6, 0] }); pw.appendChild(panda);
  add(emptyC, pw, await T('No saved games yet', 'Body/Strong 16', 'text/primary'), await T('Save this game to pick it up later.', 'Caption/12', 'text/secondary', { name: 'Hint' }));
  confirmC = CMP('V', { name: 'Load confirm', cross: 'CENTER', gap: 10, pad: [18, 22, 20, 22], r: 24, fill: 'surface/solid', w: 520, description: '.saves-confirm-card over a blurred veil (role=alertdialog).' });
  stroke(confirmC, 'accent/sun', 3, 'OUTSIDE'); await fx(confirmC, 'Shadow/Confirm');
  const btns = AL('H', { name: 'Buttons', gap: 8, main: 'CENTER', wrap: true, wrapGap: 8 });
  add(btns, btn('button', 'Ghost', 'Keep playing'), btn('button', 'Warm', '💾 Save first, then load'), btn('button', 'Danger', 'Load anyway'));
  add(confirmC, await E('⚠️', 34), await T('Load “Pandas rising”?', 'Heading/Dialog 19', 'text/primary', { align: 'CENTER' }),
    await T('The game you are playing now will be replaced. Anything since your last save will be lost.', 'Body/Small 14', 'text/secondary', { align: 'CENTER', w: 476 }), btns);
  grow(btns);
  add(g, noteC, errC, emptyC, confirmC);
  Object.assign(ids, { note: noteC.id, error: errC.id, empty: emptyC.id, confirm: confirmC.id });
}

// ---------------------------------------------------------------- Saves panel (modal) states
{
  const g = await group(B, 'Saves panel', 'SavesPanel — "💾 Saved games" modal, min(600px, 100vw − 32) over a soft scrim; z above everything but the curtain. States: list (in game), empty (setup screen), load confirm, delete confirm + just saved, online, mobile (≤560px stacked rows).');
  const head = async (n, tip = true) => { const h = AL('H', { name: 'Head', main: 'SPACE_BETWEEN', pad: [0, 4] }); add(h, await T(`${n} saved games on this device`, 'Caption/12', 'text/secondary'), tip ? await T('Tip: Ctrl+S saves instantly', 'Caption/12', 'text/secondary') : null); return h; };
  const list = (rows) => { const l = AL('V', { name: 'Saves list', gap: 8 }); for (const r of rows) { l.appendChild(r); grow(r); } return l; };
  // rows carry the scenario fixture data (scenarios.mjs makeSaves) so screens compare 1:1 with the code renders
  const DATA = {
    Autosave: ["Round 11 · 🏰 Fortify · Biscuit's turn", [['Lena', 'Default', false], ['Max', 'Default', true], ['Biscuit', 'Eliminated', true, true]]],
    'Pandas rising': ["Round 7 · 🐶 Reinforce · Max's turn", [['Lena', 'Default', false], ['Max', 'Turn', true], ['Biscuit', 'Default', true]]],
    'Sunday showdown': ["Round 3 · ⚔️ Attack · Lena's turn", [['Lena', 'Turn', false], ['Max', 'Default', true], ['Biscuit', 'Default', true]]],
    'Before the big push': ["Round 4 · 🐶 Reinforce · Lena's turn", [['Lena', 'Turn', false], ['Max', 'Default', true], ['Biscuit', 'Default', true]]],
  };
  const row = (state, label) => {
    const r = rowSet.children.find((v) => v.name === `State=${state}`).createInstance();
    const [meta, players] = DATA[label];
    const set = (name, text) => { const t = r.findOne((n) => n.type === 'TEXT' && n.name === name); if (t) t.characters = text; };
    set('Label', label); set('Time', 'just now'); set('Meta', meta);
    const ps = r.findAll((n) => n.type === 'INSTANCE' && n.name === 'Player');
    players.forEach(([name, st, bot, turnToo], i) => {
      ps[i].swapComponent(S.savePlayer.children.find((v) => v.name === `State=${st}`));
      setP(ps[i], 'savePlayer', { Name: name, Bot: bot });
      if (turnToo) ps[i].findOne((n) => n.name === 'Turn').visible = true;
    });
    const share = r.findOne((n) => n.name === 'Territory share'); if (share) for (const seg of share.children) seg.resize(Math.round(296 / 3), seg.height);
    return r;
  };
  const bar = (state) => barSet.children.find((v) => v.name === `State=${state}`).createInstance();
  const cs = [];
  const NEWEST = ['Autosave', 'Pandas rising', 'Sunday showdown'];
  cs.push(wrap('State=List', await shell([bar('Idle'), await head(3), list(NEWEST.map((l) => row('Default', l)))])));
  // empty in game: save bar + tip, no count line (saves.length is 0); empty on the setup screen: no bar, setup hint
  const emptyHead = async () => { const h = AL('H', { name: 'Head', main: 'MAX', pad: [0, 4] }); h.appendChild(await T('Tip: Ctrl+S saves instantly', 'Caption/12', 'text/secondary')); return h; };
  cs.push(wrap('State=Empty (in game)', await shell([bar('Idle'), await emptyHead(), emptyC.createInstance()])));
  { const e = emptyC.createInstance(); e.findOne((n) => n.name === 'Hint').characters = 'Start a local game and save it from the 💾 button.'; cs.push(wrap('State=Empty (setup)', await shell([e]))); }
  {
    const p = await shell([bar('Idle'), await head(2), list([row('Default', 'Pandas rising'), row('Default', 'Sunday showdown')])]);
    const veil = AL('V', { name: 'Confirm veil', main: 'CENTER', cross: 'CENTER', pad: 16, r: 20, fill: 'surface/veil' });
    await fx(veil, 'Elevation/Backdrop'); veil.appendChild(confirmC.createInstance());
    const c = wrap('State=Load confirm', p); c.appendChild(veil); veil.layoutPositioning = 'ABSOLUTE'; veil.resize(600, p.height); veil.x = 0; veil.y = 0;
    cs.push(c);
  }
  cs.push(wrap('State=Delete confirm', await shell([bar('Saved'), await head(3), list([row('Fresh', 'Before the big push'), row('Confirm delete', 'Pandas rising'), row('Default', 'Sunday showdown')])])));
  cs.push(wrap('State=Online', await shell([noteC.createInstance(), await head(2, false), list([row('Default', 'Pandas rising'), row('Default', 'Sunday showdown')])])));
  cs.push(wrap('State=Error', await shell([bar('Typing'), errC.createInstance(), await head(2), list([row('Default', 'Pandas rising'), row('Default', 'Sunday showdown')])])));
  { const mb = bar('Idle'); const sb = mb.findOne((n) => n.type === 'INSTANCE' && n.name.startsWith('State=')) || mb.children[1]; if (sb) sb.layoutGrow = 1; // .save-btn flex: 1 (≤560px)
    cs.push(wrap('State=Mobile', await shell([mb, await head(3), list(NEWEST.map((l) => row('Stacked', l)))], { w: 448 }))); }
  ids.savesPanel = variantSet(cs, 'Saves panel', g, { w: 2000, gap: 32, pad: 32, cross: 'MIN' }).id;
}

// ---------------------------------------------------------------- HUD save toggle states
{
  const g = await group(B, 'HUD save status', 'SaveBadge on the 💾 toggle: Saving = mint spinner ring around the button, Saved = green ✓ badge (pops in), Error = pink "!" badge.');
  const cs = [];
  for (const state of ['Idle', 'Saving', 'Saved', 'Error']) {
    const c = figma.createComponent(); c.name = `State=${state}`; c.resize(50, 50); c.fills = []; c.clipsContent = false;
    const b = setP(I('iconButton', 'Size=Default, State=Default'), 'iconButton', { Icon: '💾', Badge: false }); c.appendChild(b); b.x = 4; b.y = 4;
    if (state === 'Saving') { const ring = figma.createEllipse(); ring.name = 'Save ring'; ring.resize(48, 48); ring.x = 1; ring.y = 1; ring.fills = []; stroke(ring, 'accent/mint', 3, 'INSIDE'); ring.arcData = { startingAngle: -Math.PI / 2, endingAngle: Math.PI, innerRadius: 0 }; c.appendChild(ring); }
    if (state === 'Saved' || state === 'Error') { const bd = I('badge', state === 'Saved' ? 'Tone=Ok' : 'Tone=Error'); c.appendChild(bd); bd.x = 30; bd.y = 0; }
    cs.push(c);
  }
  ids.saveStatus = variantSet(cs, 'HUD save status', g, { w: 400, gap: 24, pad: 28 }).id;
}

await snap(B, 0.35);
return { ids, made: made.length, board: B.id };
