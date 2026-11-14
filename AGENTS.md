# User preferences

- Preserve the original tree-lined forest scenery. Fill escape gaps using matching original trees with solid trunk collision.
- Do not add railings, fences, unrelated props, or new scenery. Ask the user before introducing visible additions or changing the visual style.
- Hard randomized roads, hairpins, mud/wiping, native door events, and simpler friend installation are authorized.
- The four-player race prototype is authorized: two visible cars with driver/navigator crews, wider roads, nonfatal car-to-car collisions with physical jolts, fatal tree hits, and loose/stealable tablets through open doors. The user clarified "invincible", not "invisible".

# Mac development

- Current multiplayer source is on `main` and `standalone/portable-steam`. The packaged Unity game is Windows x64; this repository is an extension plus packaging tools, not the original editable Unity project.
- On macOS, read `docs/MAC-DEVELOPMENT.md` and use `python tools/build_from_release.py`. It fetches the pinned public runtime/references and builds the Windows package without a home-PC installation.
- A successful macOS-hosted build does not establish native Mac support or CrossOver playability. Apple Silicon/Tahoe CrossOver gameplay still needs a real compatibility test.
