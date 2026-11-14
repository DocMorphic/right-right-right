# itch.io HTML5 upload

Build from the authorized exported assets in `web/public/assets/`. The script leaves the live Sites/Vercel build in `web/dist/` untouched:

```sh
cd web
node scripts/build-itch.mjs --server https://YOUR-MULTIPLAYER-HOST
```

The upload file is **`local/Right-Right-Right-HTML5.zip`**, relative to the repository root. It contains `index.html` at the archive root, the browser JavaScript/CSS, original game assets and their notices. It contains no native executable or server binary. The separate `local/itch-build/` directory is the extracted browser build, and `local/itch-build-report.json` records sizes, SHA-256 and nested HTTP checks.

On the itch edit page, choose **HTML** as the kind of project, upload the ZIP, and mark it **This file will be played in the browser**. Use click-to-launch fullscreen and keep mobile-friendly disabled: this version requires a keyboard and mouse. itch accepts a ZIP containing `index.html` and requires relative asset paths because games run under a CDN subdirectory. Its current limits are 1,000 extracted files, 500 MB total, 200 MB per file and 240 characters per path. The script enforces these limits and checks HTML, CSS and exported JSON asset references through an actual local HTTP subdirectory. See [itch's HTML5 upload documentation](https://itch.io/docs/creators/html5).

For the explicitly temporary QA build only:

```sh
node scripts/build-itch.mjs --server https://click-circular-wagner-cio.trycloudflare.com
```

That address forwards to the host Mac. The Mac must remain awake with both the game server and tunnel running. The URL may expire or change; this is not permanent multiplayer hosting. The ZIP hosts the client on itch while multiplayer still uses the configured external secure WebSocket server. The current HTTP fallback expects a same-origin backend, which itch does not provide. A blocked or stopped WebSocket service prevents rooms from working. Rebuild with a stable HTTPS server origin when one is available.

Use the same uploaded browser game on both computers, host/join by room code, and press **R** on each occupied seat. These are browser rooms, separate from native Windows/Mac rooms. Audio starts after a user gesture. Final validation still requires playing inside itch's actual iframe, pointer-lock/fullscreen interaction and two-player WSS access; the CLI packaging checks do not establish those browser checks.

Original game content belongs to Stellux Interactive and is used under the developer permission stated by the project owner. Keep `assets/CREDITS.txt` and original font notices in the package; this content is excluded from the adaptation's source-code MIT license. No upload is performed by the build script.
