# Right Right Right — two-player co-op and four-player racing

**0.3.0-alpha.4** adds a lobby mode selector. **2 PLAYER CO-OP** is the default: one driver and one navigator in one car. Choose **4 PLAYER RACE** for two crews in two cars. The game, runtime and online settings are bundled. No original playtest, Steam, Porthole, player account signup or setup commands are required.

[**Download the online standalone ZIP**](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.4/RightRightRight-Standalone-0.3.0-alpha.4.zip) · [Room-code guide](docs/RELAY-MULTIPLAYER.md)

## Play with friends

1. Everyone extracts the same-version ZIP and opens **player/RightRightRight.exe**.
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

Two-player co-op and four-player racing are tested with native game processes using real Unity Authentication, Relay rooms and DTLS. Co-op tests cover one-car/two-seat setup, driving, navigator map privacy, mud/wiping, doors, loose tablets, shared finish, retry and tree failure. Lobby lifecycle tests cover retry, return and synchronized 2→4→2 mode changes with the same room. Processes run on one PC through Unity's hosted service; separate home-network playtests remain needed. See the [mode verification report](docs/mode-verification-results.json).

Both cars are simulated on the host. The second driver's controls have round-trip latency with no client prediction yet. There is no host migration or in-race joining. Lost tablets remain in the world until retrieved or the host retries. Tree DNF uses the race HUD so the other crew can continue.

This remains a licensed distribution of the original compiled runtime and assets with our extension; it does not recover editable original gameplay source. The original Steam install is untouched. Original content is attributable to Stellux Interactive under the developer permission stated by the project owner, and is not covered by our source-code MIT license.

## Developer build

**Developing on a Mac:** [Mac setup and cross-platform build guide](docs/MAC-DEVELOPMENT.md). Use `python tools/build_from_release.py` to fetch a pinned published runtime and build the Windows package on macOS without the home Windows laptop. A native Mac game is not available; CrossOver play remains an unverified compatibility test. Check out `standalone/portable-steam` for the current multiplayer source.

On Windows x64, a prepared pinned player and the local Python 3.12/.NET toolchain build the portable release:

```powershell
.\Build-Portable.ps1 -Direct -RelayConfig .\standalone\rrr-relay.production.json -PlayerPath C:\path\to\prepared\player
.\Verify-Relay.ps1 -Players 2 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -Players 2 -Flow -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -Players 4 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
```

The publisher's prepared player supplies licensed original files, cached bindings and loader dependencies. Recipients do not need that source installation. Outputs and full game content stay in ignored `local/`; authored source and sanitized reports are in Git. All scripted driving/lifecycle fixtures require explicit developer flags.

The older [alpha.2 direct/Porthole ZIP](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.2), [alpha.1 Steam-invite mod](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.1) and [stable two-player 0.2.0](https://github.com/DocMorphic/right-right-right/releases/tag/v0.2.0) remain available. The alpha.1 and stable installers require the playtest. See [distribution design](docs/STANDALONE.md), [reverse engineering](docs/REVERSE_ENGINEERING.md) and [test scope](docs/TESTING.md).
