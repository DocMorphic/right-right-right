import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RallyView,initialLookPitch} from './view.js';
import {makeCar} from '../shared/physics.js';

function fixture(slot=0){
  const course={points:Array.from({length:20},(_,i)=>({x:0,y:20,z:i*2})),width:9.5,trees:[]};
  const state=makeCar(course,0,'coop');
  const car={model:new THREE.Group(),wipers:[new THREE.Object3D(),new THREE.Object3D()],wiperRests:[new THREE.Quaternion(),new THREE.Quaternion()],mudUniforms:[],heads:[]};
  const snapshot={phase:'running',cars:[state],tablets:[],inputs:[{},{yaw:0,pitch:0}]};
  const view=Object.assign(Object.create(RallyView.prototype),{active:true,slot,course,snapshot,predicted:structuredClone(state),snapshots:[{snapshot,received:900}],cars:[car],tablets:[],look:{pitch:0,yaw:0},lastMap:1000,
    manifest:{anchors:{'Main Camera':{position:[.369,1.324,-.059]},EyeAnchor:{position:[-.333,1.282,-.096]}}},world:new THREE.Group(),scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),camera:new THREE.PerspectiveCamera(),renderer:{render(){}}});
  view.scene.fog=new THREE.Fog('#000',85,260);
  view.setSnapshot(snapshot);view.snapshots=[{snapshot,received:900}];
  return {view,car,state};
}

test('navigator driving keys leave the actual local render prediction at the authoritative car',()=>{
  const {view,car,state}=fixture(1),before=structuredClone(view.predicted);
  view.update(.02,1000,{throttle:1,steer:1});
  assert.equal(view.predicted.speed,before.speed);
  assert.equal(view.predicted.x,before.x);
  assert.equal(view.predicted.z,before.z);
  assert.equal(car.model.position.x,state.x);
  assert.equal(car.model.position.z,state.z);
  const driver=fixture(0);
  driver.view.update(.02,1000,{throttle:1,steer:0});
  assert.ok(driver.view.predicted.speed>0,'the driver still predicts their own driving');
});

test('actual wiper transforms respond to either crew member without wiping another car',()=>{
  const {view,car,state}=fixture(1);
  view.snapshot.inputs=[{wipe:true},{wipe:false}];
  view.applyCar(car,state,state,100,{wipe:false});
  assert.ok(car.wipers[0].quaternion.angleTo(car.wiperRests[0])>.1,'navigator sees the driver wiping');
  view.snapshot.inputs=[{wipe:false},{wipe:true}];
  view.applyCar(car,state,state,100,{wipe:false});
  assert.ok(car.wipers[0].quaternion.angleTo(car.wiperRests[0])>.1,'driver sees the navigator wiping');
  view.slot=2;
  view.snapshot.inputs=[{wipe:false},{wipe:false},{wipe:true},{}];
  view.applyCar(car,state,state,100,{wipe:true});
  assert.equal(car.wipers[0].quaternion.angleTo(car.wiperRests[0]),0,'crew B local input does not wipe crew A');
});


test('navigator spawn frames the physical tablet at16:9 while driver starts on the road',()=>{
  const {view,car}=fixture(1);view.look.pitch=initialLookPitch(1);
  view.camera.aspect=16/9;view.camera.fov=90;view.camera.updateProjectionMatrix();
  view.update(1/60,1000,{});view.camera.updateMatrixWorld(true);
  // Original Screen runtime offset, Tablet root scale and passenger HoldAnchor.
  const tabletCenter=new THREE.Vector3(0,.9444444635768003*.017999999225139618,-.015*.2800000011920929)
    .applyQuaternion(new THREE.Quaternion(-.2164396193,0,0,.9762960059))
    .add(new THREE.Vector3(-.33316501975,.75,.28000000119));
  car.model.localToWorld(tabletCenter);const projected=tabletCenter.project(view.camera);
  assert.ok(Math.abs(projected.x)<.1&&Math.abs(projected.y)<.1,'native physical screen center appears near the middle of the spawn view');
  assert.ok(projected.z>-1&&projected.z<1,'tablet is inside the camera clipping planes');
  assert.equal(initialLookPitch(0),0);assert.equal(initialLookPitch(2),0);
  assert.equal(initialLookPitch(3),46.6,'both navigator seats use the reading view');
});
