# Browser gameplay acceptance checks

Run the authoritative full-session checks with:

```sh
node --test server/gameplay-http.test.js
```

The tests create real HTTP clients against the same Worker handler used by the hosted game, backed by real SQLite through the D1 prepared-statement interface. The fixture injects an internal server clock to advance ordinary 20 ms physics quickly. Production uses wall time; requests cannot supply a clock, position, velocity, ownership or hazard override.

The co-op test drives native stage 04, seed 12345, from its normal starting grid to the finish using throttle, steering and wipe input packets. Its controller reads authoritative snapshots and the generated course, with no position/state placement. The observed run covers a 4,739 m route, approximately 4,701 m driven, 406.4 seconds of simulated gameplay, 20,320 physics steps, 4,114 normal input packets and all 26 mud deposits. Both clients agree on the finish. It also verifies same-seed retry and return to lobby.

The four-client race test deliberately places cars/tablets near selected interactions to keep it bounded. Nine such setups are labeled in the test; the controls and subsequent server decisions still travel through HTTP. It covers nonfatal car contact, navigator drive spoof rejection, handbrake/reverse, driver/navigator wiping, doors opening on sustained turns, G closing a door, E dropping/grabbing, loose tablet ejection, the closed-rival-door theft guard, held-tablet protection even with an open door, an open-door steal, an existing tree trunk causing DNF, finish/winner agreement, retry with the same/new seed, a four-to-two-player lobby change, missing-peer pause/resume, host departure/migration and empty-room cleanup. The race finish is placement-assisted; the separate co-op route above is the complete unassisted traversal.

A second no-placement full-route test uses a 650 ms input cadence and arrival-aware feedback. It finishes in 552.95 simulated seconds using 859 input packets and 1,725 HTTP requests. A wall-time regression also completes the normal countdown and drives with actual 650 ms delayed HTTP responses, using neither a clock override nor state placement. Its observed straight-line run remains active, covering about 45 m and reaching over 13 m/s.

A separate comparison checks that a 650 ms input gap gives the same motion as frequent identical inputs, that a long catch-up slice handles expiry at each physics step, and that controls stop accelerating after the bounded 1.5-second HTTP hold expires. WebSocket controls retain their 0.5-second window.

For a deployed full-course check:

```sh
node server/verify-full-course.mjs https://DEPLOYED_URL 1200
```

That script creates its own two-player room, drives with ordinary inputs in real wall time, checks the navigator receives the same result, and leaves its own seats in `finally`. It estimates request latency to predict where the authoritative car will be when the next command arrives. It has no database access, state placement or privileged endpoint. It logs progress every ten seconds and prints no session tokens. Allow roughly ten minutes for the conservative 8.5 m/s controller, plus network delays. The script requires access to the site's API.

These checks validate authoritative gameplay and protocol behavior. They do not establish WebGL screenshot parity, audible playback, frame rate, touch input, or an independent two-computer browser playtest. Tablet privacy is a client rendering rule; browser renderer tests and visual checks cover it separately. All route data is present in the browser application, so this is gameplay visibility rather than a secrecy boundary against modified clients.

The corrected public run passed on 2026-11-14: 557.064 gameplay seconds / 562.1 wall seconds, 3,057 normal input packets, 3,334 HTTP requests before cleanup, all 26 mud deposits, and matching driver/navigator finish times. No state placement, tree deaths or CAS retries occurred. The maximum logged smoothed RTT estimate was 475 ms. [Sanitized results](../../docs/browser-gameplay-verification.json) preserve the earlier failed attempt and the corrected verification scope.
