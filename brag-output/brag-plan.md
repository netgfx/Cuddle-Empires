# /brag — Cuddle Empires

**What it is:** classic world-conquest strategy on a cute 3D board, where the armies are dogs, ponies and pandas.
**For:** friends who want a board-game night in the browser, against each other or against bots.
**What sets it apart:** the real rules (42 territories, cards, continent bonuses) with physics dice. A team of AI agents built it in about 70 minutes of active time, and generated the 3D assets with SINNON.NET.
**Most impressive claim:** "Built in ~70 minutes by a team of AI agents." (Transcript: 22:17 to 23:01 and 03:12 to 03:37, six subagents working 22:28 to 23:00.)
**Visual hook:** real physics dice tumbling in the tray, with the camera pushing into the battle.
**Tone:** `default`. Punchy, playful and clean, with a cinematic push for the "how it was built" beat.
**Format:** landscape 1920×1080, 30 fps, 38 s. This runs longer than the 15–25 s default, at the user's request, so that every text frame can be read.
**Share caption:** "World domination, but make it cute. A team of AI agents built Cuddle Empires in about 70 minutes."

## Identity (from `game/src/ui/ui.css`)
- **Font:** Fredoka 400 to 700, plus JetBrains Mono for the terminal.
- **Colours:**
  - ink #2a2f45
  - pink #ff7aa2 / pink-deep #f0507f
  - mint #6fd6b5
  - sun #ffc94a
  - sky #8ec5ff
  - cream #fffaf6, warm table #f3dcc0
- **Assets:**
  - Real footage, captured on a virtual clock.
  - SINNON hero renders: dog, pony, panda, die, card, tray.
  - Pawn icons.
  - Real Blender 5.2 and SINNON.NET window captures.

## Storyboard (38.0 s; every text frame holds at least 2–2.5 s once settled; cue sheet in `work/timeline.js`)
| # | Time | Scene | Settled text holds |
|---|---|---|---|
| 1 | 0.0–3.5 | **Hook.** Battle close-up with the dice in the tray. "World domination." then "…but make it cute." | 2.0 s (line 2), 3.0 s (line 1) |
| 2 | 3.5–7.5 | **Reveal.** The "Cuddle Empires" lockup over the live board, with the tagline. | 2.45 s |
| 3 | 7.5–11.5 | **Armies.** Dog = 1, Pony = 5, Panda = 10. | 2.3 s |
| 4 | 11.5–15.5 | **Battle.** Real dice footage. Chips: 42 territories, Classic rules, Physics dice, Bots & online play. | 2.35 s |
| 5 | 15.5–33.0 | **Built in ~70 minutes by a team of AI agents.** | |
| 5a | 16.0–19.0 | SINNON.NET window with 7 assets. | 2.3 s |
| 5b | 19.0–22.0 | Blender, material then wireframe. | 2.3 s |
| 5c | 22.0–25.5 | The 6 subagent cards and the lead agent. | 2.45 s |
| 5d | 25.5–29.0 | The stack, 12 technologies. | 2.4 s |
| 5e | 29.0–33.0 | Terminal with the real test output. | 2.45 s |
| 6 | 33.0–38.0 | **Outro.** Logo, "Play with friends & bots", the play URL and the GitHub repo. | 2.9 s |

## Sound
- **Music:** one key (F major), 120 bpm, bright pluck and marimba melody, soft kick and clap, round bass.
- **Effects:** dice clacks on the hook and battle cuts, soft pops on card and agent reveals, a whoosh into the montage, and a chime on the logo, all tuned to F. Effects sit about 8 dB under the music.
