# Original driver hand rig

The browser renderer uses the original skinned driver and native grip references. Current tablet/cabin visual parity changes remain local at the user's direction; the live build received only the separately requested larger wiper control. `car.glb` remains unchanged.

Run `.venv-build/bin/python tools/export_driver_rig.py`. The default output is ignored `local/web-assets/driver-rig-candidate/driver-rig.glb` and `DriverWheelHandIk.json`. The source runtime defaults to the authorized compiled native player. The JSON's `/assets/driver-rig.glb` URL is a proposed integration URL, not a claim that the file is currently published.

The existing car exporter bakes `SkinnedMeshRenderer` vertices from the serialized seated pose. Its GLB has no active skin, so rotating arm bones cannot move the visible body. The native game instead runs `DriverWheelHandIk.LateUpdate` at execution order 300. `TrySetup` resolves the driver, caches source rest rotations, wrist-on-grip rotations and palm offsets, directly solves both arms onto the zero-steer wheel grips, then re-caches the resulting rest pose and wrist axes. During play it solves the arm chains and palm/wrist lock as the wheel rotates; the right hand also reaches the handbrake. These are runtime operations, not a serialized animation clip recovered by the existing static export.

The targeted exporter preserves the actual native driver's four skins (`Casual2_Body`, `Casual2_Feet`, `Casual2_Head`, `Casual2_Legs`), each with 62 original joints and inverse bind matrices. Original two-influence weights are zero-padded to glTF's four-component attributes without changing their values. The separate model contains the original 114-node hierarchy, materials, meshes and root transform. For a later integration, replace only the old `character fat` branch and attach this root under `BodyVisual`; the root transform is already included. Preserve head-bone/helmet handling and use skeleton-aware cloning when instantiating multiple cars.

The metadata records column-major matrices and positions in the existing reflected-X car coordinates. Exact original grip positions are:

| Target | X | Y | Z |
| --- | ---: | ---: | ---: |
| WheelRotationHelper | 0.376100 | 0.917500 | 0.322600 |
| Grip_L, child of WheelRide | 0.559984 | 0.926351 | 0.348292 |
| Grip_R, child of WheelRide | 0.187188 | 0.926160 | 0.349893 |
| handbrake_location | 0.001000 | 0.731546 | 0.247065 |

Native palm estimation averages the first wrist descendant matching each of `Index2`, `Thumb2`, `Middle2`, `Pinky2` and `Ring2`. It computes the palm offset using inverse wrist **rotation**, rather than inverse transform including scale. The resulting reflected-X wrist-local offsets are left `[-0.005062, 0.132795, -0.020869]` and right `[0.001826, 0.130094, -0.033219]`; using first finger joints would produce the wrong offset. Per-arm rest positions, bone matrices, arm lengths, sample transforms and wrist-on-grip rotation matrices are included in the JSON.

Serialized native settings are handbrake threshold 0.2, right-hand blend time 0.07 seconds, zero additional palm position/Euler offsets, wrist steer dead zone 3 degrees, steer full strength at 110 degrees, grip twist full strength at 50 degrees, shoulder weight 0.22 limited to 18 degrees, wrist yaw 0.162 per steer degree capped at 60 degrees, forearm twist share 0.42 capped at 32 degrees, and elbow hint outward offsets 0.06 m plus 0.0022 m per degree with 0.0008 m per degree forward. The source component's arm pointers are unset: the native resolver finds the bones by name, which this export preserves.

Native method evidence is available in the original IL2CPP symbols and ignored local disassembly: `DriverWheelHandIk.TrySetup` RVA `0x4F8150`, `BakeRestPoseOnGrips` `0x4F29D0`, `SolveArm` `0x4F72D0`, `SolveIkChain` `0x4F8010`, `GetElbowHint` `0x4F5290`, `CacheWristOnGrip` `0x4F3E50`, `PalmOffsetInWrist` `0x4F6580` and `EstimatePalmWorld` `0x4F4EC0`. The candidate retains the serialized pre-IK pose; a browser solver must execute the rest-grip bake and subsequent hand motion before claiming aligned steering hands.

Validation is recorded in `driver-rig-verification.json`: CPU skinning at rest matches the four previously baked native meshes with maximum position error below 0.000000273 m. Re-exporting produced the same GLB SHA-256. Khronos validation reports zero errors and eight warnings concerning the preserved non-root skin nodes and their ignored local mesh transforms; joint world transforms and original inverse binds produce the verified placement. These checks establish skin/export integrity only. Animated grip alignment, handbrake motion, head privacy and runtime visual fidelity still need integration and visual verification.

Original models, rig, textures and scene data remain Stellux Interactive content under the project owner's stated developer permission, excluded from the source-code MIT license. Generated GLB/JSON assets remain ignored.
