The browser authority and local prediction now share a planar port of the installed
playtest's GoofyCarController. Maps, scenery, sound and network transports are unchanged.

The current browser game applies a requested 20% increase in normal tyre grip
to reduce excessive sliding. The increase blends out as the handbrake engages.
Authority and prediction use the same tuning. The measured native reference
below remains tested without this deliberate gameplay adjustment.

Handbrake follow-up: tyre sampling now uses the measured suspension offsets
(front 1.26m, rear -1.26m, centre of mass .02m forward), rather than assuming
the steering wheelbase describes the physical axles. The original low-speed
Space behavior targets zero yaw and clamps existing yaw even while Space is
held. Local prediction now keeps button-edge timers independent of delayed
authoritative timers, so old held-Space packets cannot partially reapply it
after release. Additional offline measurements covered entry speeds of 8, 12,
20 and 30m/s, long holds, and releasing steering together with Space.
Long-hold stop timing at the intermediate speed still differs from Unity;
these corrections do not establish complete handling parity.

Reference: Steam playtest build 26172243, Unity 6000.3.16f1, GameAssembly SHA256
`b81c064eabebbc0b30af66f9684df3ffbae5e8a515e76a813c95a5ca95158f2e`.
Native method analysis established the force equations and serialized parameters.
An isolated offline MelonLoader probe ran the original controller and PhysX at
50 Hz on level ground, with body pitch/roll constrained for planar comparison.
The installed Steam files were not modified. The small recorded numerical fixture
contains measured movement only, not original executable code or assets.

Restored behavior includes the 150 km/h forward / 28 km/h reverse limits,
14 m/s² tapered acceleration, 18 m/s² foot brake, 1.8 m/s² coasting,
smooth speed-dependent 30°–9° steering, axle slip grip, angular damping,
progressive .42s handbrake engagement and .1s disengagement, speed-gated drift
kick, .7s release carry, and countersteering recovery. Space above 16 km/h
preserves sliding momentum; below it, Space holds/stops the car.

The measured fixture checks acceleration, reverse, coast, foot brake, steering,
Space taps, sustained Space, Space plus foot brake, and countersteer. Straight
speed tolerance is .03 m/s; turns allow 1.8 m/s forward, .65 m/s sideways and
.16 rad/s yaw differences (.22 during the Space-plus-foot-brake stop transition)
over the recorded interval. These are measured
approximations: the browser does not run Unity suspension, terrain contacts or
the complete 3D rigidbody solver. This is not a claim of exact PhysX parity.

For a Mac-hosted LAN server, update both ends together: pull main, run
`npm ci` then `npm run build:client` in `web`, and restart `npm start` after the
current race ends. Both players must reload the page. Updating a public deployment
alone cannot change the local Mac server's authoritative handling.
