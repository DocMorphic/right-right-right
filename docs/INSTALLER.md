# One-file Windows installation

Download [**RightRightRight-Setup.exe (alpha.5)**](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.5/RightRightRight-Setup.exe). Double-clicking it installs the complete game into the user's local application-data folder, creates Desktop and Start Menu shortcuts, and starts Right Right Right. It does not search for another game, use Steam, download dependencies, or ask players to run commands. Administrator privileges are not requested.

All game files, online configuration, the loader, Windows .NET runtimes and the UI font are embedded. Run the same installer again to verify or repair an installation. A replaced installation is retained in a sibling `.previous-*` folder. Save data is separate from installed files. Setup diagnostics are in `%LOCALAPPDATA%\RightRightRight\Logs\setup.log`.

The launcher opens the game without a terminal window or loader splash screen. Its cached assembly generator runs offline; online multiplayer still uses Unity Relay. The UI uses the embedded LiberationSans font, whose [upstream license](https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE) is included in `Licenses`.

The complete installer is distributed with [alpha.5](https://github.com/DocMorphic/right-right-right/releases/tag/v0.3.0-alpha.5). Older releases retain their original downloads. The EXE is currently unsigned. Native Windows installation and separate-computer multiplayer remain acceptance tests; a CrossOver installation test cannot replace them.

## Build on macOS, Linux or Windows

After the developer setup in [MAC-DEVELOPMENT.md](MAC-DEVELOPMENT.md), run:

```sh
python tools/build_from_release.py --output local/builds/my-release
python tools/build_installer.py --package local/builds/my-release.zip
```

The result is `local/friend-installer/RightRightRight-Setup.exe` and `SHA256SUMS.txt`. The build verifies the package before embedding it. `Build-Release.ps1` performs these same two steps on Windows. `Setup.cmd` opens the locally built complete installer; the retired playtest installer and installation finder have been removed.

The Unity player is named `GameRuntime.exe` with `GameRuntime_Data`. Its company/product settings, app identity and menu labels use the independent game's branding. Required creator and dependency credits remain in `Licenses`. The compiled imported gameplay assembly is preserved for compatibility.

## Publisher checks

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
dotnet run --project tests/PortableInstaller/PortableInstaller.Tests.csproj -c Release -- local/builds/my-release/player
```

On Windows, `RightRightRight-Setup.exe --verify-bundle report.json` checks the real embedded ZIP and all game hashes in a temporary folder without installing or launching. Normal players do not use this flag.

macOS still requires a configured CrossOver bottle; this Windows installer does not produce a native Mac app. See [MAC-DEVELOPMENT.md](MAC-DEVELOPMENT.md) for that setup.
