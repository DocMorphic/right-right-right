# Browser multiplayer server

Browser rooms are separate from the downloadable Unity game. Friends on macOS, Windows, Linux, and other systems play together by opening the same browser URL. These room codes do not connect to the downloadable game's Unity Transport/DTLS rooms.

## Run locally or on an ordinary Node host

From `web/`:

```sh
npm ci
npm run build
npm start
```

The server listens on `0.0.0.0:8787`, serves `web/dist/client` (or the standalone `web/dist` client build), accepts WebSockets at `/ws`, and exposes `/health`. Set `PORT`, `HOST`, and optional `ALLOWED_ORIGIN` for your host. Forward WebSocket upgrades and use HTTPS/WSS for a public deployment. During development, `npm run dev` uses Vite with the multiplayer server started separately by `npm run dev:server`.

## Sites Worker deployment

`npm run build` produces the complete Sites artifact, including the Vite client at `dist/client`, the bundled Worker at `dist/server/index.js`, and deployment metadata/migrations at `dist/.openai`. `npm run build:client` retains the standalone Vite-only build for ordinary Node hosting.

`worker.js` is the independent Cloudflare Worker ESM entry. Bundle it as `dist/server/index.js`, bind the static files as `ASSETS`, and bind D1 as `DB`. Apply `web/drizzle/0000_browser_rooms.sql` using the hosting migration mechanism; the runtime never creates or changes database schema. The Sites migration journal is in `web/drizzle/meta/_journal.json`.

The hosted adapter uses authenticated HTTP requests because the hosting environment does not expose Durable Objects. Room state is stored in D1, with a revision-checked atomic update for every mutation. All clients therefore share one authority even when requests run in different Worker isolates. It does not rely on an in-memory room map. Simulation advances in at most 20 ms steps using server time when requests arrive. Active clients send the latest input approximately every 100 ms and receive authoritative state in the response. Poll only when no input request is in flight. Rendering predicts the local driver with the shared driving step and interpolates remote cars.

- `POST /api/session {}` returns `{id, token, messages:[welcome]}`. Passing an existing `{id, token}` resumes the session.
- `POST /api/message {id, token, epoch, message}` applies a protocol message and returns `{messages, retryAfterMs}`.
- `POST /api/poll {id, token, epoch}` returns lobby/state updates. `epoch` is the last race event received, or zero; a changed epoch returns a `race` event before snapshots.
- `GET /health` checks the deployed database binding and migrations.

Do not put session tokens in URLs, logs, or invite links. Invite links carry only the room code. Protocol errors are returned as `messages:[{type:'error',code,message}]`; a normal rejected action does not require disconnecting. A `409/busy` response can be retried. A `401/auth` response requires a new or valid session.

## Room protocol

JSON protocol version 1. Server messages are `welcome`, `joined`, `lobby`, `race`, `snapshot`, `left`, `pong`, and `error`. Room commands:

```js
{type:'create', mode:'coop' /* or 'race' */, name:'Alice', seed:12345}
{type:'join', code:'ABC123', name:'Bob'}
{type:'seat', slot:1}
{type:'ready', ready:true}
{type:'configure', mode:'race', seed:12345, profile:0} // host, lobby only
{type:'start'}                                     // host, all players ready
{type:'retry', newSeed:false}                      // host, new epoch
{type:'lobby'}                                     // host, everyone returns
{type:'leave'}
{type:'input', epoch:1, seq:1, throttle:1, steer:0,
 handbrake:false, wipe:false, pitch:0, yaw:0,
 actions:[{id:1, kind:'grab'}]}                      // kind 'grab' or 'door'
```

Seats 0/1 are crew A driver/navigator; seats 2/3 are crew B. Co-op requires exactly two ready players, race exactly four. A distinct `{type:'create',mode:'coop',practice:true}` room allows a solo driver to practice. Only the driver seat can control its car. Input seat/team claims are ignored; membership comes from the connection or authenticated session. Every input has a monotonically increasing sequence number, and discrete action IDs run at most once. Old epochs, nonfinite/out-of-range values, and invalid actions are rejected. Controls expire after half a second without input.

The server owns car motion, tree deaths, nonfatal car impacts, mud/wiping, automatically opening passenger doors and G closing them, tablet drop/grab/theft, finish results, and retry state. Rival tablets inside a closed cabin cannot be stolen. Peers missing for ten seconds pause the run; expired HTTP peers release their seats after thirty seconds, and the next remaining player becomes host. Node WebSocket disconnects are handled immediately.

## Verification

```sh
npm test
```

The 15 automated tests use real two- and four-client WebSocket connections on one machine and a real SQLite-backed D1 interface adapter. They do not exercise the deployed Cloudflare D1 service or replace a separate-device full-course playtest. They cover readiness, seed/epoch synchronization, ownership spoofing, host commands and mode changes, disconnects, concurrent D1 updates, session authentication and resumption, practice, car collisions, fatal trees, mud, doors, tablet stealing, action replay protection, and finish crossing. Tests require Node 22.13 or later for the built-in `node:sqlite` module; production Worker code has no Node dependency.

## Transport choice

The standard browser WebSocket API is broadly supported: <https://developer.mozilla.org/en-US/docs/Web/API/WebSocket>. Unity's Transport also supports WebSockets, but Unity explicitly documents that its WebSocket transport is not a general-purpose WebSocket protocol and requires UTP on both ends: <https://docs.unity.cn/Packages/com.unity.transport%402.3/manual/websockets.html>. Unity Relay additionally supports DTLS and WSS: <https://docs.unity.com/relay/networking>. The JSON browser protocol implemented here deliberately uses its own server and room namespace.
