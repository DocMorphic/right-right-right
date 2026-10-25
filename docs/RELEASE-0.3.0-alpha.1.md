# Four-player race — first prototype

Two cars, two people per car, one shared forest race.

- 9.5 m roads with room for both cars and matching original tree boundaries.
- Server-simulated car-to-car collisions, shared physical movement and cockpit jolts. Cars remain visible and survive contact with each other.
- Tree impacts at the native hard-hit threshold cause crew DNF.
- Loose tablets can fall through open doors. Aim and press E to take an unheld rival tablet through its open door, or collect one already on the road.
- Separate crew finish times, a shared countdown and a winner.

All four players run **RightRightRight-RacePrototype-Setup.exe**, then launch the **Right Right Right Race Prototype** desktop shortcut before accepting Steam invites. The prototype installs separately from stable 0.2.0. Every player still needs the original Steam playtest, build 26172243.

Join order: host = A driver; next = A navigator; next = B driver; last = B navigator. Wait for 4/4, then the host chooses profile 04–09.

Controls: **E** tablet grab/drop, **G** close door, hold **C** wipe, **Escape** mouse lock, **F8** host retry. Drive with the original WASD/Space controls.

This is an alpha. Host-authoritative input adds latency for the second driver. Four distinct Steam accounts over the internet still need a playtest. There is no host migration, seat picker or late joining. Tree DNF uses the race HUD instead of the original global wreck screen.

[Full guide and verification scope](https://github.com/DocMorphic/right-right-right/blob/prototype/four-player-race/docs/FOUR-PLAYER-PROTOTYPE.md).
