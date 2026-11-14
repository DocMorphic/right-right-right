import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RallyView} from './view.js';
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
