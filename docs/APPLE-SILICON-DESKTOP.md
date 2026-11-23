# Apple Silicon desktop package

This package embeds the **current browser adaptation** in an Apple Silicon Electron runtime. The full client, original exported assets, original audio and existing WebSocket game authority are included locally. It does not load the public website to play, and it does not require Node, Steam, CrossOver or the Windows game on the player's Mac.

This is separate from the experimental Wine/FEX project in `macos/`. Those files and artifacts are preserved. Reusing the browser implementation does **not** establish original Unity suspension, hand-animation or native-renderer parity.

## Network contract

The loopback asset origin normally stays on port 45087 so in-game preferences survive relaunches; if that port is occupied it falls back to an available local port. The LAN game authority always uses an available, separate port. On first launch the app starts the existing Node WebSocket game server on an available port. **Network → Copy Host Link** copies its LAN address. The second Mac selects that address in **Network → Connection Settings**, then both players use the normal in-game host/join room codes. The host app must remain open. **Game → Solo Practice** opens the existing single-player practice mode while hosting locally; it requires no remote service. Room codes belong to the selected authority; independent local hosts cannot find each other's rooms by code alone.

These are browser-adaptation WebSocket rooms, separate from the downloadable Unity/DTLS Windows game's rooms. A configured shared `https://`, `http://`, `wss://` or `ws://` host is also supported. The app keeps loading its own assets and proxies only `/ws` to that authority. `GAME_SERVER_URL` overrides the saved setting for a QA launch (the development run script forwards it through Launch Services using `open --env`); no temporary tunnel URL is compiled into the package. Settings reject credentials and non-game URL paths.

This initial network setup is a developer fallback, not zero-setup multiplayer. Guest-network client isolation, firewalls, unavailable hosts and internet latency still apply. Automatic LAN discovery and a permanent shared rendezvous service are not included. Packaging does not cure the HTTP/D1 latency of a different game service.

## Build

Build on Apple Silicon macOS using Node 22.12 or newer. Prepare a frozen browser client at `web/dist/client/`, including the authorized original exported assets, using the existing browser build/export workflow. Then:

```sh
npm --prefix desktop ci
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run verify
node desktop/scripts/verify-runtime.mjs
```

`npm --prefix desktop run build -- --client /path/to/frozen/client --client-ref COMMIT` selects an immutable prepared client and records its supplied revision. Without `--client-ref`, the prepared client's revision is left unknown rather than inferred from the current checkout. The builder copies every client byte unchanged and records SHA256 hashes. It copies the existing server's actual local dependency graph without rewriting its JavaScript/JSON, and preserves its standalone-entry guard. Dependencies and the native ARM64 Electron runtime are pinned by the desktop lockfile. When the prepared original `GameRuntime.exe` is available, its icon pixels are extracted losslessly for the QA app (the original artwork contains its PLAYTEST label). `--icon-exe /path/to/GameRuntime.exe` selects another prepared runtime; no Windows executable is included in the app.

Outputs are ignored under `desktop/out/`:

- `Right Right Right-darwin-arm64/Right Right Right.app`
- `RightRightRight-AppleSilicon-QA-0.3.0-alpha.5.1.dmg`
- `build-report.json`, containing the source revision, byte hashes, architecture and distribution status.

`desktop/script/build_and_run.sh` is the development build/run entry. It stops only a prior development app from this desktop checkout, builds, and opens the generated bundle. It does not target the existing Wine/native launcher or another installed game. `npm --prefix desktop start` runs the already staged development package.

The game renderer uses a sandbox with Node integration disabled and context isolation enabled. The connection settings window exposes only its small validated settings API. Game navigation/popups are restricted; app logs and saved host settings live under `~/Library/Application Support/RightRightRight Desktop/`.

## Distribution and verification limits

The current artifact is an **ad-hoc signed QA candidate**, not a public Mac release. No Developer ID identity is installed on the build Mac. The build report deliberately states `developerIdSigned:false`, `notarized:false` and `gatekeeperReady:false`. A downloaded copy may be blocked by Gatekeeper; successful local startup does not establish a frictionless public installation. A public release needs the appropriate distribution signature/notarization and a separate downloaded-app check.

CLI checks verify the ARM64 Mach-O, deep code signature, disk-image checksum, every packaged client/server file hash, actual packaged Node runtime, nine-stage assets/audio availability, same-host room joining and both-player R readiness. These are distinct from GUI/WebGL driving, actual audio output, installed-app startup and a separate-two-Mac playtest. Record those observations separately before publishing.

The app carries the game-code MIT notice, original asset credits/font notices, Electron/Chromium notices and WebSocket library license. Original game assets retain their ownership and are not relicensed as MIT.

The desktop subproject includes its own Codex Run action and `--verify`, `--logs`, `--telemetry` and `--debug` modes. `--verify` confirms process/page startup through app logs; it does not assert a visible playable scene. The repository's existing root Codex configuration is not changed.

Framework references: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [utility process API](https://www.electronjs.org/docs/latest/api/utility-process), and [Electron 44+ macOS 13 requirement](https://www.electronjs.org/blog/electron-44-0). Actual artifact architecture/signature/payload claims come from the local verification commands above.
