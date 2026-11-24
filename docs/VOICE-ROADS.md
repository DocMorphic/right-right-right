# Voice Roads prototype

Experimental two-player browser mode. The nine authored stages and
four-player race remain separate and retain their assets and handling.

## Play

Choose **VOICE ROADS · 2 PLAYER** on the browser menu. The GitHub-connected
production project builds the `web` directory from `standalone/portable-steam`.
The multiplayer authority runs the same branch directly on Render, rather than
downloading an older pinned server bundle. Browser checks run in GitHub Actions.
The initial implementation was validated locally before this deployment pass.

## Play locally

From the repository root, install the existing web dependencies with `npm ci
--prefix web`, then build and start the local authority:

```sh
VITE_GAME_SERVER='' VITE_GAME_SERVER_WAKE=false npm --prefix web run build:client
PORT=8790 HOST=127.0.0.1 node web/server/index.js
```

Open `http://localhost:8790/?mode=roadcall` in two browser windows. Host a room,
join using its code, and choose seats. The host can be either driver or
navigator. Both press R at the controls overlay. Navigator presses V or clicks
the microphone button, then allows microphone access. Enable voice before
readying so its first download/warm-up happens before driving.

| Navigator call | Result |
| --- | --- |
| left / right / turn right | Smooth 90-degree bend |
| gentle / slight / bear left or right | Broad 35-degree bend |
| sharp / hard / tight left or right | Tighter 120-degree bend |
| U-turn / hairpin / turn around left or right | 180-degree hairpin |
| straight / go straight / keep going | Straight section |

Backup controls: left/right arrows; Shift + arrow for a sharp turn; hold U +
arrow for a U-turn; up arrow for straight. Only the navigator builds road.
Driver controls, doors, tablet and crash/retry remain the existing systems.

Speech needs HTTPS or localhost. A plain LAN HTTP address can use arrow-key
controls, but browsers normally block microphone access there. Other devices
cannot access a server bound to 127.0.0.1; remote play needs a deployed HTTPS
frontend and the updated authority, not the existing production server.

## Generation and multiplayer

Speech is decoded into a small validated command vocabulary. These are
parameterized curves, not generated 3D assets or a language-model API request.
Continuous sinusoidal curvature blends the entrance and exit of each bend.
The road is five metres wide with 1.5-metre samples. Speech currently supports
nine semantic call types, rather than arbitrary numeric angles or compound
instructions. Repeated, ambiguous and negated calls are rejected.

The server owns the route. It accepts only the navigator's call, with run epoch,
monotonic command IDs, duplicate protection and a short rate limit. Both peers
receive the same deterministic descriptors and seed. Full synchronization
recovers a missing revision. Existing immediate driver prediction remains in
use; voice does not add a server round trip to steering or braking.

Already driven road never changes. Calls append at the frontier, normally
about 100 metres ahead; at least 60 metres or 3.5 seconds of travel are protected.
Calls therefore shape upcoming road, rather than changing asphalt under the
wheels. Silence extends straight. Up to 300 metres can be queued; old chunks
are removed about 360 metres behind the car. There is no fixed finish line.

Forest compilation and speech inference run in separate workers. The renderer
updates preallocated road buffers and pooled instances of the existing six tree
assets; it never reloads the cockpit, tablet, wheel or hands. Collision trees
come from the same deterministic data as the visible forest, including local
prediction. A worker queue retains only its newest pending scenery update.

Voice is optional: its 39 MiB English model and approximately 5.8 MB JavaScript
chunk load only when voice is enabled. Audio stays in the browser; the authority
receives a command enum, not microphone audio or a transcript. A backlogged
recognizer pauses with keyboard fallback rather than accumulating unbounded
audio. Leaving the mode stops microphone tracks and terminates its WASM worker.

## Validation and limits

- Automated tests exercise grammar, ownership, epochs, duplicate calls, rolling
  memory bounds, smooth joins, deterministic replicas, worker buffers, audio
  chunking, cancellation and retry.
- A real two-WebSocket test swaps the host into navigator, drives onto a generated
  right bend using ordinary driver inputs, compares both peers' snapshots and
  forest, requests full route resynchronization and retries. It uses one physical
  machine, not an India–Germany playtest.
- Browser speech QA uses the production-bundled recognizer and 20 prerecorded
  synthetic US/Indian English clips, including unrelated and negated speech.
  This does not establish live microphone accuracy, every accent, background
  noise robustness or performance on an old integrated-graphics laptop.
- This first mode has flat ground and the existing forest assets. It does not
  yet generate elevation, ramps, junction rules, spectators or four-player
  procedural races. Routes can cross themselves; intersection visuals need a
  later design pass. Existing authored modes retain their spectators and terrain.

On the development Mac, a Node benchmark of the worker compilation function
with 437 points and 516 trees took about 1 ms median / 6.2 ms p95. The points-only
prediction function took about 0.05 ms median / 0.52 ms p95 in the same benchmark.
These are local compute measurements, not in-game browser frame-time measurements
or a zero-lag guarantee for every laptop.

Reproduce the browser speech test on macOS after building:

```sh
python3 tools/make_voice_road_samples.py
node web/scripts/voice-road-speech-qa.mjs
```

Open `http://localhost:8850` and click Run speech checks. macOS speech voices
Samantha and Aman must be installed. The generated WAVs stay in ignored `local/`.
Run the complete automated suite with `npm --prefix web test`.

## Research and dependencies

- [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
  documents limited browser availability and implementations that use remote
  speech services. [Brave's implementation issue](https://github.com/brave/brave-browser/issues/2802)
  is why the prototype does not rely on native browser speech recognition.
- [Vosk models](https://alphacephei.com/vosk/models) provides the small English
  model and its Apache-2.0 license. [vosk-browser](https://www.npmjs.com/package/vosk-browser)
  supplies browser WASM recognition in a worker. Model provenance and SHA-256 are
  recorded in `web/public/assets/voice/model.json`; original model bytes are
  repackaged with explicit tar directory entries required by its extractor.
- [Three.js buffer updates](https://threejs.org/manual/pages/how-to-update-things.html)
  supports preallocating geometry and updating draw ranges/attributes.
- [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
  keeps microphone capture/chunking off the render thread. Inference runs in
  Vosk's separate worker. Small PCM chunks cross the main thread without doing
  recognition there.

The dependency is pinned at vosk-browser 0.0.8. Its cold-model `terminate()` path
can dereference an unloaded model, so one isolated adapter terminates its actual
Worker directly. Test this adapter when upgrading the dependency. Its CommonJS
default export is normalized when loaded through Vite. The UUID override resolves
the dependency's transitive audit advisory; the current install audits clean.
