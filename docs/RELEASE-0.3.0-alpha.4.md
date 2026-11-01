# Choose two-player co-op or four-player racing

**Two-player co-op is now the default.** One car, one driver, one navigator, one tablet and a shared finish/failure. Choose **4 PLAYER RACE** in the lobby for the existing two-car race.

Everyone downloads **RightRightRight-Standalone-0.3.0-alpha.4.zip**, extracts the whole folder and opens **player/RightRightRight.exe**. Both/all players must update; older versions use a different protocol.

1. Host chooses **2 PLAYER CO-OP** or **4 PLAYER RACE**, then clicks **HOST GAME**.
2. Friends enter the room code and click **JOIN CODE**.
3. At **2/2** or **4/4**, the host chooses a course.

You can change modes in the lobby with the same code. Return to the lobby after a run to change modes. To shrink from four players to co-op, reduce the lobby to two people first. Only the host changes the mode; every client follows it automatically.

No Steam playtest, Steam, Porthole, account signup, port forwarding, Python or setup commands are needed. Unity Relay and DTLS remain configured. Existing forest courses, doors, mud/wiping and loose tablets remain. Four-player mode retains car collisions and tablet stealing.

Two-player native tests cover driving, driver/navigation roles, map privacy, remote door closing, tablet drop/fall, mud/wiping, shared finish, retry and tree failure through live Relay. Lifecycle tests cover restart, return and 2→4→2 mode synchronization. Four-player race checks also pass. These tests use separate game processes on one PC through Unity's servers; separate-PC playtests remain needed.

[Mode report](https://github.com/DocMorphic/right-right-right/blob/standalone/portable-steam/docs/mode-verification-results.json) · [Player guide](https://github.com/DocMorphic/right-right-right/blob/standalone/portable-steam/docs/RELAY-MULTIPLAYER.md)
