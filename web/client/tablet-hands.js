import * as THREE from 'three';
import {estimatePalmWorld,solveArmChain} from './hand-rig.js';

const normalized=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function find(root,name){let found;root.traverse(node=>{if(!found&&normalized(node.name)===normalized(name))found=node;});return found;}
const position=node=>node.getWorldPosition(new THREE.Vector3());
const rotation=node=>node.getWorldQuaternion(new THREE.Quaternion());
function setWorldRotation(node,quaternion){node.quaternion.copy(rotation(node.parent).invert().multiply(quaternion));node.updateMatrixWorld(true);}
function signedRoll(up,target,axis){
  up=up.clone().addScaledVector(axis,-up.dot(axis));target=target.clone().addScaledVector(axis,-target.dot(axis));
  if(up.lengthSq()<1e-12||target.lengthSq()<1e-12)return 0;up.normalize();target.normalize();
  return Math.atan2(axis.dot(new THREE.Vector3().crossVectors(up,target)),THREE.MathUtils.clamp(up.dot(target),-1,1));
}
export function mirrorTabletWrist(tabletRotation,leftWorld){
  const local=tabletRotation.clone().invert().multiply(leftWorld);local.y*=-1;local.z*=-1;
  return tabletRotation.clone().multiply(local).normalize();
}
function cacheAxes(arm,navigator){
  const world=rotation(arm.wrist),inverse=world.clone().invert();
  arm.restWrist=rotation(navigator).invert().multiply(world);
  arm.forearm=position(arm.lower).sub(position(arm.wrist)).normalize().applyQuaternion(inverse);
  // Native uses wrist.forward, falling back to wrist.right when parallel to
  // the forearm. These are bone-local axes, not world up. X is reflected.
  arm.up=Math.abs(arm.forearm.z)>.95?new THREE.Vector3(-1,0,0):new THREE.Vector3(0,0,1);
  arm.up.addScaledVector(arm.forearm,-arm.up.dot(arm.forearm)).normalize();
}
// Transfer wrist-local twist to the lower arm without changing the wrist's
// position or world orientation. The original child-bone axis stays fixed.
function untwist(arm,desiredWorld){
  const local=rotation(arm.lower).invert().multiply(desiredWorld),delta=local.clone().multiply(arm.rest[3].clone().invert());
  const axis=arm.wrist.position.clone().normalize(),projection=axis.clone().multiplyScalar(delta.x*axis.x+delta.y*axis.y+delta.z*axis.z);
  const twist=new THREE.Quaternion(projection.x,projection.y,projection.z,delta.w);
  if(twist.lengthSq()>1e-12){twist.normalize();arm.lower.quaternion.multiply(twist);arm.lower.updateMatrixWorld(true);setWorldRotation(arm.wrist,desiredWorld);}
}

/** The scene export's baked arms cannot follow a held tablet. Use the original
 * navigator skin, bone lengths, palm samples and tablet grip transforms instead.
 * The analytical solver remains a browser adaptation of the native hand IK.
 */
export class TabletHands{
  constructor(navigator,tablet,settings={}){
    this.navigator=navigator;this.settings=settings;this.arms=[];this.tablet=tablet;this.skeletons=new Set();this.holding=false;
    navigator.traverse(node=>{if(node.isSkinnedMesh){node.frustumCulled=false;this.skeletons.add(node.skeleton);}});
    if(!this.skeletons.size)throw new Error('Original navigator skin is missing.');
    navigator.updateWorldMatrix(true,true);tablet.updateWorldMatrix(true,true);
    for(const side of ['L','R']){
      const bones=['Shoulder','UpperArm','LowerArm','Wrist'].map(name=>find(navigator,`${name}.${side}`)),grip=find(tablet,`Grip_${side}`);
      if(bones.some(bone=>!bone)||!grip)throw new Error(`Original navigator ${side} grip is missing.`);
      const [shoulder,upper,lower,wrist]=bones;
      this.arms.push({side,bones,shoulder,upper,lower,wrist,grip,rest:bones.map(bone=>bone.quaternion.clone()),
        palm:estimatePalmWorld(wrist).sub(position(wrist)).applyQuaternion(rotation(wrist).invert()),
        restWrist:rotation(navigator).invert().multiply(rotation(wrist)),
        forearm:position(lower).sub(position(wrist)).normalize().applyQuaternion(rotation(wrist).invert())});
    }
    for(const arm of this.arms){arm.idle=arm.rest;cacheAxes(arm,navigator);}
  }
  reset(){for(const arm of this.arms)arm.bones.forEach((bone,i)=>bone.quaternion.copy(arm.idle[i]));this.navigator.updateWorldMatrix(true,true);}
  setTablet(tablet){this.tablet=tablet;this.holding=false;for(const arm of this.arms){arm.grip=find(tablet,`Grip_${arm.side}`);if(!arm.grip)throw new Error('Original tablet grip is missing.');}}
  update(held,bake=false){
    if(!held){this.reset();this.holding=false;}
    else{
      this.tablet.updateWorldMatrix(true,true);
      // TryBake executes the source three-pass palm-facing solve once, then
      // stores that holding rest pose for the two-pass late-update solve.
      if(!bake&&!this.holding){this.reset();for(const arm of this.arms){arm.rest=arm.idle;cacheAxes(arm,this.navigator);}this.update(true,true);for(const arm of this.arms){arm.rest=arm.bones.map(bone=>bone.quaternion.clone());cacheAxes(arm,this.navigator);arm.wristOnGrip=rotation(arm.grip).invert().multiply(rotation(arm.wrist));}this.holding=true;}
      for(const arm of this.arms){
        arm.bones.forEach((bone,i)=>bone.quaternion.copy((bake?arm.idle:arm.rest)[i]));arm.shoulder.updateMatrixWorld(true);
        const target=position(arm.grip),rest=rotation(this.navigator).multiply(arm.restWrist),outward=new THREE.Vector3(arm.side==='L'?-1:1,0,0).applyQuaternion(rotation(this.navigator));
        const pole=position(arm.lower).addScaledVector(outward,this.settings.elbowHintRestOutward??.06);
        let wristRotation=rest.clone();
        for(let iteration=0;iteration<(bake?3:2);iteration++){
          const direction=target.clone().sub(arm.palm.clone().applyQuaternion(wristRotation)).sub(position(arm.lower)).normalize();
          wristRotation=new THREE.Quaternion().setFromUnitVectors(arm.forearm.clone().applyQuaternion(rest),direction.clone().negate()).multiply(rest);
          const wanted=bake?position(this.tablet.getObjectByName('Tablet')||this.tablet).sub(position(arm.grip)):arm.up.clone().applyQuaternion(rotation(arm.grip).multiply(arm.wristOnGrip));
          const roll=signedRoll(arm.up.clone().applyQuaternion(wristRotation),wanted,direction);
          const extra=bake?Math.PI:(arm.side==='L'?this.settings.leftExtraRollDegrees:this.settings.rightExtraRollDegrees)*Math.PI/180;
          wristRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(direction,roll*(bake?1:this.settings.gripTwistWeight??1)+(extra||0)));
          const wristTarget=target.clone().sub(arm.palm.clone().applyQuaternion(wristRotation));
          // Preserve native shoulder rest, maximum32deg and authored arm lengths.
          const before=rotation(arm.shoulder),from=position(arm.upper).sub(position(arm.shoulder)),to=wristTarget.clone().sub(position(arm.shoulder));
          setWorldRotation(arm.shoulder,new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize()).multiply(before));
          arm.shoulder.quaternion.copy(arm.rest[0].clone().slerp(arm.shoulder.quaternion,bake?1:this.settings.shoulderIkWeight??.55));
          const max=(this.settings.maxShoulderDegrees??32)*Math.PI/180,angle=arm.rest[0].angleTo(arm.shoulder.quaternion);
          if(angle>max)arm.shoulder.quaternion.copy(arm.rest[0].clone().slerp(arm.shoulder.quaternion,max/angle));arm.shoulder.updateMatrixWorld(true);
          solveArmChain(arm.upper,arm.lower,arm.wrist,wristTarget,pole);setWorldRotation(arm.wrist,wristRotation);
          if(!bake)untwist(arm,wristRotation);
        }
        arm.target=target;arm.pole=pole;
      }
      if(!bake){
        const right=this.arms[1],desired=mirrorTabletWrist(rotation(this.tablet.getObjectByName('Tablet')||this.tablet),rotation(this.arms[0].wrist));
        // Retain palm contact after mirroring; original segment lengths remain
        // unchanged. Native MirrorRightWristFromLeft also untwists the forearm.
        solveArmChain(right.upper,right.lower,right.wrist,right.target.clone().sub(right.palm.clone().applyQuaternion(desired)),right.pole);setWorldRotation(right.wrist,desired);untwist(right,desired);
      }
      for(const arm of this.arms)arm.error=estimatePalmWorld(arm.wrist).distanceTo(arm.target);
    }
    this.navigator.updateMatrixWorld(true);for(const skeleton of this.skeletons)skeleton.update();
  }
  dispose(){this.reset();this.skeletons.clear();}
}
