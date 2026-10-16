# Runbook

`CLI` below = `node <skill>/engine/cli.mjs` run from the web project (or the project's `npm run figma --` alias).

## One-time setup (per project)

1. `CLI init` → fill in `figma.config.mjs` (URL, viewports, UI roots, pages, font, assets) — see `authoring.md`.
2. Write the token extractor (`scripts/figma/extract-tokens.mjs`) and the scenarios (`scripts/figma/scenarios.mjs`).
3. Create (or pick) the Figma **design** file by hand. The scripts create the pages named in `figma.pages`
   (Starter plans: 3 pages max — use 3 roles).
4. `CLI bundle` once → `<runner.out>/manifest.json`. In the **Figma desktop app** (dev plugins do not load in the
   browser): *Plugins → Development → Import plugin from manifest…* → that file. Re-bundling never needs a re-import
   (same folder + id); Figma reloads `code.js` each time the plugin opens.
5. gitignore `figma/` except `figma/tokens.json` (and any state ledger you keep).

## Every session

```bash
<dev server> &               # e.g. npx vite --port 4170 --strictPort  (config.url)
CLI serve &                  # port config.runner.port (4171)
```
Ask the user to open the runner plugin once. `CLI status` then shows whether **watch mode** works
(`canEval: true`). If yes: `CLI queue …` and results arrive without clicks. If not: `CLI bundle …` + "reopen the
plugin and click Run all bundled".

Connectivity check: `CLI queue <skill>/engine/plugin/probe.js` → `runner-out/last/probe.json` lists pages, boards,
variable / style counts.

## First migration

1. `CLI tokens` — fix drift until clean.
2. `CLI capture` — all scenarios × viewports (refs + DOM). `CLI capture --backdrop` if the UI sits on a canvas / scene.
3. Inventory the UI (components, states, overlays, in-canvas UI) and plan boards (one board per group: controls, data
   display, cards, panels, overlays, setup…) and screens (one section per flow + a responsive section).
4. Write board scripts in dependency order (atoms → molecules → panels → overlays). Each starts with `/*LIB*/`, calls
   `board()` / `group()`, builds `CMP` components + `variantSet`s bound to tokens, ends with `await snap(B, 0.4)`.
5. Run `00-foundations` then the boards one or two at a time; look at every snapshot (Read the PNG) before the next.
6. Write screen scripts (`/*LIB*/ /*SCREENS*/`) mirroring the scenarios: same names as `validate.pairs`, same data.
7. Run screens → `99-verify` → `CLI validate`. Inspect every ⚠️ side-by-side; write one idempotent patch script for the
   findings, port the fixes back into the generators, re-run patch + verify + validate.
8. Hand-off: link to the file, the validation table, the docs; list what is approximated (motion, native controls).

## Sync after code changes

| Change | Do |
|---|---|
| colour / type / radius / shadow value | `CLI tokens` → run `00-foundations` (updates in place; every bound node follows) |
| new / renamed token | same, then patch components that should use it |
| component markup / style | edit the generator (for fresh builds) **and** write a patch script for the live file |
| new UI state | scenario → `capture --only=<id>` → add variant (patch) → add screen → validate |
| new screen / flow | screen script (new section or `adoptSection`) → verify → validate |

## Watch mode vs bundle mode

| | Watch mode | Bundle mode |
|---|---|---|
| Needs | Figma sandbox allows `new Function` (detected on plugin start) | nothing |
| Clicks | open the plugin once per session | reopen + "Run all bundled" per batch |
| Ad-hoc scripts (reads, one-off patches) | `CLI queue path/to/script.js` | add the file to `scripts/figma/plugin` as `NN-…` and bundle |
| Size limit | none practical (jobs are JSON files) | none practical (bundle carries assets, ~1–2 MB is fine) |

Both modes roll back the new top-level nodes of a failing script. In-place edits are **not** rolled back — write
patches so a re-run is safe.
