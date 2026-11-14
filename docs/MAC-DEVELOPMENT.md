# Build on a Mac; test Windows compatibility separately

The published game is **Windows x64**. There is no native macOS `.app` in the repository or releases. The repository contains our C# extension and packaging tools, not the original editable Unity project. `GameAssembly.dll`, `UnityPlayer.dll` and the original platform assets remain Windows binaries. Publishing the small launcher for `osx-arm64` would not port the game underneath it.

The current source also builds a [complete one-file Windows installer](INSTALLER.md). It uses the independent game's identity and an embedded font for its lobby/HUD. The old playtest installer and Steam installation finder are retired. The [alpha.5 setup EXE](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.5/RightRightRight-Setup.exe) is the complete Windows download.

You can still edit and build the extension, launcher and complete Windows package on an Apple Silicon or Intel Mac. The cross-platform builder downloads a SHA256-pinned published release for the original runtime and managed build references. Your Windows laptop can remain offline.

## Get the current source

The current game source is on **main** and **standalone/portable-steam**. In your cloned repository:

```sh
git fetch origin
git switch main
git pull --ff-only
```

Keep any local work committed before switching branches. Do not reset it to match these instructions.

## One-time Mac developer setup

Install **Python 3.12** and a **.NET SDK, version 8 or newer**. On an M1 Max, choose the **Arm64** Mac SDK; the target game still uses Windows x64. A .NET runtime alone cannot compile the projects. See [Microsoft's Mac installation guide](https://learn.microsoft.com/en-us/dotnet/core/install/macos).

```sh
python3.12 -m venv .venv-build
source .venv-build/bin/activate
python -m pip install -r tools/portable-requirements.txt
```

## Build without the home Windows laptop

```sh
python tools/build_from_release.py
```

The first run downloads the pinned alpha.4 ZIP (about 185 MiB), checks its SHA256, extracts it under ignored `local/portable-base/`, and verifies its manifest. Later runs reuse and verify that cache. The builder supplies the extracted player as `GameDir`, compiles the C# mod on the Mac, cross-publishes the Windows launcher, and invokes the existing packager with the public production Relay settings. There is no Steam lookup or Windows interop-generation step on the Mac.

Each run creates a fresh `local/builds/windows-<timestamp>/player/RightRightRight.exe`, a complete sibling ZIP and a small `.build.json` report. **The output is a Windows game, not a Mac app.** Existing output directories are never overwritten.

For a chosen destination, or an already extracted unmodified release:

```sh
python tools/build_from_release.py --output local/my-build
python tools/build_from_release.py --base-player /path/to/RightRightRight/player --output local/another-build
python tools/verify_portable.py local/my-build/player
```

Edit source, rebuild, test, then commit/push the authored changes. Do not commit `local/`, game binaries, cached bindings, SDK downloads or ZIPs. Both multiplayer players must run compatible builds. Existing Windows-only `Build-Portable.ps1` and native gameplay verification scripts remain available on Windows.

The **Build Windows package on Mac** GitHub Actions workflow also builds and verifies from a standard Apple Silicon macOS 26 runner when relevant source/build files are pushed. It uploads a small build report, not a native Mac game or a playable build. The local command above keeps the full ZIP on your own Mac.

This workflow [passed on an arm64 macOS 26 runner](https://github.com/DocMorphic/right-right-right/actions/runs/43586429691), including a fresh base download, C# compilation, Windows launcher publication, all 638 package hashes, six bootstrap integrity tests, protocol/mode rules and distribution checks. See [the verification record](mac-build-verification.json). This is build verification; it does not run the game under macOS or CrossOver.

## Playing on an M1 Max with macOS Tahoe

Use a Windows package you rebuilt, its complete setup EXE, or the published [Windows alpha.4 ZIP](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.4/RightRightRight-Standalone-0.3.0-alpha.4.zip). On 2026-11-14, the local installer extracted and verified the full package in CrossOver 26.3.0 on Apple Silicon. The user confirmed a game window; runtime logs confirmed the extension, production Relay settings and nine-stage menu loaded. The current font fix selects the embedded LiberationSans font and stops the missing-font warning loop. The user subsequently confirmed that text is visible in the installed build. Alpha.5 subsequently passed scripted native co-op, four-player gameplay and lobby lifecycle checks through real Relay/DTLS on the Mac; see [the release report](RELEASE-0.3.0-alpha.5.md). **Manual keyboard/controller play, full-course driving, graphics performance and separate-computer sessions still need a player test.** See [local checks](local-mac-verification.json). This is partial compatibility evidence, not a complete Mac playtest.

CrossOver supports Apple Silicon; CodeWeavers lists macOS Tahoe support starting with CrossOver 25.1.1. Use its current [free trial](https://www.codeweavers.com/crossover) for a compatibility test before buying anything. This is a Windows compatibility test, not a native port.

1. Install the current CrossOver Mac trial and create a **64-bit Windows 10 or 11 bottle** named RightRightRight.
2. Run `RightRightRight-Setup.exe` inside that bottle to install and create its shortcut. For a ZIP build, extract everything and keep the `player` directory intact.
3. In the bottle's **Wine Configuration → Libraries**, add an override for **version** and set it to **Native, then Builtin**. The bundled MelonLoader bootstrap is `version.dll`; its official Wine instructions specify `WINEDLLOVERRIDES="version=n,b"`.
4. Open the installed **Right Right Right** shortcut, or use **Run Command** for **player/RightRightRight.exe** in a ZIP build. Use D3DMetal for the DirectX graphics backend. `-force-d3d11 -screen-fullscreen 0` are useful launcher options for a windowed test. Do not run the bundled Windows `dotnet.exe` as the Mac's SDK.
5. If it reaches the modded mode/room-code menu, check a two-player session with a Windows friend. The same Relay project and protocol are used, but CrossOver networking/input compatibility still needs this test.

If startup fails, keep `player/Logs/launcher.log` and `player/MelonLoader/Latest.log`, plus a CrossOver run log. Report the last error. The .NET runtime is already bundled; adding unrelated runtime/loader versions can introduce another variable.

## Scripted gameplay checks on a Mac

With CrossOver installed and the RightRightRight bottle configured, the developer runner clones a verified player into isolated test folders and launches the native Windows game processes through real Unity Relay/DTLS:

```sh
python tools/verify_crossover_gameplay.py --base-player local/my-build/player --players 2 --output local/test-coop
python tools/verify_crossover_gameplay.py --base-player local/my-build/player --players 4 --output local/test-race
python tools/verify_crossover_gameplay.py --base-player local/my-build/player --players 2 --flow --output local/test-lobby
```

Choose a new output folder each time. `--bottle` selects a different existing bottle. Each run writes a sanitized `results.json`; raw test folders also contain temporary room codes and local logs and must stay out of Git. These checks exercise native car physics, networking and scripted player actions in headless processes on one Mac. The harness positions cars at hazards and finish points; it does not drive an entire route or test manual keyboard/controller input, graphics performance or separate computers.

Sources: [CrossOver system requirements and trial](https://www.codeweavers.com/crossover), [CrossOver portable-program/Run Command guide](https://support.codeweavers.com/en_US/crossover-mac-user-guide), [MelonLoader's official Wine instructions](https://github.com/LavaGang/MelonWiki/blob/master/docs/gettingstarted.md).

## A native Mac release

A reliable native port needs the developers' Unity project/source and a macOS export, or a suitable developer-provided native Mac build plus compatible mod-loader bindings. This repository cannot reconstruct a signed Apple Silicon game from the Windows executable alone. That is a separate porting project; the cross-platform developer workflow here does not claim to perform it.

## Experimental self-contained Mac app

`tools/build_macos.py` and `macos/Launcher.swift` assemble a separate compatibility app with a bundled ARM64 Wine/FEX runtime, isolated prefix and verified complete game payload. First-launch extraction and prefix setup run inside the app; no CrossOver installation is required. This is an experimental packaging tool, not a released or native Unity Mac game.

The original signed MetalSharp Wine 6.5 runtime enables the 4K-page mode needed by this game on macOS 26.4 or later. Its signature and provisioning profile must remain intact. The unsigned relocatable runtime did not start this game's loader reliably. A headless Mac host using the signed engine passed a [live separate-computer co-op check with native Windows](mac-windows-crossplay-verification.json). The graphical test still shows a blank window: Mullion and DXVK paths are under investigation. Do not upload the current QA app as a playable Mac release.

A public app also needs distribution signing/notarization and complete runtime source/license distribution. No Developer ID signing identity is installed on the current development Mac. The builder deliberately reports `GatekeeperReady: false`, `Notarized: false` and `GameplayVerified: false` for its current QA output.
