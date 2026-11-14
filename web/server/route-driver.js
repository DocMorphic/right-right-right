/** Feedback driver for full-route acceptance tests: consumes only course geometry and snapshots. */
import {nearestPoint,direction} from '../shared/course.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
function ahead(course,index,distance){
  const start=course.distances[index];let target=index;
  while(target<course.points.length-1&&course.distances[target]<start+distance)target++;
  return target;
}
export function routeInput(course,snapshot,team=0,{maxSpeed=13.2}={}){
  const car=snapshot.cars[team];
  if(!car||car.dead||car.finish>=0||snapshot.phase!=='running')return {throttle:0,steer:0,handbrake:false,wipe:false,pitch:0,yaw:0,actions:[]};
  const near=nearestPoint(course,car.x,car.z,car.nearest??car.progress,60),speed=Math.max(0,car.speed),lookahead=5+speed*.25;
  const target=course.points[ahead(course,near.index,lookahead)];
  const error=wrap(Math.atan2(target.x-car.x,target.z-car.z)-car.yaw);
  const steeringAngle=Math.atan2(2*2.45*Math.sin(error),Math.max(2,Math.hypot(target.x-car.x,target.z-car.z)));
  const steer=clamp(-steeringAngle/.44,-1,1);
  const f=direction(course.points,near.index),far=direction(course.points,ahead(course,near.index,22));
  const curvature=Math.abs(wrap(Math.atan2(far.x,far.z)-Math.atan2(f.x,f.z)))/22;
  const desired=clamp(Math.sqrt(3.4/Math.max(.001,curvature)),7,maxSpeed);
  const throttle=clamp((desired-speed)*.7+desired*.065,-1,1);
  return {throttle,steer,handbrake:false,wipe:car.mud>.05,pitch:0,yaw:0,actions:[]};
}
