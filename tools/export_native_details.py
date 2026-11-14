#!/usr/bin/env python3
"""Preserve original painted terrain-detail coverage and billboard prototypes.

This exports density data, not invented/randomly scattered grass positions.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import UnityPy

from export_web_assets import ROOT, color
from export_native_courses import digest, rounded
from export_native_scenery import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, default=ROOT / 'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data')
    parser.add_argument('--assets', type=Path, default=ROOT / 'web/public/assets')
    args = parser.parse_args(); output = args.assets / 'scenery'; output.mkdir(parents=True, exist_ok=True)
    reports = []
    catalog = json.loads((ROOT / 'web/shared/native-courses.generated.json').read_text())
    for number in (1, 2, 3):
        e = UnityPy.load(str(args.runtime / f'level{number}'), str(args.runtime / f'sharedassets{number}.assets'))
        terrain = next(o.read() for o in e.objects if o.assets_file.name == f'level{number}' and o.type.name == 'Terrain')
        data = terrain.m_TerrainData.read(); detail = data.m_DetailDatabase
        samples, count = detail.m_PatchSamples, detail.m_PatchCount; resolution = samples * count
        grids = [np.zeros((resolution, resolution), dtype=np.uint8) for _ in detail.m_DetailPrototypes]
        for index, patch in enumerate(detail.m_Patches):
            if len(patch.coverage) != len(patch.layerIndices) * samples * samples:
                raise ValueError('Unsupported native detail patch coverage layout.')
            x, z = index % count, index // count
            for layer_index, layer in enumerate(patch.layerIndices):
                block = np.asarray(patch.coverage[layer_index * samples * samples:(layer_index + 1) * samples * samples], dtype=np.uint8).reshape(samples, samples)
                grids[layer][z * samples:(z + 1) * samples, x * samples:(x + 1) * samples] = block
        layers = []
        for i, (prototype, grid) in enumerate(zip(detail.m_DetailPrototypes, grids)):
            filename = f'native-{number:02}.detail-{i:02}.bin'; (output / filename).write_bytes(grid.tobytes())
            texture = prototype.prototypeTexture.read(); image = texture.image
            texture_file = f'native-{number:02}.detail-{i:02}.png'; image.save(output / texture_file, optimize=True)
            layers.append({'prototype': i, 'coverageUrl': '/assets/scenery/' + filename,
                'coverageSha256': digest(output / filename), 'textureUrl': '/assets/scenery/' + texture_file,
                'textureSize': [image.width, image.height], 'textureSha256': digest(output / texture_file),
                'textureName': texture.m_Name, 'totalCells': int(grid.size), 'nonzeroCells': int(np.count_nonzero(grid)),
                'coverageSum': int(grid.sum()), 'coverageMaximum': int(grid.max()),
                'healthyColor': color(prototype.healthyColor), 'dryColor': color(prototype.dryColor),
                'minWidth': prototype.minWidth, 'maxWidth': prototype.maxWidth,
                'minHeight': prototype.minHeight, 'maxHeight': prototype.maxHeight,
                'noiseSpread': prototype.noiseSpread, 'noiseSeed': prototype.noiseSeed,
                'density': prototype.density, 'renderMode': prototype.renderMode,
                'usePrototypeMesh': prototype.usePrototypeMesh, 'positionJitter': prototype.positionJitter,
                'alignToGround': prototype.alignToGround, 'targetCoverage': prototype.targetCoverage,
                'useDensityScaling': prototype.useDensityScaling, 'holeTestRadius': prototype.holeTestRadius})
        # Check row-major interpretation against original road clearing, rather
        # than claiming to recover Unity's runtime random placement algorithm.
        source = catalog['courses'][number - 1]; points = np.asarray(source['points'])
        scenery = json.loads((output / f'native-{number:02}.json').read_text()); matrix = np.array(scenery['terrain']['matrix']).reshape(4, 4).T
        local = (np.linalg.inv(matrix) @ np.column_stack([points, np.ones(len(points))]).T).T
        size = scenery['terrain']['size']; x = np.clip((-local[:, 0] / size[0] * resolution).astype(int), 0, resolution - 1)
        z = np.clip((local[:, 2] / size[2] * resolution).astype(int), 0, resolution - 1)
        road_coverage = [float((grid[z, x] != 0).mean()) for grid in grids]
        transposed = [float((grid[x, z] != 0).mean()) for grid in grids]
        report = {'schemaVersion': 1, 'scene': str(number), 'resolution': resolution,
            'source': scenery['source'],
            'patchCount': count, 'patchSamples': samples, 'coverageEncoding': 'uint8 row-major[z][x], native painted instance counts; not random instance positions',
            'scatterMode': detail.m_DetailScatterMode, 'scatterModeName': 'InstanceCountMode' if detail.m_DetailScatterMode == 1 else 'CoverageMode',
            'terrainMatrix': scenery['terrain']['matrix'], 'terrainSize': size,
            'cellSize': [size[0] / resolution, size[2] / resolution],
            'positionFormula': 'terrainMatrix * [-(x+fractionX)*cellSize[0], localTerrainHeight, (z+fractionZ)*cellSize[1], 1]',
            'density': terrain.m_DetailObjectDensity,
            'renderDistance': terrain.m_DetailObjectDistance,
            'waving': {'speed': detail.m_WavingGrassSpeed, 'strength': detail.m_WavingGrassStrength, 'amount': detail.m_WavingGrassAmount},
            'layers': layers, 'validation': {'roadCenterNonzeroFraction': road_coverage, 'transposedRoadNonzeroFraction': transposed},
            'copyright': 'Original detail data and texture: Stellux Interactive. Authorized original content; excluded from source-code MIT license.',
            'limitation': 'Native coverage/prototypes recovered. Unity terrain runtime scatter positions and exact grass shader behavior are not serialized in these assets.'}
        write_json(output / f'native-{number:02}.details.json', report); reports.append(rounded(report))
        print(json.dumps({'scene': str(number), 'resolution': resolution, 'layers': [dict(prototype=l['prototype'], nonzeroCells=l['nonzeroCells'], maximum=l['coverageMaximum']) for l in layers], 'validation': report['validation']}), flush=True)
    (ROOT / 'local/web-assets/native-details-provenance.json').write_text(json.dumps(reports, indent=2) + '\n')


if __name__ == '__main__': main()
