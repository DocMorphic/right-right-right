# Four-player connection reliability — 23 November 2026

The old public authority reproduced the previous failure after a cold start: it accepted all four players, drove normally, then stopped advancing snapshots immediately after the first loose-tablet release at elapsed 51.241 seconds. Independent `/health` requests also timed out during the stall; two sockets reported 1006 around 66.2 seconds wall time before the test cleaned up. The trace is `local/disconnect-diagnosis/cold-public-failure.json`. This was a server responsiveness failure, not merely a camera/interpolation artifact. The old runtime logs showed no JavaScript exception explaining it.

A local profile of the same normal-input four-player sequence recorded a first-drop CPU spike of 771 ms in one wall-clock second, followed by 584 ms in the next, with resident memory temporarily rising to 380 MB. This includes the WASM compiler workload that Rapier initialization alone had not exercised. The previous scheduler also advanced physics for every control packet, as well as its timer; each fractional packet step still incurred at least six native-tablet solver substeps. Catching up as much as two seconds per callback could further monopolize the loop on the constrained host.

## Changes

- Exercise the actual tablet/contact solver before the authority starts listening, moving cold compilation out of a live race. Temporary warm-up worlds are freed.
- Advance WebSocket room physics on complete 20 ms ticks, retain the clock remainder and cap each callback's catch-up at 100 ms. Continuous inputs update immediately but no longer subdivide the solver clock. The HTTP adapter retains its existing cadence and hold semantics.
- Treat inbound game traffic as liveness, allow 30 seconds of silence rather than one missed 10-second pong, and grant a fresh challenge after an observed server-loop suspension.
- Permit a bounded burst of queued controls after a stall while keeping the sustained 100-message/second limit and payload size limit.
- Skip obsolete snapshots during temporary socket backpressure instead of immediately evicting the player. Essential messages retain a hard backlog bound. All four recipients share one snapshot construction.
- Record explicit heartbeat, rate-limit, backpressure and abnormal transport close diagnostics for future incidents.

The CPU/network stall was reproduced; the exact close decision in the historical deployment cannot be reconstructed because it did not log a close cause. These fixes address the observed cold-physics stall and the timeout/burst policies that could turn a temporary stall into lost players. They do not claim to prevent physical network outages or platform process replacement.

## Verification before rollout

All 298 tests pass. New regression cases cover four-player packet pressure, fractional clock timing, bounded catch-up/expired controls, late pongs, a suspended server loop, genuine dead-peer timeout, queued packet bursts and snapshot backpressure. The existing network ejection test now waits for both sockets to observe ejection before comparing their common frames.

A normal-input four-WebSocket drive, theft, dashboard attachment/removal/reattachment and retry passed locally with 1,116 identical common snapshots. A separate 94-second four-player run repeatedly dropped and recovered both tablets 14 times each; the clients deliberately delayed control-frame pongs by 12 seconds and remained connected.

The final deployable package `rrr-server-dc970838656aa3d3.mjs` additionally passed from a fresh process under a simulated 15% execution duty cycle. The test suspended the entire server for 11 seconds while all four clients kept sending controls, then verified continued play, eight drop/recover cycles per tablet, identical shared state and retry without losing a socket. Startup warm-up completed before accepting players. The injected pause is intentionally reflected in its maximum snapshot gap; it is not a normal gameplay latency measurement. See `local/disconnect-diagnosis/throttled-run.json` and `throttled-soak.json`.

These are four automated WebSocket clients on one physical Mac. Public Render verification is recorded separately after rollout. No GitHub push is part of this release.

## Public Render rollout

Deployment `dep-dc21tuc9v7es73c1ljq0` succeeded through the signed-in Brave session. The checksum-verified package is `rrr-server-dc970838656aa3d3.mjs`, SHA-256 `dc970838656aa3d3276dd27d17e07df69c41878f3c56365072b4b691e97924a1`. Render logged the warm-up completing in 14,505 ms before listening; the service reports reliability revision 2. The existing production frontend JS and CSS hashes are unchanged.

The very first four-player room on the new process passed a 123-second live run, including 19 simultaneous drop/recover cycles for each tablet, 2,422 identical common snapshots and retry. No player disconnected. Snapshot arrival gaps were 60 ms p95 and 501 ms maximum; application ping was 63 ms p95 from this Mac. The public proxy does not forward protocol control pings to these clients, so deliberate late-control-pong coverage comes from the raw local WebSocket tests, not this public run.

All 109 independent health probes during the live run succeeded, with a maximum observed response of 395 ms, unlike the health timeouts in the old cold-drop reproduction. Evidence: `public-cold-soak.json` and `public-health-during-soak.json` in `local/disconnect-diagnosis/`. These are observations from one physical Mac, not a measurement between Germany and India.

The subsequent public normal-input theft/mount acceptance passed with 1,113 identical common snapshots, 15 mounted snapshots, original held-tablet protection, aimed removal/reattachment, driver-door closing and retry. The separate four-client drive with driver B artificially delayed 160 ms each way passed with 414 identical common snapshots and approximately 60 ms p95 authority cadence. See `release-public-mount-result.json` and `public-delayed-driving.json`. Synthetic clients deliberately close at test completion; close lines after a successful result in the diagnostic harness are test cleanup.

The public [release verification record](browser-release-verification.json) preserves the test scope, artifact hashes, four-client results and isolated-checkout validation on GitHub; detailed local traces referenced above remain development artifacts.
