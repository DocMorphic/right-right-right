# Right Right Right — online four-player race

**0.3.0-alpha.3** adds in-game room codes. The game, runtime and online settings are bundled. No original playtest, Steam, Porthole, player account signup or setup commands are required.

[**Download the online standalone ZIP**](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.3/RightRightRight-Standalone-0.3.0-alpha.3.zip) · [Room-code guide](docs/RELAY-MULTIPLAYER.md)

## Play with friends

1. All four players extract the ZIP and open **player/RightRightRight.exe**.
2. One player clicks **HOST GAME**, waits for a room code, and shares it with three friends. **COPY CODE** copies it to the clipboard.
3. Friends enter that code and click **JOIN CODE**.
4. Wait for **4/4**, then the host chooses a course. Keep the host's game open during the race.

Online rooms use Unity Relay with DTLS encryption and automatic anonymous sign-in. The release uses the project's production environment and Netherlands Relay region. Friends do not enter IP addresses, forward ports or run a helper app. The host must remain connected; disconnecting closes the room.

**LAN / ADVANCED** retains direct IPv4/UDP for LAN, VPN or the older Porthole setup. No Python, SDK, PowerShell setup or first-launch dependency downloads are required. The game does not initialize Steam. The full room-code guide and publisher service setup are [here](docs/RELAY-MULTIPLAYER.md).

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

Four native player processes pass real Unity Authentication, Relay room creation/join and DTLS binding, complete race checks, and pass restart/return-to-lobby checks while retaining the room. These processes run on one PC and exchange their traffic through Unity's hosted Relay service. A four-PC playtest across separate home networks remains needed. See the [sanitized Relay report](docs/relay-verification-results.json).

Both cars are simulated on the host. The second driver's controls have round-trip latency with no client prediction yet. There is no host migration or in-race joining. Lost tablets remain in the world until retrieved or the host retries. Tree DNF uses the race HUD so the other crew can continue.

This remains a licensed distribution of the original compiled runtime and assets with our extension; it does not recover editable original gameplay source. The original Steam install is untouched. Original content is attributable to Stellux Interactive under the developer permission stated by the project owner, and is not covered by our source-code MIT license.

## Developer build

On Windows x64, a prepared pinned player and the local Python 3.12/.NET toolchain build the portable release:

```powershell
.\Build-Portable.ps1 -Direct -RelayConfig .\standalone\rrr-relay.production.json -PlayerPath C:\path\to\prepared\player
.\Verify-Relay.ps1 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -RelayConfig .\standalone\rrr-relay.production.json -Flow -BasePlayer C:\path\to\portable\player
```

The publisher's prepared player supplies licensed original files, cached bindings and loader dependencies. Recipients do not need that source installation. Outputs and full game content stay in ignored `local/`; authored source and sanitized reports are in Git. All scripted driving/lifecycle fixtures require explicit developer flags.

The older [alpha.2 direct/Porthole ZIP](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.2), [alpha.1 Steam-invite mod](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.1) and [stable two-player 0.2.0](https://github.com/DocMorphic/right-right-right/releases/tag/v0.2.0) remain available. The alpha.1 and stable installers require the playtest. See [distribution design](docs/STANDALONE.md), [reverse engineering](docs/REVERSE_ENGINEERING.md) and [test scope](docs/TESTING.md).
