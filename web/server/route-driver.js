/** Feedback driver for full-route acceptance tests: consumes only course geometry and snapshots. */
import {nearestPoint,direction} from '../shared/course.js';
import {stepCar,steeringLimit,CAR} from '../shared/physics.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
function ahead(course,index,distance){
  const start=course.distances[index];let target=index;
  while(target<course.points.length-1&&course.distances[target]<start+distance)target++;
  return target;
}
export function routeInput(course,snapshot,team=0,{maxSpeed=13.2,responseSeconds=.1}={}){
  let car=snapshot.cars[team];
  if(!car||car.dead||car.finish>=0||snapshot.phase!=='running')return {throttle:0,steer:0,handbrake:false,wipe:false,pitch:0,yaw:0,actions:[]};
  if(responseSeconds>0){car=structuredClone(car);let remaining=responseSeconds;while(remaining>1e-6){const dt=Math.min(.02,remaining);stepCar(car,snapshot.inputs?.[team*2]||{},dt,course);remaining-=dt;}}
  const near=nearestPoint(course,car.x,car.z,car.nearest??car.progress,60),speed=Math.max(0,car.speed),lookahead=5+speed*.4+speed*Math.max(0,responseSeconds-.2)*.5;
  const target=course.points[ahead(course,near.index,lookahead)];
  const slip=Math.atan2(car.vx*Math.cos(car.yaw)-car.vz*Math.sin(car.yaw),Math.max(1,Math.abs(car.speed)));
  const error=wrap(Math.atan2(target.x-car.x,target.z-car.z)-car.yaw-slip*.7-(car.yawRate||0)*.18);
  const steeringAngle=Math.atan2(2*CAR.wheelbase*Math.sin(error),Math.max(2,Math.hypot(target.x-car.x,target.z-car.z)));
  const steer=clamp(-steeringAngle/(steeringLimit(speed)*.92),-1,1);
  // Authored stages contain tighter corners than the scaled procedural tracks.
  // Use peak upcoming curvature so the acceptance driver brakes before those
  // corners instead of assuming the old velocity-snapping model can rail them.
  let curvature=.001,previous=direction(course.points,near.index),distance=0;
  for(const look of [4,8,12,18,22]){const next=direction(course.points,ahead(course,near.index,look));curvature=Math.max(curvature,Math.abs(wrap(Math.atan2(next.x,next.z)-Math.atan2(previous.x,previous.z)))/(look-distance));previous=next;distance=look;}
  const desired=clamp(Math.sqrt(3.4/curvature),4,maxSpeed);
  const throttleGain=Math.min(.7,.6/(14*Math.max(.1,responseSeconds)));
  const throttle=clamp((desired-speed)*throttleGain,-1,1);
  return {throttle,steer,handbrake:false,wipe:car.mud>.05,pitch:0,yaw:0,actions:[]};
}
