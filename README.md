# Right, Right, Right

Six new rally stages for the Windows **Left! Left! LEFT! Playtest**, built from the installed player using reverse engineering. Three original stages plus six additional routes, selected from the game's tablet menu.

This is a **runtime extension**, not a standalone source recreation. It runs the original compiled gameplay code and reuses its vehicle, characters, cabin, audio, materials, tree/bush/rock prefabs, navigator, stage timing, and Steam co-op systems. New roads and ground are generated from the route definitions in [`levels/stages.json`](levels/stages.json).

The repository contains the extension source and build tools. Setup copies your installed player into `local/playable`; original game files and recovered project exports stay local. The Steam installation is never patched.

## Play

Double-click `Play.cmd`, or launch the prepared local build with:

```powershell
.\Play.ps1
```

Keep Steam running on an account with access to the playtest. Select **START** to open the nine-stage menu. Invite your navigator using the original lobby controls. Both players need the same extension and route definitions for new stages. Online co-op compatibility has not yet been verified with two accounts.

## Build from a fresh clone

Requires Windows x64, Steam playtest **build 26172243**, Python 3.12, and an internet connection for dependencies. The checked player is Unity **6000.3.16f1**, Steam AppID **5425110**. Setup checks source hashes before writing anything to the destination.

```powershell
git clone https://github.com/DocMorphic/right-right-right.git
cd right-right-right
.\Setup.ps1 -PythonPath 'C:\path\to\python.exe'
.\Play.ps1
```

For a different Steam library, also pass `-GamePath 'D:\SteamLibrary\steamapps\common\Left! Left! LEFT! Playtest'`. Setup downloads pinned MelonLoader 0.7.3, a local .NET 8 SDK, and a portable .NET 6 runtime used by the loader. It generates interop assemblies from your own player and compiles the extension. Allow several minutes on the first run and roughly 2 GB of free space for the player and build dependencies.

## New stages

| Stage | Route | Character |
|---|---|---|
| 04 | Pine Needle | Fast forest bends with a tightening finish |
| 05 | Switchback | Alternating climbing hairpins |
| 06 | Ridgeline | Narrow crests and a downhill finish |
| 07 | Serpent | Continuous S bends and double rights |
| 08 | Long Way Home | Endurance route with a technical return leg |
| 09 | Right Right Right | Three right-hand loops into a final gauntlet |

The original three stages retain their scene data. The six new stages start from isolated copies of scene 1, replace its road and terrain, relocate its start/finish gates, and regenerate scenery using the game's own prefabs. The six new routes currently use the same daytime forest setting. Mud deposits from the original route are disabled in the additional stages because their original positions do not match the new roads.

## Verify

```powershell
.\Verify.ps1
```

This launches each new stage in the actual Unity player, checks native navigator extraction, probes road collision, and releases the original car to verify suspension contact and motion. Reports are written under `local/`. This smoke test does not prove full-route completion or two-account multiplayer compatibility. See [`docs/TESTING.md`](docs/TESTING.md).

After editing `levels/stages.json`, copy it to `local/playable/UserData/RightRightRight/stages.json`. Changes to C# require rebuilding and copying `src/bin/Release/net6.0/RightRightRight.dll` to `local/playable/Mods/` while the game is closed.

## Recovery notes

[`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md) describes the installed files, recovered interfaces, and why this uses the original runtime. A recovered Unity project with stub scripts is not a functional recreation. An independent source implementation of the original game remains outside this extension.

Code authored here is MIT licensed. Original game content remains attributable to Stellux Interactive. No license to original game assets or third-party dependencies is granted by this repository.
