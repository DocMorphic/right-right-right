# In-game room codes and modes (alpha.4)

Choose **2 PLAYER CO-OP** (default) or **4 PLAYER RACE**, then **HOST GAME → copy room code → JOIN CODE**. [Download alpha.4](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.4/RightRightRight-Standalone-0.3.0-alpha.4.zip), extract the entire ZIP and open **player/RightRightRight.exe**. Online settings are bundled. Everyone must update; alpha.3 requires four players and uses an older protocol.

The owner supplied a separate Unity project. Four native game processes have passed live Unity Authentication, Relay allocation/join and DTLS binding, with race verification and retry/lobby return. This tests the actual hosted service from one PC; it does not replace a four-PC home-network playtest. [Verification report](relay-verification-results.json).

## One-time publisher setup

No Unity Editor install, Steamworks App ID, player account or service-account secret is needed for this integration. The mod calls Unity's public player Authentication and Relay APIs, then configures the original runtime's native Unity Transport. The original game's cloud project and credentials are never used.

1. Sign in at [Unity Cloud](https://cloud.unity.com).
2. Open **Home → Projects → Create project**, name it **RightRightRight**, answer the audience/COPPA question accurately, and create it. See [Unity's dashboard project setup](https://docs.unity.com/en-us/services/getting-started).
3. With this project selected, open **Development → Products**, find **Relay**, and complete its activation prompts. Do the same for **Authentication** if prompted. Anonymous player sign-in is used; external identity providers and Unity Player Accounts are unnecessary.
4. Keep the environment **production**, unless intentionally using another environment. All players must use the same project/environment.
5. Open project **Settings** and copy **Project ID**. [Unity's Project Settings reference](https://docs.unity.com/en-us/cloud/projects/project-details) describes this field.
6. Give the publisher the Project ID and environment name. These are public application identifiers. Do not send passwords, service-account keys, personal access tokens or player session tokens.

Unity's [published pricing](https://unity.com/products/gaming-services/pricing) lists Authentication as free, and Relay's first 50 average monthly concurrent users as free. Relay bandwidth is a separate allowance: 3 GiB per average CCU, capped at 150 GiB/month. Paid overages have separate rates. Four players are comfortably below the player allowance, but that does not establish their bandwidth use. Measure the actual build before promising cost-free unlimited sessions. Keep the free plan unless the owner explicitly chooses paid service.

## Publisher configuration and build

The release uses [public production settings](../standalone/rrr-relay.production.json): the owner's project, production environment and **europe-west4** (Netherlands). This region was confirmed in the live service's supported-regions response. This prototype does not perform automatic QoS region selection.

For a different publisher's project, copy [the example](../standalone/rrr-relay.example.json) to ignored `local/relay-settings.json`, replace ProjectId and environment, and use a supported region or leave it blank for Unity's default allocation region.

```powershell
.\Build-Portable.ps1 -Direct -RelayConfig .\standalone\rrr-relay.production.json
```

Packaging copies only Format, ProjectId, EnvironmentName and Region to `player/rrr-relay.json`, includes it in the package hash manifest, and keeps personal credentials out of the ZIP. Recipients get these settings bundled; they never edit JSON or run setup commands. A standalone build without this file keeps LAN / Advanced available and explains that online rooms are not enabled.

## Playing a configured release

1. Everyone extracts the full same-version ZIP and opens **player/RightRightRight.exe**.
2. The host chooses **2 PLAYER CO-OP** (one car: host drives, friend navigates) or **4 PLAYER RACE** (two cars: A driver, A navigator, B driver, B navigator in join order).
3. The host clicks **HOST GAME** and shares the code. Friends enter it and click **JOIN CODE**.
4. At **2/2** or **4/4** matching players, the host chooses a course.

Two-player co-op has one car and one tablet. The crew shares its finish time or tree failure. Doors, mud/wiping, tablet dropping and the existing difficult forest courses remain active.

Mode changes belong to the host and happen in the lobby, including after returning from a run. The same Relay allocation/code reserves space for up to three guests, so switching from two-player to four-player mode lets two more friends join the existing room. To shrink a four-player lobby to co-op, two guests must leave first. Every peer acknowledges the new mode as well as the selected course and seed before loading. Mode changes are unavailable during a run. Three-player and solo modes are not supported.

No Porthole, Steam, port forwarding, host IP entry, player login or separate application is required for this flow. Internet access and Relay availability are required. The host must remain in the game. Disconnecting ends that allocation; a new room has a new code. The same allocation survives course retry and return to the lobby. Host migration and in-race joins are not supported.

**LAN / ADVANCED** retains the previous direct IPv4/UDP flow for LAN, VPN or Porthole. Switching from a Relay room resets native transport mode before a direct connection starts. Rooms enforce the selected two- or four-seat cap and current version/mode/course/seed handshake.

## Implementation and validation

- Anonymous player sign-in and session-token renewal are memory-only. Each process launch starts a new anonymous player; permanent identities/profiles are outside this prototype. Requests use ProjectId and UnityEnvironment headers; Relay requests carry that player's token.
- Host allocates three guest connections, starts the native transport immediately, waits for a Relay binding, then requests its code. Clients retrieve allocation credentials using that code. Normal rooms require a DTLS endpoint; there is no silent UDP downgrade.
- HTTP stays on managed tasks. Unity transport and UI run on the game thread. Disconnect cancels pending operations, prevents late task completion from restarting a session, clears the visible code and shuts down transport. Errors distinguish expired codes, forbidden service configuration, rate limits, service failure and timeouts. Response bodies and credentials are never logged.
- HTTP timeout is 15 seconds per request; native binding/connection waits are bounded. Successful responses and credential blobs have length limits. Room codes are validated before contacting Authentication.
- [REST client tests](../tests/Relay/Program.cs) exercise the service boundary with an injected HTTP handler. This does not establish Unity service availability.
- [Verify-Relay.ps1](../Verify-Relay.ps1) drives four native processes using the room-code and gameplay/lifecycle flows. Live production-project tests pass with DTLS. Its separate `-Fixture` mode uses a loopback-only REST/UDP test double with HMAC validation and real native Relay packets. The explicit fixture flags are required to allow plain UDP to loopback; release connections require DTLS. A fixture test is not evidence of hosted service or DTLS availability.

```powershell
# No cloud traffic: loopback REST + native UDP Relay + four-player physics.
.\Verify-Relay.ps1 -Fixture -BasePlayer C:\path\to\portable\player
.\Verify-Relay.ps1 -Fixture -Flow -BasePlayer C:\path\to\portable\player

# Live Unity project: anonymous sign-in, room code, DTLS and four native players.
.\Verify-Relay.ps1 -RelayConfig .\standalone\rrr-relay.production.json -BasePlayer C:\path\to\portable\player
```

Technical sources: [Unity Authentication API](https://docs.unity.com/en-us/oas-player-auth-client/1.0.0), [Relay Allocations API](https://docs.unity.com/en-us/oas-relay-allocations/1.0.0), [Relay message protocol](https://docs.unity.com/en-us/mps-sdk/advanced-config/relay-message-protocol).
