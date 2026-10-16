// Runner plugin main thread (template — bundle.mjs fills in the SCRIPTS and PAGES placeholders below).
const SCRIPTS = [
/*SCRIPTS*/
];
const PAGE_NAMES = /*PAGES*/null; // pages a failed script is cleaned up on
let current = null;
let canEval = false;
try { canEval = new Function('return 41 + 1')() === 42; } catch (e) { canEval = false; }

const __runnerApi = {
  async snap(node, scale = 0.5) {
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    figma.ui.postMessage({ type: 'snap', script: current, node: node.name, bytes });
  },
  log(...a) { figma.ui.postMessage({ type: 'log', script: current, text: a.map(String).join(' ') }); },
};
async function topLevel() {
  const out = {};
  for (const p of figma.root.children) if ((PAGE_NAMES || []).includes(p.name)) { await p.loadAsync(); out[p.id] = new Set(p.children.map((n) => n.id)); }
  return out;
}
async function rollback(before) {
  let removed = 0;
  for (const [id, ids] of Object.entries(before)) { const p = await figma.getNodeByIdAsync(id); if (!p) continue; for (const n of [...p.children]) if (!ids.has(n.id)) { n.remove(); removed++; } }
  return removed;
}
async function execute(name, fn) {
  current = name;
  figma.ui.postMessage({ type: 'start', name });
  const before = await topLevel();
  const t0 = Date.now();
  try {
    const result = await fn(__runnerApi);
    figma.ui.postMessage({ type: 'done', name, ms: Date.now() - t0, result: JSON.parse(JSON.stringify(result ?? null)) });
    return true;
  } catch (e) {
    const removed = await rollback(before); // use_figma rolls back atomically; a plugin has to do it itself
    figma.ui.postMessage({ type: 'error', name, error: `${(e && e.message) || e}\n${(e && e.stack) || ''}`, removed });
    return false;
  }
}

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });
figma.ui.postMessage({ type: 'hello', scripts: SCRIPTS.map((s) => s.name), file: figma.root.name, canEval });
figma.ui.onmessage = async (m) => {
  if (m.type === 'close') return figma.closePlugin();
  if (m.type === 'run') {
    for (const name of m.names) { const s = SCRIPTS.find((x) => x.name === name); if (s && !(await execute(name, s.run))) break; }
    figma.ui.postMessage({ type: 'idle' });
  }
  if (m.type === 'runCode' && canEval) { // watch mode: a script queued on the local server
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    let fn;
    try { fn = new AsyncFunction('__runner', m.code); } catch (e) { figma.ui.postMessage({ type: 'error', name: m.name, error: `compile: ${e.message}`, removed: 0 }); figma.ui.postMessage({ type: 'idle', job: m.job }); return; }
    await execute(m.name, fn);
    figma.ui.postMessage({ type: 'idle', job: m.job });
  }
};
