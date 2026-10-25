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

## Observed results, 2026-10-25

- Release build: zero warnings and zero errors.
- All six additional stages passed navigator extraction, 609 combined road collision probes, and the local suspension/motion check. Route lengths total approximately 12.5 km. Per-stage counts are in `verification-results.json`.
- Windows visual check: the renamed title fits; the nine-stage tablet list scrolls; selecting stage 09 through its actual menu button loads its rendered road and original cockpit/characters/scenery.
- Fresh-destination setup completed successfully, including a new portable runtime, IL2CPP interop generation, bootstrap shutdown, compilation, and mod installation.
- Original Steam `GameAssembly.dll` and `globalgamemanagers` hashes remain unchanged.
- Full timed races and two-account co-op have not been tested.
