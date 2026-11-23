import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {tentWeights,tentPairs,NativeShadows} from './native-shadows.js';
import {prepareCabinSurfaces} from './cabin-materials.js';
import {projectShadowSphere,sphereCascade,fitCascadeSpheres} from './native-shadow-projection.js';
import {NativeShadowCaster,casterBias} from './native-shadow-caster.js';
const native=JSON.parse(readFileSync(new URL('../public/assets/cabin-surfaces.json',import.meta.url)));

test('source seven-texel tent integrates every covered texel and pairs without losing weight',()=>{
 assert.deepEqual(tentWeights(0).map(x=>x/.081632),[.125,1,2,3,3,2,1,.125]);
 for(const offset of [-.5,-.3,0,.25,.5]){
  const weights=tentWeights(offset),pairs=tentPairs(offset);assert.ok(Math.abs(weights.reduce((a,b)=>a+b)-.999992)<1e-10);
  assert.ok(weights.every(w=>w>=0));assert.ok(Math.abs(pairs.reduce((a,b)=>a+b.weight,0)-.999992)<1e-10);
  for(let i=0;i<4;i++){const fraction=pairs[i].offset-(-3.5+i*2);assert.ok(Math.abs(pairs[i].weight*fraction-weights[i*2+1])<1e-12);}
 }
 assert.deepEqual(tentWeights(-.3).map(x=>Number(x.toFixed(10))),tentWeights(.3).reverse().map(x=>Number(x.toFixed(10))));
});

test('four stable cascades retain original split fractions, light strength, material hooks and shader filter',t=>{
 const chunks={lights_fragment_begin:THREE.ShaderChunk.lights_fragment_begin,lights_pars_begin:THREE.ShaderChunk.lights_pars_begin};
 t.after(()=>Object.assign(THREE.ShaderChunk,chunks));
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(90,16/9,.01,1000),sun=new THREE.DirectionalLight(0xffffff,1.75);scene.add(sun);
 const shadows=new NativeShadows(scene,camera,sun,native);assert.equal(shadows.csm.lights.length,4);assert.ok(!scene.children.includes(sun));
 assert.deepEqual(shadows.csm.breaks,[...native.shadows.cascadeSplits,1]);assert.equal(shadows.csm.maxFar,160);
 for(const light of shadows.csm.lights){assert.equal(light.shadow.mapSize.x,1024);assert.ok(Math.abs(light.shadow.intensity-.92)<1e-6);assert.ok(light.shadow.camera.layers.isEnabled(1));}
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());scene.add(mesh);let originalCalled=0;mesh.material.onBeforeCompile=()=>originalCalled++;
 prepareCabinSurfaces(mesh,new THREE.CubeTexture(),.95,8,native);shadows.prepare(mesh);shadows.prepare(mesh);
 const shader={uniforms:{},vertexShader:'#include <shadowmap_vertex>',fragmentShader:'#include <shadowmap_pars_fragment>\n#include <lights_fragment_begin>\n#include <lights_fragment_maps>\n#include <lights_physical_pars_fragment>'};
 mesh.material.onBeforeCompile(shader,{});assert.equal(originalCalled,1);assert.equal(mesh.material.defines.CSM_CASCADES,4);assert.ok(shader.uniforms.CSM_cascades);
 assert.ok(shader.fragmentShader.includes('nativeTentPairs'));assert.ok(shader.fragmentShader.includes('nativeCascadeIndex'));
 assert.ok(mesh.customDepthMaterial);assert.equal(mesh.material.shadowSide,mesh.material.side);
 assert.ok(shader.fragmentShader.includes('nativeCabinEquator'));assert.ok(shader.fragmentShader.match(/directLight.color \*= PI/g).length>=3,'every CSM branch uses source intensity, not four additive suns');
 shadows.update();const positions=shadows.csm.lights.map(light=>light.position.clone());shadows.update();shadows.csm.lights.forEach((light,i)=>assert.ok(light.position.equals(positions[i])));
 mesh.material.dispose();assert.equal(shadows.csm.shaders.size,0);mesh.geometry.dispose();shadows.dispose();
});

test('projection matrices match original runtime captures across six sphere/viewport fixtures',t=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-shadow-matrices.json',import.meta.url)));
 const reflectX=new THREE.Matrix4().makeScale(-1,1,1),convertAtlas=new THREE.Matrix4().set(2,0,0,0,0,2,0,0,0,0,-1,1,0,0,0,1);
 const sun=new THREE.Vector3(-fixture.sourceSun[0],fixture.sourceSun[1],fixture.sourceSun[2]).normalize();let maximum=0;
 for(const c of fixture.cases){
  const s=new THREE.Vector4(-c.sphere[0],c.sphere[1],c.sphere[2],c.sphere[3]);
  const actual=projectShadowSphere(s,sun,fixture.resolution),expected=convertAtlas.clone().multiply(new THREE.Matrix4().fromArray(c.atlasMatrix)).multiply(reflectX);
  for(let i=0;i<16;i++)maximum=Math.max(maximum,Math.abs(actual.elements[i]-expected.elements[i]));
 }
 assert.ok(maximum<1e-6,`native matrix deviation ${maximum}`);t.diagnostic(JSON.stringify({nativeProjectionFixtures:fixture.cases.length,maximumMatrixElementDeviation:maximum}));
});

test('world-space spheres select near off-axis receivers rather than camera depth slices',()=>{
 const spheres=[new THREE.Vector4(0,0,20,40),new THREE.Vector4(0,0,47,96),new THREE.Vector4(0,0,86,175),new THREE.Vector4(0,0,160,326)];
 assert.equal(sphereCascade(new THREE.Vector3(0,0,45),spheres),0,'45m straight ahead is still inside the source near sphere');
 assert.equal(sphereCascade(new THREE.Vector3(45,0,45),spheres),1,'same camera depth at an outer edge belongs to a later sphere');
 assert.equal(sphereCascade(new THREE.Vector3(0,0,1000),spheres),-1);
});

test('caster bias has the native inset direction, incidence response and near-plane clamping',()=>{
 const sun=[0,1,0];assert.deepEqual(casterBias([0,0,0],[0,1,0],sun,.035,.3,.1).toArray(),[0,-.012250000000000002,0]);
 const tangent=casterBias([0,0,0],[1,0,0],sun,.035,.3,.1);assert.ok(Math.abs(tangent.x+.105)<1e-12);assert.ok(Math.abs(tangent.y+.01225)<1e-12);
});

test('exported settings keep original camera-only blur separate from cabin and source shadows',()=>{
 const motion=native.postprocessing.motionBlur;assert.equal(motion.mode,'CameraOnly');assert.equal(motion.quality,'Medium');assert.equal(motion.iterations,3);assert.ok(Math.abs(motion.intensity-.22)<1e-6);assert.equal(motion.cabinExcluded,true);
 assert.equal(native.shadows.sourcePathId,2805);assert.equal(native.shadows.softQuality,3);assert.equal(native.shadows.atlasResolution,2048);
});


test('frustum bounds remain close to native iterative captures with positive finite depth',t=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-shadow-matrices.json',import.meta.url)));
 let maximumCenter=0,maximumRadius=0;
 // Fixture 3 changed camera metadata after the native render callback; its
 // spheres belong to fixture 0. It remains valid for projection-only checks.
 for(const c of fixture.cases.filter(c=>c.fixture!==3)){
  const camera=new THREE.PerspectiveCamera(c.camera.fov,c.camera.aspect,c.camera.near,c.camera.far);
  camera.matrixWorld.copy(new THREE.Matrix4().fromArray(c.camera.view).multiply(new THREE.Matrix4().makeScale(-1,1,1)).invert());
  camera.matrixWorld.decompose(camera.position,camera.quaternion,camera.scale);
  const spheres=Array.from({length:4},()=>new THREE.Vector4());fitCascadeSpheres(camera,native.shadows,spheres);
  const expected=new THREE.Vector3(-c.sphere[0],c.sphere[1],c.sphere[2]);
  maximumCenter=Math.max(maximumCenter,new THREE.Vector3(...spheres[0].toArray()).distanceTo(expected));
  maximumRadius=Math.max(maximumRadius,Math.abs(spheres[0].w-c.sphere[3]));
  assert.ok(spheres.every(s=>s.w>0&&Number.isFinite(s.w)));
 }
 assert.ok(maximumCenter<.27);assert.ok(maximumRadius<.125);
 t.diagnostic(JSON.stringify({sphereFit:'analytic; original uses 64 conservative iterations',maximumCenterMeters:maximumCenter,maximumRadiusMeters:maximumRadius}));
});

test('caster shader enables skinned and morphed normals without displacement maps',()=>{
 const caster=new NativeShadowCaster(new THREE.Vector3(0,1,0),native.shadows);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader};caster.material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/#if 1\s+#include <beginnormal_vertex>/);
 assert.match(shader.vertexShader,/#include <skinnormal_vertex>/);
 assert.match(shader.vertexShader,/gl_Position.z=max/);caster.dispose();
});
