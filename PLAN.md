# Risk 3D — cute edition · build plan

Cute 2.5D RISK: the SINNON-generated board (`risk-map-v1`), armies are **dogs (1)**, **ponies (5)**, **pandas (10)**.
Rules: Parker Brothers 1993 manual (`C:\Users\djmid\Downloads\risk.pdf`) — World Domination + 2-player neutral variant,
optional expert variants (card +1 progression, connected fortify).

Stack: Vite + React 19 + TypeScript · three 0.186 + @react-three/fiber 9 + drei 10 · @react-three/rapier (dice physics)
· zustand 5 · animejs 4 · WebAudio (procedural music) · vitest · playwright (drives real Chrome over CDP) · ws (room server).

App lives in `game/`. Assets: SINNON Asset Generator project `risk-game` (http://127.0.0.1:47110), copied to `game/public/assets/`.

## Architecture (contracts — keep stable)
- `src/game/types.ts` — state, actions, events. `src/game/mapData.ts` — generated from the map GLB (ids = GLB node names).
- `src/game/engine.ts` — pure reducer `reduce(state, action, actor)` + selectors. Deterministic seeded RNG in state.
- `src/net/transport.ts` — `GameTransport` (LocalTransport now; OnlineTransport + `server/` for internet play).
- `src/state/gameStore.ts` — `game` (authoritative) vs `view` (displayed); batches of events are played by the
  director (`src/state/director.ts`, `onEvent(type, async fn)`) before `view` updates. `busy` locks input.
- `src/state/uiStore.ts` — selection, panels, camera focus, persisted prefs (music, volumes, anim speed).
- `window.__risk = { game, ui }` for e2e tests.

## Team colours
p1 Crimson #E63946 · p2 Azure #3A86FF · p3 Lime #6CC24A · p4 Sunflower #FFBE0B · p5 Violet #8E44AD · p6 Charcoal #34495E · neutral #A0A4A8

## Phases
- [x] P0 Blender: clear scene, render map → `renders/risk-map-v1_render.png`
- [x] P1 Assets (SINNON): pawn dog / pony / panda (TeamColor_* parts tintable), die (DieBody + Pips), card (CardFace/Back/Edge), dice tray
- [x] P2 Scaffold + contracts
- [x] P3 Rules engine + bot + unit tests            — owner: engine agent  (`src/game/*` except types/mapData)
- [x] P4 3D board: map, picking, pawns, camera, arcs — owner: scene agent   (`src/scene/*`)
- [x] P5 Dice physics (pre-simulated to engine values) — owner: dice agent (`src/dice/*`)
- [x] P6 UI: setup, HUD, scoreboard, cards, panels   — owner: ui agent      (`src/ui/*`)
- [x] P6b Audio: procedural music tracks + SFX      — owner: audio agent   (`src/audio/*`)
- [x] P7 Multiplayer groundwork: room server + OnlineTransport — owner: net agent (`server/*`, `src/net/online.ts`)
- [x] P8 Integration (App.tsx, interaction controller) + verification: unit, e2e full bot game in Chrome, screenshots of
      camera/assets/UI, card animations, turn flow — owner: lead

## Status log
- 2026-10-13 P0 done; P1 queued (6 assets); P2 done.
- 2026-10-13 P1 done: SINNON ids dog a4fix57f, pony a2xpthf4, panda a2canjz9, die ah5rgffe, card a7rtreyn, tray az45yecb
  (originals in `assets-gen/`; app copies re-encoded to WebP textures by a Python GLB repacker, 29 MB → 4.8 MB;
  gltf-transform webp fails on this machine with a libvips colourspace error). Icons: `public/assets/icons/{dog,pony,panda}.png`.
- 2026-10-13 P5 done: src/dice (headless Rapier pre-sim + face-offset replay, 4/4 tests, verified in Chrome; FACE_NORMALS checked vs die.glb).
- 2026-10-13 P3 done: engine + bot (83 vitest pass, 35 full bot games 2–6p). Note: createGame rotates players so first player is index 0 — use ids.
- 2026-10-13 P6b done: src/audio procedural music (meadow/march/lullaby/adventure) + 14 SFX, 40/40 Playwright audio checks. P7 net agent started.
- 2026-10-13 P4/P6/P7 done (scene, UI, net agents). Lead fixes: dice tray now rendered in a drei <Hud> pass (was hidden
  behind board / under depthTest-off badges), tray 30% width, scene waits for dice result via `waitDiceResult()`.
- 2026-10-13 E2E hotseat (`node scripts/e2e-hotseat.mjs <out> 6`): 100/101 checks pass, 6 human turns, 11 conquests,
  fortify, occupy, card draw, handoff curtain; no console errors. Only failure: test expects `territory-panel` after toggle.

## P8 verification — 2026-10-13 (all passing)
- Unit: 97/97 (engine 83, dice 4, server+net 10); `tsc` app + server clean.
- `scripts/e2e-hotseat.mjs`: 110/110 checks (setup screen, board-click reinforce, attack + blitz, occupy, end attack,
  card draw, fortify, end turn, handoff curtain, log/territory/help/settings panels + Esc), no console errors.
- `scripts/e2e-cards.mjs`: 8/8 (must-trade modal with 5 cards, non-dismissable, suggest set, trade animation, +4 armies).
- `scripts/e2e-online.mjs` (room server on :8787): 15/15 (Online tab create/join, bot seat, ready, start, 6 synced
  actions across 2 pages, other players' cards hidden).
- `scripts/e2e-botgame.mjs`: full 3-bot game to Game Over in Chrome at 4×: 1227 actions, 29 rounds, 19 min, no errors.
- Fixes made in P8: lobby reads server `seats`; BotDriver skips online; place-count picker only on your own seat;
  `window.__risk.LocalTransport` for test injection.

## Open / nice-to-have
- Listen to the 4 procedural music tracks by ear and tune the mix (only measured so far).
- ≤1100 px wide: auto-collapse the scoreboard so it doesn't cover Alaska.
- Optional engine `turnStarted` for the very first turn (UI greets turn 1 itself today).
- Bot games are long (≈29 rounds) because of escalating card sets — fine for play, maybe tune the bot.
- Docker image for the server not built yet (no Docker daemon here).
