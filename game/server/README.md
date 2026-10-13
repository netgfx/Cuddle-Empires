# Risk 3D room server

An authoritative multiplayer server for the game. It holds the `GameState` of every room, runs the same rules
engine as the client (`src/game/engine.ts`), plays the bot seats with `src/game/bot.ts`, and broadcasts every
accepted action to everyone in the room. Clients connect with `src/net/online.ts`.

## Run locally

```bash
npm run server            # tsx server/index.ts → ws://localhost:8787/ws
npm run dev               # the game; Online mode connects to ws://<page host>:8787/ws by default
```

`VITE_RISK_SERVER=wss://risk.example.com/ws npm run dev` (or `npm run build`) points the client somewhere else.

Checks:

```bash
npx tsc -p server/tsconfig.json --noEmit     # typecheck the server
npx vitest run server src/net                # hidden-info unit test + full-game integration tests
node server/dev/online-smoke.mjs             # two Chrome pages via Vite (needs server + dev server running;
                                             # env APP_URL, RISK_SERVER)
```

## Deploy

Any Node 22 host works (Fly.io, Render, Railway, a VPS…): `npm i ws tsx && npx tsx server/index.ts`, with the
`server/` and `src/game/` folders present. Or use the container (build context = the `game/` folder):

```bash
docker build -f server/Dockerfile -t risk-server .
docker run -p 8787:8787 -e ALLOWED_ORIGINS=https://my-game.example risk-server
```

Put it behind TLS (a reverse proxy / the platform's HTTPS) so browsers on an `https://` page can use `wss://`.
State is in memory: one instance = all rooms; restarting the process ends running games.

### Environment variables

| var | default | meaning |
| --- | --- | --- |
| `PORT` | 8787 | HTTP + WebSocket port |
| `HOST` | 0.0.0.0 | bind address |
| `BOT_DELAY_MS` | 600 | bot think time before each action (`0` = instant, used by tests) |
| `BOT_BATTLE_DELAY_MS` | 2.5 × `BOT_DELAY_MS` | extra wait per `battle` event in the previous update, so clients can animate the dice |
| `BOT_MAX_DELAY_MS` | 12000 | cap on one bot wait (blitz attacks produce many battles) |
| `SEAT_TIMEOUT_MS` | 120000 | a disconnected human's seat is played by the bot after this (they get it back on reconnect) |
| `ROOM_TTL_MS` | 600000 | a room with nobody connected is deleted after this |
| `MAX_ROOMS` | 1000 | refuse new rooms beyond this |
| `RATE_LIMIT` | 20 | messages per second per connection (burst 2×); excess is dropped with an `error` |
| `HEARTBEAT_MS` | 30000 | WebSocket ping interval; sockets that miss a pong are terminated |
| `ALLOWED_ORIGINS` | (any) | comma-separated `Origin` allow-list for the WebSocket upgrade |
| `LOG` | 1 | `0` silences room logs |

HTTP: `GET /health` → `{ ok, protocol, uptimeSec, rooms, clients, connected }`; `GET /rooms` → public rooms
waiting in the lobby (`{ rooms: [{ code, host, players, maxPlayers, phase }] }`, CORS `*`).

## Protocol (v1)

JSON text frames on `/ws`; every frame has `v: 1` and `type`. Requests may carry `rid`, which the server echoes on
the direct answer (`room`, `rooms`, `left` or `error`). Types live in `server/protocol.ts`.

Client → server

| type | fields | notes |
| --- | --- | --- |
| `hello` | `name, color, token?` | must be first; with a known `token` you get your identity, room and seats back |
| `createRoom` | `settings?, maxPlayers?, isPublic?` | you become host + seat p1; answers `room` |
| `joinRoom` | `room` | 5-char code (case-insensitive), lobby only (or rejoin your own running room) |
| `listRooms` | | answers `rooms` |
| `setReady` | `ready?` | toggles if omitted |
| `addBot` | | host, lobby |
| `kick` | `seat` | host; in a running game the seat goes to the bot |
| `startGame` | | host; every other human must be ready; also restarts a finished room |
| `action` | `envelope: { action, actor, id? }` | `actor` must be a seat you own |
| `chat` | `text` | ≤ 200 chars |
| `leave` | | in a running game your seat goes to the bot |
| `ping` | `t?` | answers `pong` |

Server → client

| type | fields |
| --- | --- |
| `welcome` | `clientId, token, room` (room code you are still in, or null) |
| `room` | `room: { code, hostId, seats: [{ seatId, name, color, kind: 'human'\|'bot', ownerId, connected, ready, botControlled? }], phase: 'lobby'\|'playing'\|'finished', maxPlayers, settings, isPublic }` |
| `started` | `gameId, state, yourSeats` — at game start and as a snapshot after every reconnect |
| `state` | `state, events, actionId?` — after every accepted action (yours, others', bots') |
| `error` | `error, actionId?` — only to the sender |
| `chat` | `line: { from, name, text, at, system? }` |
| `left` | `room, reason: 'left'\|'kicked'\|'closed'` |
| `pong` | `t?` |

Room codes use `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L). Seat ids are `p1…pN` in lobby order and become the
`PlayerId`s of the game; `createGame` rotates the turn order, so always use ids, never indexes.

## Security notes

- **Authoritative**: clients only send intents; the server checks that `envelope.actor` is a seat owned by that
  connection (and not currently bot-controlled), runs `reduce`, and rejects anything illegal.
- **Hidden information** (`server/hidden.ts`): each client gets its own view — other players' card ids become
  `hidden-<n>` placeholders (count kept), the draw pile is placeholders only, `cardDrawn.card` / `eliminated.cardsTaken`
  are blanked for others, and `state.rng` is zeroed (otherwise a client could replay the seeded PRNG and predict dice
  and draws). Seeds come from `crypto.randomInt`.
- **Identity**: the reconnect `token` (24 random bytes) is a bearer secret; the client keeps it in `sessionStorage`.
  `clientId` is public. A second connection with the same token replaces the first (close code 4000).
- **Limits**: 64 KB max frame (larger → close 1009), per-connection rate limit, names/chat sanitised and capped,
  room cap, heartbeat terminates dead sockets, rooms garbage-collected.
- Not included: accounts, persistence, TLS termination (use a proxy), per-IP limits across connections.
