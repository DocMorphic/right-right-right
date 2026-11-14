import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CrashSequence,CrashCamera,crashedSeat} from './crash-presentation.js';
test('native fatal timing locks immediately, holds at .2s and stamps at .4s with a .12s pop',()=>{
 const sequence=new CrashSequence(),snapshot={epoch:1,cars:[{dead:true},{dead:false}]};
 assert.equal(crashedSeat(snapshot,0),true);assert.equal(crashedSeat(snapshot,3),false);
 assert.deepEqual([sequence.sample(snapshot,0,1000).locked,sequence.sample(snapshot,0,1199).hold,sequence.sample(snapshot,0,1399).stamp],[true,false,false]);
 assert.equal(sequence.sample(snapshot,0,1200).hold,true);assert.equal(sequence.sample(snapshot,0,1400).stamp,true);assert.equal(sequence.sample(snapshot,0,1400).scale,1.18);assert.equal(sequence.sample(snapshot,0,1520).scale,1);assert.equal(sequence.sample(snapshot,0,1650).tintAlpha,.34);
 snapshot.epoch=2;snapshot.cars[0].dead=false;assert.equal(sequence.sample(snapshot,0,2000).locked,false);snapshot.cars[0].dead=true;assert.equal(sequence.sample(snapshot,0,2100).stamp,false);
});
test('both native faceplant targets finish the slam and reject later camera movement',()=>{
 for(const slot of [0,1]){
  const parent=new THREE.Group();parent.position.set(12,3,-8);parent.rotation.set(.04,.6,-.03);const camera=new THREE.PerspectiveCamera();camera.position.set(12.3,4.3,-8.1);camera.rotation.set(.1,2.8,0);
  const effect=new CrashCamera(camera,parent,slot);effect.apply(camera,.02);const shakeA=camera.position.clone();effect.apply(camera,.04);assert.ok(shakeA.distanceTo(camera.position)>.0001,'brief fatal shake is visible');
  effect.apply(camera,.2);const p=camera.position.clone(),q=camera.quaternion.clone(),local=parent.worldToLocal(p.clone());assert.ok(local.distanceTo(new THREE.Vector3(slot===0?.34:-.36,.9,.46))<1e-8);assert.equal(camera.near,.04);
  for(const elapsed of [.3,.4,1,5]){camera.position.set(100,200,300);camera.rotation.set(2,1,3);effect.apply(camera,elapsed);assert.ok(camera.position.distanceTo(p)<1e-8);assert.ok(camera.quaternion.angleTo(q)<1e-7);}
 }
});
