# Standalone direct multiplayer prototype

Download **RightRightRight-Standalone-0.3.0-alpha.2.zip**, extract the entire folder and open **player/RightRightRight.exe**. This bundles the game files, loader, .NET runtime and bindings. No original playtest install, Python, SDK or setup commands are needed.

Four players, two cars, the existing difficult forest courses, car-to-car collision jolts, tree DNF, mud/wiping and loose/stealable tablets remain.

For internet multiplayer without our own Steam App ID, all four players install the free **Porthole — Local Port Sharing** app through Steam:

1. Host clicks **HOST** in the game, then shares **UDP 7787** in a Porthole lobby.
2. Friends join that Porthole lobby through Steam or its share code and approve the port.
3. Friends click **JOIN** in the game at **127.0.0.1**, port **7787**.
4. Wait for **4/4**, then the host chooses a course.

Porthole runs separately and supplies the Steam invitations/tunnel. LAN/VPN addresses also work directly. The game itself does not initialize Steam. Porthole is free, not bundled or installed automatically: https://store.steampowered.com/app/4963920/

Tests passed with four native game processes: lobby/version/seed agreement, gameplay through UDP proxies, restart and return to lobby. A real four-account internet/Porthole session remains untested. The second driver still experiences host round-trip latency. This is an alpha, with no host migration or client prediction.

[Full setup and troubleshooting](https://github.com/DocMorphic/right-right-right/blob/standalone/portable-steam/docs/DIRECT-MULTIPLAYER.md).
