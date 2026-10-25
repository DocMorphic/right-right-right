# Next features and multiplayer plan

## Shipping in 0.2.0

- Fresh host-selected course seed on each menu selection. Retry keeps the same course so learning a hard sequence pays off.
- Native Steam lobby metadata distributes the seed and course-pack fingerprint. The host waits for crew acknowledgment and refuses to start a new stage with an unconfirmed/mismatched navigator.
- Random combinations of genuine 180-degree hairpins, tight 90-degree corners and chicanes. Each stage retains its own width, length profile and scenery seed.
- Native windshield mud deposits placed along the generated route, with native cleaning/wiper behavior.
- Host-scheduled door openings during committed left or right turns, using the original networked door mechanic. Cooldowns leave recovery time between interruptions.
- Dense original trees with solid trunks along the shoulders and at both ends, with collision tests for reverse and sideways escapes.
- A self-contained Windows setup/launcher for friends. It locates the Steam playtest, checks its build, copies it locally, applies a small verified scene-table delta, downloads hash-checked MelonLoader/.NET dependencies, and installs the precompiled extension. No Python, Git, C++ tools, .NET SDK, or PowerShell commands for players.

Keep the original forest appearance. Proposed features below are plans, not permission to add new scenery, props, or visual effects. Ask the user before implementing those changes.

## Priorities after this playtest

The authorized four-player race now has a separate [0.3.0-alpha.1 prototype](FOUR-PLAYER-PROTOTYPE.md). Its next acceptance session is four distinct Steam accounts: invitations, join order, course/seed acknowledgment, second-driver latency, both navigator screens, collisions, tablet theft, retry and return to lobby. Prediction and a seat picker are follow-up work after that session; new scenery still requires approval.

1. **Course codes and daily challenge.** Expose the current seed as a shareable course code, add a seed entry field, and derive an optional daily seed from the date and pack version. Keep times separated by seed, width and rules. Success: two crews can independently load identical roads and compare valid runs.
2. **Sector times and a personal-best ghost.** Add sector splits and a local ghost, visible to the navigator or in replay so the driver retains the original information restriction. Success: a recorded run replays without controlling physics and shows where time was lost. WRC's official Racenet design demonstrates the usefulness of ghost playback and comparing stage telemetry. [EA Racenet](https://www.ea.com/games/ea-sports-wrc/wrc-24/news/racenet)
3. **Crew challenges and championships.** A short sequence of seeded stages with a shared scorecard, time penalties, and an optional single-attempt rule. Start with locally shareable results; a hosted leaderboard would need separate backend work. EA's rally Clubs use events and shared standings as a model for friends who cannot all play at once. [EA Racenet Clubs](https://www.ea.com/games/ea-sports-wrc/wrc-24/news/racenet)
4. **Difficulty and hazard presets.** Technical / Brutal / Chaos settings for radius, shoulder clearance, mud frequency and door cooldown. Add a recovery budget so a mud splat and an open door cannot repeatedly chain into an unavoidable failure. Success: the preset is part of the shared course fingerprint and is reproducible.
5. **Night, fog and surface variation (requires the user’s approval before implementation).** Test visibility, headlight reach and wet grip with the existing materials before introducing new art. Keep these opt-in until both seats remain readable. Success: hazards remain visible enough for a navigator to communicate meaningful warnings.
6. **Role swap between stages.** Let crews rotate driver/navigator within a championship. This changes original seat authority, so it needs two-account regression testing of input, cabin interactions and scene transitions.

## Easier multiplayer distribution

The immediate player flow is: install the original Steam playtest once, download the release's setup executable, double-click it, then use the desktop launcher and original invite controls. Updates use the new setup executable; pack fingerprints prevent quietly joining a different course revision.

The first game launch still performs MelonLoader's IL2CPP binding generation and requires an internet connection. MelonLoader supports a portable .NET runtime under the copied game's `dotnet` folder, which avoids requiring players to install it system-wide. [Official loader release notes](https://github.com/LavaGang/MelonLoader/releases/tag/v0.7.3)

A friend still needs the same course pack and their own Steam playtest access. Steam Workshop subscriptions or publishing a separately registered Steam game would require cooperation/configuration from the original developers; a public GitHub repository does not register a Steam application.

## Next acceptance session

- Test 0.2.0 with two distinct Steam accounts, including invite, acknowledgment, joining mid-stage, retry, and returning to the menu.
- Confirm both seats see the same mud state and door angle.
- Attempt full-lock reverse at the start, tree shortcuts, jumps through the forest boundary, and approaches to the finish from the wrong direction.
- Record which seeds feel unfair, which hairpins remain too fast, and any frame-rate drops in the longest stage.
- The user's successful two-account session validates 0.1.0's baseline multiplayer, not these newly added synchronization changes.
