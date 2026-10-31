# Standalone direct multiplayer — 0.3.0-alpha.2

This guide describes the older alpha.2 download. The current [alpha.3 room-code release](RELAY-MULTIPLAYER.md) works online without Porthole; use that guide for the simplest setup.

This download includes the licensed game runtime/assets, the four-player race extension, loader, portable .NET and generated bindings. There is no original playtest installation requirement and no Steamworks App ID to obtain. Extract the entire ZIP; run `player/RightRightRight.exe`.

## Friends over the internet with Porthole

[Porthole — Local Port Sharing](https://store.steampowered.com/app/4963920/) is a separate free networking app. Its developer documents UDP forwarding, Steam friends/share-code lobbies and connecting the game to a forwarded local port. It does not require our game to have a Steam App ID. [Official Porthole explanation](https://porthole.sestudio.org/).

All four players download the same standalone ZIP, install Porthole through Steam, and keep Porthole running during play.

1. Host: open the standalone game and click **HOST**, keeping port **7787**.
2. Host: open Porthole, create a lobby and share the game's **UDP 7787** port. Invite three friends through Porthole's Steam friends controls or send its share code.
3. Friends: join the Porthole lobby and approve the offered UDP port. Leave its local mapping at **7787**.
4. Friends: open the standalone game and click **JOIN**, with address **127.0.0.1** and port **7787**. This is each friend's local Porthole endpoint; do not enter the host's public IP for this method.
5. Wait for **4/4**. The host chooses one of the six courses. The game confirms the same version/course/seed on all four clients before loading and starting the countdown.

If a guest changes the local port mapping in Porthole, that guest enters the new local port in the game's Join field. The host keeps 7787. The three guests can all use 127.0.0.1:7787 on their separate PCs.

Steam invitations take place in Porthole. The standalone game uses its Host/Join controls. Porthole is not bundled, installed automatically or modified by our launcher. The in-game buttons open its Steam page or launch the installed app.

## LAN or VPN

On the same network, friends can enter the host's reachable LAN IPv4 address and UDP port directly. With a VPN such as Tailscale, enter the reachable VPN IPv4 address instead. This route does not use Steam or Porthole. Allow the game's intended network connection if Windows Firewall prompts. Router forwarding is not needed for the Porthole method.

[Tailscale's own private-game-server guide](https://tailscale.com/docs/use-cases/personal-or-at-home-use/share-private-game-server) explains device sharing if that alternative is preferred.

## Game rules and controls

There are four seats total: host = A driver; first joiner = A navigator; second = B driver; third = B navigator. Drive with WASD/Space. E grabs/drops a tablet, G closes the door, C wipes, Escape unlocks/relocks the cursor. Host F8 retries the same seed. **Return to lobby** keeps the direct room together so the host can choose another randomized course.

Both cars share host-simulated physics. Car contacts produce jolts without eliminating a crew. Hard tree hits cause DNF. Tablets can fall through open doors and an unheld rival tablet can be stolen. See [the race guide](FOUR-PLAYER-PROTOTYPE.md) for the underlying mechanics; its Steam/playtest installation instructions apply to the older alpha.1 distribution.

## Troubleshooting and verified scope

- A different-version client is disconnected; download the same ZIP on every PC.
- If Join cannot connect, check that the host has clicked Host, the Porthole lobby is connected, UDP 7787 is offered/approved, and the guest's Join port matches its local mapping. Use **DISCONNECT** before retrying a connection.
- There are no hosted room-code servers in the game. Porthole supplies its own lobby/share code and relay service.
- Host-authoritative controls still have round-trip latency for the second driver. There is no prediction or host migration. After a lost connection, reconnect from the lobby before starting another race.
- Four native game processes passed the real direct lobby/version/seed handshake and full gameplay checks. A second test passed the full race through three bidirectional UDP forwarding proxies. The lifecycle test passed readiness, a same-seed restart and return to the lobby on all four processes. All direct tests assert Steam is not initialized in the game.
- The actual Porthole application with four distinct remote Steam accounts has not been tested. Proxy tests establish the game's UDP forwarding behavior, not end-to-end availability or latency of Porthole's service.

The original game content remains attributable to Stellux Interactive and is distributed under the developer permission stated by the project owner. Original assets/runtime are not covered by the source code's MIT license.
