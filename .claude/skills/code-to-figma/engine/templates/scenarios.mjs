// UI states rendered by `cli.mjs capture`. Each scenario puts the REAL app into one state.
// `setup` is a string run inside the page (async allowed; no closures over this file), then `actions` run
// through Playwright: ['click'|'fill'|'focus'|'wait'|'eval', selector|ms|expr, value] or a custom action below.

/** Optional: runs before the app loads (e.g. silence audio, fix the date, seed localStorage). */
export function initScript() {
  try { localStorage.setItem('demo', '1'); } catch { /* storage blocked */ }
}

/** Optional: runs once per page after load — put helpers on window for the setup strings. */
export async function prelude() {
  // Reach app state through the dev server's modules, e.g.:
  // const { useStore } = await import('/src/state/store.ts'); window.__fx = { useStore };
}

/** CSS appended before every screenshot so each element shows its resting state. */
export const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

/** Optional custom actions: [name, arg, value] in a scenario → actions[name](page, arg, value). */
export const actions = {
  // async openMenu(page) { await page.click('[data-testid=menu]'); },
};

export const SCENARIOS = [
  { id: 'home', title: 'Home', viewports: ['desktop', 'tablet', 'mobile'], setup: '' },
  // { id: 'dialog', title: 'Confirm dialog', viewports: ['desktop'], setup: '', actions: [['click', '[data-testid=delete]']] },
  // backdrop scenario (rendered with --backdrop, UI roots hidden):
  // { id: 'scene', title: 'Canvas only', viewports: ['desktop', 'tablet', 'mobile'], setup: '' },
];
