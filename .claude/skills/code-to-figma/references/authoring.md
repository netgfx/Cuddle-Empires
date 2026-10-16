# Authoring a project adapter

## figma.config.mjs

| Key | Meaning |
|---|---|
| `url`, `ready` | dev-server URL; page expression that is truthy once the app has mounted |
| `out` | artifacts dir (`ref/ dom/ backdrops/ plugin-out/ runner-out/ queue/ validation/`) |
| `scenarios`, `tokens.extract`, `tokens.file`, `scripts` | project files (paths relative to the config) |
| `ui.roots` | CSS selectors of the DOM UI (measured by capture; hidden for `--backdrop`) |
| `viewports` | `{ name: { width, height } }` — one per CSS breakpoint you care about |
| `backdrops` | `{ scenarios: [ids rendered with --backdrop], default: id }` — the canvas / scene behind screens |
| `assets` | `{ name: 'path/to.png' }` → embedded in runner builds → `asset(name)` / `imageRect(name, w, h)` |
| `figma.pages` | role → page name (`library`, `screens`, `reference`…) |
| `figma.font`, `fontStyles` | product font (verify fails on any other family). Check exact style names in Figma (`SemiBold` vs `Semi Bold`) |
| `figma.board` | text / colour styles used for board + group titles (`title subtitle group note fill accent ink muted`) |
| `figma.modes` | `false` on Starter (1 mode / collection) — palettes become `prefix/<Member>/<role>` groups |
| `runner` | `port`, `out` (plugin folder), `pluginId`, `pluginName` |
| `playwright` | `channel`, launch `args` (e.g. GPU flags for WebGL apps) |
| `validate` | `threshold`, `budget { mad, diff }`, `pairs { 'Figma screen': 'scenario@viewport' }` |

## Scenarios (`scenarios.mjs`)

Exports `SCENARIOS` (required) and optionally `initScript` (before load), `prelude` (after load, put helpers on
`window`), `FREEZE_CSS` (kill animations), `actions` (custom Playwright actions).

```js
{ id: 'checkout-error', title: 'Checkout · card declined', viewports: ['desktop', 'mobile'],
  setup: `window.__fx.store.setState({ step: 'pay', error: 'Card declined' });`,   // string, runs in the page
  actions: [['click', '[data-testid=pay]'], ['wait', 300]],
  css: '.toast{transform:none!important}' }                                          // pin a transient state
```
Drive state through the app's stores (expose them in dev, or `await import('/src/…')` in `prelude` — Vite serves
the same module instance). Freeze or pin anything driven by timers / animation (see gotchas).

## Tokens (`tokens.json` schema read by `00-foundations`)

```js
{
  font: { family, styles: [...], cssVar },
  primitives: { 'pink/500': { hex, a } },                 // hidden variables (Primitives)
  semantic: { 'text/primary': 'base/ink' },               // aliases (Color); scope from prefix text/ surface/ border/ accent/
  codeSyntax: { 'text/primary': '--ink' },                // WEB code syntax → var(--ink)
  palettes: { Team: { prefix: 'team', cssVar: { base: '--pc' }, groups: { Azure: { base: {hex,a}, 'tint-18': {hex,a}, name: 'Azure' } } } },
  extraColors: { 'scene/attack': { hex, a } },            // literal colours that also get a semantic alias
  radius: { 'radius/md': 12 }, space: { 'space/8': 8 },
  layout: { modes: ['desktop', 'tablet'], values: { 'icon-btn': [42, 36] } },   // → layout/<mode>/<key>
  typeStyles: { 'Body/Default 15': { style, size, textCase?, letterSpacingEm?, lineHeight? } },
  effects: { 'Shadow/Card': [{ x, y, blur, spread, color, inner? }], 'Elevation/Glass': [ …shadows, { backgroundBlur: 14 } ], 'Blur/X': 'blur4' },
  gradients: { 'Gradient/Primary': ['button/top', 'button/bottom'] }, gradientAngles: { 'Gradient/Primary': 180 },
}
```
Pre-compute everything Figma cannot evaluate: `color-mix()`, `calc()`, `currentColor`, theme-dependent values.
Check every named literal still exists in the source and print drift.

## Build scripts

Files `scripts/figma/plugin/NN-name.js` (engine adds `00-foundations`, `99-verify`). Placeholders:
`/*LIB*/` (always first), `/*SCREENS*/` (screen scripts), `/*INCLUDE:_file.js*/` (project helpers),
`/*TOKENS*/null`, `/*CONFIG*/null`, `/*DOM:scenario@vp*/null`. Never write placeholder text inside comments.

### `_lib.js` API

| Helper | |
|---|---|
| `page(role)`, `components({ key: 'Name' })` | lookups by name (never by node id) |
| `board(title, sub)`, `group(board, title, note)` | library layout (throws if the board exists) |
| `AL(dir, o)`, `CMP(dir, o)` | auto-layout frame / component — `o: name gap pad main cross fill r w h wrap clip description` |
| `T(text, style, colorVar, o)`, `E(emoji, size)` | text bound to a text style + colour variable; emoji glyph |
| `fill`, `stroke`, `fx`, `paintStyle`, `radius`, `pad`, `grow`, `add` | token-bound properties (spacing / radius snap to `space/*`, `radius/*`) |
| `variantSet(comps, name, parent, o)` | combine variants into a wrapping, laid-out set |
| `textProp`, `boolProp` | component properties (bind only text that really varies) |
| `swapVars(node, from, to, prefix)` / `retint` | rebind palette groups (fills, strokes, gradients, effects, STRING text) |
| `gradient(kind, stops, t)`, `radialCircle(w, h, cx, cy)`, `stripes(a, b, period, len)`, `boundShadow` | paints / effects bound to variables |
| `asset(name)`, `imageRect(name, w, h)`, `svg(w, h, body)`, `dot` | images (embedded), vectors |
| `snap(node, scale)` | PNG to the runner server (`runner-out/snaps/<script>/<node>.png`) |

### `_screens.js` API (after `/*LIB*/`)

`COMP` (all library components by name), `use(name, variant, props)`, `setNested(inst, props)`, `setOf(inst)`,
`instancesOf(root, setName)`, `section(title, y)`, `adoptSection(title)`, `screen(section, name, w, h, { backdrop, label })`,
`at(frame, node, { left right top bottom cx cy w })` (CSS-like + constraints), `rebindLayout(node, toMode)`, `fitSections()`.

### Conventions

- One board per UI group; a component (set) per CSS class / React component; variants `Prop=Value`; split sets past ~30.
- Variant previews show resting states; motion goes into the component description.
- Every fill / stroke / radius / spacing bound to a variable; text uses text styles; shadows use effect styles.
- Containers that wrap arbitrary content use **slots** (`component.createSlot()`), filled in instances.
- Screens are only instances + positioning; names match `validate.pairs`; data = scenario fixtures.

## Patching

Live files are changed **in place** by patch scripts (`NN-fixes.js` or an ad-hoc file you `queue`):

```js
/*LIB*/
/*SCREENS*/
const set = COMP['Icon button'];
for (const v of set.children.filter((c) => c.name.includes('State=On'))) stroke(v, 'accent/pink', 3, 'OUTSIDE');
// guard anything that is not naturally idempotent:
if (!COMP['Saves panel'].children.some((c) => c.name === 'State=Empty (setup)')) { /* clone + rename once */ }
return { done: true };
```
Then make the same change in the generator so a fresh build matches.
