# Browser four-player race audit — 21 November 2026

This concerns the browser game, independently of the older Windows/Steam race prototype.

## Roles

In a lobby, choose an empty seat or explicitly swap with an occupied seat. A swap only exchanges the sender and that seat's occupant. Anyone can choose their own role; host permissions stay with the hosting player's identity. Roles are locked during a race. Readiness resets after a change, and all four players press R on the controls overlay before the initial countdown. Retry starts another countdown without repeating readiness.

The authority advertises `seatSwaps: true`. The client enables occupied-seat swaps only when this capability is present, permitting the client and server to roll out separately. The older authority still supports moving into an empty seat. Original clients remain compatible with protocol version 1.

Crew A retains the source red/blue outfits. Crew B uses gold/teal clothing and helmet shells on the original rigs. Faces, visor/decal details, skinning, car assets and forest geometry stay intact. Helmet remapping preserves neutral texture details, uses a shared shader variant with per-material colour uniforms, and adds no geometry or draw calls. Native cabin lighting preserves that shader variant's cache key.

## Tablet stealing

- E drops the tablet currently in your hands. Free your hands before attempting a pickup.
- In four-player races, drivers use G to open/close the original driver door. Navigators retain their passenger-door closing controls. Two-player controls stay unchanged.
- Only a driver can steal a rival tablet. Look at a loose tablet within three metres and press E. The driver's own door must be open at least 45 degrees. A reach to an in-cabin tablet must also pass through the rival passenger's doorway, opened more than 45 degrees. Wrong-side, dashboard and roof reaches are rejected.
- Held tablets cannot be stolen. A loose tablet outside the rival car no longer requires that car's passenger door, but the stealing driver must still reach out through their own open driver door.
- An aimed tablet takes priority over the nearby lap pickup fallback. Own-car tablet retrieval is unchanged.
- Ownership/carrier changes are authoritative. All players receive the same timed snatch event. The original driver's outer arm briefly reaches toward the opening and returns to the wheel, preserving native bone lengths and steering responsiveness. This is a short gesture, not a hand stretched across the entire three-metre pickup range.
- The original driver door swings outward; both native cabin side walls now have matching hinged tablet colliders. An open driver doorway permits physical tablet ejection. Existing passenger-side release/friction/bounce calibration remains intact.
- After theft, the minimap follows the new carrier car. Driver map privacy remains in force. Closing either door does not release a held tablet.

The authority advertises `driverDoors: true`. The new client only sends driver-door actions when this capability is present. The Render authority now advertises this capability; the driver-door/theft feature is live (22 November 2026).

## Collisions and people

Car-to-car contacts remain visible, nonfatal and authoritative. Cars separated vertically do not have phantom XZ collisions. A collision displacement is checked against solid trees in the same tick. A real tree hit can eliminate a crew; ground, grass, slopes and car contact alone do not.

Both cars can hit spectators. The authority simulates bodies against both cars and sends identical joint poses to all clients. Per-player rendering and audio use the current seat/team rather than the host's identity.

## Evidence and limits

Ignored evidence is in `local/four-player-audit/`:

- `routes.json`: both cars finish all nine stages through ordinary driving inputs, zero state placements, 328,768 input packets. This is a deterministic service audit with four memberships. The second feedback driver takes a passing line around the first car stopped at the finish; it does not change the course.
- `network-tests.log` / `final-targeted.log`: four real WebSocket connections exercise role changes, both driving authorities, nonfatal car impacts, closed-door protection, loose-tablet stealing, closing while holding, crew B crowd impacts, common snapshot/joint agreement and retry cleanup. Proximity fixtures place actors to isolate contacts; no placement endpoint ships.
- `packaged-live.json`: the packaged authority accepts four WebSocket clients and ordinary inputs with 160 ms artificial delay each way for driver B. Both crews move, navigator driving is rejected, tablet drop/recovery matches across all clients, and host-as-navigator can start/retry. It records 403 identical snapshot frames and a roughly 70 ms p95 server state interval in this run.
- `browser-results.jsonl`, `visual-a.png`, `visual-b.png`: actual original forest/car rendering with both palettes, no WebGL errors, and both original tablet assets. Separate menu acceptance uses the real menu controller/network with 3D/audio stubbed, testing host swaps into navigator and the other crew, four readiness labels, and a 1024×600 lobby without scrolling.
- `full-tests.log`: 269 tests passed. Subsequent targeted shader-cache/contact assertions also pass.

These runs use one physical Mac. They do not establish performance on four physical laptops or real India–Germany network conditions. The source-identity tests preserve the original first three maps; the other six remain their existing courses.

The Render rollout must be verified independently of these local results. The staged bundle and build command are recorded in `local/four-player-audit/render-service-settings.json` and `render-build-command.txt`; their existence alone does not mean the new authority is live.

## Rollout status for this audit

The client is live at https://right-right-right.vercel.app. Production verification confirms the host can choose an empty navigator seat and the next joiner becomes driver. Crew B colours, individual four-player readiness and race winner labels are client changes. The production authority still does not advertise occupied-seat swaps. The new authority bundle is publicly staged with its verified SHA-256; the occupied-seat swap and physics fixes await the one-time Render dashboard rollout. Computer use reports the Mac locked, and no Render API credential or alternate connected browser is available. The Mac is needed for that dashboard action, not for ongoing game hosting.

## Driver-door follow-up — 22 November 2026

Evidence in `local/driver-door/`: 278 tests passed, including native GLB hinge direction, 81 snatch poses without bone stretching, closed/open driver-side tablet collision, driver permissions and theft doorway/aim/ownership guards. Four actual WebSocket clients exercise both-door requirements, passenger spoof rejection, ownership transfer and matching reach/door snapshots. Contact/theft fixtures use controlled in-process placements; no placement endpoint ships.

Both cars again finish all nine maps with normal inputs and zero placements. The packaged authority also passes a separate four-WebSocket drive with 160 ms artificial delay each way for driver B: 408 matching car/tablet/ragdoll snapshots, no tree crashes, normal tablet recovery and retry. These are automated clients on one physical Mac, not four physical laptops. Actual WebGL captures preserve 3,156 original forest mesh instances and report no GL errors. Separate UI tests use the real controller/network and stub only rendering/audio.

The newer packaged authority supersedes the audit's earlier bundle. Its manifest and ready-to-apply Render command are in `local/driver-door/`. A staged file is not a completed rollout; see that directory's production verification for live capability status.

Production verification: the compatible client and checksum-verified `rrr-server-4b95cf7c71c766d5.mjs` package are on Vercel. The public authority still advertises neither occupied-seat swaps nor driver doors. A temporary public-room check confirms choosing an empty navigator role still works and the next joiner becomes driver. Driver-door stealing remains inactive pending the Render dashboard update. No GitHub commit or push was made.

## Live rollout acceptance — 22 November 2026

The user completed the prepared Render dashboard rollout. Production verification confirms the expected frontend hashes, the checksum-verified authority package, and live `seatSwaps`/`driverDoors` capabilities. The earlier blocked-rollout notes above describe the staging phase.

`local/driver-door/public-theft.json` records a successful real public WebSocket test with four automated clients on one physical Mac, zero actor placements and normal driving inputs. Both cars drive side by side until the rival's original passenger-door hazard opens; the driver opens their own door, held-tablet theft is rejected, the rival navigator drops the tablet, and the driver successfully steals it. The driver then closes their door while retaining the tablet. All four clients agree on 1,083 common snapshots, including 999 open-door snapshots and eight stolen-tablet snapshots; reach events, both cars, tablets and spectator bodies match. Retry resets both doors, reach and original ownership. This verifies public authority behavior, not four physical laptops or measured India–Germany latency.

An earlier extended attempt lost its connection; its cause was not established. The subsequent public theft run remained connected through the complete interaction and retry. The separate delayed-connection recheck is recorded alongside it.

The separate public delayed-connection recheck also passed: four real WebSocket clients, driver B delayed 160 ms each way, both cars driven with zero placements, both tablets dropped/recovered, host swapped to navigator, 413 identical common snapshots, successful retry and roughly 61 ms p95 authority snapshot interval. See `local/driver-door/public-delayed.json`. No gameplay code changed and no additional deployment was needed during this verification.

## Stolen-tablet dashboard mount — 22 November 2026

In a four-player race, after stealing a tablet the driver looks right toward the centre dashboard bracket and presses E when `ATTACH TABLET` appears. The server verifies the aim, driver's seat, possession of the opponent's tablet and an empty bracket. It attaches that original tablet asset to the moving cabin, releases the driver's hands and leaves the navigator's own tablet alone. It stays attached during braking, open-door turns and crashes. A driver or free-handed own navigator can aim at the secured tablet and press E to remove it. A full-handed passenger cannot accidentally take it. Ordinary loose-tablet pickup cannot grab a secured tablet through a rival doorway. Original driver minimap privacy remains unchanged.

The authority advertises `dashboardTabletMounts: true`; the client shows the bracket, contextual prompt and new E action only when this capability is present. Co-op and older authorities retain their previous controls. Mounting uses one authoritative flag and car-local transform, not a second client physics simulation. Retry resets mounted ownership along with the original tablets.

Evidence is under `local/tablet-mount/`: 287 full-suite tests pass. Targeted tests use the original GLBs to verify dashboard clearance, orientation, native camera/aim agreement and body motion. Four actual WebSocket clients exercise theft, wrong-aim rejection, attachment, matching poses, removal, reattachment and retry with controlled proximity fixtures (no placement endpoint ships). A separate packaged-authority test passes with driver B delayed 160 ms each way and 409 matching snapshots. The real controller/DOM binding is also checked separately with rendering/audio/transport responses stubbed. Actual WebGL renders show the mount from both seats, preserve the 3,156 original forest mesh instances and report no GL errors. All automated clients run on one physical Mac.

The compatible frontend is live on Vercel. The checksum-verified authority `rrr-server-1a419f37a4a4b400.mjs` was deployed through the user's signed-in Brave session using native macOS accessibility controls. Render deployment `dep-dc1em03l550s73e9r13g` succeeded, and the public authority advertises `dashboardTabletMounts: true`. No GitHub push was made.

The new packaged authority additionally passes a localhost normal-input four-WebSocket drive, steal, aim-right attachment, removal/reattachment and retry with zero actor placements: 1,132 identical common snapshots, including 15 mounted snapshots. See `local/tablet-mount/localhost-normal-input-mount.json`.

The same normal-input acceptance subsequently passed against the public Render service: four actual WebSocket clients, zero placements, 1,140 identical common snapshots and 17 mounted snapshots. It verifies occupied role swaps, driver-door permissions, held-tablet protection, loose theft, aimed dashboard attachment/removal/reattachment, closing the driver door while mounted and retry cleanup. See `local/tablet-mount/public-normal-input-mount.json`. All four automated clients ran on one physical Mac; this is not an India–Germany physical-laptop test.

An initial public attempt disconnected with code 1006 just after a tablet drop. Render's runtime logs and Events showed no process restart or exception; the cause remains unestablished. The repeat completed the full interaction without a gameplay-code change. The passing run does not establish that intermittent disconnects are fixed. Logs from both attempts are retained under `local/tablet-mount/`.

The separate public delayed-network acceptance also passed: four actual WebSocket clients, driver B delayed 160 ms each way, both cars driven without placements, both tablets dropped/recovered, 408 identical common snapshots, host navigator retry and approximately 61 ms p95 authority snapshot interval. See `local/tablet-mount/public-delayed-network.json`.

## Connection reliability rollout — 23 November 2026

The cold loose-tablet stall was reproduced, then the authority was updated to warm its native solver before accepting players, use bounded fixed ticks, tolerate delayed heartbeat/queued-input bursts, and coalesce congested snapshots. All 298 tests pass. The final package passed CPU-throttled four-player fault injection including an 11-second whole-server suspension. The public fresh-process run passed 19 drop/recover cycles for each tablet without disconnecting; live theft/mount/retry and delayed-driver checks also passed. See `docs/BROWSER-RELIABILITY.md` and `local/disconnect-diagnosis/release-report.json` for scope and evidence. No GitHub push was made.
