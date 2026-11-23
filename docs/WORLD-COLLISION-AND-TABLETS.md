# Terrain, forest and loose-tablet contact

The original first-three-map terrain, tree and prop rendering files are
unchanged. Collision now uses all original 513×513 / 1025×1025 terrain samples
and the exact triangle diagonal used by `terrainChunks`. The browser registers
the height buffers it already loads; the authority loads gzip-compressed copies
in its package. There is no extra browser asset download for collision.

`world-collision.js` also registers the already-rendered background tree trunks
and original low-poly rock/stump meshes. Existing background trees no longer
let cars pass through simply because they were classified as decorative.
Bushes stay decorative. Rock/stump tops remain support surfaces even where
they protrude above a road triangle. Authored road geometry and forest
placements are not moved, replaced or regenerated.

Tree contact sweeps the travelled car capsule rather than checking only its
final point. Actual trees are the only fatal terrain/world collision. Slopes,
rocks and landings never set `dead` or increment `treeDeaths`. Takeoff velocity
comes from the actual surface grade; a missing height outside the authored
terrain produces gravity instead of a floating road-height plane. Six custom
procedural stages keep their rendered road/ribbon support model; they are not
claimed to be original native map exports.

## Tablet

The tablet now uses the original seat-specific lap pose, native release toss and
point velocity, with a server-side rigid-body solver, continuous collision and
source cabin/body proxy shapes. The visible user-requested catch tray remains.
See [the native comparison and remaining differences](TABLET-PHYSICS-PARITY.md).

## Evidence

Ignored `local/physics-audit/` contains source cabin collider measurements,
terrain raycasts, test logs and real multiplayer sound/tablet captures.
Fifteen independent Three.js raycasts against actual rendered original terrain
agree with the collision sampler to within 0.000000337 m. Existing-background
trunk contact, slope landings, void behavior, open-door retention, lateral
ejection, rotating corners and outside sloped settling have regression coverage.

Two independent live browser clients drove past a crowd and hit four people.
Both ran real AudioContexts, produced nonzero crowd/impact PCM, and played the
same impact variants. Crowd audio update cost was approximately 0.2 ms at p95.
The final packaged-server tablet run used Low graphics on both clients on one
Mac, with approximately 16.7 ms p95 frame time and no missing sound clips;
dropping, driving, settling and pickup were verified. This does not establish
physical India/Germany latency or universally lag-free play.

The public Render authority was also exercised through two live browser clients,
with 180 ms added each way for the driver. Both produced drive-past cheering
and the same four impact variants, with no missing clips. Frame-time p95 was
16.7 ms or better on Low; crowd audio update p95 was 0.2 ms. A packet comparison
found 2,895 matching car/tablet/ragdoll snapshots, including 200 active-body
snapshots, with no disagreements. A separate public two-client tablet drop
matched 24 authoritative frames as it fell into the footwell and settled.

Source files, tests and documentation remain local unless separately pushed.
The existing Vercel/Render production services are updated only after checks.
