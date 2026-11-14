import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {terrainChunks} from './native-scenery.js';

test('authored terrain chunks preserve original height samples, reflected positions and splat UVs',async()=>{
  for(const scene of ['01','02','03']){
    const data=JSON.parse(await readFile(new URL(`../public/assets/scenery/native-${scene}.json`,import.meta.url))),spec=data.terrain;
    const bytes=await readFile(new URL(`../public${spec.heightUrl}`,import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),samples=new DataView(buffer),matrix=new THREE.Matrix4().fromArray(spec.matrix),chunks=terrainChunks(spec,buffer),unique=new Set();let triangles=0;
    for(const geometry of chunks){
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');triangles+=geometry.index.count/3;
      for(let i=0;i<positions.count;i++){
        const col=Math.round(uv.getX(i)*(spec.resolution-1)),row=Math.round((1-uv.getY(i))*(spec.resolution-1));unique.add(`${col},${row}`);
        const expected=new THREE.Vector3(-col*spec.size[0]/(spec.resolution-1),samples.getUint16((row*spec.resolution+col)*2,true)/spec.heightDivisor*spec.spacing[1],row*spec.size[2]/(spec.resolution-1)).applyMatrix4(matrix);
        assert.ok(expected.distanceTo(new THREE.Vector3().fromBufferAttribute(positions,i))<.0001);assert.ok(normals.getY(i)>0,'terrain normals face upward');
      }
      geometry.dispose();
    }
    assert.equal(unique.size,spec.resolution**2);assert.equal(triangles,(spec.resolution-1)**2*2);assert.ok(data.backgroundTrees.length>0);assert.ok(data.props.length>0);
  }
});
