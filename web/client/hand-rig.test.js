import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DriverHands,solveArmChain,NATIVE_DRIVER_HANDS} from './hand-rig.js';

test('two-bone arm solve preserves native segment lengths while reaching a target',()=>{
 const upper=new THREE.Bone(),lower=new THREE.Bone(),wrist=new THREE.Bone();upper.add(lower);lower.add(wrist);lower.position.set(.3,0,0);wrist.position.set(.25,0,0);upper.updateMatrixWorld(true);
 const target=new THREE.Vector3(.3,.25,.1);solveArmChain(upper,lower,wrist,target,new THREE.Vector3(0,-1,0));
 assert.ok(wrist.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-6);
 assert.ok(Math.abs(upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()))-.3)<1e-6);
 assert.ok(Math.abs(lower.getWorldPosition(new THREE.Vector3()).distanceTo(wrist.getWorldPosition(new THREE.Vector3()))-.25)<1e-6);
});
test('hand controller rejects baked meshes instead of moving invisible bones',()=>{
 const root=new THREE.Group(),driver=new THREE.Group();driver.name='character_fat';root.add(driver);assert.equal(new DriverHands(root).ready,false);
});
async function loadGeometry(path){
 // Tests retain every real vertex, joint, weight and inverse bind; only textures
 // are replaced so GLTFLoader can run without a browser image decoder.
 const original=readFileSync(path),jsonLength=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+jsonLength));
 json.materials=json.materials.map(()=>({pbrMetallicRoughness:{baseColorFactor:[.5,.5,.5,1],metallicFactor:0,roughnessFactor:1}}));delete json.images;delete json.textures;delete json.samplers;
 const text=Buffer.from(JSON.stringify(json)),padding=(4-text.length%4)%4,body=original.subarray(20+jsonLength),result=Buffer.alloc(20+text.length+padding+body.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(text.length+padding,12);result.writeUInt32LE(0x4e4f534a,16);text.copy(result,20);result.fill(0x20,20+text.length,20+text.length+padding);body.copy(result,20+text.length+padding);
 return(await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength),'')).scene;
}
const carPath=new URL('../public/assets/car.glb',import.meta.url),candidatePath=new URL('../../local/web-assets/driver-rig-candidate/driver-rig.glb',import.meta.url),configPath=new URL('../../local/web-assets/driver-rig-candidate/DriverWheelHandIk.json',import.meta.url);
test('original skinned driver follows the full ±190° wheel sweep within native bone and shoulder limits',{skip:![carPath,candidatePath,configPath].every(existsSync)},async t=>{
 const car=await loadGeometry(carPath),driver=await loadGeometry(candidatePath),config=JSON.parse(readFileSync(configPath));let body,old;
 for(const [key,value]of Object.entries(NATIVE_DRIVER_HANDS))if(key in config.serialized)assert.deepEqual(value,config.serialized[key],`default ${key} matches the recovered native component`);
 car.traverse(node=>{if(node.name==='BodyVisual')body=node;if(node.name==='character_fat')old=node;});assert.ok(body&&old);old.removeFromParent();while(driver.children.length)body.add(driver.children[0]);car.updateMatrixWorld(true);
 const hands=new DriverHands(car,config);assert.equal(hands.ready,true,hands.reason);
 const vertices=hands.arms.map(arm=>{let found;hands.driver.traverse(node=>{if(found||!node.isSkinnedMesh)return;const ids=node.geometry.attributes.skinIndex,weights=node.geometry.attributes.skinWeight;for(let i=0;i<ids.count;i++){let score=0;for(let k=0;k<4;k++){const name=node.skeleton.bones[ids.array[i*4+k]]?.name||'';if(/Wrist|Index|Thumb|Middle|Pinky|Ring/i.test(name)&&name.endsWith(arm.side))score+=weights.array[i*4+k];}if(score>.95){found={mesh:node,index:i};break;}}});assert.ok(found,'each original hand has an actual weighted test vertex');return found;});
 const point=entry=>entry.mesh.localToWorld(entry.mesh.getVertexPosition(entry.index,new THREE.Vector3())),first=vertices.map(point),rest=hands.wheel.quaternion.clone(),lengths=hands.arms.map(arm=>[arm.upper.getWorldPosition(new THREE.Vector3()).distanceTo(arm.lower.getWorldPosition(new THREE.Vector3())),arm.lower.getWorldPosition(new THREE.Vector3()).distanceTo(arm.wrist.getWorldPosition(new THREE.Vector3()))]);
 let worst={error:0},maximumModerateError=0,maximumStep=0,previous;
 for(let angle=-190;angle<=190;angle++){
  // The reflected original car turns its wheel around negative local Z for D.
  hands.wheel.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-angle*Math.PI/180));hands.update(angle/190,{steerDegrees:angle});
  const points=vertices.map(point);if(previous)points.forEach((p,i)=>maximumStep=Math.max(maximumStep,p.distanceTo(previous[i])));previous=points;
  hands.arms.forEach((arm,i)=>{
   assert.ok(Number.isFinite(arm.error));assert.ok(arm.error<.05,'full-lock gaps stay bounded without stretching the original rig');
   if(Math.abs(angle)<=70){maximumModerateError=Math.max(maximumModerateError,arm.error);assert.ok(arm.error<.001,'ordinary steering keeps the native palm centers on their grips');}
   assert.ok(arm.rest[0].angleTo(arm.shoulder.quaternion)<=config.serialized.maxShoulderDegrees*Math.PI/180+.00001);
   const current=[arm.upper.getWorldPosition(new THREE.Vector3()).distanceTo(arm.lower.getWorldPosition(new THREE.Vector3())),arm.lower.getWorldPosition(new THREE.Vector3()).distanceTo(arm.wrist.getWorldPosition(new THREE.Vector3()))];current.forEach((value,j)=>assert.ok(Math.abs(value-lengths[i][j])<.00001,'native arm segments cannot stretch'));
   if(arm.error>worst.error)worst={angle,side:arm.side,error:arm.error,palm:arm.targetPalm.clone()};
  });
 }
 // Even a freely oriented palm cannot bridge a target beyond this sum of
 // native segment lengths, with the clavicle restricted to its authored cone.
 const limiting=hands.arms.find(arm=>arm.side===worst.side),saved=limiting.bones.map(bone=>bone.quaternion.clone());limiting.bones.forEach((bone,i)=>bone.quaternion.copy(limiting.rest[i]));car.updateMatrixWorld(true);
 const shoulder=limiting.shoulder.getWorldPosition(new THREE.Vector3()),clavicle=limiting.upper.getWorldPosition(new THREE.Vector3()).sub(shoulder),toward=worst.palm.clone().sub(shoulder).normalize(),turn=new THREE.Quaternion().setFromUnitVectors(clavicle.clone().normalize(),toward),needed=new THREE.Quaternion().angleTo(turn),capped=new THREE.Quaternion().slerp(turn,Math.min(1,config.serialized.maxShoulderDegrees*Math.PI/180/needed));
 const bestUpper=clavicle.applyQuaternion(capped).add(shoulder);worst.unavoidableReachGap=Math.max(0,bestUpper.distanceTo(worst.palm)-limiting.length-limiting.palm.length());delete worst.palm;
 assert.ok(worst.unavoidableReachGap>.03,'the extreme crossed-arm target is geometrically unreachable under the original limits');assert.ok(worst.error<worst.unavoidableReachGap+.01);
 limiting.bones.forEach((bone,i)=>bone.quaternion.copy(saved[i]));car.updateMatrixWorld(true);
 hands.wheel.quaternion.copy(rest);hands.update(0,{steerDegrees:0});vertices.forEach((entry,i)=>assert.ok(point(entry).distanceTo(first[i])<.0001,'recentering restores the same rendered pose'));
 const restLocal=vertices.map(entry=>car.worldToLocal(point(entry)));car.position.set(12,3,-8);car.rotation.set(.04,.7,-.025);car.updateMatrixWorld(true);hands.update(0);vertices.forEach((entry,i)=>assert.ok(car.worldToLocal(point(entry)).distanceTo(restLocal[i])<.0001,'moving and tilting the car cannot detach its hands'));
 const rightRest=point(vertices[1]);hands.update(0,{handbrake:true,dt:1/60});assert.ok(point(vertices[1]).distanceTo(rightRest)>.001,'the rendered right hand begins reaching the native handbrake');
 for(let i=0;i<60;i++){car.position.x+=.1;hands.update(0,{handbrake:true,dt:1/60});}
 assert.ok(hands.arms[1].error<.001,'handbrake blending stays in cabin coordinates while the car moves');
 const brakePalm=hands.arms[1].targetPalm.clone();hands.update(0,{handbrake:false,dt:1/60});assert.ok(hands.arms[1].targetPalm.distanceTo(brakePalm)<.05,'returning to the wheel blends instead of snapping');
 for(let i=0;i<60;i++)hands.update(0,{handbrake:false,dt:1/60});assert.ok(hands.arms[1].targetPalm.distanceTo(hands.arms[1].grip.getWorldPosition(new THREE.Vector3()))<.001);
 assert.ok(maximumStep<.05,'one-degree steering steps cannot snap rendered hand vertices across the cabin');
 t.diagnostic(JSON.stringify({poses:381,actualSkinnedHandVertices:2,maximumModerateErrorMeters:maximumModerateError,fullLockResidual:worst,maximumVertexStepMeters:maximumStep,nativeLimits:{upperLength:lengths[0][0],lowerLength:lengths[0][1],maxShoulderDegrees:18},limitation:'Extreme crossed-arm targets can exceed native reach; no bone stretch or fake hand offset is applied.'}));hands.dispose();
});
