import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {shadeNativeGlass,makeNativeGlass} from './native-glass.js';
import {NativeFrame,neutralChannel} from './native-frame.js';
import {installWindshieldMud} from './windshield-material.js';

test('clean glass matches independently evaluated original pixel bytecode, including back faces',()=>{
  const {rows,...settings}=JSON.parse(readFileSync(new URL('./native-glass-fixtures.json',import.meta.url)));
  for(const {normal,view,light,front,expected} of rows){
    const actual=shadeNativeGlass(normal,view,light,{...settings,front});
    actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-7,`channel ${i}: ${value} != ${expected[i]}`));
  }
});

test('mud retains native premultiplied glass and applies its opaque coverage after clean shading',()=>{
  const spec=JSON.parse(readFileSync(new URL('../public/assets/cabin-surfaces.json',import.meta.url)));
  const original=new THREE.MeshBasicMaterial({color:0xabcdee,opacity:.137});
  const glass=makeNativeGlass(original,spec,{sun:{color:[1,1,1],intensity:1}});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(),glass),body=new THREE.Group();body.add(mesh);
  const {material}=installWindshieldMud(mesh,glass,body);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>\n#include <project_vertex>',fragmentShader:'#include <color_fragment>'};
  material.onBeforeCompile(shader,{});
  assert.equal(material.blendSrc,THREE.OneFactor);assert.equal(material.blendDst,THREE.OneMinusSrcAlphaFactor);
  assert.ok(shader.fragmentShader.indexOf('float mudMask=')>shader.fragmentShader.indexOf('// NATIVE_GLASS_END'));
  assert.ok(shader.fragmentShader.includes('nativeMudLit=mudColor*nativeGlassLight'));
  assert.ok(shader.uniforms.nativeGlassHighlight&&shader.uniforms.mud&&shader.uniforms.nativeGlassLight);
  material.dispose();glass.dispose();original.dispose();mesh.geometry.dispose();
});

test('world postprocessing precedes unprocessed cabin and restores render state, also on failure',()=>{
  const passes=[],renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},shadowMap:{autoUpdate:true},autoClear:false,
    getRenderTarget:()=>null,getDrawingBufferSize:v=>v.set(640,360),setRenderTarget(target){this.target=target;},
    render(scene,camera){passes.push({scene,mask:camera.layers.mask,background:scene.background,target:this.target,autoClear:this.autoClear,shadow:this.shadowMap.autoUpdate});},clearDepth(){passes.push('depth');}};
  const frame=new NativeFrame(renderer),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  scene.background=new THREE.Color('red');const background=scene.background;camera.layers.enable(3);const mask=camera.layers.mask;
  frame.render(scene,camera,100);
  assert.equal(passes[0].mask,1);assert.equal(passes[0].target,frame.target);assert.equal(passes[1].scene,frame.scene);
  assert.equal(passes[2],'depth');assert.equal(passes[3].mask,2);assert.equal(passes[3].background,null);assert.equal(passes[3].shadow,false);
  assert.equal(frame.target.width,640);assert.equal(frame.target.height,360);assert.equal(camera.layers.mask,mask);
  assert.equal(scene.background,background);assert.equal(renderer.autoClear,false);assert.equal(renderer.shadowMap.autoUpdate,true);
  assert.ok(frame.target.depthTexture);assert.equal(frame.target.resolveDepthBuffer,true);
  const firstMatrix=frame.motion.current.clone();frame.motionSettings.active=true;frame.motionSettings.intensity=.22;camera.position.x=.1;frame.render(scene,camera,116);
  assert.equal(frame.material.uniforms.motionIntensity.value,.22);assert.ok(frame.material.uniforms.previousViewProjection.value.equals(firstMatrix));
  assert.ok(!frame.material.uniforms.previousViewProjection.value.equals(frame.motion.current),'committing camera history must not overwrite the matrix used for the rendered frame');
  frame.reset();frame.render(scene,camera,132);assert.equal(frame.material.uniforms.motionIntensity.value,0,'retry/camera reset has no previous exposure');
  renderer.render=()=>{throw new Error('test render failure');};assert.throws(()=>frame.render(scene,camera),/test render failure/);
  assert.equal(camera.layers.mask,mask);assert.equal(scene.background,background);assert.equal(renderer.target,null);
  frame.dispose();
});

test('Unity Neutral has its expected black, midtone and highlight response',()=>{
  assert.equal(neutralChannel(-1),0);assert.equal(neutralChannel(0),0);
  // Evaluated independently with Decimal(50) from Unity Color.hlsl constants.
  assert.ok(Math.abs(neutralChannel(.18)-.1816686348326791)<1e-12);
  assert.ok(neutralChannel(1)>.6&&neutralChannel(1)<1);assert.equal(neutralChannel(100),1);
});

test('integrated graphics frame skips multisampled HDR and motion depth, then restores High',()=>{
 const renderer={extensions:{has:()=>true},capabilities:{maxSamples:4},shadowMap:{autoUpdate:true},getRenderTarget:()=>null,getDrawingBufferSize:v=>v.set(960,540),setRenderTarget(){},render(){},clearDepth(){}};
 const frame=new NativeFrame(renderer,{motionBlur:{active:true,intensity:.22,clamp:.05,iterations:3}}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 frame.setReduced(true);frame.render(scene,camera,100);camera.position.x=.1;frame.render(scene,camera,116);
 assert.equal(frame.target.samples,0);assert.equal(frame.target.texture.type,THREE.UnsignedByteType);assert.equal(frame.target.depthTexture,null);assert.equal(frame.material.uniforms.motionIntensity.value,0);
 frame.setReduced(false);frame.render(scene,camera,132);camera.position.x=.2;frame.render(scene,camera,148);
 assert.equal(frame.target.samples,4);assert.equal(frame.target.texture.type,THREE.HalfFloatType);assert.ok(frame.target.depthTexture);assert.equal(frame.material.uniforms.motionIntensity.value,.22);frame.dispose();
});
