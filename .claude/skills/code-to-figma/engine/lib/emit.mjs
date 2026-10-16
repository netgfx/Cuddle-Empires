// Template → runnable Plugin API script. Placeholders:
//   /*LIB*/            engine/plugin/_lib.js        (token-bound helpers, page + component lookup, assets)
//   /*SCREENS*/        engine/plugin/_screens.js    (screen composition helpers)
//   /*INCLUDE:file*/   a file from the project's scripts dir (project-specific helpers)
//   /*CONFIG*/null     the `figma` section of figma.config.mjs (+ viewports, backdrops)
//   /*TOKENS*/null     tokens.json (without raw cssVars)
//   /*ASSETS*/null     { name: base64 } from config.assets       (runner builds only)
//   /*IMAGES*/null     { "<scenario>@<viewport>": base64 jpeg }  (runner builds only)
//   /*DOM:key*/null    compact DOM dump of a capture
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, scriptIndex } from './config.mjs';

export function emitCode(cfg, name, { embed = true } = {}) {
  const idx = scriptIndex(cfg);
  const entry = idx[name] ?? (fs.existsSync(name) ? { file: path.resolve(name), origin: 'adhoc' } : null);
  if (!entry) throw new Error(`no build script "${name}" (known: ${Object.keys(idx).join(', ')})`);
  let code = fs.readFileSync(entry.file, 'utf8');
  const read = (f) => fs.readFileSync(f, 'utf8');
  code = code.replace('/*LIB*/', () => read(path.join(ENGINE, 'plugin/_lib.js')));
  code = code.replace('/*SCREENS*/', () => read(path.join(ENGINE, 'plugin/_screens.js')));
  code = code.replace(/\/\*INCLUDE:([\w./-]+)\*\//g, (_, f) => read(path.join(cfg.paths.scripts, f)));
  const config = { pages: cfg.figma?.pages ?? {}, modes: !!cfg.figma?.modes, font: cfg.figma?.font, fontStyles: cfg.figma?.fontStyles, board: cfg.figma?.board, viewports: cfg.viewports ?? {}, backdrops: cfg.backdrops ?? {} };
  code = code.replaceAll('/*CONFIG*/null', () => JSON.stringify(config));
  code = code.replaceAll('/*TOKENS*/null', () => {
    if (!fs.existsSync(cfg.paths.tokens)) return 'null';
    const t = JSON.parse(read(cfg.paths.tokens)); delete t.cssVars; delete t.generatedFrom; return JSON.stringify(t);
  });
  code = code.replaceAll('/*ASSETS*/null', () => (embed
    ? JSON.stringify(Object.fromEntries(Object.entries(cfg.assets ?? {}).map(([k, f]) => [k, fs.readFileSync(path.resolve(cfg.root, f)).toString('base64')])))
    : 'null'));
  code = code.replaceAll('/*IMAGES*/null', () => {
    if (!embed || !fs.existsSync(cfg.paths.backdrops)) return 'null';
    const files = fs.readdirSync(cfg.paths.backdrops).filter((f) => f.endsWith('.jpg'));
    return JSON.stringify(Object.fromEntries(files.map((f) => [f.replace(/\.jpg$/, ''), fs.readFileSync(path.join(cfg.paths.backdrops, f)).toString('base64')])));
  });
  code = code.replace(/\/\*DOM:([\w@-]+)\*\/null/g, (_, k) => JSON.stringify(JSON.parse(read(path.join(cfg.paths.dom, `${k}.json`))).elements));
  return code;
}

export function emitToFile(cfg, name, opts) {
  const code = emitCode(cfg, name, opts);
  fs.mkdirSync(cfg.paths.emitted, { recursive: true });
  const out = path.join(cfg.paths.emitted, `${path.basename(name).replace(/\.js$/, '')}.js`);
  fs.writeFileSync(out, code);
  return { code, out };
}
