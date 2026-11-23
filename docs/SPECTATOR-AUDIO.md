# Roadside spectator audio

The browser now mixes proximity cheering and short pedestrian impact thuds.
`web/client/spectator-audio.js` consumes the existing deterministic crowd
placements and authoritative `spectatorHits`; it sends no messages and changes
neither server simulation nor map assets. `RallyAudio.setCourse` is called when
the level is built.

Cheering fades within 34 metres while the car moves. Two nearby crowd pockets
can sound simultaneously. The stereo position follows the original driver or
navigator eye offset and that player's head direction. Clip choice and loop
offset use the group and race clock. Hit people stop cheering.

Each hit ID is consumed once per race. Closely spaced crowd hits coalesce over
120 ms, with at most two impact voices. Both seats choose the same variation
and pitch from the authoritative ID; arrival latency does not run another sound
or physics simulation. Very old hit tombstones are silent. Retry clears the
deduplication state. Pause, crash and leaving the level stop crowd voices;
muting does not queue old impacts for later playback.

All effects connect to the existing Game volume bus and master mute. At its
default 50% setting the Game bus applies the original 0.175 gain. The new
cheering and impact multipliers are 0.35 and at most 0.48 respectively, with
distance attenuation. Effects are predecoded and bounded to four simultaneous
voices; the new distributed files total approximately 134 KiB.

## Audio sources

- Cheering: **Crowd Cheer 6** and **Crowd Cheer 2**, Krizin, CC0 1.0,
  <https://freesound.org/people/Krizin/sounds/651645/> and
  <https://freesound.org/people/Krizin/sounds/651642/>. HQ preview recordings
  shortened to approximately 4.5 seconds, converted to mono 44.1 kHz / 96 kbps
  MP3, high-passed at 180 Hz, low-passed at 6.5 kHz, compressed, normalized,
  faded and trimmed by 2 dB.
- Thuds: 0.33-second filtered derivatives of the authorized original game's
  `collision-heavy.wav`. High-pass 70 Hz, low-pass 1.3 kHz, rate variations
  0.88/1.04, 8 dB trim, short fades, mono 22.05 kHz PCM WAV.

Public asset credits are in `web/public/assets/CREDITS.txt`. The reference reel
is research material and is not distributed with the game.

## Verification

- 202 automated tests pass, including distance/stereo changes, duplicate and
  delayed snapshots, both seats' clip agreement, burst limits, retry, old-hit
  suppression, pause/mute, and unchanged native engine/music behavior.
- Local-only `web/audio-qa.html` renders twelve seconds through real browser
  OfflineAudioContexts for both seats, including the native engine and a shared
  crowd impact. Default complete-mix peak: 0.128 (-17.85 dBFS); crowd-only peak:
  0.025 (-32.1 dBFS); Game volume zero renders exact silence. Both seats play
  one coalesced impact and decode all clips. This checks the actual Web Audio
  graph; it is not a subjective speaker or headphone listening test.
- Evidence is stored under ignored `local/crowd-audio/`. Backend and original
  forests, roads and ragdolls are unchanged by this client-only release.
