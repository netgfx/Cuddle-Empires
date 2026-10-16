# Code → Figma (Cuddle Empires / RISK · Cute Edition)

The game's real UI — every HTML component and the in-scene 3D interface — lives in Figma as a token-bound library plus
composed screens, generated from the code and validated pixel-by-pixel against the running app.

- Figma file: **Cuddle Empires — UI Library** · https://www.figma.com/design/AYtycfAZKPf7OnlQ7lCtL6
  (📐 Library · 🖥 Screens · 🔎 Reference captures)
- Pipeline: the **`code-to-figma` skill** — project copy `.claude/skills/code-to-figma/`, global copy
  `~/.claude/skills/code-to-figma/` (sync with `npm run figma -- install-global`).
- **No Figma MCP needed.** Everything runs through a local Figma plugin + a local server (no quota).

## Quick use (from `game/`)

```bash
npx vite --port 4170 --strictPort &      # the app
npm run figma -- serve &                 # results / snapshots / watch-mode queue on :4171
npm run figma -- status                  # is the plugin connected? watch mode available?
```
Open **Plugins → Development → Cuddle Empires · Code → Figma runner** in the Figma desktop app (imported once from
`game/scripts/figma/runner-plugin/manifest.json`). Then:

| Task | Command |
|---|---|
| Tokens from code (+ drift report) | `npm run figma -- tokens` |
| Render UI states / scene backdrops | `npm run figma -- capture [--only=reinforce] [--vp=tablet]` · `capture --backdrop` |
| Run scripts in Figma | watch mode: `npm run figma -- queue 00-foundations 14-fixes 99-verify` · otherwise `npm run figma -- bundle …` + "Run all bundled" |
| Audit + compare with the app | `queue/bundle 99-verify` → `npm run figma -- validate` → `figma/validation/report.md` |

Full runbook, authoring guide (config, scenarios, tokens schema, script API, patching) and gotchas:
`.claude/skills/code-to-figma/references/`.

## What lives where

| Path | |
|---|---|
| `game/figma.config.mjs` | project config: URL, viewports (CSS breakpoints), UI roots, backdrops, assets, pages, font, validation pairs |
| `game/scripts/figma/scenarios.mjs` | 30+ UI states driven through `window.__risk` (+ 2 backdrop states) |
| `game/scripts/figma/extract-tokens.mjs` | tokens from `ui.css`, `util.ts` (teams), `mapData.ts` (continents), `sceneConfig.ts` (3D colours) |
| `game/scripts/figma/plugin/02…09-*.js` | library boards: Controls, Data display, Cards, Panels & dialogs, HUD & overlays, Setup, Save / load, 3D UI |
| `game/scripts/figma/plugin/10…12-*.js` | screens: setup + turn flow, panels / modals / overlays, responsive (1280 / 1024 / short / 480) |
| `game/scripts/figma/plugin/14-fixes.js`, `15-responsive.js`, `16-setup-inputs.js` | in-place patches from validation passes 1–3 (idempotent; already ported to the generators) |
| `game/scripts/figma/plugin/_game.js`, `_units.js` | game helpers (in-game chrome for screens, unit art) |
| engine (`00-foundations`, `99-verify`, helpers, runner, CLI) | `.claude/skills/code-to-figma/engine/` |

## Status (2026-10-16)

| | |
|---|---|
| Library | 8 boards · 51 component sets · 303 components · 345 variables · 35 text / 35 effect / 9 gradient styles |
| Screens | 43 |
| Audit | 0 broken instances · Fredoka only · ≈ 32 000 variable bindings |
| Validation pass 1 | desktop 2–4 % MAD; 27 / 37 within budget — findings fixed in `14-fixes` (backdrops per viewport, rings, curtain, native controls, fixture data, odds) |
| Validation pass 2 (watch mode, no clicks) | `14-fixes` → 33 / 37 within budget |
| Validation pass 3 / 4 | `15-responsive`, `16-setup-inputs` → **35 / 37 within budget**; desktop 1.2–4.6 % MAD; the two mobile screens are at 5.3 / 6.1 % (≈10 px modal offset, ellipsis vs clipping, share-bar width) |

Issues met and their fixes: [ISSUES.md](ISSUES.md) (project log) · generalised list: `.claude/skills/code-to-figma/references/gotchas.md`.
