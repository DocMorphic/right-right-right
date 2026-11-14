# Original three courses

Run `.venv-build/bin/python tools/export_native_courses.py` after preparing the authorized native runtime. The tool writes `web/shared/native-courses.generated.json` for the browser and worker, and an ignored source/hash report under `local/web-assets/`. The generated JSON contains original licensed course/forest data, is excluded from the source-code MIT license, and is intentionally ignored by Git. Keep the original Stellux Interactive asset credit in packaged distributions. No original geometry is committed with this tool.

The catalog contains the original scene IDs `1`, `2`, `3`, named from their actual menu labels `STAGE 01`, `STAGE 02`, `STAGE 03`. Their browser profile indices are appended as 6, 7, 8; existing custom profiles 0–5 remain stable. Display order can show the original three first.

| Original scene | Authored path samples | Authored trees | Road length | Spawn/finish path index |
| --- | ---: | ---: | ---: | --- |
| 1 | 1,024 | 1,720 | 2,150.218 m | 0 / 1,021 |
| 2 | 3,633 | 6,104 | 7,630.462 m | 2 / 3,488 |
| 3 | 1,710 | 2,863 | 3,579.353 m | 2 / 1,643 |

`points` are averages of each original EasyRoads mesh's paired left/right vertices, matching native `EasyRoadsCenterline.TryBuild`. `widths` retains every section's actual width, approximately 5 m, and `roadMesh` retains the complete world-space positions, normals, UVs and triangle indices for rendering authored bends and banking. All three original road materials use `dirtRoad_A` and `road_N`. Unity X is reflected, triangle winding reversed and texture V flipped to match the exported browser models. Values are stored at six decimal places in meters.

Scene 1 is a closed circuit: its original finish is just behind its start. The export rotates the same closed sample sequence to start at the native spawn, retaining every road segment and its closing sample. It does not fit or procedurally replace the path. Scenes 2 and 3 retain their native open-strip order. `startPose`, `finishPose` and `gates` preserve the authored world position, quaternion, forward direction and matrix; clients must use these rather than the custom-course fixed index offsets. The native `StageStartPoint.GetSpawnPose` returns its transform pose directly.

Each tree retains its actual serialized scene placement, original variant 0–5 in the existing model manifest order, collider center/radius and scale. Positions in `trees` use the collider center in X/Z and root origin in Y, matching the browser instancing contract. Rotation/scale is relative to the already exported native tree model's authored import rotation and scale. All current original placements can be represented as yaw and uniform scale; an exact placement matrix is emitted if a future source includes tilt or nonuniform scale. No extra forest is generated. Native serialized mud triggers are included (2, 5 and 4 respectively).

The exporter validates finite geometry, index bounds, positive tree scales/radii and exact strip-center correspondence within storage precision. A few original strip triangles face opposite their smoothed vertex normals (1, 1 and 3); the source geometry is retained instead of silently changing those corners. Source scene/shared-asset hashes and output hashes are recorded for reproducibility.

This establishes original road layouts and serialized forest placements. Runtime-generated decorations, original terrain heightfields and full Unity car/physics behavior are outside this export; the browser's remaining runtime reconstruction must not be described as complete 1:1 gameplay parity.
