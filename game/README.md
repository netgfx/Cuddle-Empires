# RISK · Cute Edition (3D)

The classic Parker Brothers rules (1993 edition) on a cute 2.5D board. Armies are **dogs (1)**, **ponies (5)** and
**pandas (10)**. The board, pawns, dice, dice tray and card come from the SINNON.NET Asset Generator project `risk-game`.

## Run

```bash
npm install
npm run dev                 # http://localhost:5173 — local hotseat (humans + bots)
npm run dev:debug           # same, plus the Online (beta) tab on the setup screen (also: any vite command with --debug)
PORT=8787 npm run server    # optional: room server for Online (beta) play, ws://localhost:8787/ws
```

## Play
- **Setup:** 2–6 players (human or bot). You can auto-deal territories or claim them by hand, pick Classic (4, 6, 8, 10, 12, 15, +5) or Expert (+1) card values, and choose Adjacent or Connected fortifying. With 2 players a neutral army is added, as in the book.
- **Turn:** reinforce (click your territories; shift-click places all), then attack (click a source, then a target, then Attack or ⚡ Blitz), then fortify once and end the turn.
- **Cards:** a conquest earns one card at the end of your attack. Trade sets from the hand at the bottom-left. With 5 or more cards you must trade.
- **Controls:**
  - Mouse: drag to pan, right-drag to rotate, wheel to zoom.
  - Keyboard: `Home` returns to the overview, Esc closes panels.
  - Settings: music (Meadow / March / Lullaby / Adventure / Off), volumes, animation speed and labels.

## Architecture
| Area | Path | Notes |
|---|---|---|
| Rules | `src/game/` | Pure reducer `reduce(state, action, actor)`, seeded RNG, selectors, bot. Shared with the server. |
| State | `src/state/` | zustand: `game` (authoritative) vs `view` (shown). The director plays events (dice, moves, cards) before `view` updates. |
| 3D | `src/scene/` | R3F + drei: map GLB, territory picking, instanced pawns, badges, labels, dashed attack arcs, camera rig, effects. |
| Dice | `src/dice/` | Rapier pre-simulation, then the dice are rotated so they land on the engine's values; rendered in a drei `<Hud>` pass. |
| UI | `src/ui/` | Setup, HUD, scoreboard, card hand, dialogs, panels, banners, game over. Animations use anime.js v4. |
| Audio | `src/audio/` | Procedural Web Audio music and sound effects (no audio files). |
| Network | `src/net/`, `server/` | `GameTransport` (Local / Online), authoritative WebSocket room server with hidden hands, reconnects and bot takeover. |

## Tests
```bash
npm test                                   # vitest: engine (83), dice (4), server + net (10)
npm run typecheck
node scripts/e2e-hotseat.mjs out 6         # Chrome: hotseat game through setup screen, board clicks and dialogs
node scripts/e2e-cards.mjs out             # Chrome: card hand + forced trade
node scripts/e2e-online.mjs out 6          # Chrome: two pages, Online lobby → synced play (needs the server + `npm run dev:debug`)
node scripts/e2e-botgame.mjs out 3 4       # Chrome: full all-bot game to the Game Over screen
node scripts/e2e-saves.mjs http://localhost:5173 out  # Chrome: save (modal + Ctrl+S), load over a running game, delete, load from setup
node scripts/shot.mjs <url> <png>          # screenshot + console errors
```
The e2e scripts need the dev server on :5173. They drive real Chrome through Playwright, and `window.__risk` exposes the stores for assertions.
