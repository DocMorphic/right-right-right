import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NativeInteractions,interactionTarget,hasTablet} from './native-interactions.js';
function cabin(){
 const root=new THREE.Group();root.position.set(12,4,-8);root.rotation.y=.7;
 const knob=new THREE.Object3D();knob.name='mud_knob_location';knob.position.set(-.391799986,.939100027,.566799998);root.add(knob);
 const door=new THREE.Mesh(new THREE.BoxGeometry(.06,.8,1.2),new THREE.MeshBasicMaterial());door.name='door_rf_ok';door.position.set(-.828998208,.666817009,.751921296);root.add(door);
 root.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(90,1,.01,100);camera.position.copy(root.localToWorld(new THREE.Vector3(-.338540195,1.281673773,-.096291469)));
 const car={door:true,doorAngle:60,doorVelocity:0,speed:0,dead:false,finish:-1},snapshot={epoch:1,phase:'running',tablets:[{holder:-1}]};
 const context={camera,carRoot:root,car,snapshot,slot:1,look:{yaw:0,pitch:0},dt:1/60,enabled:true};
 return{context,root,knob,door,aim(node){root.updateMatrixWorld(true);camera.lookAt(node.getWorldPosition(new THREE.Vector3()));camera.updateMatrixWorld(true);}};
}
test('native cabin aiming follows transformed own-car knob/door and empty-handed navigator role',()=>{
 const c=cabin(),o=c.context;c.aim(c.knob);assert.equal(interactionTarget(o),'knob');
 o.slot=0;assert.equal(interactionTarget(o),null);o.practice=true;assert.equal(interactionTarget(o),'knob');o.practice=false;o.slot=1;
 o.snapshot.tablets[0].holder=1;assert.equal(hasTablet(o.snapshot,1),true);assert.equal(interactionTarget(o),null);o.snapshot.tablets[0].holder=-1;
 c.aim(c.door);assert.equal(interactionTarget(o),'door');o.car.door=false;assert.equal(interactionTarget(o),null);o.car.door=true;
 o.snapshot.phase='waiting';assert.equal(interactionTarget(o),null);o.snapshot.phase='running';o.car.dead=true;assert.equal(interactionTarget(o),null);
});
test('native knob aim uses 1.3m forward reach and .15m ray tolerance without requiring a knob mesh',()=>{
 const c=cabin(),o=c.context;o.carRoot.position.set(0,0,0);o.carRoot.rotation.set(0,0,0);o.camera.position.set(0,0,0);o.camera.rotation.set(0,0,0);o.car.door=false;
 c.knob.position.set(.149,0,-1.3);assert.equal(interactionTarget(o),'knob');c.knob.position.x=.151;assert.equal(interactionTarget(o),null);
 c.knob.position.set(0,0,-1.301);assert.equal(interactionTarget(o),null);c.knob.position.z=.5;assert.equal(interactionTarget(o),null);
});
test('holding E starts only on an aimed press and continues after looking away until release',()=>{
 const c=cabin(),o=c.context,controls=new NativeInteractions();c.aim(c.knob);
 assert.equal(controls.update({...o,eHeld:true}).wipe,true);
 c.aim(c.door);assert.equal(controls.update({...o,eHeld:true}).wipe,true,'knob grip survives looking away');
 assert.equal(controls.update({...o,eHeld:false}).wipe,false);assert.equal(controls.update({...o,eHeld:true}).wipe,false,'holding E elsewhere cannot start wiping');
 c.aim(c.knob);assert.equal(controls.update({...o,eHeld:true}).wipe,false,'aiming later needs a fresh E press');controls.update({...o,eHeld:false});assert.equal(controls.update({...o,eHeld:true}).wipe,true);
 o.snapshot.tablets[0].holder=1;assert.equal(controls.update({...o,eHeld:true}).wipe,false);o.snapshot.tablets[0].holder=-1;assert.equal(controls.update({...o,eHeld:true}).wipe,false);
});
test('mouse hold grips the open door; right/down head motion latches once and stationary clicking does not',()=>{
 for(const direction of ['yaw','pitch']){
  const c=cabin(),o=c.context,controls=new NativeInteractions();c.aim(c.door);
  let result=controls.update({...o,leftHeld:true});assert.equal(result.holdingDoor,true);assert.deepEqual(result.actions,[]);
  for(let i=0;i<30;i++)assert.deepEqual(controls.update({...o,leftHeld:true}).actions,[]);
  o.look[direction]=40;const actions=[];for(let i=0;i<60;i++){result=controls.update({...o,leftHeld:true});actions.push(...result.actions);}
  assert.deepEqual(actions,[{kind:'door'}]);assert.equal(result.holdingDoor,false);assert.equal(result.target,null,'no second slam while the authoritative close is in flight');
 }
});
test('left/up motion, tablet carrying, mouse release and disabled controls cannot slam the door',()=>{
 const c=cabin(),o=c.context,controls=new NativeInteractions();c.aim(c.door);controls.update({...o,leftHeld:true});o.look={yaw:-40,pitch:-20};
 for(let i=0;i<60;i++)assert.deepEqual(controls.update({...o,leftHeld:true}).actions,[]);
 assert.equal(controls.update({...o,leftHeld:false}).holdingDoor,false);o.snapshot.tablets[0].holder=1;assert.equal(controls.update({...o,leftHeld:true}).holdingDoor,false);
 o.snapshot.tablets[0].holder=-1;controls.update({...o,leftHeld:false});assert.equal(controls.update({...o,leftHeld:true}).holdingDoor,true);
 const disabled=controls.update({...o,leftHeld:true,enabled:false});assert.equal(disabled.holdingDoor,false);assert.equal(disabled.wipe,false);assert.deepEqual(disabled.actions,[]);
});
test('door grab respects 1.6m reach through padded native renderer bounds',()=>{
 const c=cabin(),o=c.context;c.aim(c.door);assert.equal(interactionTarget(o),'door');
 const away=o.camera.position.clone().sub(c.door.getWorldPosition(new THREE.Vector3())).normalize();o.camera.position.addScaledVector(away,3);c.aim(c.door);assert.equal(interactionTarget(o),null);
});
