# Roadside spectators and ragdolls

The browser crowd follows the supplied Instagram reel (`Dfpiq9oIxxa`). Reference footage was sampled at 3 fps and the impact sequence at 30 fps; the local video and frames are research artifacts and are not deployed. People reuse the original game's Casual2 driver/navigator meshes, skin weights and faces, with six clothing palettes (see the follow-up comparison below).

## Hittable roadside placement

`web/shared/spectators.js` places deterministic crowd pockets on all nine courses. Crowds stay outside the road, clear trunks and gates, and have a swept-car approach corridor from the road. The shoulder placement allows car contact before reaching the solid tree line. Parked cars do not trigger a hit; moving cars above 0.5 m/s do. The capsule matches the original car's approximately 1.98 m front extent. Original road meshes, trees, mud and handling remain intact.

## Server physics and synchronization

`web/shared/spectator-ragdoll.js` implements 16 mass-weighted particles per person with distance constraints, torso bracing and elbow/knee bend limits. The authority integrates at 50 Hz with five constraint iterations, briefly using 100 Hz during the first 120 ms of contact, transfers vehicle momentum into the legs/torso, and collides particles against the moving car envelope and terrain. Bonnet/windscreen/roof envelopes are measured from the original GLB; these collision proxies approximate the car surfaces rather than using every visual triangle. Repeated terrain lookups are cached within each substep; final ground contacts are checked again after constraints. Pedestrians never push or kill the car.

`web/server/spectator-terrain.js` samples the original terrain plus exact road triangles. Full-resolution 513×513 / 1025×1025 height samples, background trunk colliders, and original rock/stump geometry are exported by `node web/scripts/export-spectator-ground.mjs` and included automatically by the cloud authority bundler. They are generated authorized asset data, ignored by Git, and absent from the client JS bundle. The browser registers the same collision geometry from assets it already loads. Terrain sampling uses the rendered triangle diagonal; the visual terrain and forest placements stay unchanged.

Snapshots carry quantized authoritative joint positions: 96 binary bytes encoded into 128 base64 characters per body, plus a small ID/time/origin/contact header. `web/client/ragdoll-playback.js` interpolates those poses. The browser does not run a separate physics solver. Contact poses follow each client's presented car transform, so the driver's local car prediction does not leave a body behind its hood. Driver and navigator see the same authoritative joint motion from their respective seats. The former ballistic pose helper remains only for compatibility while an older authority is being replaced.

Physics is bounded to eight active ragdolls and sixteen visible bodies. Bodies fade after nine race seconds, while compact hit tombstones prevent people from standing up again in the same race. Retry clears all bodies and hit flags. The renderer retains sixteen one-draw skinned people; compatible skeletons can share clothing variants so active ragdolls receive priority without adding draw calls.

## Verification

The full suite passes 251 tests, including:

- Deterministic placements on all nine maps, original geometry preservation and car-state comparisons with/without pedestrians.
- Physical bonnet/windscreen contact, roof traversal, joint-length preservation and stable settling without explosive impulses.
- Deterministic collision replay, turning/braking-car collision cases and unchanged car velocity.
- Pose encoding accuracy within 2.5 mm per coordinate, bounded active bodies and payload size.
- Real two-client WebSocket hit/pose agreement and immediate retry cleanup.
- Original skin following physical hip/head/wrist joints, independent skeletons and unchanged cockpit source rigs.
- Identical client interpolation, bounded behavior during packet stalls and retry clearing old poses.

`web/server/verify-spectator-hits.mjs` drives from spawn into a real generated roadside crowd using normal inputs, compares both clients' joint frames and verifies retry. It supports `RRR_HIT_DELAY_MS` and `RRR_HIT_PROFILE`. No state-placement endpoint is used. `verify-wan-multiplayer.mjs` additionally checks normal steering/braking, packet-stall recovery and car/body snapshot agreement under artificial WAN delay.

`web/ragdoll-qa.html` is a local-only visual inspection fixture with bonnet/glass/roof time samples and both cockpit cameras. Its side-camera view keeps the forest visible. The former tree-hiding inspection override has been removed; production forests are unchanged. Proofs and release reports are under ignored `local/ragdoll-proof/`. These automated WAN and rendering tests run on one Mac, not two physical laptops in India and Germany.

Original asset credits and licensing remain unchanged.

## Reel gestures and bend placement

The follow-up comparison inspects full-resolution frames at 6.8/7.1/7.4 and
7.6–9.6 seconds of the same cached 14.51-second, 30 FPS reference. It distinguishes
six visible motifs: overhead clap/open arms; face-height applause with an arms-down
pause; a broad V cheer; narrower raised-arm pumps; sideways leaning applause; and
lower chest-height claps. `spectator-cheering.js` reconstructs those pose/cadence
curves with measured source-rig arm lengths. Phase and small tempo differences
are seeded per person. No exact source animation clip was recovered; the screen
reference does not establish exact 3D curves, timings or authored map coordinates.
The initial runtime animation inventory and inspected frames stay under
`local/spectator-reference/` and `local/spectator-cheering/reference/`.

The original two source skins retain their weights and faces and now use six
clothing palettes, including the yellow and white/brown looks in the reel.
Clapping hands face one another; the raised-arm styles close their fingers.
`initialRagdollPose` samples the same cheer frame at the authoritative hit time,
so server physics starts from that gesture rather than a separate generic wave.
Standing cheers need no added per-frame network payload; ragdoll payloads and
limits are unchanged.

Crowd selection deliberately budgets for bend entry/apex/exit areas, preferring
outer shoulders, reserving extra clearance around low pine canopies, and falling back to the other side if original trunks block the
approach. Each person faces the road at their own location. Tape follows sampled
road curvature and terrain height rather than cutting a straight chord through
the bend. The existing cone/post/tape dressing uses five draws per pocket, with
shared instanced post/cone geometry. No new scenery type, road change or removed
tree is used. People remain outside every road segment, clear the start/finish,
and retain a swept-car approach from the road.

The rendering pool remains 16 one-draw skins and the course cap remains 96 people.
For seed 12345 the original first three maps have 92/95/96 people, including
59/57/58 people in bend pockets. Six style/phase tracks are reconstructed from the
same race time on both clients. Tests cover clap/open/pause transitions, smooth
and reachable joints, deterministic curves, bend placement, shoulder tape and
original map preservation. Two-client normal-input hits on maps one/two, including
160 ms delay each way on the driver, retained matching hood/glass/roof ragdolls and
retry cleanup. Local visual QA keeps the original forest visible.
