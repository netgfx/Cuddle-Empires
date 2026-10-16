// Local server for the runner plugin: results, snapshots and the watch-mode job queue.
//   POST /hello            plugin capabilities (canEval) → runner-out/plugin.json
//   POST /result           script result / error        → runner-out/results.jsonl + last/<script>.json
//   POST /snap?script&node PNG                           → runner-out/snaps/<script>/<node>.png
//   GET  /queue/next       oldest queued job {id,name,code} (204 when empty) — moved to queue/running
//   POST /queue/done       {id} → job removed from queue/running
// Jobs are files in <out>/queue/*.json written by `cli.mjs queue`.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const safe = (s) => String(s || 'unnamed').replace(/[^\w.@ -]+/g, '_').slice(0, 80);

export function serve(cfg) {
  const out = cfg.paths.runnerOut, q = cfg.paths.queue, running = path.join(q, 'running');
  for (const d of [path.join(out, 'last'), running]) fs.mkdirSync(d, { recursive: true });
  // jobs left "running" by a closed plugin go back to the queue
  for (const f of fs.readdirSync(running)) fs.renameSync(path.join(running, f), path.join(q, f));
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    const url = new URL(req.url, `http://localhost:${cfg.port}`);
    if (url.pathname === '/ping') return res.end('ok');
    if (url.pathname === '/queue/next' && req.method === 'GET') {
      const jobs = fs.readdirSync(q).filter((f) => f.endsWith('.json')).sort();
      if (!jobs.length) { res.statusCode = 204; return res.end(); }
      const f = jobs[0];
      fs.renameSync(path.join(q, f), path.join(running, f));
      const job = JSON.parse(fs.readFileSync(path.join(running, f), 'utf8'));
      console.log(`▶ ${job.name} (queued job ${job.id})`);
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(job));
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (url.pathname === '/hello') {
        const m = JSON.parse(body.toString('utf8'));
        fs.writeFileSync(path.join(out, 'plugin.json'), JSON.stringify({ at: new Date().toISOString(), ...m }, null, 1));
        console.log(`plugin connected — “${m.file}”, watch mode ${m.canEval ? 'AVAILABLE' : 'unavailable (bundle mode only)'}`);
      } else if (url.pathname === '/result') {
        const m = JSON.parse(body.toString('utf8'));
        fs.appendFileSync(path.join(out, 'results.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...m }) + '\n');
        fs.writeFileSync(path.join(out, 'last', `${safe(m.name)}.json`), JSON.stringify(m, null, 1));
        console.log(`${m.type === 'done' ? '✓' : '✗'} ${m.name}${m.error ? ` — ${m.error.split('\n')[0]}` : ''}`);
      } else if (url.pathname === '/snap') {
        const dir = path.join(out, 'snaps', safe(url.searchParams.get('script')));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${safe(url.searchParams.get('node'))}.png`), body);
      } else if (url.pathname === '/queue/done') {
        const { id } = JSON.parse(body.toString('utf8'));
        for (const f of fs.readdirSync(running)) if (f.includes(id)) fs.rmSync(path.join(running, f));
      }
      res.end('ok');
    });
  }).listen(cfg.port, () => console.log(`code-to-figma server on http://localhost:${cfg.port} (out: ${out})`));
}

/** Queue emitted scripts for watch mode. */
export function enqueue(cfg, items) {
  fs.mkdirSync(cfg.paths.queue, { recursive: true });
  return items.map(({ name, code }, i) => {
    const id = `${Date.now()}-${String(i).padStart(3, '0')}`;
    fs.writeFileSync(path.join(cfg.paths.queue, `${id}-${safe(name)}.json`), JSON.stringify({ id, name, code }));
    return id;
  });
}
