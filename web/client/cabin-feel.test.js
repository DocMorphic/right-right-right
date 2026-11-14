import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CabinFeel,NATIVE_CABIN,roadPitchAt} from './cabin-feel.js';
import {RallyView} from './view.js';
import {makeCar,stepCar} from '../shared/physics.js';
const course={width:5,points:Array.from({length:600},(_,i)=>({x:0,y:20,z:i*2})),trees:[]};
const moving=(speed=0)=>({...makeCar(course),speed,vz:speed});

test('native FOV starts at90, widens smoothly with speed/throttle and stays bounded after a stop',()=>{
  const feel=new CabinFeel();assert.equal(feel.fov,90);
  feel.update(moving(25),{throttle:1},1/60);assert.ok(feel.fov>90&&feel.fov<92,'no instant zoom on a packet');
  for(let i=0;i<300;i++)feel.update(moving(25),{throttle:1},1/60);
  assert.ok(feel.fov>100&&feel.fov<=104);
  for(let i=0;i<300;i++)feel.update(moving(0),{},1/60);
  assert.ok(Math.abs(feel.fov-90)<.001);
  for(let i=0;i<300;i++)feel.update({...moving(40),dead:true},{throttle:1},1/60,'ended');
  assert.ok(Math.abs(feel.fov-90)<.001);
});

test('braking leans the eye forward and acceleration leans it back by native centimetre limits',()=>{
  const feel=new CabinFeel();let speed=0;
  feel.update(moving(speed),{},.02);
  for(let i=0;i<100;i++){speed+=.15;feel.update(moving(speed),{throttle:1},.02);}
  assert.ok(feel.lean<-.01&&feel.lean>=-.02);assert.ok(feel.pitch<0,'accelerating lifts the nose');
  for(let i=0;i<50;i++){speed-=.25;feel.update(moving(speed),{throttle:-1},.02);}
  assert.ok(feel.lean>.02&&feel.lean<=.035);assert.ok(feel.pitch>0,'braking pitches the nose down');
  for(let i=0;i<300;i++)feel.update(moving(speed),{},.02);
  assert.ok(Math.abs(feel.lean)<1e-6&&Math.abs(feel.pitch)<1e-6,'no invented idle head bob');
});

test('body lean uses lateral movement and never exceeds original roll and pitch limits',()=>{
  const feel=new CabinFeel();for(let i=0;i<200;i++)feel.update({...moving(15),vx:30},{throttle:1},.02);
  assert.ok(feel.roll<0);assert.ok(Math.abs(feel.roll)<=NATIVE_CABIN.maxRollDeg*Math.PI/180+1e-9);
  assert.ok(Math.abs(feel.pitch)<=NATIVE_CABIN.maxPitchDeg*Math.PI/180+1e-9);
  const slope={points:[{x:0,y:0,z:0},{x:0,y:1,z:10},{x:0,y:2,z:20}]};
  assert.ok(Math.abs(roadPitchAt(slope,1)+Math.atan(.1))<1e-12);
});

test('camera feel follows elapsed time consistently at30fps and120fps',()=>{
  const run=fps=>{const feel=new CabinFeel();for(let i=0;i<fps*2;i++)feel.update(moving(20),{throttle:1},1/fps);return feel.fov;};
  assert.ok(Math.abs(run(30)-run(120))<.01);
});

test('both actual cabin seats inherit original eye pose, body tilt and driver FOV',()=>{
  for(const slot of [0,1]){
    const body=new THREE.Group(),model=new THREE.Group();model.add(body);
    const state=moving(20),car={model,body,bodyRest:new THREE.Quaternion(),heads:[],wipers:[],mudUniforms:[]};
    const snapshot={phase:'running',cars:[state],tablets:[],inputs:[{throttle:1},{}]};
    const anchor={position:[slot===0?.366:-.338,1.3,-.06],matrix:new THREE.Matrix4().makeRotationX(.15).toArray()};
    const view=Object.assign(Object.create(RallyView.prototype),{active:true,slot,course,snapshot,cars:[car],tablets:[],look:{pitch:0,yaw:0},lastMap:1e9,manifest:{anchors:{'Main Camera':anchor,EyeAnchor:anchor}},world:new THREE.Group(),scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),camera:new THREE.PerspectiveCamera(),renderer:{render(){}}});
    view.scene.fog=new THREE.Fog('#000',85,260);
    for(let frame=0;frame<120;frame++)view.update(1/60,1000+frame*1000/60,{throttle:slot===0?1:-1,steer:slot===0?0:1});
    assert.ok(view.camera.fov>99,'both occupants get the driver speed/throttle effect');
    const expected=new THREE.Vector3().fromArray(anchor.position);body.localToWorld(expected);
    assert.ok(view.camera.position.distanceTo(expected)<1e-8,'the eye retains the exported original anchor');
    const direction=new THREE.Vector3();view.camera.getWorldDirection(direction);assert.ok(direction.z>.98&&direction.y<-.1,'the original rest pitch is applied');
  }
});

test('car velocity has real directional inertia and handbrake loses more lateral grip',()=>{
  const slide=handbrake=>{const car=moving(14);let maximum=0;for(let i=0;i<40;i++){stepCar(car,{throttle:1,steer:1,handbrake},.02,course);const lateral=car.vx*Math.cos(car.yaw)-car.vz*Math.sin(car.yaw);maximum=Math.max(maximum,Math.abs(Math.atan2(lateral,Math.abs(car.speed))));}return {car,maximum};};
  const normal=slide(false),braked=slide(true);
  assert.ok(normal.maximum>.01,'velocity does not teleport into the body heading');
  assert.ok(braked.maximum>normal.maximum*1.2,'Space allows a larger slip angle');
  assert.ok(Math.abs(braked.car.speed)<Math.abs(normal.car.speed),'Space still scrubs speed');
});
