# Native tablet contact comparison

The browser's previous fixed drop point, sideways 90° rotation, invented spin,
rectangular occupant exclusion and timed tip/ejection rule are replaced by a
server-side rigid-body simulation. The existing car handling is unchanged.
The browser interpolates the shared authoritative local pose and quaternion;
it does not download or run the additional tablet physics engine.

## Original evidence

`local/tablet-parity/native-settings.json` and `native-traces.json` were captured
from the pinned original Unity player with a separate local test plugin. The
original gameplay extension was removed from that isolated test copy. The
harness sets known lap poses, calls the original `Release`, parks the car and
uses Unity PhysX to measure contacts. Open-panel and acceleration cases are
controlled fixtures rather than manual playthroughs of the original game.

`CabinHoldable.ForceDrop` at RVA 0x4EB740 adds `forward * 1.6 - right * 0.5 +
Vector3.up * 0.35`; `Release` at RVA 0x4ECE00 adds the car Rigidbody's velocity
at the actual tablet point. The native held tilt is −25° X. Driver and passenger
anchors are independently preserved. The old extension's extra open-door
`right * 2.5 + up * 3.5` impulse is not the original release rule.

Native measured parameters are 0.4 kg, gravity 9.81 m/s², zero linear drag,
0.4 angular drag, 0.26×0.052×0.32 m shell, and continuous dynamic collision.
RW_Notebook uses static friction 0.7, dynamic friction 0.55 and bounce 0.08.
CabinBodyBlock uses friction 0.35 and bounce 0.35 with maximum bounce combining.
`web/shared/native-tablet.json` records those settings and 18 original runtime
colliders: eight cabin boxes and ten torso/leg capsules. The existing,
user-requested visible catch tray is retained as a real collider; it is an
adaptation, not an original native prop.

## Runtime

Rapier 0.21 runs only on the authority, with predictive contacts and six to 32
relative-motion substeps per 50 Hz game tick (see the latest contact update). Source capsules stay capsules, rather than coarse
occupant boxes. Cabin and passenger-door colliders move with the car; the door
panel sweeps about its front hinge. Release inherits linear and turning-point
velocity. There is no automatic sideways launch, parked-door timeout, footwell
teleport or clamp that prevents the tablet rotating.

Opening a parked car's door retains the tablet. Gentle turns retain it; sustained
strong acceleration can slide/tumble it over the actual lip and through the
opening. The existing outside terrain/prop contact path continues after ejection,
now preserving momentum through the open doorway and using the measured tablet
bounce and Coulomb ground friction. It is not a full Unity PhysX implementation.
Pickup, transfer between seats, and closing the door while holding it retain
server authority. Solver worlds are freed on pickup/ejection and finalized if
an abandoned room's tablet is collected.

## Verification

`local/tablet-parity/native-comparison.json` compares controlled native and browser
trajectories. First-second positional RMS differs by approximately 1.9 cm for a
driver drop, 5.3–5.6 cm for parked passenger drops, and 2.6 cm under braking.
Controlled 12 m/s² open-door ejection occurs at approximately 0.48 s versus native
0.72 s; at 24 m/s² it is 0.34 s versus native 0.38 s. Cornering trajectories and
resting angles are still approximate. These measurements are not an exact
physics-parity claim.

Two live browser clients exercised navigator drop, driver pickup/drop, navigator
recovery, driving with a loose tablet and closing a naturally opened door while
holding it. Both maintained approximately 16.7 ms frame-time p95 on Low graphics.
A separate two-WebSocket-client test induces a controlled door/lateral-contact
fixture, compares matching-sequence tablet poses, verifies ejection and uses real
player messages to recover the tablet and close the door while held. The fixture
places the test car near the lost tablet for recovery; it does not claim a manual
full-course or physical India/Germany playtest.

The unchanged original forest/maps remain visible. The new favicon derives from
the same original red car artwork already used in the menu.

## Open-door turn timing update

A further original-player capture added 9, 15, 18 and 30 m/s² lateral loads,
and repeated 9/12/15/24 m/s² loads after one second of settling. Native
`Physics.bounceThreshold` is 2 m/s. Both comparisons use the same geometric
exit: the entire rotated tablet clears the passenger doorway's outer plane.

The authority now preserves a settled friction patch until actual solved slip
breaks it. Static and sliding grip have separate calibrated solver mappings;
source material numbers remain in `native-tablet.json`. The adapter is not a
claim that Rapier coefficients reproduce PhysX directly. Existing slow contact
is not treated as a fresh bouncing impact. Contact slip is measured against
actual solved platform velocity, rather than the next velocity before the
solver applies its traction impulse. New simulation worlds are created at
release, retaining the correct previous car frame for the first moving tick.
No position lock, delayed-release timer or artificial ejection impulse is used.

In the matched captures (50 Hz), the moderate fresh-drop case improved from
0.50 s to 0.62 s versus native 0.72 s; the hard case improved from 0.32 s to
0.40 s versus native 0.38 s. Settled 12/15 m/s² cases now retain the tablet for
all four captured seconds, matching native; previously they ejected after
1.64/0.94 s. Settled 24 m/s² still ejects at about 0.36 s versus native 0.42 s.
A settled 9 m/s² case can still creep out around 3.4 s where native retained it
for four seconds. Timing, trajectories and resting angles remain approximate.

`local/ejection-tuning/` contains baseline/release comparisons, native captures,
test logs and the shared browser run. Two browser clients exercised an abrupt
controlled circular trajectory over the unchanged forest scene. They sent the
ordinary player drop message, saw the same ejection, and received 1,635 matching
car/tablet snapshots, including nine airborne tablet snapshots, without
mismatches. Both maintained frame-time p95 of approximately 16.7 ms or better.
The trajectory is a loopback-only QA fixture, not a manual driving or physical
India/Germany latency test. The server fixture is excluded from deployment.

## Braking and crash contact update

`local/tablet-bounce/` adds original-player captures for fresh/settled braking
loads of 4/8/14 m/s², 2/6/12 m/s abrupt-stop equivalents, and controlled vertical
contact probes. The native captures use original Release and PhysX; abrupt-stop
velocity changes isolate interior collision response rather than claiming a
manual native tree crash. Inertia/COM were measured too and agree with the box
inertia already computed from the original mass and dimensions. Compact source
checkpoints are checked in as `native-tablet-braking.json`.

The old swept CCD against the translated kinematic cabin could produce extra
motion even during constant-speed travel. The current cabin world uses short
predictive contacts and six solver substeps, rising to at most 32 with relative
linear/angular/door motion. This bounds travel through thin panels without the
moving-shell clipping. It does not add drag, reposition the tablet or clamp its
pose. The effective settled friction patch is recalibrated to preserve the
previous turn-capture retention. A predictive/cached contact no longer disables
all restitution before a new fast impact. Original mass, dimensions, damping,
release velocity and material bounciness remain unchanged.

A separate scheduler defect froze loose tablets on the first fatal frame. The
original inspected crash flow holds the crashed car after 0.2 real seconds and
locks controls, but contains no global timeScale write. Ended browser races now
allow a bounded three-second tablet-only settling period, without moving cars,
advancing the result timer, enabling controls or delaying restart. The work stops
after this period; it is not a continuing physics loop on the result screen.

In controlled comparisons, fresh braking trajectories are within about 2 cm RMS
of the original over the first second, and settled abrupt-stop trajectories are
within about 7 cm RMS. These are fixture results, not exact PhysX parity. Strong
vertical tumbles and angular trajectories still differ; in particular the 6 m/s
vertical probe is not a close trajectory match. Forests, maps, visual assets,
car handling and networking inputs are unchanged.

Two independent browser clients exercised a controlled 12 m/s drop, braking and
sudden stop over the original forest scene. At matched sequence numbers, 576
car/tablet snapshots agreed; all 58 sampled post-crash settling poses agreed.
Both views were approximately 60 FPS or better on the test Mac. The first QA
run had a clock mismatch that allowed ordinary input catch-up to step the test
trajectory; that run is excluded. The final loopback fixture freezes its clock
only while receiving commands and is not part of the production bundle.

The packaged authority also passed a separate two-WebSocket-client run on the
original first map using ordinary route-following input, navigator drop, braking
to zero and steering into an actual map tree, with no authoritative placements
or injected motion. It received 300 matching snapshots and 60 distinct settling
poses after the crash. This is one physical Mac, not a two-country latency test.
