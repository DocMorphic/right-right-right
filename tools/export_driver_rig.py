#!/usr/bin/env python3
"""Export the original driver's real skin plus source hand-IK references.

Writes an isolated candidate by default; never replaces the live car GLB.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from UnityPy.helpers.MeshHelper import MeshHandler

from export_web_assets import Exporter, GLB, ROOT, REFLECT, local_matrix, vec
from export_native_courses import rounded


class SkinnedGLB(GLB):
    def __init__(self, exporter):
        super().__init__(exporter)
        self.pending = []

    def mesh(self, pointer, materials, renderer=None):
        result = super().mesh(pointer, materials)
        if result and renderer and renderer.m_Bones:
            mesh = pointer.read(); handler = MeshHandler(mesh); handler.process()
            if not handler.m_BoneWeights:
                raise ValueError('Native skinned mesh has no recoverable weights.')
            weights = np.asarray(handler.m_BoneWeights, dtype=float)
            joints = np.asarray(handler.m_BoneIndices, dtype=np.uint16)
            padding = -weights.shape[1] % 4
            if padding:
                weights = np.pad(weights, ((0, 0), (0, padding)))
                joints = np.pad(joints, ((0, 0), (0, padding)))
            if weights.shape[1] % 4 or joints.max() >= len(renderer.m_Bones):
                raise ValueError(f'Unsupported native skin weights/joints: {weights.shape}, max joint {joints.max()}, bones {len(renderer.m_Bones)}.')
            assert np.allclose(weights.sum(axis=1), 1, atol=1e-5)
            for primitive in self.document['meshes'][result[0]]['primitives']:
                for group in range(weights.shape[1] // 4):
                    primitive['attributes'][f'JOINTS_{group}'] = self.accessor(joints[:, group*4:group*4+4], 'VEC4', 5123)
                    primitive['attributes'][f'WEIGHTS_{group}'] = self.accessor(weights[:, group*4:group*4+4], 'VEC4')
            self.document['meshes'][result[0]]['extras']['nativePoseBaked'] = False
        return result

    def add_go(self, go, **kwargs):
        node = super().add_go(go, **kwargs)
        renderer = self.exporter.components[go.object_reader.path_id].get('SkinnedMeshRenderer')
        if renderer and renderer.m_Bones:
            self.pending.append((node, renderer))
        return node

    def finish_skins(self):
        nodes = {n['extras']['unityPathId']: i for i, n in enumerate(self.document['nodes'])}
        self.document['skins'] = []
        for node, renderer in self.pending:
            mesh = renderer.m_Mesh.read()
            bind = [np.array([[getattr(b, f'e{r}{c}') for c in range(4)] for r in range(4)]) for b in mesh.m_BindPose]
            if len(bind) != len(renderer.m_Bones):
                raise ValueError('Native inverse-bind/joint count mismatch.')
            joints = [nodes[b.read().m_GameObject.m_PathID] for b in renderer.m_Bones]
            inverse = np.asarray([(REFLECT @ b @ REFLECT).T.reshape(-1) for b in bind])
            skin = {'name': renderer.m_GameObject.read().m_Name + '-native-skin', 'joints': joints,
                'inverseBindMatrices': self.accessor(inverse, 'MAT4', target=None)}
            if renderer.m_RootBone.m_PathID:
                skin['skeleton'] = nodes[renderer.m_RootBone.read().m_GameObject.m_PathID]
            self.document['nodes'][node]['skin'] = len(self.document['skins'])
            self.document['skins'].append(skin)


def serialized_config(data):
    offset = 32
    def take(fmt):
        nonlocal offset
        values = struct.unpack_from('<' + fmt, data, offset); offset += struct.calcsize('<' + fmt)
        return values
    def pointer():
        file_id, path_id = take('iq'); return {'fileId': file_id, 'pathId': path_id}
    result = {'steeringWheel': pointer(), 'driverRoot': pointer()}
    length = take('i')[0]; result['driverObjectName'] = data[offset:offset + length].decode(); offset = (offset + length + 3) & ~3
    for name in ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftWrist', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightWrist', 'leftGrip', 'rightGrip', 'handbrakeLocation', 'car', 'netBridge']:
        result[name] = pointer()
    for name in ['handbrakePoseThreshold', 'cabinHandSmoothTime']:
        result[name] = take('f')[0]
    for name in ['palmLocalOffset', 'palmLocalEuler']:
        result[name] = list(take('3f'))
    for name in ['wristIkSteerDeadZone', 'wristIkSteerFullAt', 'gripTwistFullAt', 'shoulderIkWeight', 'maxShoulderDegrees', 'wristSteerYawPerDegree', 'maxWristSteerYawDegrees', 'forearmTwistShare', 'maxForearmTwistDegrees', 'elbowHintRestOutward', 'elbowHintOutwardPerDegree', 'elbowHintForwardPerDegree']:
        result[name] = take('f')[0]
    if offset != len(data): raise ValueError('Changed DriverWheelHandIk serialization.')
    return result


def export(runtime, output):
    exporter = Exporter(runtime, output)
    driver = exporter.find('character fat'); car = exporter.find('Car')
    builder = SkinnedGLB(exporter)
    root = builder.add_go(driver, root=True, preserve_root_rotation=True, preserve_root_scale=True)
    # Preserve the source local transform. Attach the model to BodyVisual, the
    # same parent as the native driver; its root was centered by GLB.add_go.
    builder.document['nodes'][root]['translation'] = (REFLECT @ local_matrix(exporter.go_transform(driver)) @ REFLECT)[:3, 3].tolist()
    builder.document['scenes'] = [{'nodes': [root]}]; builder.finish_skins()
    target = output / 'driver-rig.glb'; builder.save(target)
    car_inv = np.linalg.inv(exporter.world(exporter.go_transform(car)))
    def reference(go):
        t = exporter.go_transform(go)
        matrix = REFLECT @ car_inv @ exporter.world(t) @ REFLECT
        return {'name': go.m_Name, 'unityPathId': go.object_reader.path_id,
            'transformPathId': t.object_reader.path_id,
            'localMatrix': (REFLECT @ local_matrix(t) @ REFLECT).T.reshape(-1).tolist(),
            'carMatrix': matrix.T.reshape(-1).tolist(), 'carPosition': matrix[:3, 3].tolist(),
            'parentName': t.m_Father.read().m_GameObject.read().m_Name if t.m_Father.m_PathID else None}
    def descendants(go):
        yield go
        for child in exporter.go_transform(go).m_Children:
            yield from descendants(child.read().m_GameObject.read())
    children = list(descendants(driver)); bones = {g.m_Name: g for g in children}
    component = None
    for c in car.m_Component:
        o = c.component.deref()
        if o.type.name == 'MonoBehaviour':
            d = o.read_typetree(check_read=False, wrap=True)
            if d.m_Script.read().m_ClassName == 'DriverWheelHandIk': component = o; break
    config = serialized_config(component.get_raw_data())
    references = {}
    for key in ['steeringWheel', 'leftGrip', 'rightGrip', 'handbrakeLocation']:
        pointer = config[key]['pathId']; t = exporter.transforms[pointer]
        references[key] = reference(t.m_GameObject.read())
    arms = {}
    for side in ['L', 'R']:
        arm = {name: reference(bones[f'{name}.{side}']) for name in ['Shoulder', 'UpperArm', 'LowerArm', 'Wrist']}
        wrist = bones[f'Wrist.{side}']
        samples = []
        for contains in ['Index2', 'Thumb2', 'Middle2', 'Pinky2', 'Ring2']:
            sample = next(g for g in descendants(wrist) if contains in g.m_Name)
            samples.append(reference(sample))
        palm = np.mean([s['carPosition'] for s in samples], axis=0)
        wrist_matrix = np.asarray(arm['Wrist']['carMatrix']).reshape(4, 4).T
        rotation = wrist_matrix[:3, :3] / np.linalg.norm(wrist_matrix[:3, :3], axis=0)
        arm['palmSamples'] = samples; arm['restPalmCar'] = palm.tolist()
        arm['palmInWristRotationOnly'] = (rotation.T @ (palm - wrist_matrix[:3, 3])).tolist()
        grip_matrix = np.asarray(references['leftGrip' if side == 'L' else 'rightGrip']['carMatrix']).reshape(4, 4).T
        grip_rotation = grip_matrix[:3, :3] / np.linalg.norm(grip_matrix[:3, :3], axis=0)
        arm['wristOnGripRotationMatrix'] = (grip_rotation.T @ rotation).T.reshape(-1).tolist()
        arm['upperLength'] = float(np.linalg.norm(np.array(arm['UpperArm']['carPosition']) - arm['LowerArm']['carPosition']))
        arm['lowerLength'] = float(np.linalg.norm(np.array(arm['LowerArm']['carPosition']) - arm['Wrist']['carPosition']))
        arms[side] = arm
    report = {'schemaVersion': 1, 'source': 'Native DriverWheelHandIk + original level1 rig',
        'sourceHashes': {name: hashlib.sha256((runtime / name).read_bytes()).hexdigest() for name in ['level1', 'sharedassets1.assets']},
        'serializedComponentSha256': hashlib.sha256(component.get_raw_data()).hexdigest(),
        'copyright': 'Original game and assets: Stellux Interactive. Authorized original content; excluded from source-code MIT license.',
        'model': {'url': '/assets/driver-rig.glb', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'bytes': target.stat().st_size, 'skins': len(builder.document['skins']), 'nodes': len(builder.document['nodes']),
            'replaceOriginalNode': driver.m_Name, 'attachParent': exporter.go_transform(driver).m_Father.read().m_GameObject.read().m_Name,
            'rootTransformAlreadyIncluded': True},
        'serialized': config, 'references': references, 'arms': arms,
        'coordinates': 'Reflected-X browser coordinates. Matrices column-major. Palm offsets exclude scale, matching native inverse(rotation)*(palmWorld-wristWorld).',
        'runtime': {'executionOrder': 300, 'TrySetup': '0x4F8150', 'BakeRestPoseOnGrips': '0x4F29D0',
            'SolveArm': '0x4F72D0', 'SolveIkChain': '0x4F8010', 'GetElbowHint': '0x4F5290',
            'palmSamples': 'First descendant matching each of Index2, Thumb2, Middle2, Pinky2, Ring2; mean world positions.',
            'restBake': 'TrySetup caches source rest, wrist-on-grip rotations and palm axes, directly solves both arms to grips at zero steer, then re-caches rest and bone axes. BakeRestPoseOnGrips repeats the grip solve. This exported rig retains the serialized source pose, not the executed runtime bake.',
            'limitation': 'Source hierarchy/skin/targets recovered exactly; runtime IK execution is not baked into this model. Browser hand motion requires a solver and runtime visual verification.'}}
    path = output / 'DriverWheelHandIk.json'; path.write_text(json.dumps(rounded(report), indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--output', type=Path, default=ROOT / 'local/web-assets/driver-rig-candidate')
    args = parser.parse_args(); print(json.dumps(export(args.runtime, args.output), indent=2))
