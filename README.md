# Right Right Right — two-player co-op and four-player racing

**0.3.0-alpha.5** includes the complete Windows game in one setup EXE. **2 PLAYER CO-OP** is the default: one driver and one navigator in one car. Choose **4 PLAYER RACE** for two crews in two cars.

[**Download RightRightRight-Setup.exe**](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.5/RightRightRight-Setup.exe) · [Release notes](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.5) · [Room-code guide](docs/RELAY-MULTIPLAYER.md)

Double-click the setup EXE. It installs everything, creates shortcuts and starts the game. No Steam, separate game installation, Python, SDK or setup commands are needed. The game uses its own branding and the lobby/HUD font is embedded. All players should install alpha.5. Windows x64 is the game target; Mac users running the Windows release need the [CrossOver setup](docs/MAC-DEVELOPMENT.md).

## Browser adaptation

The [browser game](https://right-right-right-play.andustry-0633.chatgpt.site) is available through a link. Friends open the same URL, host or join a browser room, and play without installing the Windows game.

The browser implementation uses the authorized original models, textures, sounds, fonts and Unity control skin. Its menu/HUD are reconstructed from this repository's native mod source and extracted runtime settings; its driving and networking are implemented in JavaScript. It targets current WebGL browsers on macOS, Windows and Linux. Browser players use separate browser rooms; their codes do not join the downloadable Windows release's Unity Relay/DTLS rooms.

The browser supports two-player co-op and four-player racing, with shared courses, driver/navigator seats, mud, doors, tablets, tree collisions, retries and lobby mode changes. Fifteen automated tests cover local multi-client WebSockets, a SQLite-backed D1 adapter, gameplay rules and all six course profiles. Asset format validation and local visual checks are recorded separately. These checks do not establish exact Unity rendering/physics parity or a complete separate-device playtest of the deployed service.

See the [browser setup and controls](web/README.md), [server/deployment details](web/server/README.md), and [asset export/provenance guide](docs/WEB-ASSET-EXPORT.md). Generated game assets and builds stay outside Git; a source checkout needs an authorized native runtime export before it can build the browser game. The Windows installer above remains a separate downloadable release.

## Play with friends

1. Everyone runs the same **RightRightRight-Setup.exe** and uses its shortcut. For the published ZIP, extract everything and open **player/RightRightRight.exe**.
2. The host chooses **2 PLAYER CO-OP** or **4 PLAYER RACE**, clicks **HOST GAME**, and shares the room code. **COPY CODE** copies it to the clipboard.
3. Friends enter that code and click **JOIN CODE**.
4. Wait for **2/2** or **4/4**, then the host chooses a course. Keep the host's game open.

The host can switch modes in the lobby using the same room code. Return to the lobby to change mode after a run. To switch from four-player racing to co-op, reduce the lobby to two players first. Clients automatically follow the host's mode. Only two- and four-player modes are supported in this release.

Online rooms use Unity Relay with DTLS encryption and automatic anonymous sign-in. The release uses the project's production environment and Netherlands Relay region. Friends do not enter IP addresses, forward ports or run a helper app. The host must remain connected; disconnecting closes the room.

**LAN / ADVANCED** retains direct IPv4/UDP for LAN, VPN or the older Porthole setup. No Python, SDK, PowerShell setup or first-launch dependency downloads are required. The game does not initialize Steam. The full room-code guide and publisher service setup are [here](docs/RELAY-MULTIPLAYER.md).

## The race

- Two-player co-op uses one centered car and one tablet: host drives, the other player navigates. Finish or fail together, with a shared run time.
- Four-player racing uses two visible cars, driver/navigator in each. Join order: host = A driver, then A navigator, B driver, B navigator.
- Host-simulated car collisions with cockpit jolts, surviving contact with each other. Hard tree hits cause crew DNF.
- Original car, cabin, character, tablet and forest assets. Matching original trees close roadside/end gaps; no railings or unrelated scenery.
- Six randomized technical courses with hairpins, hard corners and 9.5 m roads.
- Mud/wiping and doors opening on hard turns in either direction.
- Loose tablets can fall through open doors. Aim and press E within three metres to take an unheld tablet; one still inside a rival cabin requires its door to be open. Held tablets are protected.
- Four-player version/course/seed handshake, shared countdown, separate crew times and a winner. Host retry keeps the seed; choosing a new course randomizes it.

WASD/Space drives. **E** grabs/drops tablets, **G** closes the door, hold **C** to wipe, **Escape** toggles cursor lock, and host **F8** retries. The host can return everyone to the lobby through the race HUD.

## Alpha scope

Alpha.5 passes scripted native gameplay checks through CrossOver on Apple Silicon: two-player co-op, four-player racing, retry/return to lobby and synchronized 2→4→2 mode changes, all through live Unity Relay/DTLS. The complete installer also passes its embedded-file verification and normal installation/launch. See [release checks and limits](docs/RELEASE-0.3.0-alpha.5.md) and [the sanitized results](docs/alpha5-verification-results.json). A later [separate-computer cross-play check](docs/mac-windows-crossplay-verification.json) passed with a Mac ARM64 Wine/FEX host and a native Windows guest, covering co-op driving, tablet/door/mud actions, shared finish, retry and tree failure. These scripted headless checks do not establish manual full-course play or working graphics in the experimental standalone Mac app.

Two-player co-op and four-player racing are tested with native game processes using real Unity Authentication, Relay rooms and DTLS. Co-op tests cover one-car/two-seat setup, driving, navigator map privacy, mud/wiping, doors, loose tablets, shared finish, retry and tree failure. Lobby lifecycle tests cover retry, return and synchronized 2→4→2 mode changes with the same room. Processes run on one PC through Unity's hosted service; separate home-network playtests remain needed. See the [mode verification report](docs/mode-verification-results.json).

Both cars are simulated on the host. The second driver's controls have round-trip latency with no client prediction yet. There is no host migration or in-race joining. Lost tablets remain in the world until retrieved or the host retries. Tree DNF uses the race HUD so the other crew can continue.

Right Right Right is independently branded. It includes licensed compiled runtime/assets and our extension; this repository does not contain the editable original Unity project. Licensed content is attributable to Stellux Interactive under the developer permission stated by the project owner, and is not covered by our source-code MIT license.

## Developer build

**Developing on a Mac:** [Mac setup and cross-platform build guide](docs/MAC-DEVELOPMENT.md). Use `python tools/build_from_release.py` to fetch a pinned published runtime and build the Windows package on macOS without the home Windows laptop. A native Mac game is not available. CrossOver startup and the embedded font have runtime checks, and the user confirmed readable text. Scripted co-op, four-player gameplay and lobby lifecycle pass through live Relay/DTLS on the Mac. Manual full-course driving remains untested; the separate-computer scripted Mac/Windows co-op check above passes. The current source is on `main` and `standalone/portable-steam`.

On Windows x64, a prepared pinned player and the local Python 3.12/.NET toolchain build the portable release:

```powershell
.\Build-Portable.ps1 -Direct -RelayConfig .\standalone\rrr-relay.production.json -PlayerPath C:\path\to\prepared\player
.\Verify-Relay.ps1 -Players 2 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -Players 2 -Flow -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -Players 4 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
```

The publisher's prepared player supplies licensed original files, cached bindings and loader dependencies. Recipients do not need that source installation. Outputs and full game content stay in ignored `local/`; authored source and sanitized reports are in Git. All scripted driving/lifecycle fixtures require explicit developer flags.

The older [alpha.2 direct/Porthole ZIP](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.2), [alpha.1 Steam-invite mod](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.1) and [stable two-player 0.2.0](https://github.com/DocMorphic/right-right-right/releases/tag/v0.2.0) remain available. The alpha.1 and stable installers require the playtest. See [distribution design](docs/STANDALONE.md), [reverse engineering](docs/REVERSE_ENGINEERING.md) and [test scope](docs/TESTING.md).
