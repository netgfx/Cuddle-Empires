// ---- code-to-figma: screen composition helpers (inlined at the SCREENS placeholder, after LIB) ----
// Components are found by name on the library page; backdrops (the canvas / scene behind the DOM UI)
// come from `capture --backdrop` renders keyed "<scenario>@<viewport>".
const LIB_PAGE = await page('library');
const SCREENS_PAGE = await page('screens');
const COMP = {};
for (const n of LIB_PAGE.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
  if (n.type === 'COMPONENT' && n.parent?.type === 'COMPONENT_SET') continue;
  COMP[n.name] = n;
}
const BACKDROPS = /*IMAGES*/null;
const BACKDROP_HASH = {};
await figma.setCurrentPageAsync(SCREENS_PAGE);

function propsOf(owner, props) {
  const defs = owner.componentPropertyDefinitions; const o = {};
  for (const [n, v] of Object.entries(props)) { const k = Object.keys(defs).find((x) => x === n || x.startsWith(n + '#')); if (!k) throw new Error(`no property ${n} on ${owner.name}`); o[k] = v; }
  return o;
}
/** Instance of a library component (variant by name), with optional properties. */
function use(name, variant, props) {
  const c = COMP[name]; if (!c) throw new Error(`component "${name}" not found on the library page`);
  const main = c.type === 'COMPONENT_SET' ? (variant ? c.children.find((v) => v.name === variant) : c.defaultVariant) : c;
  if (!main) throw new Error(`variant "${variant}" not found in ${name}`);
  const i = main.createInstance();
  if (props) i.setProperties(propsOf(c, props));
  return i;
}
// dynamic-page plugins must use getMainComponentAsync (the sync .mainComponent getter only works under the MCP)
async function setOf(inst) { const m = await inst.getMainComponentAsync(); return m?.parent?.type === 'COMPONENT_SET' ? m.parent : m; }
async function setNested(inst, props) { inst.setProperties(propsOf(await setOf(inst), props)); }
/** Instances under `root` whose component (set) is named `setName`. */
async function instancesOf(root, setName) { const out = []; for (const n of root.findAllWithCriteria({ types: ['INSTANCE'] })) { if ((await setOf(n))?.name === setName) out.push(n); } return out; }
/** Rebinds layout/<from>/* variables to layout/<to>/* under a node (paddings, gaps, sizes, font sizes). */
function rebindLayout(node, to, from = 'desktop') {
  const swap = (a) => { const v = _vars.find((x) => x.id === a?.id); return v && v.name.startsWith(`layout/${from}/`) ? V[v.name.replace(`layout/${from}/`, `layout/${to}/`)] : null; };
  for (const n of [node, ...('findAll' in node ? node.findAll(() => true) : [])]) {
    for (const [field, a] of Object.entries(n.boundVariables || {})) {
      if (Array.isArray(a)) { const nv = swap(a[0]); if (nv && n.type === 'TEXT') n.setBoundVariable(field, nv); continue; }
      const nv = swap(a); if (nv) { try { n.setBoundVariable(field, nv); } catch { /* not bindable here */ } }
    }
  }
}
const viewportName = (w, h) => Object.entries(CONFIG?.viewports || {}).find(([, v]) => v.width === w && v.height === h)?.[0];
function backdropHash(scenario, w, h) {
  const key = `${scenario}@${viewportName(w, h)}`;
  if (!BACKDROP_HASH[key] && BACKDROPS?.[key]) BACKDROP_HASH[key] = figma.createImage(figma.base64Decode(BACKDROPS[key])).hash;
  return BACKDROP_HASH[key] || null;
}
const SCREEN_GAP = 160;
const sections = {};
/** One titled section per flow on the screens page; frames are laid out in rows inside it. */
function section(title, y) {
  if (SCREENS_PAGE.children.some((n) => n.type === 'SECTION' && n.name === title)) throw new Error(`Section ${title} already exists on the screens page — patch it in place or delete it to rebuild`);
  const s = figma.createSection(); s.name = title; s.x = 0; s.y = y; SCREENS_PAGE.appendChild(s);
  sections[title] = { node: s, x: 120, y: 160, rowH: 0 };
  return s;
}
/** Adopts an existing section (append screens to it later, e.g. from a fix script). */
function adoptSection(title) {
  const s = SCREENS_PAGE.children.find((n) => n.type === 'SECTION' && n.name === title); if (!s) throw new Error(`no section ${title}`);
  let x = 120, y = 160, rowH = 0;
  for (const c of s.children) if (c.type === 'FRAME') { x = Math.max(x, c.x + c.width + SCREEN_GAP); y = Math.max(y, c.y); rowH = Math.max(rowH, c.height); }
  sections[title] = { node: s, x, y, rowH };
  return s;
}
/** A screen frame (viewport) inside a section with the scene render as backdrop. o: label, backdrop (scenario id), dim */
async function screen(sectionTitle, name, w = 1440, h = 900, o = {}) {
  const S = sections[sectionTitle];
  const f = figma.createFrame(); f.name = name; f.resize(w, h); f.clipsContent = true;
  f.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.94, b: 0.95 } }];
  const hash = o.backdrop !== false ? backdropHash(o.backdrop || CONFIG?.backdrops?.default, w, h) : null;
  if (hash) {
    const bg = figma.createRectangle(); bg.name = 'Scene backdrop (render · not part of the UI library)'; bg.resize(w, h);
    bg.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }];
    if (o.dim) bg.opacity = o.dim;
    f.appendChild(bg); bg.constraints = { horizontal: 'SCALE', vertical: 'SCALE' }; bg.locked = true;
  }
  S.node.appendChild(f);
  if (S.x + w > 6400) { S.x = 120; S.y += S.rowH + SCREEN_GAP; S.rowH = 0; }
  f.x = S.x; f.y = S.y; S.x += w + SCREEN_GAP; S.rowH = Math.max(S.rowH, h);
  const label = await T(o.label || name, BOARD.group, BOARD.ink, { name: 'Screen label' });
  S.node.appendChild(label); label.x = f.x; label.y = f.y - 44; label.locked = true;
  return f;
}
/** Place a node in a screen like CSS absolute positioning (left/top/right/bottom/cx/cy). */
function at(frame, node, p) {
  frame.appendChild(node);
  const W = frame.width, H = frame.height;
  if (p.w) node.resize(p.w, node.height);
  let h = 'MIN', v = 'MIN';
  if (p.left != null) node.x = p.left;
  if (p.right != null) { node.x = W - p.right - node.width; h = 'MAX'; }
  if (p.left != null && p.right != null) { node.resize(W - p.left - p.right, node.height); node.x = p.left; h = 'STRETCH'; }
  if (p.cx) { node.x = Math.round((W - node.width) / 2); h = 'CENTER'; }
  if (p.top != null) node.y = p.top;
  if (p.bottom != null) { node.y = H - p.bottom - node.height; v = 'MAX'; }
  if (p.cy) { node.y = Math.round((H - node.height) / 2 + (p.dy || 0)); v = 'CENTER'; }
  node.constraints = { horizontal: h, vertical: v };
  return node;
}
function fitSections() {
  for (const { node } of Object.values(sections)) {
    let mx = 0, my = 0;
    for (const c of node.children) { mx = Math.max(mx, c.x + c.width); my = Math.max(my, c.y + c.height); }
    node.resizeWithoutConstraints(mx + 120, my + 120);
  }
}
// ---- end screen helpers
