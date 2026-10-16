#!/usr/bin/env node
// code-to-figma CLI — run from the web project (anywhere below its figma.config.mjs).
//
//   init                         scaffold figma.config.mjs + scenario / token / board templates
//   tokens                       run the project's token extractor (config.tokens.extract)
//   capture [--only=a,b] [--vp=desktop] [--backdrop]   render UI states (ref/ dom/) or scene backdrops
//   emit <NN-name|all>           write runnable scripts to <out>/plugin-out (use_figma-sized, no embeds)
//   bundle [NN-name …]           build the runner plugin (<config.runner.out>) with those scripts
//   serve                        results / snapshots / watch-mode queue server (config.runner.port)
//   queue <NN-name|file.js …>    queue scripts for watch mode (runs as soon as the plugin polls)
//   status                       plugin capability, queue, last results
//   validate [--threshold=0.12]  pixel-compare Figma exports with the code renders
//   install-global               copy this skill to ~/.claude/skills/code-to-figma
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { args, ENGINE, loadConfig, scriptIndex } from './lib/config.mjs';

const cmd = process.argv[2];
const { pos, opt } = args();

async function main() {
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); return; }
  if (cmd === 'install-global') {
    const src = path.resolve(ENGINE, '..');
    const dst = path.join(os.homedir(), '.claude', 'skills', 'code-to-figma');
    if (path.resolve(src) === path.resolve(dst)) { console.log('already the global copy'); return; }
    fs.rmSync(dst, { recursive: true, force: true });
    fs.cpSync(src, dst, { recursive: true });
    console.log(`installed → ${dst}`);
    return;
  }
  if (cmd === 'init') {
    const target = path.resolve(opt.dir || process.cwd());
    for (const [from, to] of [['figma.config.mjs', 'figma.config.mjs'], ['scenarios.mjs', 'scripts/figma/scenarios.mjs'], ['extract-tokens.mjs', 'scripts/figma/extract-tokens.mjs'], ['10-board-example.js', 'scripts/figma/plugin/10-board-example.js'], ['50-screens-example.js', 'scripts/figma/plugin/50-screens-example.js']]) {
      const dst = path.join(target, to);
      if (fs.existsSync(dst)) { console.log(`exists  ${to}`); continue; }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(ENGINE, 'templates', from), dst);
      console.log(`created ${to}`);
    }
    console.log('\nNext: fill in figma.config.mjs, the token extractor and scenarios (references/authoring.md).');
    return;
  }
  const cfg = await loadConfig(opt);
  if (cmd === 'tokens') {
    const r = spawnSync(process.execPath, [path.resolve(cfg.root, cfg.tokens.extract), ...pos], { cwd: cfg.root, stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
  if (cmd === 'capture') { const { capture } = await import('./lib/capture.mjs'); return capture(cfg, opt); }
  if (cmd === 'emit') {
    const { emitToFile } = await import('./lib/emit.mjs');
    const names = pos[0] === 'all' || !pos.length ? Object.keys(scriptIndex(cfg)).sort() : pos;
    for (const n of names) { const { code, out } = emitToFile(cfg, n, { embed: false }); console.log(`${path.relative(cfg.root, out)}: ${code.length} chars${code.length > 50000 ? '  (over the use_figma limit — runner only)' : ''}`); }
    return;
  }
  if (cmd === 'bundle') { const { bundle } = await import('./lib/bundle.mjs'); bundle(cfg, pos); return; }
  if (cmd === 'serve') { const { serve } = await import('./lib/server.mjs'); serve(cfg); return; }
  if (cmd === 'queue') {
    const { emitCode } = await import('./lib/emit.mjs');
    const { enqueue } = await import('./lib/server.mjs');
    const items = pos.map((n) => ({ name: path.basename(n).replace(/\.js$/, ''), code: emitCode(cfg, n, { embed: true }) }));
    const ids = enqueue(cfg, items);
    const plugin = path.join(cfg.paths.runnerOut, 'plugin.json');
    const cap = fs.existsSync(plugin) ? JSON.parse(fs.readFileSync(plugin, 'utf8')) : null;
    console.log(`queued ${items.map((i) => i.name).join(', ')} (${ids.join(', ')})`);
    if (!cap) console.log('note: no plugin has connected yet — open the runner plugin in Figma (watch mode) to run the queue');
    else if (!cap.canEval) console.log('note: this Figma sandbox has no runtime eval → watch mode is off; use `bundle` + Run instead');
    return;
  }
  if (cmd === 'status') {
    const p = path.join(cfg.paths.runnerOut, 'plugin.json');
    console.log('plugin:', fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : 'never connected');
    const q = fs.existsSync(cfg.paths.queue) ? fs.readdirSync(cfg.paths.queue).filter((f) => f.endsWith('.json')) : [];
    console.log(`queue: ${q.length} waiting`);
    const last = path.join(cfg.paths.runnerOut, 'last');
    if (fs.existsSync(last)) for (const f of fs.readdirSync(last)) { const m = JSON.parse(fs.readFileSync(path.join(last, f), 'utf8')); console.log(`  ${m.type === 'done' ? '✓' : '✗'} ${m.name}${m.error ? ` — ${m.error.split('\n')[0]}` : ''}`); }
    return;
  }
  if (cmd === 'validate') { const { validate } = await import('./lib/validate.mjs'); await validate(cfg, opt); return; }
  throw new Error(`unknown command ${cmd} (help for the list)`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
export { pathToFileURL };
