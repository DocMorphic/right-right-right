# Original scenery export

`tools/export_native_scenery.py` supplements the original three course layouts with their authored terrain, background forest and existing roadside props. Run it after `export_web_assets.py` and `export_native_courses.py`, followed by `tools/export_native_details.py` for original grass-detail data. They create ignored licensed assets under `web/public/assets/scenery/`; no generated geometry, images or scene-instance data is committed to the source repository. Original game/asset credit remains Stellux Interactive under the project owner's stated developer permission and the original-content exclusion from the source-code MIT license.

The initial course export contained the exact roads and colliding tree trunks, but omitted background trees without colliders and substituted a generated grass ribbon for the original terrain. Those omissions materially changed the map's appearance. This supplemental export restores the serialized original scenery rather than inventing replacements.

| Scene | Native terrain | Background trees in supplement | Original bush/rock/stump instances |
| --- | --- | ---: | ---: |
| 1 | 513×513 heights; 500×80×500 m | 6,494 | 558 |
| 2 | 1025×1025 heights; 1000×80×1000 m | 22,968 | 1,982 |
| 3 | 1025×1025 heights; 1000×80×1000 m | 10,434 | 890 |

`native-01.json`, `native-02.json` and `native-03.json` provide renderer inputs. Heights are row-major `[z][x]`, unsigned 16-bit little endian, normalized by **32767**. Terrain vertex position is `matrix * [-column*spacing.x, height/32767*spacing.y, row*spacing.z, 1]`. Derive exact horizontal cell spacing from `size/(resolution-1)` when needed; the JSON's general six-decimal rounding loses half a micrometer per cell from the native 0.9765625 m value. Sampled scene-1 terrain heights match its authored road centerline within the native terrain/road interpolation difference, approximately 0.001–0.02 m. Dividing by 65535 would incorrectly halve the height.

Terrain layers preserve their original images, tint, tile sizes, normal maps and material values. Splat weights use the original R/G/B bytes as linear data (`NoColorSpace`); their unused zero alpha is removed to prevent browser image premultiplication from clearing the weights. Use splat UV `[column/(resolution-1), 1-row/(resolution-1)]` with `Texture.flipY=false`. The three original layers are grass, brown ground and pebbles, with native tiling 4.5 m, 3 m and 2 m respectively.

Background-tree and prop placements use the model's **root origin**, in the same reflected-X browser coordinates as the road models. Do not apply the collision-tree collider-center offset to these placements. Each entry references a `materialSet`; its material entries follow the original renderer/submesh order and preserve native colors, roughness, double-sidedness and unlit status. The dark `forest` leaf override is retained for background rows. Native scene-1 background trees neither cast nor receive shadows, while its front colliding trees do both. The 12 original prop models are self-contained GLBs; all use flat native material colors without texture maps or vertex colors. Khronos validation passed with zero errors/warnings for all 12.

`RoadsideDecorator.Start` tail-calls native `EnsureBreakableTrees`; it does not regenerate the entire forest on entry. Original generated-in-editor placements are therefore the relevant scene data.

`native-01.details.json` through `native-03.details.json` preserve the original grass-detail grids and two billboard prototypes. These are populated layers, not unused prototypes:

| Scene | Grid per layer | Nonzero cells, layers 0 / 1 | Sum of native counts, layers 0 / 1 |
| --- | --- | ---: | ---: |
| 1 | 1024×1024 | 761,617 / 475,277 | 1,762,302 / 892,698 |
| 2 | 2048×2048 | 3,084,042 / 1,926,980 | 7,172,652 / 3,641,315 |
| 3 | 2048×2048 | 3,175,936 / 1,977,880 | 7,363,155 / 3,730,520 |

Each `.bin` is uint8 row-major `[z][x]`; the source scatter mode is **InstanceCountMode (1)**, so its bytes are instance counts, not normalized coverage. Render mode **GrassBillboard (0)** means camera-facing billboards. These enum meanings are confirmed by [Unity's terrain bindings](https://github.com/Unity-Technologies/UnityCsReference/blob/master/Modules/Terrain/Public/TerrainData.bindings.cs). All original road centerline samples land on zero-count cells in both layers across all three stages, verifying the patch/grid axis interpretation against the authored road clearing.

The detail metadata includes the column-major reflected-X `terrainMatrix`, `terrainSize`, `cellSize`, density 0.55, render distance 55 m, original 64×64 `RW_GrassBillboard` RGBA image, size/color/noise parameters and per-layer density-scaling flags. Place a detail at `terrainMatrix * [-(x+fractionX)*cellSize[0], localTerrainHeight, (z+fractionZ)*cellSize[1], 1]`. Cell dimensions use `size/resolution`; heights use the separate terrain grid and its `size/(resolution-1)` spacing. The two prototypes do not enable density scaling; retain both this flag and the terrain's global density in the renderer contract rather than conflating them. Width ranges are 0.45–0.8 m and 0.5–0.85 m; height ranges are 0.35–0.65 m and 0.35–0.7 m. Healthy/dry colors and native waving parameters are exported verbatim.

Unity's generated per-instance scatter positions and exact grass shader behavior are not serialized in the input. A browser renderer can use the original count grid and billboard with deterministic cell scatter, but that is not a recovery of the native random placement algorithm. Lighting/postprocessing and runtime rendering still require comparison before claiming complete 1:1 visual parity. `docs/native-scenery-verification.json` records source/output hashes, finite instance/reference checks, exact data lengths/counts, zero road-center grass coverage and the 12 successful GLB validations; it reports export integrity only.

The separate `tools/export_ready_titles.py` recipe exports eight original Anton lettering masks and `ReadyTitles.json` for the native ready/controls canvas. Its metadata records the recovered panel geometry, exact original control copy, fonts and runtime palette. In particular, runtime `GameUiColors` differs from the serialized orange tablet palette. Exported settings and masks are source references, not proof that browser controls or screenshots match the native game.
