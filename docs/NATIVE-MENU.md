# Native tablet menu

`src/NativeMenu.cs` renders the native standalone lobby with the browser menu's orange NAV-1350 tablet, original car illustration, title lettering, Share Tech Mono controls and original palette. It runs inside the existing Unity IMGUI callback and scales its complete layout to the game window. It does not use a web view or connect native players to browser rooms.

Host/Join and Copy Code use the existing native Relay connection. The lobby shows assigned driver/navigator seats, two-player co-op and four-player race, six stage tiles and an explicit Start Game action. Selecting a tile changes only the local selection. Start Game still calls `DirectSession.Select`, which requires the full crew's existing content/mode acknowledgment before loading the shared scene. Controls opens a separate panel containing the secondary LAN/VPN and Porthole controls. Network messages and room protocols are unchanged.

The renderer first finds original `ee` and `TabletRoute` textures and the `ShareTechMono-Regular` font among the loaded Unity resources. It can use the original baked Anton font as a title fallback. The exact browser title mask has no embedded original TTF, so packaging should copy these existing authorized export outputs into the native player's `UserData/RightRightRight/UI/` directory:

| Export output | Native sidecar |
| --- | --- |
| `web/public/assets/ui/MainMenuTitle.png` | `UI/MainMenuTitle.png` |
| `web/public/assets/textures/ee.png` | `UI/ee.png` |
| `web/public/assets/textures/TabletRoute.png` | `UI/TabletRoute.png` |

The latter two are fallbacks if Unity has not loaded those textures. No generated licensed artwork is embedded in the mod assembly or committed to Git. Original game/artwork credit remains Stellux Interactive, under the project owner's stated developer permission and the original-content exclusion from the source-code MIT license. Original font licenses remain unchanged.

The runtime logs `NATIVE_TABLET_MENU_READY` with the selected font and texture availability. A clean C# build checks generated IL2CPP binding availability, but a runtime screenshot is still needed to verify native draw calls, artwork, text and input under Wine. Build using the prepared native player references:

```sh
local/tools/dotnet/dotnet build src/RightRightRight.csproj -c Release \
  -p:GameDir=/absolute/path/to/prepared/player
```

For runtime verification, install the resulting `RightRightRight.dll` under the test player's `Mods/`, copy the sidecars above, and check Host/Join, text entry and Copy Code, both player modes, crew updates, all six selections, Start Game only when the crew is ready, Controls/LAN and Leave. Native Relay co-op and lobby lifecycle checks still use their existing verification flags. No successful build alone establishes visual or networking test completion.
