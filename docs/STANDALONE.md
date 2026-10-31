# Portable build and independent Steam identity

**Current update:** [0.3.0-alpha.3 online rooms](RELAY-MULTIPLAYER.md) bundles the game and uses Unity Relay room codes without Steam, Porthole or the original playtest. Public production settings are included. The older [alpha.2 direct/Porthole version](DIRECT-MULTIPLAYER.md) remains available. The earlier candidate and native Steam-identity work described below are historical and remain a separate route for a future registered Steam release.

The standalone distribution work is on `standalone/portable-steam`. The existing public alpha installer remains unchanged and still needs an installed playtest. The new portable build is an engineering candidate pending a separate Steamworks application; it is not a released Steam-enabled standalone game.

The candidate bundles the licensed compiled Unity player, original assets, race extension, MelonLoader, portable .NET runtime and cached IL2CPP bindings. A recipient will not need the original playtest downloaded, Python, a .NET SDK or setup-time dependency downloads. It still uses the original compiled runtime and assets under the developer permission stated by the owner. This is a self-contained distribution, not recovered editable gameplay source.

The original Unity build authentication field is removed before packaging. Personal settings, prior game logs, test results, installer markers and development Steam App ID files are excluded. Full game binaries/assets and candidate ZIPs remain under ignored `local/`; they are not added to the public source repository.

## Steam requirement

Right Right Right needs its own App ID, or an appropriate separate application/playtest provided by the original developers. The Steamworks partner must configure its launch executable and packages, and grant all four accounts access. Valve documents that Steam API initialization requires a configured App ID and an account license. Lobby invitations and cold-start lobby parameters are documented in the friends API.

- [Steam API initialization and application context](https://partner.steamgames.com/doc/sdk/api)
- [Steam lobby invites and join callbacks](https://partner.steamgames.com/doc/api/isteamfriends)
- [Steam Playtest and tester access](https://partner.steamgames.com/doc/features/playtest)
- [Steam Direct onboarding](https://partner.steamgames.com/steamdirect)

The builder and launcher reject the original playtest's App ID and Valve's sample App ID as independent identities. A numeric App ID in a file does not register the game or grant a license. Existing playtest-based installations have no distribution configuration and retain their original behavior.

`rrr-distribution.json` identifies the portable build. With a configured App ID, the launcher supplies its Steam context, forwards launch arguments individually and starts the bundled player. The mod redirects the original compiled Steam initialization/restart calls to that configured ID. These bindings compile successfully; a real separate application's online initialization, overlay and invitations cannot be validated until its App ID and account access are available.

## Build

Use a prepared pinned player containing the bundled loader/runtime and generated bindings. The normal alpha installer can prepare this developer-side input. Recipients do not need that installer or original Steam folder.

```powershell
# Engineering candidate: manifest verification and explicit local test only.
.\Build-Portable.ps1 -PrepareOnly -PlayerPath C:\path\to\prepared\player

# After Steamworks assigns a separate application and grants tester access:
.\Build-Portable.ps1 -AppId YOUR_ASSIGNED_APP_ID -PlayerPath C:\path\to\prepared\player
```

The output is a complete folder plus ZIP and SHA-256 checksum in `local/portable/`. Existing output folders are never overwritten. The player launcher is `player/RightRightRight.exe`. A build in `pending-steam` state refuses normal play with a clear explanation; it does not silently use the original playtest's Steam identity. Only the explicit developer local-transport flags run the pending candidate for verification.

For a Steam depot, configure `player/RightRightRight.exe` as the launch executable and upload the entire output folder. Include the original game's required notices and any dependency notices supplied by the developers. Do not upload `steam_appid.txt`; Steam supplies the application context for depot builds. No Steamworks upload or account configuration has been performed by this task.

## Verification

```powershell
.\local\portable\BUILD_FOLDER\player\RightRightRight.exe --verify-package
.\Verify-Race.ps1 -Portable -BasePlayer C:\path\to\portable\player
```

The launcher streams SHA-256 validation of all bundled manifest entries. Pending Steam setup fails with an actionable message. Distribution configuration tests reject original/sample IDs, mismatched content/format and incomplete settings. The four-process test uses the native local transport, both cars, mud, doors, tablet theft/ejection, tree DNF and matching finish results. Portable verification additionally checks that Steam is not initialized; this local result does not claim Steam invitation support without an assigned app.

The candidate passed manifest verification before and after fresh ZIP extraction, archive CRC checks, and all four local race processes. All four report `steam_not_initialized: true`. The complete ZIP is about 185 MiB. Sanitized results and artifact hashes are recorded in [portable-verification-results.json](portable-verification-results.json). Steam-specific hooks are installed only when a portable distribution manifest exists; the no-manifest native startup and course geometry checks also pass. Live Steam service access is not established in this session, so that check does not claim a working online lobby.

Still required: a genuine separate App ID with tester licenses, a four-account Steam session, overlay/invites with the game open, launch from an accepted invite, retry/return to lobby, and confirmation that no original playtest entitlement is required for that separate app.
