// code-to-figma — stage 3a: foundations from tokens.json (schema: references/authoring.md#tokens).
// Idempotent: find-or-create by name and update values in place, so it is also the token *sync* step.
/*LIB*/
const TOKENS = /*TOKENS*/null;
if (!TOKENS) throw new Error('tokens.json missing — run the project token extractor first');
const hex2rgb = (h) => { h = h.replace('#', ''); return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }; };
const rgba = (c) => ({ ...hex2rgb(c.hex), a: c.a ?? 1 });
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const all = await figma.variables.getLocalVariablesAsync();
const report = { collections: {}, created: 0, updated: 0, textStyles: 0, effectStyles: 0, paintStyles: 0 };

function collection(name) {
  let c = cols.find((x) => x.name === name);
  if (!c) { c = figma.variables.createVariableCollection(name); cols.push(c); }
  if (c.modes[0].name !== 'Value') c.renameMode(c.modes[0].modeId, 'Value');
  report.collections[name] = c.id;
  return c;
}
function variable(coll, name, type, value, scopes, web) {
  let v = all.find((x) => x.name === name && x.variableCollectionId === coll.id);
  if (!v) { v = figma.variables.createVariable(name, coll, type); all.push(v); report.created++; } else report.updated++;
  v.setValueForMode(coll.modes[0].modeId, value);
  v.scopes = scopes;
  if (web) v.setVariableCodeSyntax('WEB', web.startsWith('var(') ? web : `var(${web})`);
  return v;
}
const css = TOKENS.codeSyntax || {};

// Primitives (hidden from pickers) + extra literal colours (e.g. canvas / scene colours)
const prim = collection('Primitives');
const P = {};
for (const [name, c] of Object.entries({ ...TOKENS.primitives, ...(TOKENS.extraColors || {}) })) P[name] = variable(prim, name, 'COLOR', rgba(c), [], css[name]);

// Semantic colours = aliases to primitives
const color = collection('Color');
const scopeFor = (name) => {
  if (name.startsWith('text/')) return ['TEXT_FILL'];
  if (name.startsWith('surface/')) return ['FRAME_FILL', 'SHAPE_FILL'];
  if (name.startsWith('border/')) return ['STROKE_COLOR', 'EFFECT_COLOR'];
  if (name.startsWith('accent/')) return ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'];
  return ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'];
};
const semantic = { ...TOKENS.semantic, ...Object.fromEntries(Object.keys(TOKENS.extraColors || {}).map((k) => [k, k])) };
for (const [name, target] of Object.entries(semantic)) {
  if (!P[target]) throw new Error(`semantic ${name} → unknown primitive ${target}`);
  variable(color, name, 'COLOR', { type: 'VARIABLE_ALIAS', id: P[target].id }, scopeFor(name), css[name]);
}

// Palettes: one collection each; one group per member (`<prefix>/<Member>/<role>`) on single-mode plans.
for (const [collName, pal] of Object.entries(TOKENS.palettes || {})) {
  const coll = collection(collName);
  for (const [member, roles] of Object.entries(pal.groups)) {
    for (const [role, val] of Object.entries(roles)) {
      const name = `${pal.prefix}/${member}/${role}`;
      if (typeof val === 'string') variable(coll, name, 'STRING', val, ['TEXT_CONTENT']);
      else if (typeof val === 'number') variable(coll, name, 'FLOAT', val, []);
      else variable(coll, name, 'COLOR', rgba(val), ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'], pal.cssVar?.[role]);
    }
  }
}

// Dimensions + responsive layout values (one group per breakpoint)
const dim = collection('Dimension');
for (const [name, val] of Object.entries(TOKENS.radius || {})) variable(dim, name, 'FLOAT', val, ['CORNER_RADIUS']);
for (const [name, val] of Object.entries(TOKENS.space || {})) variable(dim, name, 'FLOAT', val, ['GAP']);
if (TOKENS.layout) {
  const lay = collection('Layout');
  for (const [key, vals] of Object.entries(TOKENS.layout.values)) {
    const scopes = /font/.test(key) ? ['FONT_SIZE'] : /gap|pad/.test(key) ? ['GAP'] : ['WIDTH_HEIGHT'];
    vals.forEach((val, i) => variable(lay, `layout/${TOKENS.layout.modes[i]}/${key}`, 'FLOAT', val, scopes));
  }
}

// Text styles
const texts = await figma.getLocalTextStylesAsync();
await Promise.all(TOKENS.font.styles.map((style) => figma.loadFontAsync({ family: TOKENS.font.family, style })));
for (const [name, t] of Object.entries(TOKENS.typeStyles)) {
  let s = texts.find((x) => x.name === name);
  if (!s) { s = figma.createTextStyle(); s.name = name; report.textStyles++; }
  s.fontName = { family: t.family || TOKENS.font.family, style: t.style };
  s.fontSize = t.size;
  s.lineHeight = t.lineHeight ? { unit: 'PERCENT', value: t.lineHeight * 100 } : { unit: 'AUTO' };
  s.letterSpacing = { unit: 'PERCENT', value: (t.letterSpacingEm || 0) * 100 };
  s.textCase = t.textCase || 'ORIGINAL';
  s.description = `${t.family || TOKENS.font.family} ${t.style} ${t.size}px${t.textCase === 'UPPER' ? ' · uppercase' : ''}${TOKENS.font.cssVar ? ` — font-family: var(${TOKENS.font.cssVar})` : ''}`;
}

// Effect styles: arrays of { x, y, blur, spread, color } and/or { backgroundBlur }; or 'blurN' shorthand
const effs = await figma.getLocalEffectStylesAsync();
for (const [name, def] of Object.entries(TOKENS.effects || {})) {
  let s = effs.find((x) => x.name === name);
  if (!s) { s = figma.createEffectStyle(); s.name = name; report.effectStyles++; }
  const list = typeof def === 'string' ? [{ backgroundBlur: +def.replace(/\D/g, '') }] : def;
  s.effects = list.map((e) => (e.backgroundBlur
    ? { type: 'BACKGROUND_BLUR', blurType: 'NORMAL', radius: e.backgroundBlur, visible: true }
    : { type: e.inner ? 'INNER_SHADOW' : 'DROP_SHADOW', color: rgba(e.color), offset: { x: e.x, y: e.y }, radius: e.blur, spread: e.spread || 0, visible: true, blendMode: 'NORMAL', ...(e.inner ? {} : { showShadowBehindNode: false }) }));
}

// Gradient paint styles: { name: [colorVar, …] } or { name: { stops: [...], angle: 180 } } — stops bound to variables
const paints = await figma.getLocalPaintStylesAsync();
const byName = (n) => all.find((v) => v.name === n && v.variableCollectionId === color.id) ?? all.find((v) => v.name === n);
const valueOf = (v) => { let val = v.valuesByMode[Object.keys(v.valuesByMode)[0]]; while (val && val.type === 'VARIABLE_ALIAS') { const t = all.find((x) => x.id === val.id); val = t.valuesByMode[Object.keys(t.valuesByMode)[0]]; } return val; };
const angleTransform = (deg) => { // CSS linear-gradient angle → Figma gradientTransform (node → gradient space)
  const r = ((deg - 90) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[c, s, 0.5 - 0.5 * c - 0.5 * s], [-s, c, 0.5 + 0.5 * s - 0.5 * c]];
};
const missing = [];
for (const [name, def] of Object.entries(TOKENS.gradients || {})) {
  const stops = Array.isArray(def) ? def : def.stops;
  const angle = Array.isArray(def) ? (TOKENS.gradientAngles?.[name] ?? 180) : (def.angle ?? 180);
  let s = paints.find((x) => x.name === name);
  if (!s) { s = figma.createPaintStyle(); s.name = name; report.paintStyles++; }
  s.paints = [{
    type: 'GRADIENT_LINEAR', gradientTransform: angleTransform(angle),
    gradientStops: stops.map((n, i) => {
      const v = byName(n); if (!v) missing.push(`${name}:${n}`);
      const c = v ? valueOf(v) : { r: 1, g: 1, b: 1, a: 1 };
      return { position: stops.length === 1 ? 0 : i / (stops.length - 1), color: { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 }, ...(v ? { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } } : {}) };
    }),
  }];
}
return { ...report, missingGradientStops: missing };
