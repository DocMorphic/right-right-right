# Right Right Right — standalone four-player race

**In development: alpha.3 in-game room codes.** Host Game / Join Code integration is being validated; a separate Unity Gaming Services project is required before live internet rooms can be tested and released. See [one-time setup and current scope](docs/RELAY-MULTIPLAYER.md). The downloadable alpha.2 below still uses Porthole.

**0.3.0-alpha.2** bundles the game and runtime. Friends no longer need the original playtest downloaded or a Steamworks App ID.

[**Download the standalone ZIP**](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.2/RightRightRight-Standalone-0.3.0-alpha.2.zip) · [Setup guide](docs/DIRECT-MULTIPLAYER.md)

## Play with friends

1. All four players extract the ZIP and open **player/RightRightRight.exe**.
2. For internet play, all four install the free [Porthole — Local Port Sharing](https://store.steampowered.com/app/4963920/) app in Steam.
3. Host clicks **HOST** in the game, creates a Porthole lobby and shares **UDP 7787**.
4. Friends join that Porthole lobby through Steam or its share code and approve the offered port. In the game, click **JOIN** with **127.0.0.1**, port **7787**.
5. Wait for **4/4**, then the host chooses a course. Keep Porthole open during the race.

Porthole supplies the Steam invitations and network tunnel; the game uses direct Host/Join. It runs separately and is not bundled or installed automatically. On a LAN or VPN, join the host's reachable IPv4 address directly instead. Porthole's [official explanation](https://porthole.sestudio.org/) describes its Steam friends/code lobbies and UDP forwarding.

No Python, SDK, PowerShell setup or first-launch dependency downloads are required. The game itself does not initialize Steam. The full setup and troubleshooting guide is [here](docs/DIRECT-MULTIPLAYER.md).

## The race

- Two visible cars, driver/navigator in each. Join order: host = A driver, then A navigator, B driver, B navigator.
- Host-simulated car collisions with cockpit jolts, surviving contact with each other. Hard tree hits cause crew DNF.
- Original car, cabin, character, tablet and forest assets. Matching original trees close roadside/end gaps; no railings or unrelated scenery.
- Six randomized technical courses with hairpins, hard corners and 9.5 m roads.
- Mud/wiping and doors opening on hard turns in either direction.
- Loose tablets can fall through open doors. Aim and press E within three metres to take an unheld tablet; one still inside a rival cabin requires its door to be open. Held tablets are protected.
- Four-player version/course/seed handshake, shared countdown, separate crew times and a winner. Host retry keeps the seed; choosing a new course randomizes it.

WASD/Space drives. **E** grabs/drops tablets, **G** closes the door, hold **C** to wipe, **Escape** toggles cursor lock, and host **F8** retries. The host can return everyone to the lobby through the race HUD.

## Alpha scope

Four native player processes pass the direct lobby handshake, complete gameplay checks through three bidirectional UDP proxies, and pass restart/return-to-lobby checks. Distribution/protocol tests, manifest hashes and ZIP extraction checks also pass. A real four-account internet/Porthole playtest remains needed; local forwarding tests do not establish Porthole service availability or latency.

Both cars are simulated on the host. The second driver's controls have round-trip latency with no client prediction yet. There is no host migration or in-race joining. Lost tablets remain in the world until retrieved or the host retries. Tree DNF uses the race HUD so the other crew can continue.

This remains a licensed distribution of the original compiled runtime and assets with our extension; it does not recover editable original gameplay source. The original Steam install is untouched. Original content is attributable to Stellux Interactive under the developer permission stated by the project owner, and is not covered by our source-code MIT license.

## Developer build

On Windows x64, a prepared pinned player and the local Python 3.12/.NET toolchain build the portable release:

```powershell
.\Build-Portable.ps1 -Direct -PlayerPath C:\path\to\prepared\player
.\Verify-Race.ps1 -Direct -Proxy -BasePlayer C:\path\to\portable\player
.\Verify-Race.ps1 -Direct -Flow -BasePlayer C:\path\to\portable\player
```

The publisher's prepared player supplies licensed original files, cached bindings and loader dependencies. Recipients do not need that source installation. Outputs and full game content stay in ignored `local/`; authored source and sanitized reports are in Git. All scripted driving/lifecycle fixtures require explicit developer flags.

The older [alpha.1 Steam-invite mod](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.1) and [stable two-player 0.2.0](https://github.com/DocMorphic/right-right-right/releases/tag/v0.2.0) remain available; those installers still require the playtest. See [distribution design](docs/STANDALONE.md), [reverse engineering](docs/REVERSE_ENGINEERING.md) and [test scope](docs/TESTING.md).
