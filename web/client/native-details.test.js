import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {detailPatch,NativeDetails,loadNativeDetails} from './native-details.js';
function fixture({resolution=4,patchSamples=2,size=4}={}){
 const transform=new THREE.Matrix4().makeTranslation(10,2,-5),terrain={resolution:3,heightDivisor:32767,spacing:[size/2,80,size/2],size:[size,80,size],matrix:transform.toArray()},heights=new ArrayBuffer(18);for(let i=0;i<9;i++)new DataView(heights).setUint16(i*2,32767,true);
 const layer={coverageUrl:'/coverage',textureUrl:'/sprite',textureSha256:'same',density:1,healthyColor:[.62,.82,.38,1],dryColor:[.52,.68,.32,1],minWidth:.45,maxWidth:.8,minHeight:.35,maxHeight:.65};
 const data={resolution,patchSamples,patchCount:resolution/patchSamples,density:.55,renderDistance:55,layers:[layer,{...layer,coverageUrl:'/coverage2',textureUrl:'/sprite2'}]},coverages=[new Uint8Array(resolution**2),new Uint8Array(resolution**2)],textures=new Map([['/sprite',new THREE.Texture()],['/sprite2',new THREE.Texture()]]);
 return{source:{data:{terrain},heights},details:{data,coverages,textures}};
}
test('grass preserves zero-painted cells and source height scale/handedness with deterministic native-size sprites',()=>{
 const{source,details}=fixture();details.coverages[0][1*4+1]=7;
 const [first,second]=detailPatch(source,details,0,0);assert.ok(first.count>0);assert.equal(second.count,0);
 assert.deepEqual(detailPatch(source,details,0,0)[0],first,'regenerated patches keep their exact deterministic placement');
 for(let i=0;i<first.count;i++){
  assert.ok(first.positions[i*3]>8&&first.positions[i*3]<9);assert.equal(first.positions[i*3+1],82);assert.ok(first.positions[i*3+2]>-4&&first.positions[i*3+2]<-3);
  assert.ok(first.sizes[i*2]>=.45&&first.sizes[i*2]<=.8);assert.ok(first.sizes[i*2+1]>=.35&&first.sizes[i*2+1]<=.65);
 }
 assert.equal(detailPatch(source,details,1,1)[0].count,0);
});
test('nearby grass cache stays bounded, batches two layers, reuses unchanged patches and disposes GPU resources',()=>{
 const{source,details}=fixture({resolution:64,patchSamples:2,size:500});source.data.terrain.matrix=new THREE.Matrix4().toArray();details.coverages.forEach(coverage=>coverage.fill(2));
 const world=new THREE.Group(),grass=new NativeDetails(world,source,details);grass.update(-250,250,0);
 assert.equal(world.children.length,2,'all active patches share only two draw batches');assert.ok(grass.patches.size>30&&grass.patches.size<80);
 for(const mesh of grass.meshes){assert.ok(mesh.geometry.instanceCount>0&&mesh.geometry.instanceCount<64**2);assert.equal(mesh.material.alphaTest,.5);assert.equal(mesh.castShadow,false);}
 const geometry=grass.meshes[0].geometry,keys=new Set(grass.patches.keys());for(let i=0;i<60;i++)grass.update(-250,250,i);assert.equal(grass.meshes[0].geometry,geometry,'stationary frames do not rebuild instance buffers');
 let oldDisposed=false;geometry.addEventListener('dispose',()=>oldDisposed=true);grass.update(-490,490,1000);assert.equal(oldDisposed,true);assert.ok([...grass.patches.keys()].some(key=>!keys.has(key)));assert.ok(grass.patches.size<80);
 let finalDisposed=false;grass.meshes[0].geometry.addEventListener('dispose',()=>finalDisposed=true);grass.dispose();assert.equal(finalDisposed,true);assert.equal(world.children.length,0);assert.equal(grass.patches.size,0);grass.dispose();
});
test('grass material keeps billboards vertical and camera facing while clipping to the original 55m distance',()=>{
 const{source,details}=fixture(),grass=new NativeDetails(new THREE.Group(),source,details),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
 grass.meshes[0].material.onBeforeCompile(shader);assert.match(shader.vertexShader,/cameraPosition-nativeGrassOffset/);assert.match(shader.vertexShader,/nativeFacing.y=0/);assert.match(shader.fragmentShader,/nativeGrassDistance\)discard/);assert.equal(shader.uniforms.nativeGrassDistance.value,55);grass.dispose();
});
test('detail loader validates coverage bytes and decodes identical original prototype sprites once',async t=>{
 const original=globalThis.fetch,{details}=fixture(),calls=[];t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async url=>String(url).endsWith('.json')?Response.json(details.data):new Response(new Uint8Array(16));
 const loaded=await loadNativeDetails(1,{async loadAsync(url){calls.push(url);return new THREE.Texture();}});assert.equal(loaded.coverages.length,2);assert.equal(calls.length,1);assert.equal(loaded.textures.get('/sprite'),loaded.textures.get('/sprite2'));assert.equal(loaded.textures.get('/sprite').colorSpace,THREE.SRGBColorSpace);
 globalThis.fetch=async url=>String(url).endsWith('.json')?Response.json(details.data):new Response(new Uint8Array(15));
 await assert.rejects(loadNativeDetails(1,{loadAsync:async()=>new THREE.Texture()}),/incomplete/);
});
