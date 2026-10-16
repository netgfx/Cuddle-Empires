// use_figma script — stage 3b: Controls board (atoms). Source: src/ui/ui.css "buttons", setup + settings rules.
/*LIB*/
/*INCLUDE:_units.js*/
for (const [name, size, style] of [['Number/Stepper 20', 20, 'Bold'], ['Number/Deck 13', 13, 'Bold']]) {
  if (!TS[name]) { const s = figma.createTextStyle(); s.name = name; s.fontName = { family: 'Fredoka', style }; s.fontSize = size; s.lineHeight = { unit: 'AUTO' }; TS[name] = s; }
}
const ids = {};
const B = await board('Controls', 'Buttons, toggles, inputs and pickers from ui.css. Variants mirror the CSS classes and states; fills, radii and padding are bound to tokens. Motion (hover lift, bounce easing) is noted in each component description.');

// ---------------------------------------------------------------- Unit icon
{
  const g = await group(B, 'Unit icon', '.unit-img — PNG art served from /assets/icons. Dog = 1 army, Pony = 5, Panda = 10. Resize the instance; the art scales. Emoji fallback: 🐶 🐴 🐼.');
  const cs = [];
  for (const a of ['dog', 'pony', 'panda']) {
    const c = figma.createComponent(); c.name = `Animal=${a[0].toUpperCase() + a.slice(1)}`; c.resize(28, 28); c.fills = [];
    const r = img(a, 28); r.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }; c.appendChild(r);
    cs.push(c);
  }
  ids.unit = variantSet(cs, 'Unit icon', g, { w: 240, description: 'UnitIcon (src/ui/common.tsx). <img class="unit-img" src="/assets/icons/{animal}.png"> with drop-shadow(0 2px 2px rgba(0,0,0,.18)).' }).id;
}

// ---------------------------------------------------------------- Badge
let badgeSet;
{
  const g = await group(B, 'Badge', '.badge — counter dot on icon buttons and tabs (white 2px ring). Ok = save confirmed, Error = save failed.');
  const cs = [], labels = [];
  for (const [tone, bg, txt] of [['Count', 'accent/pink-deep', '3'], ['Ok', 'accent/success', '✓'], ['Error', 'accent/pink-deep', '!']]) {
    const c = CMP('H', { name: `Tone=${tone}`, main: 'CENTER', cross: 'CENTER', pad: [0, 5], r: 999, fill: bg });
    c.resize(20, 20); c.primaryAxisSizingMode = 'AUTO'; c.minWidth = 20;
    stroke(c, 'surface/white', 2, 'OUTSIDE');
    const t = await T(txt, 'Caption/Badge 12', 'text/on-accent', { name: 'Count' });
    add(c, t); cs.push(c); labels.push(t);
  }
  badgeSet = variantSet(cs, 'Badge', g, { w: 260 });
  const k = badgeSet.addComponentProperty('Count', 'TEXT', '3');
  labels.forEach((t, i) => { if (i === 0) t.componentPropertyReferences = { characters: k }; }); // Ok ✓ / Error ! are fixed glyphs (ISSUES #7)
  ids.badge = badgeSet.id;
}

// ---------------------------------------------------------------- Buttons (one set per size, Style × State)
const BTN = {
  Default: { fill: 'surface/white', text: 'text/primary', fx: 'Shadow/Button' },
  Primary: { grad: 'Gradient/Button primary', text: 'text/on-accent', fx: 'Shadow/Button primary' },
  Warm: { grad: 'Gradient/Button warm', text: 'text/warm', fx: 'Shadow/Button warm' },
  Ghost: { fill: 'surface/glass-70', text: 'text/primary', stroke: 'border/line' },
  Danger: { grad: 'Gradient/Button danger', text: 'text/on-accent', fx: 'Shadow/Button danger' },
  Success: { grad: 'Gradient/Button success', text: 'text/on-accent', fx: 'Shadow/Button success' },
};
const SIZES = {
  Small: { pad: [6, 12], type: 'Label/13 strong', label: 'Suggest set', icon: 13, cls: '.btn.sm' },
  Medium: { pad: [9, 18], type: 'Body/Button 15', label: 'End attack ➜', icon: 15, cls: '.btn' },
  Big: { pad: [14, 30], type: 'Body/Button big 19', label: 'Start game ✨', icon: 19, cls: '.btn.big' },
};
for (const [size, z] of Object.entries(SIZES)) {
  const g = await group(B, size === 'Medium' ? 'Button' : `Button ${size}`, `${z.cls} — Style × State. Hover: translateY(-2px) scale(1.03); Pressed: translateY(1px) scale(.98) + flat ledge; Disabled: opacity .45. Easing .18s cubic-bezier(.34,1.56,.64,1). Touch (pointer: coarse) pads 11/20 → layout/touch/btn-pad-*.`);
  const cs = [], labels = [], icons = [];
  for (const [style, s] of Object.entries(BTN)) {
    for (const state of ['Default', 'Hover', 'Pressed', 'Disabled']) {
      const c = CMP('H', { name: `Style=${style}, State=${state}`, gap: 6, pad: [z.pad[0], z.pad[1] + (state === 'Hover' ? 1 : 0)], r: 999, main: 'CENTER', cross: 'CENTER' });
      if (s.grad) await paintStyle(c, s.grad); else fill(c, s.fill);
      if (s.stroke) stroke(c, s.stroke, 2, 'INSIDE');
      if (state === 'Pressed') await fx(c, 'Shadow/Button pressed'); else if (s.fx) await fx(c, s.fx);
      if (state === 'Disabled') c.opacity = 0.45;
      const icon = await E('🎲', z.icon, 'Icon');
      const label = await T(z.label, z.type, s.text, { name: 'Label' });
      add(c, icon, label);
      cs.push(c); labels.push(label); icons.push(icon);
    }
  }
  const set = variantSet(cs, size === 'Medium' ? 'Button' : `Button ${size}`, g, { w: size === 'Big' ? 1100 : 900, description: `Native <button class="btn ${size === 'Small' ? 'sm ' : size === 'Big' ? 'big ' : ''}{primary|warm|ghost|danger}">. Success = .save-btn.done. Emoji in labels are part of the text in code; "Icon" exposes a leading one.` });
  const kL = set.addComponentProperty('Label', 'TEXT', z.label);
  const kI = set.addComponentProperty('Icon', 'TEXT', '🎲');
  const kS = set.addComponentProperty('Show icon', 'BOOLEAN', false);
  labels.forEach((t) => { t.componentPropertyReferences = { characters: kL }; });
  icons.forEach((t) => { t.componentPropertyReferences = { characters: kI, visible: kS }; });
  ids[`button${size}`] = set.id;
}

// ---------------------------------------------------------------- Icon button (HUD toggles, close)
{
  const g = await group(B, 'Icon button', '.icon-btn — 42px HUD toggle (36px ≤1100px, 46px on touch). On = panel open (pink ring). Hover: scale(1.1) rotate(-4deg). Small = close / delete (.icon-btn.sm). Size is bound to layout/* variables.');
  const cs = [], emojis = [], badges = [];
  const SZ = { Default: ['layout/desktop/icon-btn', 'layout/desktop/icon-btn-font'], Compact: ['layout/tablet/icon-btn', 'layout/tablet/icon-btn-font'], Touch: ['layout/touch/icon-btn', 'layout/touch/icon-btn-font'] };
  for (const [size, [wv, fv]] of Object.entries(SZ)) {
    for (const state of ['Default', 'On', 'Hover']) {
      const c = CMP('H', { name: `Size=${size}, State=${state}`, main: 'CENTER', cross: 'CENTER', r: 999, fill: state === 'On' ? 'surface/selected' : 'surface/glass-85' });
      c.resize(42, 42); c.setBoundVariable('width', vr(wv)); c.setBoundVariable('height', vr(fv.replace('-font', '')));
      await fx(c, state === 'On' ? 'Shadow/Icon button on' : 'Shadow/Icon button');
      if (state === 'On') stroke(c, 'accent/pink', 3, 'OUTSIDE'); // ring as a stroke: shadow spread is ignored on non-clipping frames
      const e = await E('🏆', 19, 'Icon'); e.setBoundVariable('fontSize', vr(fv));
      if (state === 'Hover') e.rotation = 4;
      const b = badgeSet.defaultVariant.createInstance(); b.name = 'Badge';
      add(c, e, b);
      b.layoutPositioning = 'ABSOLUTE'; b.constraints = { horizontal: 'MAX', vertical: 'MIN' }; b.x = c.width - 16; b.y = -4;
      cs.push(c); emojis.push(e); badges.push(b);
    }
  }
  for (const state of ['Default', 'Hover']) {
    const c = CMP('H', { name: `Size=Small, State=${state}`, main: 'CENTER', cross: 'CENTER', r: 999, fill: state === 'Hover' ? 'surface/track' : 'surface/icon-sm' });
    c.resize(28, 28);
    const e = await E('✕', 13, 'Icon'); fill(e, 'text/primary');
    const b = badgeSet.defaultVariant.createInstance(); b.name = 'Badge';
    add(c, e, b); b.layoutPositioning = 'ABSOLUTE'; b.x = 14; b.y = -4;
    cs.push(c); emojis.push(e); badges.push(b);
  }
  const set = variantSet(cs, 'Icon button', g, { w: 620, gap: 24, pad: 28 });
  const kI = set.addComponentProperty('Icon', 'TEXT', '🏆');
  const kB = set.addComponentProperty('Badge', 'BOOLEAN', false);
  emojis.forEach((t) => { t.componentPropertyReferences = { characters: kI }; });
  badges.forEach((b) => { b.componentPropertyReferences = { visible: kB }; b.isExposedInstance = true; });
  ids.iconButton = set.id;
}

// ---------------------------------------------------------------- Round (stepper) button
{
  const g = await group(B, 'Round button', '.round-btn — − / + steppers of the count picker.');
  const cs = [], labels = [];
  for (const state of ['Default', 'Disabled']) {
    const c = CMP('H', { name: `State=${state}`, main: 'CENTER', cross: 'CENTER', r: 999, fill: 'surface/white' });
    c.resize(36, 36); await fx(c, 'Shadow/Round button'); if (state === 'Disabled') c.opacity = 0.45;
    const t = await T('+', 'Number/Stepper 20', 'text/primary', { name: 'Sign' }); add(c, t); cs.push(c); labels.push(t);
  }
  const set = variantSet(cs, 'Round button', g, { w: 200 });
  const k = set.addComponentProperty('Sign', 'TEXT', '+'); labels.forEach((t) => { t.componentPropertyReferences = { characters: k }; });
  ids.roundButton = set.id;
}

// ---------------------------------------------------------------- Segmented option + control (slot)
{
  const g = await group(B, 'Segmented control', '.seg / .place-step — pill track with options (role=radiogroup). Settings speed 1× 2× 4×, setup rules, HUD "place 1 / 3 / 5 / All". Options live in a slot: drop Seg option instances in.');
  const cs = [], labels = [];
  for (const [kind, state] of [['Seg', 'Off'], ['Seg', 'On'], ['Place', 'Off'], ['Place', 'On'], ['Place', 'Disabled']]) {
    const on = state === 'On';
    const c = CMP('H', { name: `Kind=${kind}, State=${state}`, main: 'CENTER', cross: 'CENTER', r: 999, pad: kind === 'Seg' ? [6, 14] : [0, 10] });
    if (on) { fill(c, 'surface/white'); await fx(c, 'Shadow/Seg on'); }
    if (kind === 'Place') { c.resize(34, 30); c.primaryAxisSizingMode = 'AUTO'; c.minWidth = 34; }
    if (state === 'Disabled') c.opacity = 0.45;
    const t = await T(kind === 'Seg' ? 'Auto deal' : '3', on || kind === 'Place' ? 'Body/Small strong 14' : 'Body/Small 14', on ? 'text/accent' : 'text/primary', { name: 'Label' });
    add(c, t); cs.push(c); labels.push(t);
  }
  const opt = variantSet(cs, 'Seg option', g, { w: 520 });
  const k = opt.addComponentProperty('Label', 'TEXT', 'Auto deal'); labels.forEach((t) => { t.componentPropertyReferences = { characters: k }; });
  ids.segOption = opt.id;

  const track = CMP('H', { name: 'Segmented control', gap: 2, pad: 3, r: 999, fill: 'surface/track', description: '.seg track. Options slot holds Seg option instances (one On).' });
  let slotOk = true;
  try {
    const slot = track.createSlot(); slot.name = 'Options';
    slot.layoutMode = 'HORIZONTAL'; slot.itemSpacing = 2; slot.primaryAxisSizingMode = 'AUTO'; slot.counterAxisSizingMode = 'AUTO'; slot.fills = [];
    const on = opt.children.find((c) => c.name === 'Kind=Seg, State=On'); const off = opt.children.find((c) => c.name === 'Kind=Seg, State=Off');
    const a = on.createInstance(); a.setProperties({ [k]: 'Auto deal' });
    const b = off.createInstance(); b.setProperties({ [k]: 'Manual claim' });
    slot.appendChild(a); slot.appendChild(b);
  } catch (e) { slotOk = String(e.message || e); }
  g.appendChild(track);
  ids.segControl = track.id; ids.segSlot = slotOk;
}

// ---------------------------------------------------------------- Swatch
{
  const g = await group(B, 'Swatch', '.swatch — team colour picker dot (setup + online). Selected = ink ring, Disabled = colour taken by another player (opacity .25). Fill is bound to team/<Colour>/base — use retint to switch.');
  const cs = [];
  for (const size of ['Default', 'Small']) {
    for (const state of ['Default', 'Selected', 'Disabled']) {
      const s = size === 'Default' ? 34 : 28;
      const c = figma.createComponent(); c.name = `Size=${size}, State=${state}`; c.resize(s, s); radius(c, 999); fill(c, 'team/Crimson/base'); c.clipsContent = true; // spread rings need a clipping frame
      c.effects = [
        { type: 'INNER_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.18 }, offset: { x: 0, y: -3 }, radius: 0, spread: 0, visible: true, blendMode: 'NORMAL' },
        ...(state === 'Selected'
          ? [{ type: 'DROP_SHADOW', color: { r: 0.165, g: 0.184, b: 0.271, a: 1 }, offset: { x: 0, y: 0 }, radius: 0, spread: 6, visible: true, blendMode: 'NORMAL' }]
          : []),
        { type: 'DROP_SHADOW', color: { r: 1, g: 1, b: 1, a: 1 }, offset: { x: 0, y: 0 }, radius: 0, spread: 3, visible: true, blendMode: 'NORMAL' },
        ...(state === 'Selected' ? [] : [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 2 }, radius: 6, spread: 0, visible: true, blendMode: 'NORMAL' }]),
      ];
      if (state === 'Disabled') c.opacity = 0.25;
      cs.push(c);
    }
  }
  ids.swatch = variantSet(cs, 'Swatch', g, { w: 360, gap: 22, pad: 24 }).id;
}

// ---------------------------------------------------------------- Text input
{
  const g = await group(B, 'Text input', '.name-input (player name, save name) and online fields. Focus: pink border + white fill. Placeholder uses the browser default grey.');
  const cs = [], labels = [];
  for (const kind of ['Name', 'Field']) {
    for (const state of ['Default', 'Focus', 'Placeholder', 'Disabled']) {
      const c = CMP('H', { name: `Kind=${kind}, State=${state}`, pad: kind === 'Name' ? [7, 12] : [8, 12], r: 12, fill: state === 'Focus' ? 'surface/white' : 'surface/track-soft', w: 240 });
      if (state === 'Focus') stroke(c, 'border/focus', 2, 'INSIDE'); else c.strokes = []; // transparent 2px border = no stroke (layout is padding-based)
      if (state === 'Disabled') c.opacity = 0.6;
      const t = await T(state === 'Placeholder' ? 'Name this save (optional)' : 'Lena', kind === 'Name' ? 'Body/Input 16' : 'Body/Default 15', state === 'Placeholder' ? 'text/secondary' : 'text/primary', { name: 'Value' });
      add(c, t); grow(t); t.maxLines = 1; t.textTruncation = 'ENDING'; // native inputs are one line and clip
      cs.push(c); labels.push(t);
    }
  }
  const set = variantSet(cs, 'Text input', g, { w: 1060 });
  const k = set.addComponentProperty('Value', 'TEXT', 'Lena');
  labels.forEach((t, i) => { if (!cs[i].name.includes('Placeholder')) t.componentPropertyReferences = { characters: k }; });
  for (const [i, c] of cs.entries()) if (c.name === 'Kind=Field, State=Placeholder') labels[i].characters = 'e.g. PANDA7';
  ids.textInput = set.id;
}

// ---------------------------------------------------------------- Kind toggle + chip tag + add player
{
  const g = await group(B, 'Toggles & tags', '.kind-btn (human ⇄ bot), .chip-tag (bot / you / waiting / ready), .add-player (dashed).');
  const kinds = [];
  for (const [kind, bg, fg, label] of [['Human', 'surface/selected', 'text/accent', '🙂 Human'], ['Bot', 'surface/note', 'text/bot', '🤖 Bot']]) {
    const c = CMP('H', { name: `Kind=${kind}`, main: 'CENTER', cross: 'CENTER', pad: [7, 14], r: 999, fill: bg });
    c.minWidth = 104;
    add(c, await T(label, 'Body/Small strong 14', fg, { name: 'Label' })); kinds.push(c);
  }
  ids.kindToggle = variantSet(kinds, 'Kind toggle', g, { w: 300 }).id;

  const tags = [], tagLabels = [];
  for (const [tone, bg, fg] of [['Default', 'surface/tag', 'text/secondary'], ['Ready', 'surface/ready', 'text/success']]) {
    const c = CMP('H', { name: `Tone=${tone}`, pad: [1, 6], r: 999, fill: bg });
    const t = await T(tone === 'Ready' ? 'ready' : 'bot', 'Micro/Tag 10', fg, { name: 'Text' }); add(c, t); tags.push(c); tagLabels.push(t);
  }
  const tagSet = variantSet(tags, 'Chip tag', g, { w: 200 });
  const kt = tagSet.addComponentProperty('Text', 'TEXT', 'bot'); tagLabels.forEach((t, i) => { if (i === 0) t.componentPropertyReferences = { characters: kt }; });
  ids.chipTag = tagSet.id;

  const adds = [];
  for (const state of ['Default', 'Hover']) {
    const c = CMP('H', { name: `State=${state}`, main: 'CENTER', cross: 'CENTER', pad: 9, r: 18, w: 420 });
    if (state === 'Hover') fill(c, 'surface/glass-60');
    stroke(c, 'border/dashed', 2, 'INSIDE', [6, 4]);
    add(c, await T('+ Add player', 'Body/Button 15', 'text/secondary', { name: 'Label' })); adds.push(c);
  }
  ids.addPlayer = variantSet(adds, 'Add player', g, { w: 920 }).id;
}

// ---------------------------------------------------------------- Die button
{
  const g = await group(B, 'Die button', '.die-btn — attacker dice count picker (1–3 pips). Selected: pink ring + rotate(-4deg) scale(1.08). Hover: translateY(-3px) rotate(-6deg).');
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8] };
  const cs = [];
  for (const n of [1, 2, 3]) {
    for (const state of ['Default', 'Selected', 'Disabled']) {
      const c = figma.createComponent(); c.name = `Pips=${n}, State=${state}`; c.resize(46, 46); radius(c, 12); c.clipsContent = true;
      fill(c, state === 'Selected' ? 'surface/selected' : 'surface/white');
      await fx(c, state === 'Selected' ? 'Shadow/Die on' : 'Shadow/Die');
      if (state === 'Disabled') c.opacity = 0.45;
      for (const i of PIPS[n]) {
        const p = dot(8, 'text/primary', 'Pip'); c.appendChild(p);
        p.x = 6 + (i % 3) * (34 / 3) + (34 / 3 - 8) / 2; p.y = 6 + Math.floor(i / 3) * (34 / 3) + (34 / 3 - 8) / 2;
      }
      if (state === 'Selected') c.rotation = 0;
      cs.push(c);
    }
  }
  ids.die = variantSet(cs, 'Die button', g, { w: 480, gap: 18, pad: 24 }).id;
}

// ---------------------------------------------------------------- Spinner
{
  const g = await group(B, 'Spinner', '.spinner — 15px ring, 2.5px currentColor with a transparent right edge, spin .7s linear infinite.');
  const cs = [];
  for (const [tone, color] of [['On accent', 'text/on-accent'], ['Ink', 'text/primary']]) {
    const c = figma.createComponent(); c.name = `Tone=${tone}`; c.resize(15, 15); c.fills = [];
    const e = figma.createEllipse(); e.resize(15, 15); e.arcData = { startingAngle: -Math.PI / 4 * 1, endingAngle: Math.PI * 1.25, innerRadius: 0.67 }; fill(e, color); e.name = 'Arc';
    c.appendChild(e); cs.push(c);
  }
  ids.spinner = variantSet(cs, 'Spinner', g, { w: 160, bg: 'accent/pink-deep' }).id;
}

// ---------------------------------------------------------------- Settings controls (native inputs, Chrome rendering)
{
  const g = await group(B, 'Form controls', 'Native <input type=range>, <select> and <input type=checkbox> with accent-color: var(--pink-deep), as Chrome renders them in the Settings panel.');
  const sliders = [];
  for (const [state, pct] of [['Low', 0.2], ['Mid', 0.5], ['High', 0.85]]) {
    const c = figma.createComponent(); c.name = `Value=${state}`; c.resize(140, 16); c.fills = [];
    const track = figma.createRectangle(); track.resize(140, 4); track.y = 6; radius(track, 999); track.name = 'Track';
    track.fills = [{ type: 'SOLID', color: { r: 0.231, g: 0.231, b: 0.231 } }]; // Chrome's native unfilled track (#3b3b3b), no token
    const on = figma.createRectangle(); on.resize(140 * pct, 4); on.y = 6; radius(on, 999); fill(on, 'accent/pink-deep'); on.name = 'Fill';
    const thumb = dot(16, 'accent/pink-deep', 'Thumb'); thumb.x = 140 * pct - 8; thumb.y = 0;
    c.appendChild(track); c.appendChild(on); c.appendChild(thumb); sliders.push(c);
  }
  ids.slider = variantSet(sliders, 'Slider', g, { w: 560, gap: 24 }).id;

  const sel = CMP('H', { name: 'Select', gap: 8, pad: [4, 8], r: 10, fill: 'surface/white', main: 'SPACE_BETWEEN', w: 100, description: 'Native <select> (music track) — Chrome sizes it to the longest option (≈100px).' });
  stroke(sel, 'border/line', 2, 'INSIDE');
  const selLabel = await T('🌼 Meadow', 'Body/Small 14', 'text/primary', { name: 'Value' });
  add(sel, selLabel, await T('▾', 'Body/Small 14', 'text/primary', { name: 'Chevron' }));
  sel.addComponentProperty('Value', 'TEXT', '🌼 Meadow');
  selLabel.componentPropertyReferences = { characters: Object.keys(sel.componentPropertyDefinitions)[0] };
  g.appendChild(sel); ids.select = sel.id;

  const checks = [];
  for (const state of ['On', 'Off']) {
    const c = CMP('H', { name: `Checked=${state}`, main: 'CENTER', cross: 'CENTER', r: 4 });
    c.resize(20, 20);
    if (state === 'On') { fill(c, 'accent/pink-deep'); add(c, await T('✓', 'Label/13 strong', 'text/on-accent', { name: 'Check' })); }
    else { fill(c, 'surface/white'); stroke(c, 'text/secondary', 1.5, 'INSIDE'); }
    checks.push(c);
  }
  ids.checkbox = variantSet(checks, 'Checkbox', g, { w: 200 }).id;
}

return { ids, made: made.length };
