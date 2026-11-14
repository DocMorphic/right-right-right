import * as THREE from 'three';
import {ImprovedNoise} from 'three/addons/math/ImprovedNoise.js';

// Recovered CrashWreckFX defaults and reflected-X camera targets.
export const NATIVE_CRASH=Object.freeze({shake:.12,slam:.16,hold:.2,stamp:.4,stampPop:.12,shakePosition:.16,shakeRotation:28,tint:[.55,.06,.04],tintAlpha:.34});
export const crashedSeat=(snapshot,slot)=>snapshot?.cars?.[Math.floor(slot/2)]?.dead===true;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class CrashSequence{
 reset(){this.startedAt=null;this.epoch=null;this.team=null;}
 sample(snapshot,slot,now){
  const team=Math.floor(slot/2);
  if(!crashedSeat(snapshot,slot)){this.reset();return{active:false,locked:false,hold:false,stamp:false,elapsed:0,tintAlpha:0,scale:1};}
  if(this.startedAt==null||this.epoch!==snapshot.epoch||this.team!==team){this.startedAt=now;this.epoch=snapshot.epoch;this.team=team;}
  const elapsed=Math.max(0,(now-this.startedAt)/1000),stamp=elapsed>=NATIVE_CRASH.stamp,u=clamp((elapsed-NATIVE_CRASH.stamp)/NATIVE_CRASH.stampPop,0,1);
  return{active:true,locked:true,elapsed,hold:elapsed>=NATIVE_CRASH.hold,stamp,tintAlpha:NATIVE_CRASH.tintAlpha*clamp((elapsed-NATIVE_CRASH.stamp)*4,0,1),scale:1.18-.18*(1-(1-u)**2)};
 }
}
const facing=new THREE.Quaternion(0,1,0,0),unfacing=new THREE.Quaternion(0,-1,0,0),noise=new ImprovedNoise(),noise01=(x,y)=>.5+.5*noise.noise(x,y,0),radians=Math.PI/180;
export class CrashCamera{
 constructor(camera,parent,slot){
  parent.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);this.parent=parent;
  this.from=parent.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));this.parentRotation=new THREE.Quaternion();parent.getWorldQuaternion(this.parentRotation);
  this.fromRotation=this.parentRotation.clone().invert().multiply(camera.getWorldQuaternion(new THREE.Quaternion())).multiply(unfacing);
  this.target=new THREE.Vector3(slot%2===0?.34:-.36,.9,.46);
  this.targetRotation=new THREE.Quaternion(...(slot%2===0?[.619917503,-.170557027,-.194075540,.740909761]:[.605989554,.215472048,.243198803,.726087322])).normalize();
  this.position=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.jitter=new THREE.Quaternion();
 }
 apply(camera,elapsed){
  const u=1-(1-clamp(elapsed/NATIVE_CRASH.slam,0,1))**3;this.position.copy(this.from).lerp(this.target,u);this.rotation.copy(this.fromRotation).slerp(this.targetRotation,u);
  if(elapsed<NATIVE_CRASH.shake){
   // The native uses Unity PerlinNoise. ImprovedNoise preserves the recovered
   // amplitude/envelope/sample paths; the exact Unity noise implementation differs.
   const t=elapsed*70,fade=1-elapsed/NATIVE_CRASH.shake,p=NATIVE_CRASH.shakePosition*fade,a=NATIVE_CRASH.shakeRotation*fade*radians;
   this.position.add(new THREE.Vector3(-(noise01(t,1.7)-.5),noise01(2.2,t)-.5,noise01(t,t)-.5).multiplyScalar(p));
   this.jitter.setFromEuler(new THREE.Euler((noise01(t,4.1)-.5)*a,-(noise01(5.4,t)-.5)*a,-(noise01(t*.8,8.2)-.5)*a,'YXZ'));this.rotation.multiply(this.jitter);
  }
  this.parent.updateWorldMatrix(true,false);camera.position.copy(this.parent.localToWorld(this.position));this.parent.getWorldQuaternion(this.parentRotation);camera.quaternion.copy(this.parentRotation).multiply(this.rotation).multiply(facing);
  if(camera.near!==.04){camera.near=.04;camera.updateProjectionMatrix();}
 }
}
