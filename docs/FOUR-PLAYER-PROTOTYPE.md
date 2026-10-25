# Four-player race prototype — 0.3.0-alpha.1

Two crews race the same generated forest course. Each car has a driver and a navigator. Cars stay visible and survive contact with each other; the host simulates both rigidbodies together so collisions produce an actual shared bounce. Collision jolts reach both seats. Tree impacts at the original game's hard-hit threshold eliminate that crew.

The prototype reuses the original cars, occupants, tablets, doors, materials and forest assets. Roads are 9.5 metres wide, with the route stretched horizontally to leave room between nearby sections. Matching original trees still close the course boundaries. No fences or unrelated props are added.

## Install and join

Every player needs their own Steam playtest access and supported original build **26172243**.

1. All four players download and run **RightRightRight-RacePrototype-Setup.exe** from the same prerelease.
2. Start **Right Right Right Race Prototype** from the desktop shortcut. Keep Steam running. The prototype installs separately under `%LOCALAPPDATA%\RightRightRight-RacePrototype\player`.
3. The host invites three friends using the original Steam invite controls. Everyone must have the prototype running before accepting an invite.
4. Seats follow connection order: host = crew A driver; first joiner = crew A navigator; second = crew B driver; third = crew B navigator.
5. Wait for **4/4** and let the host select profile **04–09**. All four clients must confirm the same pack and seed. The race starts after all four scenes are ready and a shared countdown completes.

The stable two-player 0.2.0 installation and latest stable release remain separate. Original stages 1–3 are not race courses in this prototype.

## Controls and rules

| Control | Action |
|---|---|
| W / S, A / D, Space | Driver: accelerate/reverse, steer, handbrake |
| Mouse | Look around in either seat |
| E | Drop your held tablet, or aim at a nearby loose tablet to pick it up |
| G | Close your own car's open door |
| Hold C | Wipe your own windshield |
| Escape | Unlock/relock the mouse for the race HUD |
| F8 | Host restarts the course with its current seed |
| Return to lobby | Host returns everyone to course selection |

Each navigator begins holding a tablet. Holding protects it from the door-ejection mechanic. A loose tablet can be thrown through an open door and continues as a physical object on the road. Aim and press E within three metres to collect one. Stealing a tablet still inside the rival cabin requires its door to be open; an already dropped tablet can be recovered from the road. A held tablet cannot be stolen. A player carries at most one tablet. A stolen tablet follows the new car's position on its minimap, and the native driver map-privacy restriction remains.

There is one shared start clock and a separate finish time or tree DNF for each crew. The fastest valid finisher wins. The finish requires reaching the end of the route, crossing in the correct direction, remaining within the road width and passing the original minimum-time guard. Rock, ground and car contacts do not cause a fatal wreck in this prototype.

## Prototype limits

- Physics is host authoritative. The second driver sends controls to the host; there is no client prediction yet, so internet latency will affect steering response.
- There is no host migration, seat selection, in-race joining, replay or championship mode. If someone disconnects, return to the lobby and reconnect before starting again.
- A lost tablet stays lost until someone retrieves it or the host restarts. There is no automatic replacement.
- The race HUD reports tree DNF; the original global wreck/end screen is not used because it would interrupt the other crew.
- Four-process local-network verification and four distinct Steam accounts are separate checks. See the test report for the exact verified scope; a four-account internet playtest is still needed.

## Developer verification

`Verify-Race.ps1` uses four separate copies of the installed player under `local/race-test/{host,client1,client2,client3}`. It binds the native Unity transport to loopback for repeatable testing without four Steam logins. The gameplay protocol, seat authority, scene loading and actual host physics are the same race code used with Steam's original transport.

The explicit `--rrr-race-verify` flag enables scripted fixture placement and input clients. Normal play never teleports cars or runs those scripted inputs. The fixture checks independent driving, car contacts without death, mud on both cars, a rejected closed-door theft, a successful open-door theft, dropping/ejecting a tablet, tree-only DNF, a rejected early finish, remote wiping, valid finish timing and results received by all three clients.

The Steam path expands the lobby to four and uses the original Facepunch transport. Custom race state uses Netcode named messages. [Unity named messages](https://docs-multiplayer.unity3d.com/netcode/1.6.0/advanced-topics/message-system/custom-messages/) provides the underlying API pattern; implementation uses the bindings generated from the supported installed build.
