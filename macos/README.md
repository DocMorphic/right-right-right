# Experimental Mac launcher

This is a native ARM64 launcher for an isolated, bundled Windows compatibility runtime. It is not a Unity macOS export and is not yet a playable public release.

The launcher verifies the complete game payload, automatically extracts it into Application Support, prepares its own Wine prefix and runs the game. It does not use an installed CrossOver application or bottle. Its runtime remains inside the app bundle, and game data stays outside the signed bundle.

Local QA assembly:

```sh
python3.12 tools/build_macos.py \
  --package local/builds/RightRightRight-0.3.0-alpha.5.zip \
  --engine /absolute/path/to/MetalSharp-Wine.app \
  --output 'local/mac-app-qa-new/Right Right Right.app'
```

Use a new output directory. The builder accepts an original signed engine app or a relocatable engine folder; the folder variant has not successfully initialized this game's loader. Source/runtime licensing and production signing/notarization are separate release requirements.

The signed ARM64 MetalSharp Wine 6.5 ZIP was verified against its published SHA256 `f6a6fbf5779a4fe5906170202b00f79e71c612fea3af095cc4fdb6a65d9508b8`. Its original inner app signature and provisioning profile are retained. The working 4K-page configuration requires macOS 26.4 or later. The raw 16K-page engine did not start this game reliably.

A headless ARM64 Wine/FEX Mac host and a native Windows GitHub Actions guest completed two co-op rounds over real Unity Relay/DTLS. See [the verification report](../docs/mac-windows-crossplay-verification.json). This does not verify graphics or manual input. The user confirmed a blank graphical window with both the default Mullion route and DXVK. Disabling MoltenVK's sampler LOD-bias emulation fixes a specific DXVK shader compilation error, but did not fix the blank window. GDI presentation and Unity single-threaded-rendering diagnostics also failed to produce a usable menu.

The current build report intentionally records `GameplayVerified: false`, `GatekeeperReady: false` and `Notarized: false`. Do not distribute this QA app as a working Mac download. No Developer ID signing identity is installed on the development Mac.
