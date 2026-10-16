// Loads the project's figma.config.mjs (searched upwards from the cwd, or --config=path) and resolves paths.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function args(argv = process.argv.slice(3)) {
  const pos = [], opt = {};
  for (const a of argv) {
    if (a.startsWith('--')) { const [k, ...v] = a.slice(2).split('='); opt[k] = v.length ? v.join('=') : true; } else pos.push(a);
  }
  return { pos, opt };
}

function find(start) {
  let dir = path.resolve(start);
  for (;;) {
    const f = path.join(dir, 'figma.config.mjs');
    if (fs.existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export async function loadConfig(opt = {}) {
  const file = opt.config ? path.resolve(opt.config) : find(process.cwd());
  if (!file) throw new Error('figma.config.mjs not found (run `cli.mjs init` in the web project, or pass --config=…)');
  const root = path.dirname(file);
  const c = (await import(pathToFileURL(file).href)).default;
  const r = (p) => path.resolve(root, p);
  const out = r(c.out || 'figma');
  const cfg = {
    ...c, file, root, out,
    paths: {
      out,
      ref: path.join(out, 'ref'), dom: path.join(out, 'dom'), backdrops: path.join(out, 'backdrops'),
      emitted: path.join(out, 'plugin-out'), runnerOut: path.join(out, 'runner-out'), queue: path.join(out, 'queue'),
      validation: path.join(out, 'validation'), tokens: r(c.tokens?.file || path.join(c.out || 'figma', 'tokens.json')),
      scripts: r(c.scripts || 'scripts/figma/plugin'), scenarios: r(c.scenarios || 'scripts/figma/scenarios.mjs'),
      plugin: r(c.runner?.out || path.join(c.out || 'figma', 'runner-plugin')),
    },
    port: +(process.env.FIGMA_RUNNER_PORT || c.runner?.port || 4171),
  };
  cfg.require = createRequire(path.join(root, 'package.json')); // playwright etc. come from the project
  return cfg;
}

/** Engine scripts (00-foundations, 99-verify) + project scripts, by NN-name. Project wins on a name clash. */
export function scriptIndex(cfg) {
  const idx = {};
  for (const [dir, origin] of [[path.join(ENGINE, 'plugin'), 'engine'], [cfg.paths.scripts, 'project']]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (/^\d\d-.*\.js$/.test(f)) idx[f.replace(/\.js$/, '')] = { file: path.join(dir, f), origin };
  }
  return idx;
}
