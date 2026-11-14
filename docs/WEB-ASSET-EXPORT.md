# Original assets in the browser

`tools/export_web_assets.py` reads the authorized original native player directly with UnityPy. It exports the original car, cabin, two seated occupants, tablet, six matching forest species, native start/finish geometry, textures, material settings and all 28 available sounds. It adds no scenery or substitute models.

Original game and asset credit: **Stellux Interactive, Left Left LEFT**. The project owner states that developer permission covers the independently branded adaptation. These generated files are excluded from the repository's source-code MIT license. Keep the generated `CREDITS.txt` with packaged browser assets.

```sh
.venv-build/bin/pip install -r tools/web-assets-requirements.txt
.venv-build/bin/python tools/export_web_assets.py
```

The default input is the prepared alpha.5 player under ignored `local/builds/`; `--runtime` accepts another prepared native data directory containing `level1`, shared assets and resource sidecars. `--output` defaults to `web/public/assets/`, whose generated contents are ignored by Git. Exporting is a development/package step required for a fresh source checkout; generated models, textures, audio, fonts and manifests are excluded from GitHub by `web/public/assets/.gitignore`. The browser needs no Unity runtime, Python or asset tools after packaging.

`manifest.json` supplies URLs, source object IDs, mesh bounds and counts, material inventory, native seat/head/door/wiper anchors, original tree trunk capsule dimensions, audio names and URLs, terrain layers and original fog/lighting settings. Asset dimensions are meters, with +Y up and +Z forward. Unity's X axis is reflected, triangle winding reversed and texture V flipped for glTF. Native authored tree import rotation/scale is included; do not rotate trees again. Car and tablet dimensions already include their native import scale.

`--ui-only` updates only `fonts/`, `ui/` and the manifest's corresponding sections. The exact embedded LiberationSans TTF is read from `resources.assets:91` and its existing OFL notice is copied unchanged. Native `GameSkin` is decoded from `unity default resources:11000`; all 8,488 serialized bytes are accounted for. `ui/GameSkin.json` preserves its 20 standard styles, three custom styles, eight states per style, original background textures, text colors, nine-slice borders, padding, margins, alignment, wrapping, clipping and selection/cursor settings. The 26 native control textures are exported losslessly as PNG. Browser menus can use these original images as CSS border images and the supplied native metrics rather than approximating Unity's default controls. Font import size is 16 px; style size zero inherits the font size. `src/GuiFonts.cs` applies this exact font to the native runtime's skin.

The original cabin font, Share Tech Mono Regular, is also exported byte-for-byte from `resources.assets:87` with its [upstream OFL notice](https://github.com/google/fonts/blob/main/ofl/sharetechmono/OFL.txt). Native `CabinFont.Font` loads this resource for the dashboard and tablet's timer. `manifest.ui.cabinCamera` records the source cabin camera's 90° FOV, 0.01 m near plane and 1,000 m far plane.

`ui/TabletMinimap.json` and `manifest.ui.tablet` decode all 168 bytes of the native tablet component's serialized settings: 75 m orthographic size, 0.4 look-ahead fraction, 512-square render texture, 1.35 road width multiplier, white route, gray triangle/black outline and olive-brown map background. The native display has no Canvas/TMP hierarchy or title header. Its timer is a separate 3D `TimerWindow` parented to the tablet, with original dark plate, four orange rim cubes and Share Tech Mono TextMesh. Native runtime screen layout, timer transforms, font size/alignment, `m:ss.s` formatting and privacy settings were recovered from the pinned native IL2CPP methods and metadata (`BuildTimerHud` RVA `0x50E2A0`, `UpdateTimerHud` `0x5109F0`, `LayoutScreen` `0x50F770`, `CabinFont.Font` `0x4E9650`). These transforms are in the native Unity tablet-local coordinate system; browser code applies the same X reflection as the mesh export. The source scene's initial tablet quad differs from its runtime layout, so clients must apply the exported runtime transform.

The browser UI and gameplay are reconstructed from the native mod source and recovered settings; extracting original assets does not establish exact runtime rendering, physics or screenshot parity. The [verification report](web-asset-verification.json) distinguishes format/asset-preview checks from remaining final-game visual comparison. Browser rooms are a separate service from the native Unity/DTLS rooms.

The 397-node car GLB retains original hierarchy and door/steering pivots. The two original skinned occupants are baked to their native scene's seated bone pose; this preserves the existing seated shape without requiring a Unity animator in the browser. Meshes retain vertex normals, tangent vectors, UVs, material submeshes and vertex colors. Color textures are PNG in sRGB, normal maps use linear RGB. Material color factors are converted from Unity's serialized sRGB values to glTF linear values. Collider data is attached to each relevant node's `extras.colliders`.

The car's native `Car_Glass` shader implements mud procedurally; the source contains no mud bitmap. Its source color/noise/opacity settings are in `manifest.mud`. A browser shader can reuse those parameters with the original windshield mesh. Dynamic tablet map rendering also remains browser behavior attached to its original `Screen` mesh. Unity text rendering and custom shader programs are not portable glTF features.

For a visual diagnostic, serve the repository root and open the included preview:

```sh
.venv-build/bin/python -m http.server 4174
# http://localhost:4174/tools/web_asset_preview.html
```

The preview shows the original car and trees beside a view from the original driver's eye. The preview requires `npm install --prefix web` for Three.js and performs no gameplay or network work.

Format references: [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [Unity material property color handling](https://docs.unity.com/en-us/engine/6000.6/manual/materials-and-shaders/shaders/writing-custom/shader-writing/writing-shader-change-properties/sl-properties-in-programs), [UnityPy project](https://github.com/K0lb3/UnityPy).
