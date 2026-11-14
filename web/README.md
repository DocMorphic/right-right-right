# Right Right Right browser game

This is a browser adaptation using the authorized original game models, textures, audio, font, and Unity IMGUI skin. It is not a Unity WebGL export: the original editable Unity project is unavailable. Browser players share browser rooms; these rooms are separate from the downloadable game's Unity/DTLS rooms.

## Deployment and scope

Open the [deployed browser game](https://right-right-right-play.andustry-0633.chatgpt.site) and share that link with friends. Browser room codes belong to this service and cannot join the downloadable Windows game's rooms.

The menu uses the original tablet palette, Share Tech Mono, title lettering and car artwork with clear host/join and Start Game controls. The race HUD reconstructs the native mod UI using its original fonts and skin textures. Driving, networking, procedural mud and dynamic tablet rendering run in browser/server JavaScript. Exact native rendering and physics parity remain subject to comparison with the compiled game.

## Run locally

Requires Node.js 22.13 or later. Generated licensed assets are ignored by Git: export them from an authorized prepared native runtime into `web/public/assets/` before building. Follow the [asset export guide](../docs/WEB-ASSET-EXPORT.md); keep the generated credits and font notices with the assets.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:8787`. For development, run `npm run dev:server` and `npm run dev` in separate terminals, then open the Vite URL.

`npm run build` produces `dist/client/` and the Worker/D1 server at `dist/server/index.js`, including Sites hosting metadata and database migrations. The standalone Node server uses WebSockets. The hosted Worker uses authenticated HTTP sessions and optimistic database concurrency. The client selects the available transport automatically.

## Play

Use **HOST GAME** or enter a friend's room code and select **JOIN CODE**. Choose **2 PLAYER CO-OP** or **4 PLAYER RACE**. Seats follow join order: A driver, A navigator, B driver, B navigator. When everyone connects, the host selects a course and presses **START GAME**. Compatible browser peers acknowledge readiness automatically, as the downloadable game's menu does.

Play on a laptop or desktop with a keyboard and mouse. Phones and tablets display **Only available on laptop for now** before loading 3D assets or connecting. Touchscreen Windows laptops remain supported. Native UDP/LAN and Porthole controls are omitted. A browser-only solo practice room can be opened with `?practice=1`.

- Driver: WASD / arrow keys; Space handbrake.
- Both seats: mouse look; E grab/drop a tablet; G close the passenger door; hold C wipe mud.
- Navigator: the original tablet displays the private route. Tab optionally enlarges it for readability.
- Host: F8 retries; **RETURN TO LOBBY** returns the entire room.
- Esc releases the mouse; a second Esc opens browser controls.

Trees have solid trunk collision and hard hits end a run. Car collisions jolt both crews without eliminating them. Open doors can eject dropped tablets; another crew can grab them. The server decides driving, hazards, ownership, progress, and results.

## Verify

```sh
npm test
node server/verify-host.mjs https://DEPLOYED_URL
```

Automated tests use real two- and four-client WebSocket connections, actual HTTP clients, and a real SQLite database behind a D1 interface adapter. Client regressions cover stale course responses, session resumption, delayed camera reconciliation, navigator input isolation and crew wiper visibility. Full-course HTTP driving tests cross the finish using normal inputs without state placement, including a 650 ms request cadence. They cover permissions, all six native course profiles, input validation and ownership, stale input, collisions, mud, doors, tablet stealing and action deduplication, finish crossing, HTTP authentication, concurrent updates, and session resumption. These tests do not run against the deployed Cloudflare database. The deployment verifier requires access to the deployed site's API; it creates temporary browser rooms and cleans up its own seats.

The public HTTP service completed stage 04, seed 12345, in 557.06 seconds: a 4.739 km route, 3,057 normal input packets, all 26 mud deposits, no state placement, and matching driver/navigator results. The [sanitized gameplay report](../docs/browser-gameplay-verification.json) records this run, the earlier failed verification, and the latency fixes.

The [asset verification report](../docs/web-asset-verification.json) records glTF validation and local asset preview observations. Full-course gameplay across separate devices and final screenshot parity with the native game remain manual verification work. The HTTP driving result validates authoritative gameplay; it does not establish those visual or separate-device results.

Original asset attribution and export provenance are in `public/assets/CREDITS.txt`, the asset manifest, `../docs/WEB-ASSET-EXPORT.md`, and the font's OFL notice. The browser code is covered by the repository's MIT license; original third-party game assets retain their original ownership.
