# Browser gameplay acceptance checks

Run the authoritative full-session checks with:

```sh
node --test server/gameplay-http.test.js
```

The tests create real HTTP clients against the same Worker handler used by the hosted game, backed by real SQLite through the D1 prepared-statement interface. The fixture injects an internal server clock to advance ordinary 20 ms physics quickly. Production uses wall time; requests cannot supply a clock, position, velocity, ownership or hazard override.

The co-op test drives native stage 04, seed 12345, from its normal starting grid to the finish using throttle, steering and wipe input packets. Its controller reads authoritative snapshots and the generated course, with no position/state placement. The observed run covers a 4,739 m route, approximately 4,701 m driven, 406.4 seconds of simulated gameplay, 20,320 physics steps, 4,114 normal input packets and all 26 mud deposits. Both clients agree on the finish. It also verifies same-seed retry and return to lobby.

The four-client race test deliberately places cars/tablets near selected interactions to keep it bounded. Nine such setups are labeled in the test; the controls and subsequent server decisions still travel through HTTP. It covers nonfatal car contact, navigator drive spoof rejection, handbrake/reverse, driver/navigator wiping, doors opening on sustained turns, G closing a door, E dropping/grabbing, loose tablet ejection, the closed-rival-door theft guard, an open-door steal, an existing tree trunk causing DNF, finish/winner agreement, retry with the same/new seed, a four-to-two-player lobby change, missing-peer pause/resume, host departure/migration and empty-room cleanup. The race finish is placement-assisted; the separate co-op route above is the complete unassisted traversal.

For a deployed full-course check:

```sh
node server/verify-full-course.mjs https://DEPLOYED_URL 1200
```

That script creates its own two-player room, drives with ordinary inputs in real wall time, checks the navigator receives the same result, and leaves its own seats in `finally`. It has no database access, state placement or privileged endpoint. It logs progress every ten seconds and prints no session tokens. Allow roughly ten minutes for the conservative 8.5 m/s controller, plus network delays. The script requires access to the site's API.

These checks validate authoritative gameplay and protocol behavior. They do not establish WebGL screenshot parity, audible playback, frame rate, touch input, or an independent two-computer browser playtest. Tablet privacy is a client rendering rule; browser renderer tests and visual checks cover it separately. All route data is present in the browser application, so this is gameplay visibility rather than a secrecy boundary against modified clients.
