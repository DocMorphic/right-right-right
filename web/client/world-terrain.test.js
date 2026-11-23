import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import * as T from'three';
import '../server/spectator-terrain.js';
import{terrainChunks}from'./native-scenery.js';import{nativeTerrainHeight}from'../shared/world-collision.js';
test('full-resolution collision heights agree with raycasts against the actual original terrain rendering',()=>{
 const ray=new T.Raycaster(),material=new T.MeshBasicMaterial({side:T.DoubleSide});let probes=0,maxError=0;
 for(let id=1;id<=3;id++){
  const data=JSON.parse(readFileSync(new URL(`../public/assets/scenery/native-0${id}.json`,import.meta.url))),spec=data.terrain,bytes=readFileSync(new URL('../public'+spec.heightUrl,import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),geometries=terrainChunks(spec,buffer),meshes=geometries.map(g=>{const m=new T.Mesh(g,material);m.updateMatrixWorld();return m;});
  for(const [u,v]of[[.18341,.27132],[.68231,.76223],[.49373,.23567],[.33818,.58538],[.79521,.32162]]){
   const x=spec.matrix[12]-u*spec.size[0],z=spec.matrix[14]+v*spec.size[2];ray.set(new T.Vector3(x,1000,z),new T.Vector3(0,-1,0));const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit);const height=nativeTerrainHeight({nativeScene:id},x,z),error=Math.abs(height-hit.point.y);maxError=Math.max(maxError,error);assert.ok(error<.0001,`native ${id}: ${error}m`);probes++;
  }
  for(const g of geometries)g.dispose();
 }
 material.dispose();console.log(JSON.stringify({terrainRaycastProbes:probes,maximumErrorMetres:maxError}));
});
