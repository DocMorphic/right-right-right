# Online room-code multiplayer

Download **RightRightRight-Standalone-0.3.0-alpha.3.zip**, extract the whole ZIP, and open **player/RightRightRight.exe**. Everyone needs this same version. Game files, runtime and online settings are included.

1. One player clicks **HOST GAME** and shares the room code. **COPY CODE** copies it.
2. Three friends enter that code and click **JOIN CODE**.
3. At **4/4**, the host chooses a course. Keep the host's game open.

No original Steam playtest, Steam App ID, Porthole, account signup, IP addresses, port forwarding, Python or setup commands are required. Unity Relay handles the connection with DTLS encryption and anonymous player sign-in. The default region is Netherlands.

This retains the four-player/two-car race, technical forest courses, surviving car-to-car contact with jolts, fatal tree impacts, doors, mud/wiping and loose/stealable tablets. Join order assigns A driver, A navigator, B driver, B navigator. WASD/Space drives; E grabs/drops a tablet, G closes the door, C wipes, Escape toggles the cursor, and host F8 retries.

**LAN / ADVANCED** keeps the previous direct LAN/VPN/Porthole options. The same room stays connected when the host retries or returns everyone to the lobby. A disconnected host closes the room; create a new one to play again.

Four native player processes passed the actual Unity Authentication and hosted Relay APIs, DTLS connection, race checks, retry and return to lobby. They ran on one PC through Unity's real servers. A four-PC home-network playtest remains needed. There is no host migration, in-race joining or client prediction; the second driver still experiences host round-trip latency. Service availability and the project's Relay usage allowance apply.

[Room-code guide](https://github.com/DocMorphic/right-right-right/blob/standalone/portable-steam/docs/RELAY-MULTIPLAYER.md) · [Verification report](https://github.com/DocMorphic/right-right-right/blob/standalone/portable-steam/docs/relay-verification-results.json)
