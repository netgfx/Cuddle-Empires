// UI state fixtures for the code → Figma pipeline (code-to-figma skill, `npm run figma -- capture`).
//
// Every scenario puts the real app (real components, real CSS) into one UI state through the
// stores exposed on window.__risk plus a few Vite module imports, so captures never drift from
// the code. `setup` runs inside the page (it is serialised — no closures over this file), then
// optional Playwright `actions` run (clicks for popovers / confirm dialogs).
//
// Viewports live in figma.config.mjs (CSS breakpoints: width 1280 / 1100 / 560, height 720, pointer:coarse).

/** Before the app loads: no music / sfx, normal speed. */
export function initScript() {
  try { localStorage.setItem('risk3d-prefs', JSON.stringify({ state: { music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 1, showLabels: true }, version: 0 })); } catch { /* */ }
}

/** Custom Playwright actions used by scenarios. */
export const actions = {
  /** Clicks the first n cards of the hand fan (picks a set). */
  async clickCards(page, n) { const cards = page.locator('.hand-card'); for (let i = 0; i < n; i++) await cards.nth(i).click({ force: true }); },
};

/** Runs once per page load before a scenario: helpers on window.__fx. */
export async function prelude() {
  const R = window.__risk;
  const { useLocal } = await import('/src/ui/localStore.ts');
  const { useSaves } = await import('/src/state/saves.ts');
  const map = await import('/src/game/mapData.ts');
  const PLAYERS = [
    { id: 'p1', name: 'Lena', color: '#E63946', kind: 'human' },
    { id: 'p2', name: 'Max', color: '#3A86FF', kind: 'bot' },
    { id: 'p3', name: 'Biscuit', color: '#6CC24A', kind: 'bot' },
  ];
  const fx = {
    R, useLocal, useSaves, map, PLAYERS,
    /** A fresh auto-dealt game state (deterministic seed). */
    fresh(players = PLAYERS, settings = { setup: 'auto' }, seed = 7) {
      R.game.getState().startLocal(players, settings, seed);
      return structuredClone(R.game.getState().game);
    },
    /** Shows `st` and freezes the game: bots and dispatches no longer change anything. */
    apply(st) {
      R.game.getState().attachTransport(new R.LocalTransport(st), st);
      R.game.setState({ dispatch: () => {} });
    },
    owned(st, pid) { return Object.keys(st.territories).filter((t) => st.territories[t].owner === pid); },
    /** An attack pair: own territory (armies set to `a`) with an enemy neighbour (armies `d`). */
    attackPair(st, pid, a = 7, d = 3) {
      for (const t of fx.owned(st, pid)) {
        const n = map.ADJACENT[t].find((x) => st.territories[x].owner !== pid);
        if (n) { st.territories[t].armies = a; st.territories[n].armies = d; return [t, n]; }
      }
      throw new Error('no attack pair');
    },
    fortifyPair(st, pid, a = 9) {
      for (const t of fx.owned(st, pid)) {
        const n = map.ADJACENT[t].find((x) => st.territories[x].owner === pid);
        if (n) { st.territories[t].armies = a; return [t, n]; }
      }
      throw new Error('no fortify pair');
    },
    /** Moves `n` cards from the deck into a player's hand; first three form a valid set when `set`. */
    deal(st, pid, n, set = true) {
      const p = st.players.find((x) => x.id === pid);
      const pick = [];
      if (set) for (const unit of ['infantry', 'cavalry', 'artillery']) pick.push(st.deck.find((c) => st.cards[c].unit === unit && !pick.includes(c)));
      const wild = st.deck.find((c) => st.cards[c].unit === 'wild');
      if (wild && pick.length < n) pick.push(wild);
      for (const c of st.deck) { if (pick.length >= n) break; if (!pick.includes(c)) pick.push(c); }
      st.deck = st.deck.filter((c) => !pick.includes(c));
      p.cards = pick.slice(0, n);
      return p.cards;
    },
    ui(p) { R.ui.setState(p); },
    panels(p) { R.ui.setState({ panels: { scoreboard: true, cards: false, log: false, help: false, settings: false, territory: false, saves: false, ...p } }); },
    local(p) { useLocal.getState().set(p); },
    css(text) { const s = document.createElement('style'); s.dataset.fx = '1'; s.textContent = text; document.head.appendChild(s); },
    async makeSaves(labels) {
      for (const k of Object.keys(localStorage)) if (k.startsWith('risk3d-save')) localStorage.removeItem(k);
      const st = fx.fresh();
      for (const [i, label] of labels.entries()) {
        const s = structuredClone(st);
        s.turn = 3 + i * 4;
        s.phase = ['attack', 'reinforce', 'fortify'][i % 3];
        s.current = i % 3;
        if (i === 2) s.players[2].eliminated = true;
        fx.apply(s);
        await useSaves.getState().save(label);
      }
      R.game.getState().leave();
      useSaves.getState().refresh();
    },
  };
  window.__fx = fx;
  // quiet + deterministic: no music, normal speed
  R.ui.setState({ music: 'off', musicVolume: 0, sfxVolume: 0, animSpeed: 1, showLabels: true });
}

/** CSS that removes motion so a capture shows each element's resting state. */
export const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
.confetti-layer{display:none!important}`;

// Common in-game base: Lena (human) to move, scoreboard open, banner/curtain cleared.
const game = (body) => `
  const fx = window.__fx; const st = fx.fresh(); const me = 'p1';
  st.current = 0; st.turn = 4; st.phase = 'reinforce'; st.reinforcements = 0; st.mustTrade = false; st.pendingOccupy = null;
  ${body}
  fx.apply(st);
  await new Promise((r) => setTimeout(r, 1800));
  fx.local({ banner: null, curtain: null, lastHuman: 'p1' });
`;

export const SCENARIOS = [
  // ---------------------------------------------------------------- backdrops (capture.mjs --backdrop --only=board-game,board-idle)
  { id: 'board-game', title: '3D scene · in game', viewports: ['desktop', 'laptop', 'tablet', 'short', 'mobile'], setup: game(``) },
  { id: 'board-idle', title: '3D scene · idle (setup)', viewports: ['desktop', 'laptop', 'tablet', 'short', 'mobile'], setup: `window.__fx.R.game.getState().leave();` },
  // ---------------------------------------------------------------- setup
  { id: 'setup', title: 'Setup · local (3 players)', viewports: ['desktop', 'tablet', 'mobile'],
    setup: `window.__fx.R.game.getState().leave();` },
  { id: 'setup-swatch', title: 'Setup · colour picker open', viewports: ['desktop'],
    setup: `window.__fx.R.game.getState().leave();`, actions: [['click', '[data-testid="setup-player-2-color"]']] },
  { id: 'setup-2p', title: 'Setup · 2 players (neutral hint)', viewports: ['desktop'],
    setup: `window.__fx.R.game.getState().leave();`, actions: [['click', '[data-testid="setup-player-3-remove"]']] },
  { id: 'setup-6p-load', title: 'Setup · 6 players + Load game', viewports: ['desktop'],
    setup: `await window.__fx.makeSaves(['Sunday showdown', 'Autosave']);`,
    actions: [['click', '[data-testid="setup-add-player"]'], ['click', '[data-testid="setup-add-player"]'], ['click', '[data-testid="setup-add-player"]'], ['fill', '[data-testid="setup-player-1-name"]', 'Lena'], ['focus', '[data-testid="setup-player-1-name"]']] },

  // ---------------------------------------------------------------- HUD per phase
  { id: 'claim', title: 'HUD · setup claim', viewports: ['desktop'],
    setup: `const fx = window.__fx; const st = fx.fresh(fx.PLAYERS, { setup: 'manual' }); fx.apply(st); await new Promise((r) => setTimeout(r, 1500)); fx.local({ banner: null, curtain: null });` },
  { id: 'reinforce', title: 'HUD · reinforce + trade hint', viewports: ['desktop', 'laptop', 'tablet', 'short'],
    setup: game(`st.reinforcements = 7; fx.deal(st, me, 3); fx.ui({ placeCount: 3 });`) },
  { id: 'reinforce-hand', title: 'Card hand open (suggested set)', viewports: ['desktop', 'short'],
    setup: game(`st.reinforcements = 7; fx.deal(st, me, 4); fx.panels({ cards: true });`) },
  { id: 'hand-picked', title: 'Card hand · 3 picked, trade enabled', viewports: ['desktop'],
    setup: game(`st.reinforcements = 5; fx.deal(st, me, 5); fx.panels({ cards: true });`),
    actions: [['clickCards', 3]] },
  { id: 'hand-empty', title: 'Card hand · empty', viewports: ['desktop'],
    setup: game(`st.phase = 'attack'; fx.panels({ cards: true });`) },
  { id: 'must-trade', title: 'Must trade modal', viewports: ['desktop', 'tablet'],
    setup: game(`st.reinforcements = 3; st.mustTrade = true; fx.deal(st, me, 5);`) },
  { id: 'attack-select', title: 'Attack · source selected + territory/log panels', viewports: ['desktop'],
    setup: game(`st.phase = 'attack'; const [a] = fx.attackPair(st, me); fx.panels({ territory: true, log: true }); fx.ui({ selected: a, target: null });
      st.log = [{ turn: 3, player: 'p2', text: 'Max placed 6 armies on Siam' }, { turn: 3, player: 'p2', text: 'Max traded a set for 6 armies' }, { turn: 3, player: 'p3', text: 'Biscuit fortified Ural' }, { turn: 4, player: 'p1', text: 'Lena attacked Peru from Brazil' }, { turn: 4, player: 'p1', text: 'Lena conquered Peru' }]; // oldest first (the panel shows newest first)`) },
  { id: 'attack-panel', title: 'Attack panel (3 dice)', viewports: ['desktop', 'tablet'],
    setup: game(`st.phase = 'attack'; const [a, d] = fx.attackPair(st, me); fx.ui({ selected: a, target: d, attackDice: 3 });`) },
  { id: 'attack-panel-2', title: 'Attack panel (2 dice, risky)', viewports: ['desktop'],
    setup: game(`st.phase = 'attack'; const [a, d] = fx.attackPair(st, me, 3, 6); fx.ui({ selected: a, target: d, attackDice: 2 });`) },
  { id: 'occupy', title: 'Occupy dialog', viewports: ['desktop'],
    setup: game(`st.phase = 'occupy'; const [a, d] = fx.attackPair(st, me, 8, 0); st.territories[d].owner = me; st.pendingOccupy = { from: a, to: d, min: 3, max: 7 }; fx.ui({ selected: a, target: d });`) },
  { id: 'fortify', title: 'Fortify dialog', viewports: ['desktop'],
    setup: game(`st.phase = 'fortify'; const [a, b] = fx.fortifyPair(st, me); fx.ui({ selected: a, target: b });`) },
  { id: 'fortify-idle', title: 'HUD · fortify (End turn)', viewports: ['desktop'],
    setup: game(`st.phase = 'fortify';`) },
  { id: 'bot-turn', title: 'HUD · bot is thinking', viewports: ['desktop'],
    setup: game(`st.current = 1; st.phase = 'attack';`) },

  // ---------------------------------------------------------------- transient overlays
  // animejs drives the banner with an inline transform and parks it off-screen (x: 120vw) when its
  // timeline ends, so the capture pins the resting state explicitly.
  { id: 'banner', title: 'Turn banner', viewports: ['desktop'], css: '.turn-banner{transform:none!important;translate:none!important;rotate:none!important}',
    setup: game(``) + `fx.local({ banner: { key: 999, player: 'p1', turn: 4, reinforcements: { territories: 4, continents: [{ continent: 'Australia', bonus: 2 }, { continent: 'SouthAmerica', bonus: 2 }], total: 8 } } });
      // the director's greet timer clears banners after 1.4s — keep this one for the capture
      const orig = fx.useLocal.getState().set; fx.useLocal.setState({ set: (p) => { if ('banner' in p && !p.banner) return; orig(p); } });
      await new Promise((r) => setTimeout(r, 300)); const el = document.querySelector('.turn-banner'); if (el) el.style.setProperty('transform', 'none', 'important');` },
  { id: 'curtain', title: 'Hotseat hand-off curtain', viewports: ['desktop'],
    setup: game(``) + `fx.local({ curtain: { player: 'p1', resolve() {} } });` },
  { id: 'popups', title: 'Popups + error toast', viewports: ['desktop'],
    setup: game(``) + `fx.useLocal.getState().popup('💥 Max was knocked out by Lena! (+3 cards)', '#3A86FF', 600000); fx.useLocal.getState().popup('💾 Game saved!', '#3cb88f', 600000); fx.R.game.setState({ lastError: 'You can only attack a neighbouring territory' });` },
  { id: 'gameover', title: 'Game over', viewports: ['desktop', 'tablet'],
    setup: game(`st.phase = 'gameOver'; st.winner = 'p1'; st.turn = 23;`) + `
      const b = (attacker, defender, al, dl) => ({ type: 'battle', roll: { attacker, defender, attackerLosses: al, defenderLosses: dl } });
      fx.R.game.setState({ history: [b('p1','p2',1,2), b('p1','p2',0,2), b('p2','p1',2,0), b('p1','p3',1,1), b('p3','p1',1,1), { type: 'conquered', player: 'p1' }, { type: 'conquered', player: 'p1' }, { type: 'conquered', player: 'p2' }, { type: 'cardsTraded', player: 'p1' }, { type: 'eliminated', by: 'p1' }, { type: 'eliminated', by: 'p1' }] });
      fx.local({ showGameOver: true });` },

  // ---------------------------------------------------------------- panels
  { id: 'territory-empty', title: 'Territory panel · nothing selected', viewports: ['desktop'],
    setup: game(`fx.panels({ territory: true });`) },
  { id: 'settings', title: 'Settings panel (+ leave confirm)', viewports: ['desktop'],
    setup: game(`fx.panels({ settings: true });`) },
  { id: 'settings-leave', title: 'Settings · leave confirm', viewports: ['desktop'],
    setup: game(`fx.panels({ settings: true });`), actions: [['click', '[data-testid="leave-game"]']] },
  { id: 'help', title: 'How to play', viewports: ['desktop', 'tablet'],
    setup: game(`fx.panels({ help: true });`) },
  { id: 'saves-list', title: 'Saved games · list', viewports: ['desktop', 'mobile'],
    setup: `await window.__fx.makeSaves(['Sunday showdown', 'Pandas rising', 'Autosave']);` + game(`fx.panels({ saves: true });`) },
  { id: 'saves-empty', title: 'Saved games · empty', viewports: ['desktop'],
    setup: `for (const k of Object.keys(localStorage)) if (k.startsWith('risk3d-save')) localStorage.removeItem(k); window.__fx.useSaves.getState().refresh();` + game(`fx.panels({ saves: true });`) },
  { id: 'saves-confirm', title: 'Saved games · load confirm', viewports: ['desktop'],
    setup: `await window.__fx.makeSaves(['Sunday showdown', 'Pandas rising']);` + game(`fx.panels({ saves: true });`),
    actions: [['click', '[data-testid="save-load"]']] },
  { id: 'saves-delete', title: 'Saved games · delete confirm + saved', viewports: ['desktop'],
    setup: `await window.__fx.makeSaves(['Sunday showdown', 'Pandas rising']);` + game(`fx.panels({ saves: true });`),
    actions: [['fill', '[data-testid="save-label"]', 'Before the big push'], ['click', '[data-testid="save-game"]'], ['wait', 300], ['click', '[data-testid="save-delete"] >> nth=1']] },
];
