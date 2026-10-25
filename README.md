# Right, Right, Right

Six difficult randomized stage profiles for the Windows **Left! Left! LEFT! Playtest**, built from the installed player using reverse engineering. Three original stages plus six additional profiles, selected from the game's tablet menu.

Version **0.2.0** adds genuine 180-degree hairpins, tight hard corners, chicanes, working windshield mud/wiping, door events on either turn direction, dense original tree boundaries and closed route ends. The host shares a fresh course seed when selecting a new stage; retrying keeps the same course. Every generated profile has at least six hairpins and ten hard corners. Both players must use the same pack version.

This is a **runtime extension**, not a standalone source recreation. It runs the original compiled gameplay code and reuses its vehicle, characters, cabin, audio, materials, tree/bush/rock prefabs, navigator, stage timing, and Steam co-op systems. New roads and ground are generated from the route definitions in [`levels/stages.json`](levels/stages.json).

The repository contains the extension source and build tools. Setup copies your installed player into `local/playable`; original game files and recovered project exports stay local. The Steam installation is never patched.

## Easy install for friends

1. Install the original **Left! Left! LEFT! Playtest** through Steam. This release supports build **26172243**.
2. Download **[RightRightRight-Setup.exe](https://github.com/DocMorphic/right-right-right/releases/latest/download/RightRightRight-Setup.exe)** and double-click it. Setup finds the Steam game, creates a separate local copy, installs the prebuilt extension and handles runtime dependencies automatically.
3. Keep Steam running and launch the **Right Right Right** desktop shortcut. Both friends open this version before accepting the original game's Steam invite. Wait for **CREW 2/2**, then let the driver choose a stage.

The setup executable is self-contained: players do not need Python, Git, a C++ compiler, the .NET SDK, or PowerShell commands. The first game launch automatically generates bindings and can take a few minutes. Internet is needed for runtime/loader downloads and Steam. To update, close the game and run the newer setup executable. The installed copy lives in `%LOCALAPPDATA%\RightRightRight\player`.

The installer copies each player's own installed assets; no original game binaries or assets are distributed in this repository or setup executable. A tiny hash-verified scene-table delta is applied locally. Unknown game builds are rejected before installation.

## Play from the source checkout

Double-click `Play.cmd`, or launch the prepared local build with:

```powershell
.\Play.ps1
```

Keep Steam running on an account with access to the playtest. Select **START** to open the nine-stage menu. Invite your navigator using the original lobby controls. Both players need the same extension and route definitions. The user reported successful two-account co-op on 0.1.0; the new 0.2.0 seed/acknowledgment protocol still needs a two-account playtest. The host waits for the navigator to confirm the same course pack instead of silently loading different roads.

## Build from a fresh clone

Requires Windows x64, Steam playtest **build 26172243**, Python 3.12, and an internet connection for dependencies. The checked player is Unity **6000.3.16f1**, Steam AppID **5425110**. Setup checks source hashes before writing anything to the destination.

For the ZIP download: install [Python 3.12 (64-bit)](https://www.python.org/downloads/release/python-31210/), extract the repository ZIP, then double-click **Setup.cmd**. After it finishes, double-click **Play.cmd**. Setup.cmd permits scripts only in its own PowerShell process; it does not change your permanent execution policy.

Setup automatically selects Python 3.12 even if `python` normally starts Python 3.15. Other Python versions can remain installed. It uses a separate `local/.venv-py312` environment, so a previous failed attempt does not need to be deleted. The pinned UnityPy dependencies do not support this setup on Python 3.15; installing C++ build tools is unnecessary.

```powershell
git clone https://github.com/DocMorphic/right-right-right.git
cd right-right-right
.\Setup.cmd
.\Play.ps1
```

Setup detects Steam libraries on other drives using Steam's library configuration and the playtest's app manifest. If it cannot find the game, it asks you to paste the installation folder: in Steam, right-click **Left! Left! LEFT! Playtest > Manage > Browse local files**, then copy the folder's address. It must contain `LeftLeftLEFT.exe`, `GameAssembly.dll`, and `LeftLeftLEFT_Data`. Install the original playtest first if it is missing.

You can also supply the folder directly: `.\Setup.cmd -GamePath "D:\SteamLibrary\steamapps\common\Left! Left! LEFT! Playtest"`. Setup downloads pinned MelonLoader 0.7.3, a local .NET 8 SDK, and a portable .NET 6 runtime used by the loader. It generates interop assemblies from your own player and compiles the extension. Allow several minutes on the first run and roughly 2 GB of free space for the player and build dependencies.

## New stages

| Stage | Route | Character |
|---|---|---|
| 04 | Pine Needle | Random technical forest opener; 5.2 m road |
| 05 | Switchback | Tight alternating hairpins; 4.8 m road |
| 06 | Ridgeline | Narrow hard turns; 4.6 m road |
| 07 | Serpent | Random chicanes, hard corners and U-turns |
| 08 | Long Way Home | Long seeded endurance gauntlet |
| 09 | Right Right Right | Maximum technical mix; 4.7 m road |

The original three stages retain their scene data. New profiles start from isolated copies of scene 1, replace its road and terrain, relocate its gates, regenerate original scenery and mud triggers, and close escape gaps with additional original trees and solid trunk collision. They use the same daytime forest setting. Native mud synchronization, wipers, door physics, and door network RPCs are retained. Door events have a cooldown and occur only during a timed race while the driver commits to a turn.

## Verify

```powershell
.\Verify.ps1
```

This launches each profile in the Unity player and checks navigator extraction, full-route road probes and tree-gap sweeps, native suspension, a mud-trigger crossing, native wiping, native door opening, reverse impacts against the trees behind the start, and sideways impacts against roadside tree trunks. Reports are written under `local/`. The pure geometry test checks 128 seeds for repeatability, variation, technical-corner counts and separated road corridors. These checks do not prove full timed runs or two-account compatibility. See [`docs/TESTING.md`](docs/TESTING.md).

To build the friend installer from this checkout after developer setup: run `Build-Release.ps1`. The resulting self-contained executable is written to `local/friend-installer/`.

Further features and research: [`docs/ROADMAP.md`](docs/ROADMAP.md).

After editing `levels/stages.json`, copy it to `local/playable/UserData/RightRightRight/stages.json`. Changes to C# require rebuilding and copying `src/bin/Release/net6.0/RightRightRight.dll` to `local/playable/Mods/` while the game is closed.

## Recovery notes

[`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md) describes the installed files, recovered interfaces, and why this uses the original runtime. A recovered Unity project with stub scripts is not a functional recreation. An independent source implementation of the original game remains outside this extension.

Code authored here is MIT licensed. Original game content remains attributable to Stellux Interactive. No license to original game assets or third-party dependencies is granted by this repository.
