# Right, Right, Right 0.2.0

Harder randomized courses, restored cabin hazards, closed escape routes, and a friend installer.

## Install or update

Download **RightRightRight-Setup.exe**, close the game, and double-click it. Keep Steam running and use the new desktop shortcut afterward. Your friend installs the same release. Each player needs the original Steam playtest, build 26172243. Setup automatically locates it and installs a separate copy under Local AppData.

Players no longer need to install Python, Git or development tools, or enter PowerShell commands. First launch can still take several minutes for the loader's automatic binding generation and requires internet access.

For an existing source checkout, run Setup.cmd again after updating the repository. Its Play.cmd remains valid for that local copy. Avoid running the older source-copy launcher when your friend is using the new release.

## Gameplay changes

- New course selection rolls a new shared seed. Retry preserves it.
- At least six real 180-degree hairpins and ten hard corners per course, mixed with randomized chicanes, segment lengths and left/right direction choices.
- Narrower roads, from 4.6 to 5.2 metres depending on profile.
- Mud deposits follow the actual new road. The native windshield effect and clearing controls work again.
- Door openings during committed hard turns in either direction use the original networked mechanism, with recovery cooldowns.
- Matching original trees fill roadside gaps and close both route ends. Their individual solid trunks prevent reversing out or breaking a shortcut through the forest. No railings are added.
- Steam lobby course acknowledgment and pack fingerprints prevent the host starting new stages before a navigator confirms matching content.

## Validation and limits

All six profiles pass automated in-player checks of road geometry, suspension, mud/wiping, doors, reverse boundaries, and side boundaries. Pure geometry tests cover 128 seeds. The setup executable was tested on a clean destination and verifies original-file and downloaded-dependency hashes.

The user's two-player test confirmed baseline 0.1.0 co-op. The new 0.2.0 acknowledgment protocol has host/lobby tests but has not yet been retested with two distinct Steam accounts. Complete timed races and difficulty balancing remain playtest work.

See the [roadmap](https://github.com/DocMorphic/right-right-right/blob/main/docs/ROADMAP.md) for proposed course codes, daily challenges, split times, ghosts and crew championships. New scenery or visual effects require the user’s approval before implementation.
