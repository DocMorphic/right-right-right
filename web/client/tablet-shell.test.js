import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {restoreTabletShell} from './tablet-shell.js';
import {TabletHands,mirrorTabletWrist} from './tablet-hands.js';
import {prepareCabinSurfaces} from './cabin-materials.js';
const asset=name=>new URL(`../public/assets/${name}`,import.meta.url);
const spec=JSON.parse(readFileSync(asset('tablet-shell.json'),'utf8'));
async function load(name){
 const bytes=readFileSync(asset(name)),loader=new GLTFLoader();loader.register(parser=>({name:'QA_MATERIALS',loadMaterial:index=>Promise.resolve(new THREE.MeshStandardMaterial({name:parser.json.materials[index]?.name||''}))}));
 return(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}

test('original tablet startup restores all fourteen parts, exact dimensions and raised screen',async()=>{
 const tablet=await load('tablet.glb'),result=restoreTabletShell(tablet,spec);
 assert.equal(result.shell.children.length,14);assert.deepEqual(result.shell.children.map(child=>child.name),spec.parts.map(part=>part.name));
 assert.ok(Math.abs(result.root.scale.y-.052)<1e-7);assert.ok(Math.abs(result.root.scale.x-.26)<1e-7);assert.ok(Math.abs(result.root.scale.z-.32)<1e-7);
 assert.ok(Math.abs(result.root.getObjectByName('Screen').position.y-(.5+.008/.052))<1e-7);
 for(let i=0;i<spec.parts.length;i++){
  const native=spec.parts[i],mesh=result.shell.children[i];assert.deepEqual(mesh.scale.toArray(),native.scale);
  assert.deepEqual(mesh.position.toArray(),[-native.position[0],native.position[1],native.position[2]]);
  assert.ok(mesh.quaternion.angleTo(new THREE.Quaternion(native.rotation[0],-native.rotation[1],-native.rotation[2],native.rotation[3]))<.001);
 }
 assert.ok(result.shell.getObjectByName('Button').geometry.isBufferGeometry);assert.throws(()=>restoreTabletShell(tablet,spec),/already restored/);
 const geometries=new Set(result.shell.children.map(mesh=>mesh.geometry)),materials=new Set(result.shell.children.map(mesh=>mesh.material));let disposed=0;
 for(const resource of [...geometries,...materials])resource.addEventListener('dispose',()=>disposed++);result.dispose();assert.equal(disposed,geometries.size+materials.size);
});

test('original navigator skin matches the native meshes, reaches grips and restores its seated pose',async t=>{
 const [car,nav,tablet]=await Promise.all(['car.glb','navigator-rig.glb','tablet.glb'].map(load));car.getObjectByName('BodyVisual').add(nav);restoreTabletShell(tablet,spec);
 const anchor=car.getObjectByName('HoldAnchor_Passenger');car.updateMatrixWorld(true);anchor.getWorldPosition(tablet.position);anchor.getWorldQuaternion(tablet.quaternion);tablet.updateMatrixWorld(true);
 // Compare every rendered skin vertex against the existing native seated mesh
 // export, rather than validating only invisible target/bone transforms.
 const sourceId=node=>{while(node&&node.userData.unityPathId==null)node=node.parent;return node?.userData.unityPathId;};
 const baked=new Map();car.traverse(node=>{if(node.isMesh&&!node.isSkinnedMesh&&sourceId(node)!=null)baked.set(sourceId(node),node);});
 let comparedVertices=0,maximumRestError=0;const skins=new Set();
 nav.traverse(mesh=>{if(!mesh.isSkinnedMesh||skins.has(sourceId(mesh)))return;skins.add(sourceId(mesh));mesh.skeleton.update();const original=baked.get(sourceId(mesh));assert.ok(original,'source seated body part exists');assert.equal(mesh.geometry.attributes.position.count,original.geometry.attributes.position.count);
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){const a=mesh.localToWorld(mesh.getVertexPosition(i,new THREE.Vector3())),b=original.localToWorld(original.getVertexPosition(i,new THREE.Vector3()));maximumRestError=Math.max(maximumRestError,a.distanceTo(b));comparedVertices++;}
 });
 assert.equal(skins.size,4);assert.ok(comparedVertices>1000);assert.ok(maximumRestError<1e-6,`original navigator rest mesh deviation ${maximumRestError}m`);t.diagnostic(JSON.stringify({nativeNavigatorSkins:skins.size,comparedVertices,maximumRestErrorMeters:maximumRestError}));
 const config=JSON.parse(readFileSync(asset('NavigatorTabletHandIk.json'),'utf8')).serialized,hands=new TabletHands(nav,tablet,config);
 for(let i=0;i<10;i++)hands.update(true);
 for(const arm of hands.arms){assert.ok(arm.error<.005,`${arm.side} palm error ${arm.error}m`);assert.ok(arm.rest[0].angleTo(arm.shoulder.quaternion)<=config.maxShoulderDegrees*Math.PI/180+1e-7);}
 const tabletRotation=tablet.getObjectByName('Tablet').getWorldQuaternion(new THREE.Quaternion());
 assert.ok(hands.arms[1].wrist.getWorldQuaternion(new THREE.Quaternion()).angleTo(mirrorTabletWrist(tabletRotation,hands.arms[0].wrist.getWorldQuaternion(new THREE.Quaternion())))<1e-6,'right wrist mirrors left in tablet-local coordinates, as in the source LateUpdate');
 // Stability over a long hold: no accumulating forearm roll or hand drift.
 const heldPose=hands.arms.map(arm=>arm.bones.map(bone=>bone.quaternion.clone()));
 for(let i=0;i<300;i++)hands.update(true);
 hands.arms.forEach((arm,a)=>arm.bones.forEach((bone,b)=>assert.ok(bone.quaternion.clone().normalize().angleTo(heldPose[a][b].clone().normalize())<1e-6)));
 hands.update(false);for(const arm of hands.arms)arm.bones.forEach((bone,i)=>assert.ok(bone.quaternion.equals(arm.idle[i])));
 const stolen=tablet.clone();stolen.position.x+=.015;hands.setTablet(stolen);hands.update(true);for(const arm of hands.arms)assert.ok(arm.error<.005);hands.dispose();
});

test('paint respects original reflection flags and uses its recovered custom lighting program',()=>{
 const root=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({name:'body'}));root.material.userData.unityShader='RollingWreck/BodyBothSides';
 const native=JSON.parse(readFileSync(asset('cabin-surfaces.json'),'utf8'));prepareCabinSurfaces(root,new THREE.Texture(),.95,8,native);
 assert.equal(root.material.envMap,null,'paint disabled environment reflections in the original');assert.equal(root.material.toneMapped,false);
 const shader={uniforms:{},vertexShader:'',fragmentShader:['#include <lights_fragment_begin>','#include <lights_fragment_maps>','#include <lights_physical_pars_fragment>'].join('\n')};root.material.onBeforeCompile(shader,{});
 assert.ok(shader.fragmentShader.includes('luminance*vec3(1.04,.96,.92)'));assert.ok(shader.fragmentShader.includes('exp2(nativePaintSmoothness*8.+1.)'));
 assert.ok(shader.fragmentShader.includes('nativeCabinEquator'));assert.ok(!shader.fragmentShader.includes('getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal )'));
 assert.deepEqual(shader.uniforms.nativeCabinSun.value.toArray(),native.sunDirection);
 assert.equal(spec.screenStyle.markerSize,26);assert.deepEqual(spec.screenStyle.markerFill,[1,.55,.08,1]);
});

test('native reflection export preserves all six HDR faces in linear half-float data',()=>{
 const {reflection}=JSON.parse(readFileSync(asset('cabin-surfaces.json'),'utf8'));
 assert.equal(reflection.sourceFile,'sharedassets0.assets');assert.equal(reflection.sourcePathId,18);assert.equal(reflection.type,'RGBA16F');assert.equal(reflection.colorSpace,'linear');assert.equal(reflection.faces.length,6);
 let maximum=0;
 for(const url of reflection.faces){
  const bytes=readFileSync(asset(url.replace('/assets/','')));assert.equal(bytes.length,reflection.width*reflection.width*8);
  for(let pixel=0;pixel<bytes.length;pixel+=8){for(let channel=0;channel<3;channel++){const value=THREE.DataUtils.fromHalfFloat(bytes.readUInt16LE(pixel+channel*2));assert.ok(Number.isFinite(value)&&value>=0);maximum=Math.max(maximum,value);}assert.equal(THREE.DataUtils.fromHalfFloat(bytes.readUInt16LE(pixel+6)),1);}
 }
 assert.ok(maximum>1&&maximum<2,'native HDR highlights are preserved rather than clipped into background PNGs');
 assert.equal(reflection.mips.length,reflection.nativeMipCount-1);
 for(const [level,mip]of reflection.mips.entries()){
  assert.equal(mip.width,reflection.width/2**(level+1));assert.equal(mip.faces.length,6);
  for(const url of mip.faces){const bytes=readFileSync(asset(url.replace('/assets/','')));assert.equal(bytes.length,mip.width*mip.width*8);}
 }
});
