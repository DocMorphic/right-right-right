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

test('menu does not redraw the covered WebGL canvas or change world visibility',()=>{
 const {view}=fixture();view.active=false;let renders=0;view.renderer.render=()=>renders++;
 const background=view.scene.background;for(let i=0;i<60;i++)view.update(1/60,1000+i*17,{});
 assert.equal(renders,0);assert.equal(view.world.visible,true);assert.equal(view.scene.background,background);
});

test('crew B driver predicts their own inputs immediately and crew B navigator cannot drive',()=>{
 for(const slot of [2,3]){
  const {view}=fixture(slot);
  const state=makeCar(view.course,1,'race'),model=new THREE.Group(),car={model,wipers:[new THREE.Object3D(),new THREE.Object3D()],wiperRests:[new THREE.Quaternion(),new THREE.Quaternion()],mudUniforms:[],heads:[]};
  view.cars.push(car);view.snapshot.cars.push(state);view.snapshot.inputs.push({},{});view.setSnapshot(view.snapshot);
  view.update(.02,1000,{throttle:1,steer:.4});
  assert.equal(view.cars[0].presentation.predicted.speed,0);
  if(slot===2)assert.ok(car.presentation.predicted.speed>0);else assert.equal(car.presentation.predicted.speed,0);
 }
});

test('changing shadow quality invalidates cached materials and camera exposure history',t=>{
 const old=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;t.after(()=>{if(old===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=old;});
 const {view}=fixture(),material=new THREE.MeshStandardMaterial();view.world.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 view.manifest.atmosphere={fog:{far:260}};view.renderer={shadowMap:{enabled:true},setPixelRatio(){}};let resets=0;view.frame={reset(){resets++;}};
 const version=material.version;view.setQuality('low');assert.equal(view.renderer.shadowMap.enabled,false);assert.equal(material.version,version+1);
 view.setQuality('high');assert.equal(view.renderer.shadowMap.enabled,true);assert.equal(material.version,version+2);assert.equal(resets,2);
});

test('actual wiper transforms respond to either crew member without wiping another car',()=>{
  const {view,car,state}=fixture(1);
  view.snapshot.inputs=[{wipe:true},{wipe:false}];
  view.applyCar(car,state,state,100,{wipe:false},.2);
  assert.ok(car.wipers[0].quaternion.angleTo(car.wiperRests[0])>.1,'navigator sees the driver wiping');
  view.snapshot.inputs=[{wipe:false},{wipe:true}];
  view.applyCar(car,state,state,100,{wipe:false},.2);
  assert.ok(car.wipers[0].quaternion.angleTo(car.wiperRests[0])>.1,'driver sees the navigator wiping');
  view.slot=2;
  view.snapshot.inputs=[{wipe:false},{wipe:false},{wipe:true},{}];
  view.applyCar(car,state,state,100,{wipe:true},.5);
  view.applyCar(car,state,state,100,{wipe:true},.5);
  assert.equal(car.wipers[0].quaternion.angleTo(car.wiperRests[0]),0,'crew B local input does not wipe crew A');
});

test('native fatal shake finishes and the crashed camera ignores all later free look',()=>{
  const {view,state}=fixture(0);view.snapshot.phase='ended';state.dead=true;state.jolt=1;
  view.lastMap=1e9;
  view.update(.02,1000,{});view.update(.02,1300,{});const first=view.camera.position.clone(),rotation=view.camera.quaternion.clone();
  for(let i=1;i<=30;i++){view.look.yaw=i*3;view.look.pitch=-i;view.update(.02,1300+i*20,{});assert.ok(view.camera.position.distanceTo(first)<1e-8);assert.ok(view.camera.quaternion.angleTo(rotation)<1e-7);}
});

test('native reflected passenger door opens away from the cabin and cannot swing inward',()=>{
 const {view,car,state}=fixture(0);car.door=new THREE.Object3D();car.door.position.set(-.828998,.666817,.751921);car.door.quaternion.set(0,-.99999994,.000000081,.000383214).normalize();car.door.scale.setScalar(100);car.model.add(car.door);car.doorRest=car.door.quaternion.clone();car.model.updateMatrixWorld(true);
 const marker=new THREE.Object3D();marker.position.copy(car.door.worldToLocal(new THREE.Vector3(-.7858,.8455,.0612)));car.door.add(marker);
 state.doorAngle=45;view.applyCar(car,state,state,1000,{});car.model.updateMatrixWorld(true);assert.ok(marker.getWorldPosition(new THREE.Vector3()).x< -1.25,'door centroid moves outside the cabin in reflected browser coordinates');
 state.doorAngle=-45;view.applyCar(car,state,state,1020,{});car.model.updateMatrixWorld(true);assert.ok(Math.abs(marker.getWorldPosition(new THREE.Vector3()).x-(-.7858))<.001,'negative angles clamp to the closed rest pose');
});

test('right driving input turns the visible wheel right and sends the same direction to both hands',()=>{
 const {view,car,state}=fixture(0);car.wheel=new THREE.Object3D();car.wheel.position.set(.3761,.9175,.3226);car.wheel.rotation.x=.2513;car.wheelRest=car.wheel.quaternion.clone();car.model.add(car.wheel);
 const top=new THREE.Object3D();top.position.y=.2;car.wheel.add(top);let handSteer;
 car.hands={update(value){handSteer=value;}};car.presentation=null;
 view.applyCar(car,state,state,1000,{});car.model.updateMatrixWorld(true);const rest=top.getWorldPosition(new THREE.Vector3());
 state.steer=.2;view.applyCar(car,state,state,1020,{});car.model.updateMatrixWorld(true);const right=top.getWorldPosition(new THREE.Vector3());
 // Camera looks along +Z: screen-right is the cabin's negative X.
 assert.ok(right.x<rest.x,'D moves the top of the steering wheel toward screen-right');assert.equal(handSteer,-.2,'hands follow the corrected wheel direction');
 state.steer=-.2;view.applyCar(car,state,state,1040,{});car.model.updateMatrixWorld(true);assert.ok(top.getWorldPosition(new THREE.Vector3()).x>rest.x,'A moves the wheel toward screen-left');assert.equal(handSteer,.2);
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
