# Gotchas (each one cost a failed run once)

## Figma plan / tooling
- **MCP quota**: Starter / View seats ≈ 20 MCP calls per month and `use_figma` writes count. This skill avoids the MCP.
- **Starter**: 3 pages per file; **1 mode per variable collection** (`addMode` → "Limited to 1 modes only") → palettes as
  `prefix/<Member>/<role>` groups + `swapVars`; responsive values as `layout/<breakpoint>/<key>` + `rebindLayout`.
- **Dev plugins only load in the Figma desktop app.** No remote trigger: a person opens the plugin.
- `generate_figma_design` captures are layout references only: raw frames, no components / variables, and they drop
  `color-mix()` and `repeating-linear-gradient()`. Use Playwright renders as ground truth instead.

## Plugin API
- `documentAccess: dynamic-page`: use `setTextStyleIdAsync` / `setEffectStyleIdAsync` / `setFillStyleIdAsync`,
  `getMainComponentAsync()` (the sync `.mainComponent` getter throws in a real plugin; the MCP tolerates it),
  `getNodeByIdAsync`, `page.loadAsync()`.
- No MCP-only helpers in shared code: `figma.createAutoLayout`, `node.screenshot`, `node.query` don't exist in plugins.
- `minWidth` / `layoutSizing* = 'FILL'` / `isExposedInstance` only after the node is appended to its parent / component.
- `layoutGrow` is 0 or 1 — proportional `flex-grow` → compute fixed widths.
- `resize()` pins both axes to FIXED; set sizing modes after it.
- A set-level TEXT property overrides every variant's text: bind only text that varies (fixed glyphs, placeholder copy stay unbound).
- Instances cannot get extra children — make the composition its own component (or use a slot).
- Variants requested by name must exist: generate full matrices (Kind × State) and fail loudly when a variant is missing.
- Glyphs with an emoji presentation (▶ ◀ ☀ ✔ …) render as emoji tiles in Figma → draw them as SVG bound to the colour.
- Drop-shadow **spread is ignored on frames that don't clip content** → rings as OUTSIDE strokes, or `clipsContent = true`
  when nothing overflows.
- Gradient transforms map node space → gradient space. CSS `linear-gradient(θ)` and `radial-gradient(circle at x y)`
  have exact conversions (`angleTransform`, `radialCircle`) — don't eyeball them.
- Board rebuild = deleted main components = orphaned instances. Patch in place instead.

## Build pipeline
- `String.replace(str, replacementString)` expands `$'` / `` $` `` / `$&` — scripts contain them in template literals.
  Always use a function replacer when inserting code.
- Never put placeholder text (`/*LIB*/`, `/*SCRIPTS*/`, …) inside comments — the first match is the one replaced,
  and a `*/` inside a `/** */` comment closes it early.
- Plugin rollback only removes new top-level nodes; in-place edits survive a failure → idempotent patches.

## Fidelity
- Timer- / animation-driven UI (banners, toasts, confetti) must be pinned in the scenario: override the inline transform
  with `!important` CSS and block the code that clears the state while capturing.
- Canvas / WebGL backdrops must be rendered **per viewport** (`capture --backdrop`); one desktop raster cropped into a
  tablet frame wrecks validation.
- Native controls (`<select>`, range, checkbox) are browser-rendered: match Chrome's look (e.g. `#3b3b3b` range track)
  and document it — no token exists for them.
- Screens must carry the scenario fixture data (names, numbers, ordering) or validation compares different content.
- CSS layout that depends on the viewport must be modelled per breakpoint: an element positioned `left: 50%` only gets
  `50vw − padding` of shrink-to-fit width (rows wrap on tablets); `max-height: calc(100vh − N)` modals clip and scroll;
  `flex-wrap` rows need `layoutWrap = 'WRAP'` on the component so a narrower instance wraps.
- Native `<input>`s are one line and clip: give input text `maxLines = 1` + `textTruncation = 'ENDING'` (Figma wraps by default).
- Rows of centred buttons (`justify-content: center`) must FILL their container, or they hug and sit left.
- Fixture data itself can be wrong (e.g. a log written newest-first that the panel reverses) — fix the fixture.
