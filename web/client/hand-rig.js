import * as THREE from 'three';
const RAD=Math.PI/180;
// Original DriverWheelHandIk serialized values; wheel lock comes from the
// original GoofyCarController. Exported metadata may supply the same fields.
export const NATIVE_DRIVER_HANDS=Object.freeze({steeringWheelDegrees:190,handbrakePoseThreshold:.2,cabinHandSmoothTime:.07,palmLocalOffset:[0,0,0],palmLocalEuler:[0,0,0],wristIkSteerDeadZone:3,wristIkSteerFullAt:110,gripTwistFullAt:50,shoulderIkWeight:.22,maxShoulderDegrees:18,wristSteerYawPerDegree:.162,maxWristSteerYawDegrees:60,forearmTwistShare:.42,maxForearmTwistDegrees:32,elbowHintRestOutward:.06,elbowHintOutwardPerDegree:.0022,elbowHintForwardPerDegree:.0008});
const normalized=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const find=(root,name)=>{let found=null;root?.traverse(node=>{if(!found&&normalized(node.name)===normalized(name))found=node;});return found;};
const position=node=>node.getWorldPosition(new THREE.Vector3());
const rotation=node=>node.getWorldQuaternion(new THREE.Quaternion());
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function worldRotation(node,value){const parent=node.parent?rotation(node.parent).invert():new THREE.Quaternion();node.quaternion.copy(parent.multiply(value));node.updateMatrixWorld(true);}
function aimBone(node,child,target){
 const from=position(child).sub(position(node)),to=target.clone().sub(position(node));if(from.lengthSq()<1e-14||to.lengthSq()<1e-14)return;
 worldRotation(node,new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(rotation(node)));
}
/** Native EstimatePalmWorld: first descendant matching each of five finger roots. */
export function estimatePalmWorld(wrist){
 const result=new THREE.Vector3();let count=0;
 for(const name of ['Index2','Thumb2','Middle2','Pinky2','Ring2']){let sample=null;wrist.traverse(node=>{if(!sample&&node.name.toLowerCase().includes(name.toLowerCase()))sample=node;});if(sample){result.add(position(sample));count++;}}
 return count?result.multiplyScalar(1/count):position(wrist);
}
/** Analytical two-bone solve; bone lengths and native elbow bend are preserved. */
export function solveArmChain(upper,lower,wrist,target,pole){
 const a=position(upper),b=position(lower),c=position(wrist),l1=a.distanceTo(b),l2=b.distanceTo(c),delta=target.clone().sub(a),distance=delta.length();
 if(l1<1e-6||l2<1e-6||distance<1e-6)return;
 const axis=delta.multiplyScalar(1/distance),reach=clamp(distance,Math.abs(l1-l2)+1e-6,l1+l2-1e-6),along=(l1*l1-l2*l2+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 let bend=pole.clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));
 if(bend.lengthSq()<1e-12){bend=b.clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));}
 if(bend.lengthSq()<1e-12){bend=new THREE.Vector3(0,-1,0);bend.addScaledVector(axis,-bend.dot(axis));}
 bend.normalize();const elbow=a.clone().addScaledVector(axis,along).addScaledVector(bend,height);
 aimBone(upper,lower,elbow);aimBone(lower,wrist,target);
}
function capture(bones){return bones.map(bone=>bone.quaternion.clone());}
function restore(bones,quaternions){bones.forEach((bone,index)=>bone.quaternion.copy(quaternions[index]));bones[0].updateMatrixWorld(true);}
function cacheAxes(arm,driver){
 const wristRotation=rotation(arm.wrist),inverse=wristRotation.clone().invert();
 arm.forearmLocal=position(arm.lower).sub(position(arm.wrist)).normalize().applyQuaternion(inverse);
 arm.upLocal=new THREE.Vector3(0,1,0).addScaledVector(arm.forearmLocal,-arm.forearmLocal.y).normalize();
 arm.restWristInDriver=rotation(driver).invert().multiply(wristRotation);
}
function alignedWrist(arm,rest,forearm,twist=0){
 const direction=forearm.clone().normalize(),back=arm.forearmLocal.clone().applyQuaternion(rest).normalize();
 const result=new THREE.Quaternion().setFromUnitVectors(back,direction.clone().negate()).multiply(rest);
 return new THREE.Quaternion().setFromAxisAngle(direction,twist*RAD).multiply(result);
}
function gripTwist(arm,rest,forearm,gripRotation){
 const axis=forearm.clone().normalize(),base=arm.upLocal.clone().applyQuaternion(alignedWrist(arm,rest,axis)),desired=arm.upLocal.clone().applyQuaternion(gripRotation);
 base.addScaledVector(axis,-base.dot(axis)).normalize();desired.addScaledVector(axis,-desired.dot(axis)).normalize();
 return Math.atan2(axis.dot(new THREE.Vector3().crossVectors(base,desired)),clamp(base.dot(desired),-1,1))/RAD;
}
function steerWeight(degrees,deadZone,fullAt){return clamp((Math.abs(degrees)-deadZone)/(Math.max(deadZone+.5,fullAt)-deadZone),0,1);}
function smoothPalm(current,target,velocity,time,dt){
 if(dt<=0)return current;const omega=2/Math.max(.0001,time),x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x),change=current.clone().sub(target),temp=velocity.clone().addScaledVector(change,omega).multiplyScalar(dt);
 velocity.addScaledVector(temp,-omega).multiplyScalar(decay);const result=target.clone().add(change.add(temp).multiplyScalar(decay));
 if(target.clone().sub(current).dot(result.clone().sub(target))>0){result.copy(target);velocity.set(0,0,0);}return current.copy(result);
}
function findDriver(root){
 const candidates=[];root.traverse(node=>{if(normalized(node.name)==='characterfat')candidates.push(node);});
 return candidates.find(candidate=>{let skinned=false;candidate.traverse(node=>{skinned||=Boolean(node.isSkinnedMesh);});return skinned;})||null;
}
/** Call after rotating WheelRotationHelper and applying the car/body transforms.
 * steerDegrees uses the native steering sign: positive D turns the reflected
 * wheel around negative local Z. The native reach/18-degree shoulder limits
 * are preserved, so extreme crossed-arm grips can retain a small reach gap.
 * Requires the original skinned driver export; baked meshes are rejected. */
export class DriverHands{
 constructor(carModel,config={}){
  this.model=carModel;this.config={...NATIVE_DRIVER_HANDS,...(config.serialized||config.fields||config)};this.driver=config.driverRoot?.isObject3D?config.driverRoot:findDriver(carModel);this.arms=[];this.ready=false;
  if(!this.driver){this.reason='Original skinned driver is not loaded.';return;}
  this.skeletons=new Set();this.driver.traverse(node=>{if(node.isSkinnedMesh){node.frustumCulled=false;this.skeletons.add(node.skeleton);}});
  if(!this.skeletons.size){this.reason='The driver mesh is baked and cannot follow its bones.';return;}
  this.model.updateMatrixWorld(true);
  for(const [side,label]of[['L','left'],['R','right']]){
   const bones=['Shoulder','UpperArm','LowerArm','Wrist'].map(name=>find(this.driver,`${name}.${side}`)),grip=find(carModel,`Grip_${side}`);if(bones.some(bone=>!bone)||!grip){this.reason=`Original ${label} arm or grip is missing.`;return;}
   const [shoulder,upper,lower,wrist]=bones,palm=estimatePalmWorld(wrist).sub(position(wrist)).applyQuaternion(rotation(wrist).invert());
   const arm={side,bones,shoulder,upper,lower,wrist,grip,palm,original:capture(bones),wristOnGrip:rotation(grip).invert().multiply(rotation(wrist)),length:position(upper).distanceTo(position(lower))+position(lower).distanceTo(position(wrist))};cacheAxes(arm,this.driver);this.arms.push(arm);
  }
  this.handbrake=find(carModel,'handbrake_location');this.wheel=find(carModel,'WheelRotationHelper');this.wheelRest=this.wheel?.quaternion.clone();
  this.ready=true;
  // TrySetup 0x4F8150 solves zero-steer arms, then caches THAT pose and its axes.
  this.update(0,{bake:true});for(const arm of this.arms){arm.rest=capture(arm.bones);cacheAxes(arm,this.driver);}
  this.update(0);
 }
 shoulderAim(arm,target,weight,limitWeight,bake){
  const rest=(bake?arm.original:arm.rest||arm.original)[0],before=rotation(arm.shoulder),from=position(arm.upper).sub(position(arm.shoulder)),to=target.clone().sub(position(arm.shoulder));if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)return;
  const desired=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(before);worldRotation(arm.shoulder,before.slerp(desired,weight));
  arm.shoulder.quaternion.copy(rest.clone().slerp(arm.shoulder.quaternion,limitWeight));
  const limit=(this.config.maxShoulderDegrees??0)*RAD,angle=rest.angleTo(arm.shoulder.quaternion);if(angle>limit&&angle>1e-8)arm.shoulder.quaternion.copy(rest.clone().slerp(arm.shoulder.quaternion,limit/angle));arm.shoulder.updateMatrixWorld(true);
 }
 update(steer=0,options={}){
  if(!this.ready)return false;if(typeof steer==='object'){options=steer;steer=options.steer||0;}
  const config=this.config,steerDegrees=options.steerDegrees??steer*config.steeringWheelDegrees,handbrake=options.handbrake===true||Number(options.handbrake)>config.handbrakePoseThreshold,dt=clamp(options.dt??1/60,0,.1),bake=options.bake===true;
  this.model.updateMatrixWorld(true);const offset=new THREE.Vector3().fromArray(config.palmLocalOffset||[0,0,0]);
  for(const arm of this.arms){
   restore(arm.bones,arm.rest||arm.original);this.model.updateMatrixWorld(true);
   const targetNode=arm.side==='R'&&handbrake&&this.handbrake?this.handbrake:arm.grip,gripRotation=rotation(targetNode).multiply(arm.wristOnGrip),targetPalm=position(targetNode).add(offset.clone().applyQuaternion(rotation(targetNode)));
   if(arm.side==='R'){
    const local=this.driver.worldToLocal(targetPalm.clone());
    if(!this.rightPalmLocal){this.rightPalmLocal=local.clone();this.rightPalmVelocity=new THREE.Vector3();}
    if(this.rightWasBrake&&!handbrake)this.rightReturning=true;
    if(handbrake||this.rightReturning){smoothPalm(this.rightPalmLocal,local,this.rightPalmVelocity,config.cabinHandSmoothTime,dt);if(!handbrake&&this.rightPalmLocal.distanceTo(local)<.002){this.rightReturning=false;this.rightPalmLocal.copy(local);this.rightPalmVelocity.set(0,0,0);}}
    else this.rightPalmLocal.copy(local);
    this.rightWasBrake=handbrake;targetPalm.copy(this.driver.localToWorld(this.rightPalmLocal.clone()));
   }
   const restRotation=rotation(this.driver).multiply(arm.restWristInDriver),weight=steerWeight(steerDegrees,config.wristIkSteerDeadZone??3,config.wristIkSteerFullAt??110),twistWeight=steerWeight(steerDegrees,config.wristIkSteerDeadZone??3,config.gripTwistFullAt??50);
   const outward=new THREE.Vector3(arm.side==='L'?-1:1,0,0).applyQuaternion(rotation(this.driver)),inside=Math.max(0,arm.side==='L'?steerDegrees:-steerDegrees)*weight;
   const pole=position(arm.lower).addScaledVector(outward,(config.elbowHintRestOutward??.06)+(config.elbowHintOutwardPerDegree??.0022)*inside).add(new THREE.Vector3(0,0,1).applyQuaternion(rotation(this.driver)).multiplyScalar((config.elbowHintForwardPerDegree??.0008)*inside));
   let wristRotation=restRotation.clone();
   // SolveArm 0x4F72D0 aligns the wrist with the forearm, then adds bounded
   // grip roll. Locking the wrist directly to the wheel makes arms unreachable.
   for(let iteration=0;iteration<(bake?3:2);iteration++){
    const direction=targetPalm.clone().sub(arm.palm.clone().applyQuaternion(wristRotation)).sub(position(arm.lower)).normalize(),twist=bake?0:gripTwist(arm,restRotation,direction,gripRotation);
    const extra=bake?0:-clamp(steerDegrees*(config.wristSteerYawPerDegree??.162),-(config.maxWristSteerYawDegrees??60),config.maxWristSteerYawDegrees??60);
    wristRotation=alignedWrist(arm,restRotation,direction,twist*twistWeight+extra);
    const targetWrist=targetPalm.clone().sub(arm.palm.clone().applyQuaternion(wristRotation));
    this.shoulderAim(arm,targetWrist,bake?1:Math.max(.35,weight),bake?1:(config.shoulderIkWeight??.22)+(1-(config.shoulderIkWeight??.22))*weight,bake);
    solveArmChain(arm.upper,arm.lower,arm.wrist,targetWrist,pole);worldRotation(arm.wrist,wristRotation);
    if(!bake&&iteration===0){const roll=clamp(twist*twistWeight*(config.forearmTwistShare??.42),-(config.maxForearmTwistDegrees??32),config.maxForearmTwistDegrees??32),axis=position(arm.wrist).sub(position(arm.lower)).normalize();worldRotation(arm.lower,new THREE.Quaternion().setFromAxisAngle(axis,roll*RAD).multiply(rotation(arm.lower)));worldRotation(arm.wrist,wristRotation);}
   }
   arm.targetPalm=targetPalm;arm.error=estimatePalmWorld(arm.wrist).distanceTo(targetPalm);
  }
  this.model.updateMatrixWorld(true);this.skeletons.forEach(skeleton=>skeleton.update());return true;
 }
 dispose(){for(const arm of this.arms)restore(arm.bones,arm.original);this.model.updateMatrixWorld(true);this.skeletons?.forEach(skeleton=>skeleton.update());this.ready=false;}
}
