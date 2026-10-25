# Build recovery and extension design

Inspected on 2026-10-25 against the user's installed Steam playtest. Developer permission was stated by the user.

## Evidence

- Steam AppID 5425110; installed build 26172243.
- Unity 6000.3.16f1, Windows x64, IL2CPP metadata version 39.
- `GameAssembly.dll` contains native gameplay code. There is no editable Assembly-CSharp source assembly in the installed player.
- BuildSettings names four scenes: `Menu`, `1`, `2`, `3`; serialized files are `level0` through `level3`.
- Original scenery uses EasyRoads3D road meshes, terrain, and baked roadside props.
- `level1` contains 9,310 GameObjects. The other stage scenes contain 31,596 and 14,728. Counts are recorded in `build-inventory.json`.

## Tools and results

1. UnityPy 1.25.4 reads built-in object types and BuildSettings. Game MonoBehaviour fields have stripped type trees, so generic MonoBehaviour reads are insufficient.
2. Il2CppDumper 6.7.46 rejects metadata version 39. It is not part of the extension build.
3. Cpp2IL 2022.1.0-pre-release.21 successfully recovers type/method metadata and dummy assemblies.
4. AssetRipper 2.0.0 exports scene hierarchies, prefabs, textures, meshes, audio, and C# interface stubs. The export is retained locally under `local/recovered-project`. Stub methods do not implement the game's behavior. Exported dummy shaders also cannot be assumed visually equivalent to the original shaders.
5. MelonLoader 0.7.3 generates usable IL2CPP interop assemblies and loads the extension in the original player.

Primary tool sources: [UnityPy](https://github.com/K0lb3/UnityPy), [Cpp2IL](https://github.com/SamboyCoding/Cpp2IL), [AssetRipper](https://github.com/AssetRipper/AssetRipper), [MelonLoader](https://github.com/LavaGang/MelonLoader).

## Recovered interfaces used

- `MainMenu.maps`: serialized map entries containing display names, scene names, and button references.
- `NetSession.LoadMap`: original scene loading and network flow.
- `StageController`: start point, finish line, vehicle, ready/countdown/racing/finish phases.
- `StageStartPoint.GetSpawnPose` and original stage triggers.
- `GoofyCarController`: original suspension, grip, steering, braking and grid hold.
- `TabletMinimap.roadMesh`: original navigator display source.
- `EasyRoadsCenterline.TryBuild`: converts paired road vertices to navigator samples.
- `RoadsideDecorator.Generate`: regenerates the original trees, bushes and rocks along the replacement road.

## Implementation

`prepare_build.py` validates the supported original hashes, copies the player, appends six scene paths to BuildSettings, and creates `level4` through `level9` from the original `level1`. Unity then exposes unique scene names to its normal scene and networking APIs. The originals are untouched in the Steam install and retained in the copied player.

The menu patch runs before native `MainMenu.Start`, adds six cloned map buttons, publishes a course seed, waits for matching crew acknowledgments, then calls the original `MainMenu.LoadMap` method. The existing scroll layout handles all nine entries. Stage generation runs before native `StageController.Awake` in the six appended scenes. Other original scenes bypass stage generation.

Version 0.2.0 uses a deterministic xorshift generator to compose circular 180-degree turns, hard corners and chicanes, with clearance between modules. Legacy authored spline sampling remains available for non-procedural profiles. The road retains the original mesh's paired left/right vertex topology and winding. Ground follows the nearest route segment and uses an original terrain texture.

The extension reconnects the original navigator to the new road, moves the original gates/triggers and spawn pose, and regenerates props with the native decorator. Physics layer 13 is retained on the replacement road. Neither the vehicle nor cabin is rebuilt. New scenery generation is deterministic from route points and seeds.

Native mud triggers are cloned onto the new centerline and retain the original networked windshield/wiping behavior. Host-only turn scheduling calls the original CabinDoor.RequestOpen RPC path. The native front tree lane uses the same original prefabs, materials and scale range. A spatial lookup of actual trunk positions fills gaps along both road shoulders. Offset model pivots are corrected so the trunk closes the intended gap. Boundary trees retain individual trunk colliders but have their breakable component removed. Additional matching trees close the start/end openings. There are no railings or invisible collision walls.

The SteamLobby nullable field needs special care: IL2CPP boxes a populated Nullable<Lobby> as Lobby, while the generated accessor labels the wrapper Nullable<Lobby>. Reading its Value/HasValue accessors yields invalid data. CourseSession checks the actual native class and unmarshals the boxed blittable Lobby. Lobby member IDs are read through SteamMatchmaking's native indexed API, avoiding generic enumerator marshaling.

The friend installer embeds the extension, definitions, expected hashes and a tiny delta (269 inserted bytes) for the pinned original scene table. It reconstructs and verifies the patched table locally. The installer does not contain original assets and does not require Python or the SDK. Its .NET 8 runtime is self-contained; the game loader's portable .NET 6 archive and MelonLoader are downloaded from official sources and checked against pinned hashes.

## Four-player prototype architecture

Version 0.3.0-alpha.1 clones the original bound car, occupants and tablet into a second crew after scene initialization. The original binder's clone-time global occupant search is suppressed. Network identities on the clone are removed; the original Netcode connection and Steam Facepunch transport carry custom named messages for both cars. The host simulates both native vehicle controllers, validates each sender's assigned seat and replicates poses, controls, doors, mud, impacts, tablets and results. Clients interpolate replicas. There is no client prediction.

The original two-player connection callback and join flow are replaced for the four-seat mode. Steam lobby capacity is four, and lobby mode/version plus pack/seed acknowledgments gate the start. The installed IL2CPP bindings cannot marshal the non-blittable connection approval request delegate, so the prototype caps connected clients in the connection callback and waits for four matching ready messages. Native lobby assignment validates the Nullable field layout and readback before proceeding.

Tablet authority, ejection, theft and per-crew clocks are implemented independently of the original one-car bridge. Native tablet geometry, map rendering, hand IK and materials remain. Native body proxies are excluded from tablet contacts so a loose tablet can actually exit an open door. Creating the second map rig clears its layer from existing cameras, so each map camera explicitly restores its own layer mask. Camera privacy and head visibility are set for each of the four seats.

Car contacts retain actual rigidbody response and trigger replicated cockpit jolts. Only tree contacts above the original hard-hit threshold cause crew DNF. One crew's DNF does not invoke the original global end screen, allowing the other crew to finish. Developer-only fixtures and render captures require explicit command-line flags.

## Limits

- This is a version-specific extension dependent on the original player and Steam access.
- It does not recover working original gameplay C# method bodies or produce a standalone Unity source recreation.
- The recovered Unity project is an inspection artifact, not a buildable source release.
- New scenery uses a generated ground mesh and the original forest prefabs; the original terrain heightfields are replaced for new stages.
- Environmental variety, full-route race completion, difficulty balance, and the new 0.2.0 multiplayer handshake need further playtesting. The user confirmed baseline 0.1.0 co-op.
- Existing save/best-time behavior is inherited from the original game and has not been audited for new scene names.
- No Steam entitlement checks or authentication mechanisms are removed or bypassed.
