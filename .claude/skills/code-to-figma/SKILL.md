---
name: code-to-figma
description: Migrate or sync a web app's real UI (React/HTML/CSS, incl. UI drawn in a canvas/3D scene) into an editable Figma library + composed screens — tokens as variables, components with every state as variants, real fonts, fixture data, responsive breakpoints — then verify and pixel-validate against the running app. Uses a local Figma runner plugin + Playwright; does NOT need the Figma MCP (no quota). Use when the user asks to move/push/sync/rebuild UI "to Figma", build a Figma design system from code, keep Figma in sync after code changes, or re-validate Figma against the app.
---

# code-to-figma

Code is the source of truth. The pipeline renders every UI state in the **real app** (Playwright), extracts
**tokens from the code**, generates **Plugin API build scripts** that create token-bound components and screens,
runs them through a **local Figma plugin** (no MCP, no quota), then **audits** the file and **pixel-compares**
every Figma screen with the code render.

```
tokens ─▶ capture (UI states, DOM geometry, scene backdrops) ─▶ build scripts ─▶ runner plugin ─▶ 99-verify ─▶ validate ─▶ patch
```

Engine: `engine/` in this skill (Node ≥ 20; uses the project's own `playwright`). Project adapter:
`figma.config.mjs` + `scripts/figma/{scenarios.mjs, extract-tokens.mjs, plugin/NN-*.js}` in the web project.

## Operating rules (read before acting)

1. **Never use the Figma MCP** for this workflow (Starter / View seats get ~20 calls a month, writes included).
   Everything goes through `cli.mjs` + the runner plugin. Reading Figma = a read-only script + `snap()` PNGs.
2. **Run the CLI from the web project** (it finds `figma.config.mjs` upwards):
   `node <skill>/engine/cli.mjs <command>` — projects usually alias it as `npm run figma -- <command>`.
3. **One person-click per session, at most.** A human must start a Figma plugin (no remote trigger exists):
   - `serve` must be running (background) before the plugin opens.
   - **Watch mode** (`status` shows `canEval: true`): the user opens the plugin once; you `queue` scripts and they run
     by themselves. Poll `status` / read `runner-out/last/<script>.json`; view snapshots with the Read tool.
   - **Bundle mode** (no runtime eval in the sandbox): `bundle <scripts…>` then ask the user to reopen the plugin and
     click **Run all bundled**. Batch as much as possible per click.
4. **Never rebuild an existing board or section** — it deletes main components and orphans every instance.
   `board()` / `section()` throw on purpose. Change existing things with an in-place **patch script** (see
   `references/authoring.md#patching`), make patches idempotent, and port the same change back into the generator.
5. **Validate before you claim success**: run `99-verify` (audit + screen export) then `validate`; look at the
   side-by-sides of anything over budget and fix the cause (wrong backdrop, missing state, placeholder data, ring
   rendering…). Report the numbers honestly.
6. Screens must use the **same data as the scenario fixtures**, or validation measures the wrong thing.

## Commands

| Command | Does |
|---|---|
| `init` | scaffold `figma.config.mjs`, scenarios, token extractor, example board + screen script |
| `tokens` | run the project's token extractor → `figma/tokens.json` (prints drift) |
| `capture [--only=ids] [--vp=names]` | render UI states → `figma/ref/*.png` + `figma/dom/*.json` |
| `capture --backdrop [--only=ids]` | render the page with UI roots hidden → `figma/backdrops/*.jpg` (canvas / 3D scene behind the UI) |
| `emit <name\|all>` | standalone scripts in `figma/plugin-out` (also pasteable into `use_figma` if ever needed) |
| `bundle [names…]` | (re)generate the project's runner plugin with those scripts + embedded assets / backdrops |
| `serve` | results / snapshots / watch-mode queue server (`runner.port`, default 4171) |
| `queue <name\|file.js…>` | queue scripts for watch mode (names = `NN-*` scripts; a path = ad-hoc read / patch script) |
| `status` | plugin capability, queue length, last result per script |
| `validate [--script=99-verify]` | pixel diff Figma exports vs code renders → `figma/validation/report.md` + images |
| `install-global` | copy this skill to `~/.claude/skills/code-to-figma` (keep the global copy in sync) |

Engine scripts: `00-foundations` (variables, text / effect / gradient styles from tokens — idempotent, doubles as token
sync), `99-verify` (audit + export), `probe.js` (read-only connectivity check). Project scripts: `NN-*.js` boards and screens.

## Typical flows

- **First migration** → `references/runbook.md#first-migration` (≈ 8 steps; boards first, then screens, then verify).
- **Sync after code changes** → `tokens` → re-run `00-foundations`; changed components → patch script; new state →
  new scenario + variant + screen → validate.
- **Re-validate only** → `capture` (refs) → queue/bundle `99-verify` → `validate`.

## References

- `references/runbook.md` — setup (one-time Figma plugin import), first migration, sync, watch vs bundle mode.
- `references/authoring.md` — config, scenarios, tokens schema, build-script API (`_lib.js`, `_screens.js`), patching.
- `references/gotchas.md` — every Figma / Plugin API / plan pitfall met so far and its fix. Read before writing scripts.
