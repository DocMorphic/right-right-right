# Public multiplayer latency verification — 2026-11-14

The browser client remains on Vercel and the authority on Render Free in
Frankfurt. No host Mac, Tailscale or cloudflared dependency was reintroduced.

## Corrections deployed

1. `NetworkTiming` previously refused to establish a clock fit whenever all
   RTT samples exceeded 250 ms. It now accepts three consistent low-delay
   samples on a long-distance link, while retaining the existing protection
   against a single late/asymmetric pong. A good prior estimate continues to
   reject queued burst samples.
2. Node broadcasts could label a snapshot with the broadcast callback's wall
   time even though the physics state was from the preceding tick. Snapshots
   now carry the last simulated timestamp. Client forecasting includes that
   scheduling gap rather than treating the older car state as newer.

Both regressions were reproduced by failing tests before correction. All
159 tests pass after correction. Vehicle handling and map geometry are
unchanged.

## Public WAN tests

`web/server/verify-wan-multiplayer.mjs` opens independent WebSockets to the
actual Render service and uses the game's real `CarPresentation` predictor.
Ordered queues add bidirectional delay/jitter and repeated downlink stalls,
representing the head-of-line behavior of a stalled WebSocket/TCP connection.
The controller follows original Stage 1 using normal throttle/steering
messages and the predicted car; it does not place cars or patch authority.

| Case | Added delay per direction | Jitter | Downlink stalls | Result |
| --- | --- | --- | --- | --- |
| Delayed navigator, original timing | 180 ms | ±25 ms | 350 ms repeatedly | Driving/retry pass; no long-RTT clock fit |
| Delayed navigator, corrected clock | 180 ms | ±25 ms | 350 ms repeatedly | Pass; clock fit established |
| Delayed driver, both fixes | 180 ms | ±25 ms | 350 ms repeatedly | Pass |
| Four-player race, mixed delays, both fixes | Two fast and two delayed peers | ±25 ms on delayed peers | 350 ms repeatedly | Pass |

Each case drives for 40 seconds, then brakes and retries. Tests assert that
all required seats ready before the countdown, authority remains identical
for matching snapshot ticks, cars make route progress without dying, braking
settles, rendering continues through stalls, and retry starts a new countdown.
Both cars move in the four-player case. The initial four-player harness attempt
incorrectly assumed connection order equaled seat assignment; it failed its
route-distance check. The harness now joins peers in a known order and asserts
each actual assigned seat. No game role-assignment fix was needed.

The two client-clock comparison runs used the same server version and the
same artificial network settings, not an identical recorded packet trace.
Navigator snapshot-age estimation error at the 95th percentile fell from
101.381 ms to 8.789 ms. Its predictor residual at the 95th percentile fell from
0.621 m to 0.431 m. These measure timing/forecasting accuracy, not an equivalent
reduction in input latency. In the later delayed-driver run, measured RTT was
389 ms median / 662 ms at the 95th percentile. All seats in the corrected race
case agreed on more than 930 matching authority ticks.

Reports are under ignored `local/visual-parity/wan-*.json`. The server bundle is
`rrr-server-c3c752347e15f667.mjs`, SHA-256
`c3c752347e15f667e8a40b8ebf571e515ea3e269ba5368245da600a0906b4db5`.
Render deploy: `dep-dbsdn03l550s73867cj0`.
Vercel deploy: `dpl_FUuBFatEHfCMQHYS5NCZGteQ2zXc`.
No GitHub source push was performed.

## Limits of this evidence

All verification clients ran on one Mac, talking over the internet to the
real Frankfurt server. Artificial delay was added locally. These are not
physical India/Germany playtests and do not establish GPU frame rate, identical
ISP routing, human-perceived smoothness, zero latency or uninterrupted service.
Snapshot-age error uses client/server wall time as reference and assumes those
clocks are synchronized. The Free service can sleep after idle or restart;
existing cold-start handling remains enabled.

Independent earlier health probes reached the cloud endpoint from Mumbai,
Bengaluru, Falkenstein and Nuremberg. A real two-laptop India/Germany playtest
has been requested and remains unconfirmed. Both players should reload Vercel
and create a new room before that test.

## Driver input response and follow-up release — 2026-11-14

Deployed client `dpl_2YedGw24oB2wZnQdGx2xVuokSJXb` and Render authority
`dep-dbsea13m8hqs73cgra20`. No GitHub source push was performed.

The driver now records locally simulated controls against sent input sequence
numbers. An acknowledged authoritative state replays the intervening control
history, subtracting the time already simulated on the authority. Only the
resulting pose error is smoothed; steering and velocity are not repeatedly
blended back toward controls from an older packet. Key presses, releases and
window blur send driving controls immediately, alongside the normal refresh.
Navigator ownership, server hazards/finish, stale-input validation and the
Brave same-origin health wake fix remain in place.

The deterministic 50 Hz authority / 60 Hz renderer experiment measured visible
steering response at 360 ms RTT improving from approximately 233 ms to 150 ms
(local updated result 133 ms). This includes the vehicle's steering spring,
not raw keyboard latency. Throttle, brake and handbrake response/release were
also checked at 180/360/600 ms RTT. The baseline and result reports are under
`local/visual-parity/input-response-*.json`.

Two- and four-player public WSS runs each drove for 40 seconds with 180 ms
artificial delay in each direction, ±25 ms jitter and repeated 350 ms downlink
stalls. Driver history replay ran on more than 860 snapshots per driver.
Readiness/countdown, route driving, braking, same-tick state agreement and
retry passed. These are one-Mac synthetic WAN tests against Frankfurt, not
physical India/Germany playtests. Actual player feedback is still required.

The same release adds the requested passenger tablet tray, stable car-relative
loose-tablet placement, actual road-triangle tyre alignment, ramp/crest vertical
motion and nonfatal landings. Tree collision now checks trunk vertical extent
and excludes non-solid placements. Original first-three-stage opening-bend
route tests passed. Handbrake browser tuning engages in .30 s (previous .42 s)
and increases drift turning by 15%; release/low-speed stopping regressions and
the untouched default native handling fixture tests pass. This is browser
handling tuning, not a claim of identical Unity suspension or PhysX behavior.

Volume is directly accessible from the main menu and Esc pause home screen;
independent game/menu/music values update immediately and persist locally.
172 tests passed. Browser verification covered IAB hosting, Brave joining,
both-R countdown, driving/braking/Space, passenger drop into the tray and
pickup, shared retry, main/in-game volume access and volume persistence.
No console errors were observed. Final proof images and WAN reports are under
`local/visual-parity/input-*` and `tablet-catch-live.jpg`.

## Immediate local controls — 2026-11-15

Frontend `dpl_AN2h2Rvuu4H2kw8iqSZ8vpAAwAAb` and Render
`dep-dbsf69m1egvs73dm2qcg` use authority bundle
`e4a532895e5765bcc4f8944936b647e54b721ad388c052816d59123b6cb70d19`.
No GitHub source push was performed.

Browser steering keeps its original speed-dependent maximum angle, grip,
yaw-rate limits, brake force and drift behavior. Its steering spring duration
is multiplied by .45 and its artificial centring dead zone is reduced from
.12 to .015. Default `stepHandling` retains the native fixture settings; browser
authority and prediction share the new response tuning. Braking remains
18 m/s², with normal stop/reverse behavior. The steering wheel starts moving
promptly while the body retains progressive rotation and momentum.

Local rendering no longer waits for the first usable acknowledgement to
bypass its extra whole-pose smoothing. If history is temporarily unavailable,
position still reconciles, but different newly pressed/released controls do
not get their velocity or steering pulled toward the older server command.
Acknowledgements arriving between frames remain usable up to one physics tick
ahead. Remote presentation and authoritative crash/finish decisions are
preserved. Engine feedback now uses the driver's predicted speed; navigator
controls cannot replace it, and hazards, doors and results stay authoritative.

179 tests passed, including first-input-frame steering/braking at
0/180/360/600 ms RTT and four keypress/frame phases, initial missing-ACK
response, release/reversal, stopping/reverse, speed-sensitive steering limits,
low-speed handbrake stopping, original handling fixture traces and the opening
bends of the first three original stages. The aligned 60 Hz experiment's
visible-heading threshold improved from about 150 to 100 ms at 360 ms RTT;
that threshold measures accumulated body rotation, not command-processing
latency. Input feedback began on the first available render frame.

An actual local browser was also connected through a text-WebSocket proxy
adding 180 ms in each direction. A development-only keypress-to-render-submit
probe measured steering at 16.0/24.8/22.4 ms and braking at
23.1/28.7/30.3 ms. These are render-submission measurements, not physical
screen/display latency. The production bundle was checked to exclude the
probe entirely. Records and screenshot: `instant-browser-measurements.json`
and `instant-browser-delayed.png` under `local/visual-parity/`.

Initial cloud stress runs reported large movement steps. A subsequent diagnostic
run spanned an 8.4-hour low-battery sleep/hibernate and is invalid as gameplay
latency evidence. Per-frame diagnostics and a >500 ms test-host interruption
guard were added; gameplay movement assertions were not weakened. The fresh
awake two-player run passed 40 seconds of route driving, braking, agreement
and retry at roughly 384 ms median RTT, with jitter and repeated 350 ms
packet stalls. Its worst measured frame movement was .341 m on the driver
and .414 m on the navigator. Final cloud reports are the `*-awake.json`
artifacts; earlier failed/interrupted reports are retained for the audit trail.
These synthetic one-Mac tests do not establish a physical India/Germany result.

The fresh awake four-player cloud run also passed: both cars travelled
241.33/182.66 m, with 933+ matching authoritative ticks per peer. The delayed
driver had approximately 382 ms median / 621 ms p95 RTT; its maximum measured
frame movement was .248 m. Production browser smoke testing passed IAB hosting,
Brave joining, both-R readiness/countdown and driving/steering/braking, with no
console errors. The development timing overlay is absent from production.
