import {decodeRagdoll,RAGDOLL} from '../shared/spectator-ragdoll.js';
const mix=(a,b,t)=>a+(b-a)*t;
/** Interpolate server joint poses; the browser never integrates ragdoll physics. */
export class RagdollPlayback{
 constructor(){this.frames=new Map();this.epoch=null;this.latestTime=0;this.received=0;}
 accept(snapshot,now){
  if(snapshot.epoch!==this.epoch){this.frames.clear();this.epoch=snapshot.epoch;}
  this.latestTime=snapshot.elapsed;this.received=now;const ids=new Set();
  for(const body of snapshot.spectatorBodies||[]){const points=decodeRagdoll(body.p,body.o);if(!points)continue;ids.add(body.id);const frames=this.frames.get(body.id)||[];if(!frames.length||body.t>frames.at(-1).body.t){frames.push({body,points,car:{...snapshot.cars[body.team]}});if(frames.length>3)frames.shift();}this.frames.set(body.id,frames);}
  for(const id of this.frames.keys())if(!ids.has(id))this.frames.delete(id);
 }
 sample(id,now,running=true){
  const frames=this.frames.get(id);if(!frames?.length)return null;const current=frames.at(-1),previous=frames.at(-2)||current,time=this.latestTime+(running?Math.max(0,Math.min(.10,(now-this.received)/1000)):.05)-.05,span=current.body.t-previous.body.t,t=span>0?Math.max(0,Math.min(1,(time-previous.body.t)/span)):1,points=new Float64Array(48);
  for(let i=0;i<48;i++)points[i]=mix(previous.points[i],current.points[i],t);
  const car={};for(const key of['x','y','z'])car[key]=mix(previous.car[key],current.car[key],t);car.yaw=previous.car.yaw+Math.atan2(Math.sin(current.car.yaw-previous.car.yaw),Math.cos(current.car.yaw-previous.car.yaw))*t;
  return{points,body:current.body,car};
 }
}
