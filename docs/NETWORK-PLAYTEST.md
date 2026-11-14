# Direct-server browser playtest

The standalone Node server serves the built game and uses persistent WebSockets, 50 Hz physics and 20 Hz snapshots. The Vercel frontend's HTTP/D1 authority is a separate transport. Moving static hosting does not remove that synchronization path.

Run `node server/verify-websocket-host.mjs http://HOST:8787 /absolute/report.json` inside `web/` to test an existing Node host. The script creates and cleans up its own two-player room; it never repositions game state. It tests hosting, joining, both R acknowledgments, real countdown, 15 seconds of normal driving, handbraking, matching host/guest cars at the same authoritative tick, and retry readiness reset.

On November 14, 2026, two independent clients on the host Mac drove original Stage 01 for 102.68 m with no placement. Their 345 matching car ticks agreed exactly. Median ping was 0.44–0.51 ms and snapshot intervals had a 52.5 ms p95. This is a same-machine test through the Mac's Wi-Fi address, not a measurement between laptops.

The friend's browser could not reach the local server despite both devices having addresses in the same /24 network and the same router. The host listened on all IPv4 interfaces and its macOS application firewall was disabled. The friend's address did not resolve in the host ARP cache and three pings timed out. Wi-Fi peer isolation is a likely cause; these observations do not prove the router configuration.

A temporary Cloudflare tunnel to the same Node server allowed the friend to open the game menu. This bypasses the HTTP/D1 game-state path but travels through the internet; it is not true LAN. Through that tunnel, two clients on the host Mac drove 101.86 m with 352 matching ticks. Median pings were 44.94–47.62 ms, p95 pings about 496 ms, and p95 snapshot intervals about 124 ms. No separate-laptop gameplay or human-perceived smoothness claim follows from these automated results. The two-laptop manual playtest is pending.

Temporary tunnel hostnames and active room codes are intentionally not production defaults. The host Mac and tunnel must remain running. Do not modify the router or disable friends' security settings to work around isolation without appropriate network-owner authorization.
