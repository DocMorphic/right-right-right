# Alpha.5: complete Windows setup

[Download RightRightRight-Setup.exe](https://github.com/DocMorphic/right-right-right/releases/download/v0.3.0-alpha.5/RightRightRight-Setup.exe). All players should use alpha.5.

The setup EXE embeds the complete game, runtimes, cached bindings and production online settings. Double-clicking installs it, creates shortcuts and starts Right Right Right. No Steam, other game installation, SDK, Python or setup commands are required. The launcher has no terminal window or loader splash, and assembly generation uses its bundled cache offline. The game uses independent branding and an embedded font for its lobby/HUD. Creator and dependency credits remain included.

## Checked on 14 November 2026

| Check | Result |
| --- | --- |
| Mac-hosted Windows build | Passed, zero warnings/errors |
| Python integrity and branding tests | 10 passed |
| Installer extraction/integrity checks | 13 passed |
| Protocol/mode and distribution rules | Passed |
| Actual setup EXE embedded payload | All 638 game files verified |
| Normal CrossOver install and automatic launch | Passed; installed hashes and embedded UI font verified |
| Two-player native co-op over live Relay/DTLS | Both processes passed |
| Four-player native race over live Relay/DTLS | All four processes passed |
| Retry, lobby return, synchronized 2→4→2 mode changes | Both processes passed, room retained |

Co-op checks exercise native driving and ground contact, driver/navigator roles and map privacy, mud, remote wiping and door closing, tablet drop/fall, shared finish, retry, fatal tree contact and replicated failure. Race checks exercise both cars' controls, nonfatal car contact and cockpit jolts, mud on both cars, closed-door theft rejection, successful tablet theft/drop/fall, fatal tree contact, early-finish rejection and matching finish/state on all clients.

The tests use Windows game processes through CrossOver 26.3.0 on one Apple Silicon Mac, communicating through the real Unity service with DTLS. They use scripted input and position cars at hazards and finish points. They do not constitute a manual full-route playthrough, keyboard/controller assessment, graphics-performance test, native Windows installer test or separate-computer internet playtest. User confirmation of readable text was obtained for the preceding alpha.4 font fix; alpha.5 uses the same font code and its installed runtime log confirms it loaded.

The second car remains host-simulated with round-trip input latency. There is no host migration or joining a race in progress. This is an unsigned alpha Windows build; macOS needs the configured CrossOver bottle and is not a native Mac app.

[Sanitized test results and exact installer checksum](alpha5-verification-results.json) · [Installer/build guide](INSTALLER.md) · [Mac test commands](MAC-DEVELOPMENT.md#scripted-gameplay-checks-on-a-mac)
