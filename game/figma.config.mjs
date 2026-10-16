// code-to-figma config for Cuddle Empires (RISK · Cute Edition). Engine: .claude/skills/code-to-figma
// (global copy: ~/.claude/skills/code-to-figma). Run from game/: npm run figma -- <command>
export default {
  name: 'Cuddle Empires',
  url: 'http://localhost:4170/', // npx vite --port 4170 --strictPort (this worktree owns 4170–4179)
  ready: '!!window.__risk',
  out: 'figma',
  scenarios: 'scripts/figma/scenarios.mjs',
  tokens: { extract: 'scripts/figma/extract-tokens.mjs', file: 'figma/tokens.json' },
  scripts: 'scripts/figma/plugin',
  ui: { roots: ['.ui-root', '.fx-layer'] },
  viewports: {
    desktop: { width: 1440, height: 900 },
    laptop: { width: 1280, height: 800 }, // ≤1280 rules
    tablet: { width: 1024, height: 768 }, // ≤1100 rules
    short: { width: 1366, height: 680 }, // max-height 720 rules
    mobile: { width: 480, height: 860 }, // ≤560 rules (saves modal)
  },
  backdrops: { scenarios: ['board-game', 'board-idle'], default: 'board-game' },
  assets: {
    'unit/dog': 'public/assets/icons/dog.png',
    'unit/pony': 'public/assets/icons/pony.png',
    'unit/panda': 'public/assets/icons/panda.png',
  },
  figma: {
    fileKey: 'AYtycfAZKPf7OnlQ7lCtL6', // https://www.figma.com/design/AYtycfAZKPf7OnlQ7lCtL6
    pages: { library: '📐 Library', screens: '🖥 Screens', reference: '🔎 Reference captures' },
    modes: false, // Starter plan: 1 mode per collection
    font: 'Fredoka', fontStyles: ['Regular', 'Medium', 'SemiBold', 'Bold'],
  },
  runner: { port: 4171, out: 'scripts/figma/runner-plugin', pluginId: 'cuddle-empires-code-to-figma-runner', pluginName: 'Cuddle Empires · Code → Figma runner' },
  playwright: { channel: 'chrome', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  validate: {
    threshold: 0.12,
    budget: { mad: 0.05, diff: 0.1 },
    pairs: {
      'Setup · 3 players': 'setup@desktop', 'Setup · colour picker': 'setup-swatch@desktop', 'Setup · 2 players': 'setup-2p@desktop', 'Setup · 6 players + load': 'setup-6p-load@desktop',
      'Claim territories': 'claim@desktop', Reinforce: 'reinforce@desktop', 'Reinforce · cards open': 'reinforce-hand@desktop', 'Attack · pick a source': 'attack-select@desktop',
      'Attack · choose dice': 'attack-panel@desktop', 'Attack · risky': 'attack-panel-2@desktop', Occupy: 'occupy@desktop', Fortify: 'fortify@desktop', 'Fortify · end turn': 'fortify-idle@desktop',
      'Bot turn': 'bot-turn@desktop', 'Must trade': 'must-trade@desktop', Settings: 'settings@desktop', 'Settings · leave confirm': 'settings-leave@desktop', 'How to play': 'help@desktop',
      'Territory · nothing selected': 'territory-empty@desktop', 'Saved games · list': 'saves-list@desktop', 'Saved games · empty': 'saves-empty@desktop',
      'Saved games · load confirm': 'saves-confirm@desktop', 'Saved games · delete confirm': 'saves-delete@desktop', 'Turn banner': 'banner@desktop', 'Hot-seat curtain': 'curtain@desktop',
      'Popups + toast': 'popups@desktop', 'Game over': 'gameover@desktop', 'Laptop · reinforce': 'reinforce@laptop', 'Tablet · reinforce': 'reinforce@tablet', 'Tablet · attack dialog': 'attack-panel@tablet',
      'Tablet · must trade': 'must-trade@tablet', 'Tablet · how to play': 'help@tablet', 'Tablet · setup': 'setup@tablet', 'Tablet · game over': 'gameover@tablet', 'Short · cards open': 'reinforce-hand@short',
      'Mobile · saved games': 'saves-list@mobile', 'Mobile · setup': 'setup@mobile',
    },
  },
};
