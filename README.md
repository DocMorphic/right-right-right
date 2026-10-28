# Right, Right, Right — four-player race prototype

This branch contains **0.3.0-alpha.1**: two cars, two people per car, racing the same generated forest road. Cars remain visible and survive collisions with each other. Tree impacts at the original hard-hit threshold cause crew DNF.

The `standalone/portable-steam` branch also contains [portable distribution work](docs/STANDALONE.md): a complete bundled candidate and configurable separate Steam identity. This work is pending an assigned Steam App ID and tester access. It does not change the requirements of the existing public installer linked below.

**[Download the race prototype installer](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.1/RightRightRight-RacePrototype-Setup.exe)** · [Full guide](docs/FOUR-PLAYER-PROTOTYPE.md)

For the stable two-player game, use [release 0.2.0](https://github.com/DocMorphic/right-right-right/releases/tag/v0.2.0) and the [main branch](https://github.com/DocMorphic/right-right-right/tree/main). The prototype has a separate installation folder and desktop shortcut.

## Play with four players

1. All four players install the original **Left! Left! LEFT! Playtest** through Steam, supported build **26172243**.
2. Each player downloads and runs **RightRightRight-RacePrototype-Setup.exe**. No Python, Git, SDK or PowerShell commands are needed.
3. Launch the **Right Right Right Race Prototype** desktop shortcut and keep Steam running. Everyone opens the prototype before accepting the host's Steam invite.
4. Join order assigns seats: host = A driver; first joiner = A navigator; second = B driver; third = B navigator.
5. Wait for **4/4**, then the host selects one of profiles **04–09**. A shared countdown begins after all four scenes are ready.

The first launch generates bindings and can take a few minutes. The installer creates `%LOCALAPPDATA%\RightRightRight-RacePrototype\player` using each player's own installed assets. Original game binaries and assets are not distributed in the repository or installer, and the Steam installation is not patched.

## Prototype features

- Two host-simulated rigidbody cars, four assigned seats, a shared start clock, separate crew finish times and a winner.
- Real car-to-car contacts and cockpit jolts without fatal wrecks from other cars, rocks or the ground.
- Native car, character, cabin, tablet and forest assets. No railings or unrelated scenery.
- 9.5 m roads, with the existing randomized route stretched horizontally to preserve room between nearby sections. Original trees still close side/reverse exits.
- Original windshield mud appearance, with deposits applying independently to both cars and remote wiping.
- Doors opening on hard turns in either direction. Loose tablets can be ejected through an open door.
- Tablet grab/drop and theft: aim and press **E** within three metres. A held tablet is protected. A tablet still in the rival cabin requires its door to be open; tablets already on the road can be collected. A stolen tablet follows its new car's position on the minimap.

Drive with WASD/Space. Use **E** for tablets, **G** to close your door, hold **C** to wipe, **Escape** to unlock/relock the cursor, and **F8** for a host retry. The host can return everyone to the lobby through the HUD.

## Alpha limits

The second driver's controls travel to the host; there is no client prediction yet. Internet latency will affect steering. Four local game processes and four distinct Steam accounts over the internet are separate tests; the internet playtest is still needed.

There is no seat picker, host migration or mid-race joining. Reconnect through the lobby after a disconnect. A lost tablet stays in the world until recovered or the host restarts. The race HUD reports tree DNF instead of opening the original global wreck/end screen, which would stop the other crew's race.

## Build and verify

Developer setup requires the supported Steam player, Windows x64 and Python 3.12. Run `Setup.cmd` to prepare a local player and generated IL2CPP bindings, then run `Build-Release.ps1` to build the mod and self-contained installer under `local/race-installer/`.

- `Verify-Race.ps1`: four isolated game processes using the native Unity transport over loopback; exercises actual remote controls, two-car physics, cabin interactions, fatal trees and finish results.
- `Verify-RaceGeometry.ps1`: all six widened courses, road collider probes, tree-gap sweeps and the four-member Steam lobby/native lobby assignment.
- `tests/RaceProtocol`: sender-to-seat mapping, sequence/replay checks, finite control/aim limits, packet framing and size limits.
- `tests/CourseGeometry`: 128 seeds for repeatability, adjacent-seed variation, hard corners, continuous geometry and separate road corridors.
- `Verify.ps1`: legacy two-player route/hazard checks using the explicit `--rrr-legacy-coop` flag.

Test fixtures use separate player copies under `local/race-test/`; they never patch the Steam installation. `--rrr-race-verify` enables scripted inputs and setup teleports only for verification. Normal play does not use them.

See [the prototype guide](docs/FOUR-PLAYER-PROTOTYPE.md), [reverse engineering notes](docs/REVERSE_ENGINEERING.md), and [feature roadmap](docs/ROADMAP.md). This remains a runtime extension of the installed compiled game, rather than a recovered standalone source implementation.

Code authored here is MIT licensed. Original game content remains attributable to Stellux Interactive; third-party dependencies retain their own licenses.
