import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cameraVelocity,MotionHistory,blurOffsets} from './native-motion.js';

test('depth reprojection is stationary at rest and preserves depth-dependent camera motion',()=>{
 const camera=new THREE.PerspectiveCamera(90,1,.01,1000);camera.updateMatrixWorld();
 const previous=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 function velocityAt(point){camera.updateMatrixWorld();const current=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),ndc=point.clone().applyMatrix4(current);return cameraVelocity([(ndc.x+1)/2,(ndc.y+1)/2],(ndc.z+1)/2,current.clone().invert(),previous,.05,.22);}
 assert.ok(velocityAt(new THREE.Vector3(1,0,-10)).length()<1e-10);
 camera.position.x=.1;
 const near=velocityAt(new THREE.Vector3(1,0,-10)),far=velocityAt(new THREE.Vector3(1,0,-50));
 assert.ok(Math.abs(near.x-.0022)<1e-10);assert.ok(Math.abs(far.x-.00044)<1e-10);assert.ok(Math.abs(near.y)<1e-10);
 camera.position.x=10;assert.ok(Math.abs(velocityAt(new THREE.Vector3(1,0,-10)).length()-.011)<1e-10,'native clamp applies before intensity');
});

test('medium blur gathers six source samples with source jitter and symmetric shutter extent',()=>{
 assert.deepEqual(blurOffsets(3,.5),[-.5/6,.5/6,-1.5/6,1.5/6,-2.5/6,2.5/6]);
 const a=blurOffsets(3,.2),b=blurOffsets(3,.8);assert.ok(a.every((value,i)=>Math.abs(value+b[i^1])<1e-12));
 assert.ok(a.every(value=>Math.abs(value)<=.5));
});

test('motion history resets on tab resume, spawn, resize, camera cut and explicit retry',()=>{
 const history=new MotionHistory(),camera=new THREE.PerspectiveCamera();
 assert.equal(history.prepare(camera,1280,720,100),false);history.commit(camera,1280,720,100);
 camera.position.x=.1;assert.equal(history.prepare(camera,1280,720,116),true);assert.ok(!history.current.equals(history.previous));history.commit(camera,1280,720,116);
 assert.equal(history.prepare(camera,1280,720,500),false);assert.ok(history.current.equals(history.previous));history.commit(camera,1280,720,500);
 assert.equal(history.prepare(camera,640,360,516),false);history.commit(camera,640,360,516);
 camera.position.x=20;assert.equal(history.prepare(camera,640,360,532),false);history.commit(camera,640,360,532);
 camera.rotation.y=1;assert.equal(history.prepare(camera,640,360,548),false);history.commit(camera,640,360,548);
 history.reset();assert.equal(history.prepare(camera,640,360,564),false);
});
