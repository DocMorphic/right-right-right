# Verification

The C# extension is compiled against interop assemblies generated from the installed supported build. `Verify.ps1` launches the original Unity player for each additional scene.

Per-stage automated checks:

- Scene can be loaded through the original `NetSession.LoadMap` path.
- Menu is extended to nine map entries.
- Original `EasyRoadsCenterline.TryBuild` accepts the new road.
- MeshCollider probes hit the center of the road at intervals along the entire route.
- The original car is released with a small initial forward velocity in a test-only harness. Its suspension must report ground contact after three seconds, and its height must remain near the road.

The harness temporarily disables the stage/vehicle network bridge and releases grid hold for the local physics check. Normal gameplay does not use these overrides. This verifies local vehicle/road integration, not network authority or a complete timed race.

Reports: `local/playable/UserData/RightRightRight/verification/`, `local/verification-summary.json`, and per-stage loader/player logs under `local/`.

Manual checks still required:

- Complete every route in a two-player timed race.
- Confirm navigator tablet visibility and privacy in both seats.
- Verify invites, joining mid-session, restart, finish, returning to menu, and best times with two separate Steam accounts.
- Assess difficulty, props close to the road, sharp hairpins and scenery at speed.

Build artifacts and original game data are excluded from Git. `tools/prepare_build.py` fails closed for unknown source hashes before creating or changing the destination.

## Baseline 0.1.0 results, 2026-10-25

- Release build: zero warnings and zero errors.
- All six additional stages passed navigator extraction, 609 combined road collision probes, and the local suspension/motion check. Route lengths total approximately 12.5 km. These are historical baseline counts; `verification-results.json` now contains the 0.2.0 results.
- Windows visual check: the renamed title fits; the nine-stage tablet list scrolls; selecting stage 09 through its actual menu button loads its rendered road and original cockpit/characters/scenery.
- Fresh-destination setup completed successfully, including a new portable runtime, IL2CPP interop generation, bootstrap shutdown, compilation, and mod installation.
- Original Steam `GameAssembly.dll` and `globalgamemanagers` hashes remain unchanged.
- The user subsequently reported successful two-account play. Full timed races were not part of the automated checks.

## Version 0.2.0

- Pure geometry test: 128 seeds, repeated-seed determinism, variation between adjacent seeds, at least six 180-degree hairpins and ten hard corners, continuous finite vertices, and separated road/shoulder corridors.
- All six profiles pass 1,815 road collider probes, 12,240 tree-boundary sphere sweeps (including angled exits at both ends), and original suspension contact/movement checks in the native player.
- Each profile passes an actual mud-trigger crossing, native passenger clearing, original networked door opening, reverse rigidbody impact against the trees behind the start, and sideways impact against roadside tree trunks.
- The installed release executable passes an additional native-player run with a fresh Steam-published random seed, including its host acknowledgment, geometry, boundary, mud/wipe, and door checks. Host lobby publication/readback of a fresh course seed is tested through Steam and the original scene loading path. Matching acknowledgments are required from every current lobby member, including the host. This new handshake has not yet been tested with two distinct accounts.
- The self-contained friend installer validates source hashes and delta reconstruction, installs a separate copy, downloads and verifies loader/runtime archives, and installs the precompiled mod without Python, PowerShell, or a local SDK build.
- Boundary collision belongs to the original individual tree trunks. A 1.3 m wide sphere sweep samples both shoulders along the full route to catch gaps between trunks. Full timed runs and course balance remain manual playtests.

## Python setup compatibility fix

- Tested interpreter selection under Windows PowerShell 5.1: an explicit Python 3.12 x64 path works, automatic PATH detection finds 3.12, and an unsupported 3.14 interpreter is rejected before dependency installation. The same version guard rejects 3.15.
- Rebuilt the setup environment in a new version-specific folder; UnityPy and lz4 installed from Windows x64 wheels without a C++ compiler.
- The complete setup and Release build finished successfully under Windows PowerShell 5.1, with zero compiler warnings/errors.
- Added `Setup.cmd` for the ZIP download workflow; its execution-policy setting applies to the launched PowerShell process only.

## Steam installation discovery

- Tested actual Steam-registry discovery and explicit installation-folder selection under Windows PowerShell 5.1.
- `tests/Test-FindGame.ps1` checks a configured secondary library, paths with spaces, escaped VDF paths, a manifest with a different install-folder name, quoted manual paths, missing files, and an absent installation.
- Setup now resolves the game location before installing dependencies and asks for the folder when automatic discovery fails. A missing folder is reported separately from an unsupported build hash.

The final forest visual inspection was stopped by the user with Escape. No completed visual approval is claimed for 0.2.0.
