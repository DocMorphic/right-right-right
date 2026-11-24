# Multiplayer independent of the host Mac

Keep the browser client and its original assets on Vercel. Run one authoritative
Node process for `/ws` and `/health` on a separate cloud host. Do not use the
old per-input HTTP/D1 authority for the live driving loop.

## Free hosting choice, checked 2026-11-14

The quickest compatible option is a **Render Free Web Service in Frankfurt**.
The existing Node/WebSocket authority does not require an engine or protocol
rewrite. Render sleeps the service after 15 minutes without incoming HTTP or
WebSocket traffic; an incoming request wakes it in about a minute. Incoming
game WebSocket messages keep it active while friends play. The free allocation
is 750 instance-hours per workspace per month, with separate bandwidth/build
limits. Free instances may restart, which ends in-memory rooms.

Sources: [free service limits](https://render.com/docs/free),
[WebSocket support](https://render.com/docs/websocket),
[regions](https://render.com/docs/regions).

Other options:

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
  has a Free tier with 100,000 requests/day and 13,000 GB-s/day; incoming
  WebSocket messages use a 20:1 billing ratio. It needs a separate adapter
  for authoritative room objects and their simulation lifecycle. The current
  Sites environment does not expose Durable Object bindings. Its existing D1
  adapter is not this architecture and should not be described as equivalent.
- [Koyeb Free](https://www.koyeb.com/docs/reference/instances) offers one
  512 MB, 0.1 vCPU instance in Frankfurt or Washington. It sleeps after an
  hour of inactivity and is documented for hobby/testing use.
- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
  can run a VM without a scheduled application sleep, but capacity is not
  guaranteed and idle compute can be reclaimed. It needs VM administration.

None of these options guarantees uninterrupted, unlimited, permanently free
gaming. A cloud server removes the dependency on this laptop and home network;
India–Germany transit latency and players' own networks still affect play.

## GitHub source deployment (24 November 2026)

Vercel is connected to `DocMorphic/right-right-right`, production branch
`standalone/portable-steam`, root directory `web`, Vite build
`npm run build:client`, output `dist`. Previously this project had no Git link
and received manually uploaded builds, so pushing a commit could not update it.

The existing Render service uses that same repository/branch with root directory
`web`, build command `npm ci --omit=dev`, and start command
`node server/index.js`. The generated native course and contact catalogs are now
tracked in Git. A clean production-only install passed both the two-client Voice
Roads driving check and the existing four-player network acceptance.

The previous build command downloaded a fixed server bundle from Vercel. That
command has been replaced, so source changes no longer require manually packaging
and uploading a new backend artifact. `web/scripts/build-multiplayer-server.mjs`
remains available for an explicitly bundled deployment, but is not required by
this source-based service.

The `Browser game checks` GitHub Actions workflow installs dependencies, runs the
full browser/gameplay/network test suite and builds the browser from the checkout.

Set the cloud service's `HOST=0.0.0.0` and
`ALLOWED_ORIGIN=https://right-right-right.vercel.app`. Let Render assign `PORT`.
The `/health` endpoint permits the configured frontend's cross-origin wake
request. WebSocket origin restriction remains enforced.

Once the new backend passes public health and two-client acceptance, configure
Vercel production:

```
VITE_GAME_SERVER=https://<verified-service>.onrender.com
GAME_SERVER_ORIGIN=https://<verified-service>.onrender.com
VITE_GAME_SERVER_WAKE=true
```

The wake flag makes the client wait up to 90 seconds for a protocol-compatible
healthy WebSocket authority, displaying the status in the existing menu. It
does not artificially keep an idle free instance awake. It accepts neither a
Render loading HTML page nor the legacy HTTP/D1 authority as a ready game
server. The Vercel production frontend now uses the verified Render service. The old
Mac authority and public tunnels have been stopped; their automatic launch
was disabled.

## Verification before switching

- Run the existing game suite, including cold-start, incompatible-backend,
  cancellation and configured-origin tests.
- Install and launch the standalone bundle from its isolated package folder.
- Run `verify-websocket-host.mjs` with
  `RRR_WEB_ORIGIN=https://right-right-right.vercel.app` against that server,
  then repeat against the actual public Render address.
- Verify Vercel hosting/joining, readiness, countdown, driving and retry.
- Repeat the public check with the Mac server stopped; the cloud backend must
  continue serving rooms. A local package test alone does not establish this.
- Both players reload and create a new room when the authority changes.

Actual India–Germany gameplay still needs two physical laptops in those
countries; two local verification clients do not establish that experience.


## Live deployment (2026-11-14)

- Game: https://right-right-right.vercel.app
- Authority: https://right-right-right-multiplayer.onrender.com
- Render service: `srv-dbsdfmrbc2fs73b91i1g`, Free / Node / Frankfurt.
- Render initial deploy: `dep-dbsdfnjbc2fs73b91jf0`.
- Vercel production deployment: `dpl_3heXQ3JuGepaQ5Dq6mwF69Xonboa`.
- Immutable server bundle SHA-256:
  `c3c752347e15f667e8a40b8ebf571e515ea3e269ba5368245da600a0906b4db5`.
- All 157 tests passed. Two independent public WebSocket clients passed
  host/join, both-R readiness, countdown, throttle/steering, braking, matching
  state and retry. Acceptance was repeated with the Mac authority stopped.
- Independent HTTP health probes returned 200 from Mumbai, Bengaluru,
  Falkenstein and Nuremberg. These are reachability checks, not physical
  India–Germany gameplay tests.
- Local launchd server and cloudflared jobs were unloaded and disabled.
  Only the game-specific Tailscale Funnel was turned off; other Tailscale
  account functionality was not altered. No service listens on local 8787.
- Old tunnel/direct-Mac links are retired. Both players should reload Vercel
  and create a fresh room. No GitHub source push was performed.

Reports and screenshots are under ignored `local/cloud-server/` and
`local/visual-parity/render-*`. The selected Free service has usage limits,
can restart and can cold-start after idle; it is not an uptime guarantee.

If local development/LAN hosting is desired later, re-enable the saved
launchd definitions explicitly (this is not needed for the public game):

```sh
launchctl enable gui/$(id -u)/com.dharmay.rightrightright.server
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dharmay.rightrightright.server.plist
```

Latency corrections and WAN verification were deployed in Render `dep-dbsdn03l550s73867cj0`; see [the latency report](MULTIPLAYER-LATENCY.md).

Browser connection fix: Brave blocked the direct cross-site Render health check (`ERR_BLOCKED_BY_CLIENT`). Wake-up now uses the Vercel same-origin `/health` proxy; gameplay stays on WSS. Hosting and a fresh navigator join passed in the same Brave profile with protection settings unchanged. Browser tabs opened before this deployment need a full reload.

Latest control-response release (2026-11-15): Vercel
`dpl_AN2h2Rvuu4H2kw8iqSZ8vpAAwAAb`, Render
`dep-dbsf69m1egvs73dm2qcg`, bundle SHA-256
`e4a532895e5765bcc4f8944936b647e54b721ad388c052816d59123b6cb70d19`.
Canonical local service settings now point to this package. Auto-deploy stays
off and the Free Frankfurt service still runs independently of the Mac. See
the immediate-controls section in the latency report for tests and limits.

Menu/loading UI release (2026-11-16): Vercel
`dpl_E9n4Yv1yGa3hHDBvqCHRFK5zSuJr`. Authority and multiplayer configuration
are unchanged. The loading screen reports setup phases/counts and has retry
recovery; the complete menu scales to fit the viewport, with controls inside
the tablet instead of adding page height. Co-op and race layouts were checked
at desktop/laptop sizes including 1280×600, 1024×400 and 640×480, with zero
clipped controls or page overflow. Slow loading and failed-load retry were
verified locally, then the published menu/controls/volume were checked. Report
and screenshots: ignored `local/visual-parity/menu-loading-*`.
