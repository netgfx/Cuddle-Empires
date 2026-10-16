// code-to-figma project config (see references/authoring.md). Paths are relative to this file.
export default {
  name: 'My App',
  url: 'http://localhost:5173/',              // the running dev server
  ready: '!!document.querySelector("#root > *")', // page expression that is true once the app has mounted
  out: 'figma',                               // generated artifacts (gitignore it, except tokens.json)
  scenarios: 'scripts/figma/scenarios.mjs',   // UI states to render
  tokens: { extract: 'scripts/figma/extract-tokens.mjs', file: 'figma/tokens.json' },
  scripts: 'scripts/figma/plugin',            // project build scripts NN-*.js (engine adds 00-foundations, 99-verify)
  ui: { roots: ['#root'] },                   // DOM roots to measure; hidden for --backdrop renders
  viewports: {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 1024, height: 768 },
    mobile: { width: 390, height: 844 },
  },
  backdrops: { scenarios: [], default: null }, // canvas / scene renders behind the UI, e.g. ['scene'] + default 'scene'
  assets: {},                                 // { 'logo': 'public/logo.png' } → asset('logo') / imageRect('logo', w, h)
  figma: {
    pages: { library: '📐 Library', screens: '🖥 Screens', reference: '🔎 Reference' }, // Starter plans allow 3 pages
    modes: false,                             // true on Professional+ (palettes as variable modes)
    font: 'Inter', fontStyles: ['Regular', 'Medium', 'Semi Bold', 'Bold'],
    board: { title: 'Display/Title', subtitle: 'Body/Default', group: 'Heading/Section', note: 'Caption/Default', fill: 'surface/solid', accent: 'text/accent', ink: 'text/primary', muted: 'text/secondary' },
  },
  runner: { port: 4171, out: 'figma/runner-plugin', pluginName: 'My App · Code → Figma runner' },
  playwright: { channel: 'chrome', args: [] },
  validate: { threshold: 0.12, budget: { mad: 0.05, diff: 0.1 }, pairs: { /* 'Figma screen name': 'scenario@viewport' */ } },
};
