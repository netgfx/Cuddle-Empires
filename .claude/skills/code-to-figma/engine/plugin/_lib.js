// ---- code-to-figma: shared helpers for build scripts (inlined at the LIB placeholder) ----
// Standard Plugin API only (no MCP-only helpers), dynamic-page safe: works in the runner plugin and,
// for scripts under 50 000 characters, as the `code` of the Figma MCP use_figma tool.
// Everything visual binds to the variables / styles created by 00-foundations.
const CONFIG = /*CONFIG*/null;
const ASSETS = /*ASSETS*/null;
const _vars = await figma.variables.getLocalVariablesAsync();
const V = Object.fromEntries(_vars.map((v) => [v.name, v]));
const TS = Object.fromEntries((await figma.getLocalTextStylesAsync()).map((s) => [s.name, s]));
const ES = Object.fromEntries((await figma.getLocalEffectStylesAsync()).map((s) => [s.name, s]));
const PS = Object.fromEntries((await figma.getLocalPaintStylesAsync()).map((s) => [s.name, s]));
const FONT = (CONFIG?.font) || 'Fredoka';
await Promise.all((CONFIG?.fontStyles || ['Regular', 'Medium', 'SemiBold', 'Bold']).map((style) => figma.loadFontAsync({ family: FONT, style }).catch(() => null)));
const RADIUS = Object.fromEntries(_vars.filter((v) => v.name.startsWith('radius/')).map((v) => [v.valuesByMode[Object.keys(v.valuesByMode)[0]], v.name]));
const made = [];
/** Styles used for the library chrome (board / group titles) — override in figma.config.mjs → figma.board. */
const BOARD = { title: 'Display/Title 40', subtitle: 'Body/Default 15', group: 'Heading/Must trade 24', note: 'Label/13 regular', fill: 'surface/solid', accent: 'text/accent', ink: 'text/primary', muted: 'text/secondary', ...(CONFIG?.board || {}) };

// ---- pages + library lookup (by name, never by node id)
/** Page by role key from config.figma.pages (library | screens | reference …); created when missing. */
async function page(key) {
  const name = CONFIG?.pages?.[key] || key;
  let p = figma.root.children.find((x) => x.name === name);
  if (!p) { p = figma.createPage(); p.name = name; }
  await p.loadAsync();
  return p;
}
/** { key: 'Component or set name' } → { key: node } from the library page; throws on a missing name. */
async function components(map) {
  const lib = await page('library');
  const all = {};
  for (const n of lib.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) if (!(n.type === 'COMPONENT' && n.parent?.type === 'COMPONENT_SET')) all[n.name] = n;
  const out = {};
  for (const [k, name] of Object.entries(map)) { if (!all[name]) throw new Error(`library component "${name}" not found — build its board first`); out[k] = all[name]; }
  return out;
}
const ASSET_HASH = {};
/** Image hash for an embedded asset (config.assets) — figma.createImage, no upload tool needed. */
function asset(name) {
  if (ASSET_HASH[name]) return ASSET_HASH[name];
  if (!ASSETS?.[name]) throw new Error(`asset "${name}" is not embedded (config.assets, runner builds only)`);
  return (ASSET_HASH[name] = figma.createImage(figma.base64Decode(ASSETS[name])).hash);
}
function imageRect(name, w, h = w, scaleMode = 'FIT') { const r = figma.createRectangle(); r.name = name; r.resize(w, h); r.fills = [{ type: 'IMAGE', imageHash: asset(name), scaleMode }]; return r; }

// ---- token-bound paint / layout
function vr(name) { const v = V[name]; if (!v) throw new Error('missing variable ' + name); return v; }
function solid(name, opacity) {
  const p = figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', vr(name));
  return opacity == null ? p : { ...p, opacity };
}
function fill(n, name, opacity) { n.fills = name ? [solid(name, opacity)] : []; return n; }
async function paintStyle(n, name) { if (!PS[name]) throw new Error('missing paint style ' + name); await n.setFillStyleIdAsync(PS[name].id); return n; }
function stroke(n, name, w = 1, align = 'INSIDE', dash) { n.strokes = [solid(name)]; n.strokeWeight = w; n.strokeAlign = align; if (dash) n.dashPattern = dash; return n; }
async function fx(n, name) { if (!ES[name]) throw new Error('missing effect ' + name); await n.setEffectStyleIdAsync(ES[name].id); return n; }
function radius(n, r) {
  const name = typeof r === 'string' ? r : RADIUS[r];
  if (name) for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) n.setBoundVariable(k, vr(name));
  else n.cornerRadius = r;
  return n;
}
function sp(n, field, val) { const v = V['space/' + val]; if (v) n.setBoundVariable(field, v); else n[field] = val; }
function pad(n, t, r = t, b = t, l = r) { sp(n, 'paddingTop', t); sp(n, 'paddingRight', r); sp(n, 'paddingBottom', b); sp(n, 'paddingLeft', l); }
function autoFrame(dir) {
  const f = figma.createFrame(); f.layoutMode = dir === 'V' ? 'VERTICAL' : 'HORIZONTAL';
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; f.fills = []; f.clipsContent = false; return f;
}
/** Auto-layout frame. o: name, gap, pad ([t,r,b,l] | n), main, cross, fill, opacity, r, wrap, wrapGap, clip, w, h */
function AL(dir, o = {}) { return layout(autoFrame(dir), dir, o); }
/** A component that is itself an auto-layout frame (same options as AL + description). */
function CMP(dir, o = {}) {
  const c = figma.createComponent();
  c.layoutMode = dir === 'V' ? 'VERTICAL' : 'HORIZONTAL';
  c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO';
  layout(c, dir, o);
  if (o.description) c.description = o.description;
  made.push(c.id);
  return c;
}
function layout(n, dir, o) {
  n.name = o.name || (dir === 'V' ? 'Column' : 'Row');
  n.fills = [];
  if (o.gap != null) sp(n, 'itemSpacing', o.gap);
  if (o.pad != null) pad(n, ...[].concat(o.pad));
  n.primaryAxisAlignItems = o.main || 'MIN';
  n.counterAxisAlignItems = o.cross || (dir === 'V' ? 'MIN' : 'CENTER');
  if (o.fill) fill(n, o.fill, o.opacity);
  if (o.r != null) radius(n, o.r);
  if (o.wrap) { n.layoutWrap = 'WRAP'; if (o.wrapGap != null) n.counterAxisSpacing = o.wrapGap; }
  n.clipsContent = !!o.clip;
  if (o.w || o.h) {
    n.resize(o.w || 10, o.h || 10); // resize() pins both axes; give the unset axis back to hug
    if (dir === 'V') { n.counterAxisSizingMode = o.w ? 'FIXED' : 'AUTO'; n.primaryAxisSizingMode = o.h ? 'FIXED' : 'AUTO'; }
    else { n.primaryAxisSizingMode = o.w ? 'FIXED' : 'AUTO'; n.counterAxisSizingMode = o.h ? 'FIXED' : 'AUTO'; }
  }
  return n;
}
/** Text bound to a text style + colour variable. o: name, align, w (fixed width, wraps), opacity */
async function T(chars, style, color = 'text/primary', o = {}) {
  const t = figma.createText();
  if (!TS[style]) throw new Error('missing text style ' + style);
  await t.setTextStyleIdAsync(TS[style].id);
  t.characters = String(chars);
  t.name = o.name || String(chars).slice(0, 32);
  if (color) fill(t, color);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; }
  if (o.opacity != null) t.opacity = o.opacity;
  return t;
}
/** Emoji / glyph text (system emoji fallback inside the product font). */
async function E(ch, size, name = 'Emoji') {
  const t = figma.createText();
  t.fontName = { family: FONT, style: 'Regular' };
  t.characters = ch; t.fontSize = size; t.name = name; t.lineHeight = { unit: 'PERCENT', value: 100 };
  return t;
}
function add(parent, ...kids) { for (const k of kids.flat()) if (k) parent.appendChild(k); return parent; }
function grow(n, h = true, v = false) { if (h) n.layoutSizingHorizontal = 'FILL'; if (v) n.layoutSizingVertical = 'FILL'; return n; }
function dot(size, color, name = 'Dot') { const e = figma.createEllipse(); e.name = name; e.resize(size, size); fill(e, color); return e; }
const svg = (w, h, body) => figma.createNodeFromSvg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

// ---- components
function textProp(c, name, def, node) { const k = c.addComponentProperty(name, 'TEXT', def); node.componentPropertyReferences = { ...(node.componentPropertyReferences || {}), characters: k }; return k; }
function boolProp(c, name, def, node) { const k = c.addComponentProperty(name, 'BOOLEAN', def); node.componentPropertyReferences = { ...(node.componentPropertyReferences || {}), visible: k }; return k; }
/** Combines variant components into a wrapping, auto-laid-out set inside `parent`. */
function variantSet(comps, name, parent, o = {}) {
  const set = figma.combineAsVariants(comps, parent);
  set.name = name;
  set.layoutMode = 'HORIZONTAL'; set.layoutWrap = 'WRAP';
  set.itemSpacing = o.gap ?? 16; set.counterAxisSpacing = o.gap ?? 16;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = o.pad ?? 20;
  set.primaryAxisSizingMode = 'FIXED'; set.counterAxisSizingMode = 'AUTO';
  set.counterAxisAlignItems = o.cross ?? 'CENTER';
  set.resize(o.w ?? 720, set.height);
  set.fills = o.bg ? [solid(o.bg)] : [];
  set.strokes = [{ type: 'SOLID', color: { r: 0.6, g: 0.45, b: 1 } }]; set.strokeWeight = 1; set.dashPattern = [6, 4]; set.cornerRadius = 12;
  if (o.description) set.description = o.description;
  made.push(set.id);
  return set;
}
/**
 * Rebinds every `<prefix>/<from>/*` variable under `node` to `<prefix>/<to>/*` — fills, strokes, gradient stops,
 * effect colours and STRING-bound text. This is how one component serves every palette group (team colour,
 * continent, brand…) on plans with a single variable mode. With modes enabled use setExplicitVariableModeForCollection.
 */
function swapVars(node, from, to, prefix) {
  const swap = (alias) => {
    const v = _vars.find((x) => x.id === alias.id);
    if (!v || !v.name.startsWith(`${prefix}/${from}/`)) return null;
    return V[v.name.replace(`${prefix}/${from}/`, `${prefix}/${to}/`)];
  };
  const fixPaints = (paints) => paints.map((p) => {
    if (p.type === 'SOLID') { const a = p.boundVariables?.color; const nv = a && swap(a); return nv ? figma.variables.setBoundVariableForPaint(p, 'color', nv) : p; }
    if (p.gradientStops) return { ...p, gradientStops: p.gradientStops.map((s) => { const a = s.boundVariables?.color; const nv = a && swap(a); return nv ? { ...s, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: nv.id } } } : s; }) };
    return p;
  });
  for (const n of [node, ...('findAll' in node ? node.findAll(() => true) : [])]) {
    if ('fills' in n && Array.isArray(n.fills) && n.fills.length) n.fills = fixPaints(n.fills);
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length) n.strokes = fixPaints(n.strokes);
    const ch = n.type === 'TEXT' && n.boundVariables?.characters;
    if (ch) { const nv = swap(ch); if (nv) n.setBoundVariable('characters', nv); }
    if ('effects' in n && n.effects.some((e) => e.boundVariables?.color)) {
      n.effects = n.effects.map((e) => { const a = e.boundVariables?.color; const nv = a && swap(a); return nv ? figma.variables.setBoundVariableForEffect(e, 'color', nv) : e; });
    }
  }
}
/** Back-compat alias used by older scripts: retint(node, from, to, prefix = 'team'). */
function retint(node, from, to, prefix = 'team') { return swapVars(node, from, to, prefix); }
/** Drop shadow whose colour is bound to a variable. */
function boundShadow(name, x, y, blur, spread = 0) {
  return figma.variables.setBoundVariableForEffect({ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 1 }, offset: { x, y }, radius: blur, spread, visible: true, blendMode: 'NORMAL' }, 'color', vr(name));
}
/** Gradient paint whose stops are bound to colour variables. kind: LINEAR | RADIAL; t: gradientTransform (node → gradient space) */
function gradient(kind, stops, t = [[0, 1, 0], [-1, 0, 1]]) {
  const valueOf = (v) => { let val = v.valuesByMode[Object.keys(v.valuesByMode)[0]]; while (val && val.type === 'VARIABLE_ALIAS') { const x = _vars.find((y) => y.id === val.id); val = x.valuesByMode[Object.keys(x.valuesByMode)[0]]; } return val; };
  return {
    type: `GRADIENT_${kind}`, gradientTransform: t,
    gradientStops: stops.map(([pos, name]) => { const v = vr(name); const c = valueOf(v); return { position: pos, color: { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } }; }),
  };
}
/** CSS radial-gradient(circle at X% Y%, …) farthest-corner on a w×h node → Figma gradientTransform. */
function radialCircle(w, h, cx = 0.5, cy = 0.5) {
  const R = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => Math.hypot(x - cx * w, y - cy * h)));
  const k = 0.5 / R;
  return [[w * k, 0, 0.5 - cx * w * k], [0, h * k, 0.5 - cy * h * k]];
}
/** Hard-stop linear gradient that imitates repeating-linear-gradient(45deg, a 0 p/2, b p/2 p). */
function stripes(a, b, period, length) {
  const stops = []; const n = Math.ceil(length / period);
  for (let i = 0; i < n; i++) {
    const s = (i * period) / length, m = (i * period + period / 2) / length, e = Math.min(1, ((i + 1) * period) / length);
    stops.push([s, a], [Math.min(1, m), a], [Math.min(1, m), b], [e, b]);
  }
  return gradient('LINEAR', stops.filter(([p]) => p <= 1), [[0.5, 0.5, 0], [-0.5, 0.5, 0.5]]);
}
/** Visual check: PNG to the runner server (plugin) or an inline screenshot (use_figma). */
async function snap(node, scale = 0.5) {
  if (typeof __runner !== 'undefined' && __runner) return __runner.snap(node, scale);
  if (typeof node.screenshot === 'function') return node.screenshot({ scale });
}

// ---- library boards: one titled auto-layout column per group, side by side on the library page
async function board(title, subtitle) {
  const p = await page('library');
  await figma.setCurrentPageAsync(p);
  // Never silently rebuild: deleting a board deletes its main components and orphans every instance.
  if (p.children.some((n) => n.name === `Board · ${title}`)) throw new Error(`Board · ${title} already exists — patch it in place (see references/authoring.md) or delete it first`);
  let x = 0;
  for (const c of p.children) x = Math.max(x, c.x + c.width + 160);
  const b = AL('V', { name: `Board · ${title}`, gap: 40, pad: 48, fill: BOARD.fill, r: 32 });
  b.x = x; b.y = 0;
  add(b, await T(title, BOARD.title, BOARD.accent), subtitle ? await T(subtitle, BOARD.subtitle, BOARD.muted, { w: 900 }) : null);
  p.appendChild(b);
  return b;
}
async function group(boardNode, title, note) {
  const g = AL('V', { name: title, gap: 14 });
  add(g, await T(title, BOARD.group, BOARD.ink), note ? await T(note, BOARD.note, BOARD.muted, { w: 760 }) : null);
  boardNode.appendChild(g);
  return g;
}
// ---- end helpers
