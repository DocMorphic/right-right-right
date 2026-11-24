import {beginSpectatorRagdoll,spectatorFloor} from './spectator-ragdoll.js';
import {nativeTrees}from'./world-collision.js';
/** Deterministic roadside crowds and compact, permanent per-race hit events. */
export const SPECTATOR_PHYSICS=Object.freeze({gravity:9.81,radius:.32,minHitSpeed:.5,maxPeople:96,maxFlightSeconds:1.6,carRadius:.85,carHalfLength:1.15});
const caches=new WeakMap(),placements=new WeakMap(),CELL=12;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*1000)/1000;
const key=(x,z)=>`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`;
function random(seed){let state=(seed>>>0)||1;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);}
function geometry(course){
 let result=caches.get(course);if(result)return result;
 const road=new Map(),trees=new Map(),points=course.points;
 const add=(grid,k,item)=>{if(!grid.has(k))grid.set(k,[]);grid.get(k).push(item);};
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],radius=Math.max(course.widths?.[i]??course.width,course.widths?.[i+1]??course.width)/2+.12;
  for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++)for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)add(road,`${x},${z}`,{a,b,radius});
 }
 for(const tree of [...(course.trees||[]),...nativeTrees(course)])add(trees,key(tree.x,tree.z),tree);
 let distances=course.distances;if(!distances){distances=[0];for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));}
 result={road,trees,distances};caches.set(course,result);return result;
}
function poseAt(course,distance){
 const distances=geometry(course).distances,points=course.points;let lo=0,hi=distances.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(distances[mid]<distance)lo=mid;else hi=mid;}
 const a=points[lo],b=points[hi],t=clamp((distance-distances[lo])/(distances[hi]-distances[lo]||1),0,1),length=Math.hypot(b.x-a.x,b.z-a.z)||1;
 return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,fx:(b.x-a.x)/length,fz:(b.z-a.z)/length,width:course.widths?.[lo]??course.width};
}
function clear(course,x,z,people,spawn,finish){
 if(Math.hypot(x-spawn.x,z-spawn.z)<25||Math.hypot(x-finish.x,z-finish.z)<25)return false;
 const {road,trees}=geometry(course);
 for(const segment of road.get(key(x,z))||[])if(segmentDistance(x,z,segment.a,segment.b)<segment.radius)return false;
 const gx=Math.floor(x/CELL),gz=Math.floor(z/CELL);
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const tree of trees.get(`${gx+dx},${gz+dz}`)||[]){const pine=typeof tree.variant==='string'?tree.variant.startsWith('Pine'):tree.variant===2||tree.variant===3,clearance=(pine?1.2:.7)*(tree.scale??1);if(Math.hypot(x-tree.x,z-tree.z)<(tree.radius??.4)+clearance)return false;}
 return people.every(person=>Math.hypot(x-person.x,z-person.z)>.95);
}
// A visible spectator must also be reachable by a car from the road. Reject
// pockets hidden behind a solid trunk rather than asking the player to tree first.
function clearApproach(course,p,x,z){
 const start={x:p.x-p.fx*8,z:p.z-p.fz*8},length=Math.hypot(p.x-x,p.z-z)||1,end={x:x+(p.x-x)/length*.8,z:z+(p.z-z)/length*.8},grid=geometry(course).trees,seen=new Set();
 for(let i=0;i<=4;i++){const t=i/4,gx=Math.floor((start.x+(end.x-start.x)*t)/CELL),gz=Math.floor((start.z+(end.z-start.z)*t)/CELL);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const tree of grid.get(`${gx+dx},${gz+dz}`)||[]){if(seen.has(tree))continue;seen.add(tree);if(segmentDistance(tree.x,tree.z,start,end)<(tree.radius??.4)+.9)return false;}}
 return true;
}
/** Samples the actual road, rather than a chord between the first and last
 * spectator. No road/tree geometry is moved to fit a crowd or its dressing. */
export function spectatorPocketPath(course,people){
 const sorted=[...people].sort((a,b)=>(a.routeDistance??a.id)-(b.routeDistance??b.id));
 if(sorted.every(p=>Number.isFinite(p.routeDistance))){
  const start=sorted[0].routeDistance-.6,end=sorted.at(-1).routeDistance+.6,n=Math.max(2,Math.ceil((end-start)/.7)),out=[];
  for(let i=0;i<=n;i++){const d=start+(end-start)*i/n,p=poseAt(course,d);let k=0;while(k<sorted.length-1&&sorted[k+1].routeDistance<d)k++;const a=sorted[k],b=sorted[Math.min(k+1,sorted.length-1)],u=clamp((d-a.routeDistance)/(b.routeDistance-a.routeDistance||1),0,1),offset=q=>{const c=poseAt(course,q.routeDistance);return Math.hypot(q.x-c.x,q.z-c.z)-c.width/2;},margin=offset(a)*(1-u)+offset(b)*u-.15,side=a.side;
   out.push({x:p.x+p.fz*(p.width/2+margin)*side,y:p.y,z:p.z-p.fx*(p.width/2+margin)*side,distance:d});
  }return out;
 }
 return sorted.map(p=>({x:p.x+Math.sin(p.yaw)*.15,y:p.y,z:p.z+Math.cos(p.yaw)*.15}));
}
export function generateSpectators(course){
 if(course.liveRoad)return [];
 if(placements.has(course))return placements.get(course);
 const people=[],points=course.points;if(points.length<2){placements.set(course,people);return people;}
 const rand=random((course.seed||1)^Math.imul(course.profile||0,7919)^0x53504543),distances=geometry(course).distances,startIndex=course.startIndex??Math.min(8,points.length-1),finishIndex=course.finishIndex??Math.max(startIndex,points.length-9);
 const endpoint=(pose,index)=>pose?{x:pose.position[0],z:pose.position[2]}:points[index],spawn=endpoint(course.startPose,startIndex),finish=endpoint(course.finishPose,finishIndex),end=distances[finishIndex]-35;
 // Deliberately select entry/apex/exit pockets instead of only periodic
 // distance markers, which favour long straights. Outer shoulders are preferred;
 // original road/trunk clearance and a hittable approach are still mandatory.
 const begin=distances[startIndex]+40,bends=[],regular=[],angleAt=distance=>{
  const a=poseAt(course,distance-8),b=poseAt(course,distance+8);
  return Math.atan2(a.fz*b.fx-a.fx*b.fz,a.fx*b.fx+a.fz*b.fz);
 };
 for(let distance=begin;distance<end;distance+=10){const angle=angleAt(distance);if(Math.abs(angle)>.14)bends.push({distance,angle,kind:'bend'});}
 const chosen=[];for(const bend of bends.sort((a,b)=>Math.abs(b.angle)-Math.abs(a.angle)||a.distance-b.distance)){
  if(chosen.every(p=>Math.abs(p.distance-bend.distance)>38))chosen.push(bend);
  if(chosen.length>=10)break;
 }
 for(let distance=distances[startIndex]+50;distance<end;distance+=135+rand()*45)regular.push({distance,angle:angleAt(distance),kind:'roadside'});
 const pockets=[];
 for(const candidate of [...chosen,...regular]){
  const {distance,angle,kind}=candidate;if(people.length>=SPECTATOR_PHYSICS.maxPeople)break;
  if(kind==='bend'&&people.length>=64||pockets.some(p=>Math.abs(p.distance-distance)<30))continue;
  const count=Math.min(kind==='bend'?6:3+Math.floor(rand()*2),SPECTATOR_PHYSICS.maxPeople-people.length);if(count<2)break;
  const side=kind==='bend'?-(Math.sign(angle)||1):(rand()<.5?-1:1),motionOffset=Math.floor(rand()*6);let acceptedGroup=[];
  for(const chosenSide of [side,-side]){
   const group=[];
   for(let member=0;member<count;member++){
    let accepted=null;
    for(let attempt=0;attempt<12&&!accepted;attempt++){
     const routeDistance=distance+(member-(count-1)/2)*1.7+(Math.floor(attempt/4)-1)*.65,p=poseAt(course,routeDistance),offset=p.width/2+.45+(attempt%4)*.16;
     const x=p.x+p.fz*offset*chosenSide,z=p.z-p.fx*offset*chosenSide;
     if(clear(course,x,z,[...people,...group],spawn,finish)&&clearApproach(course,p,x,z)){
      const motion=(motionOffset+member)%6;
      accepted={group:round(distance),side:chosenSide,x:round(x),y:round(p.y),z:round(z),yaw:round(Math.atan2(p.x-x,p.z-z)),variant:motion,motion,tempo:round(.94+rand()*.12),phase:round(rand()*Math.PI*2),scale:round(.9+rand()*.2),routeDistance:round(routeDistance),bend:round(angle),pocket:kind};
     }
    }
    if(accepted)group.push(accepted);
   }
   if(group.length>acceptedGroup.length)acceptedGroup=group;if(group.length===count)break;
  }
  if(acceptedGroup.length>=2){for(const person of acceptedGroup)people.push({...person});pockets.push(candidate);}
 }
 // Spatial IDs stay in route order so early encounters remain early, even
 // though bend pockets receive the placement budget first.
 people.sort((a,b)=>a.routeDistance-b.routeDistance);people.forEach((p,id)=>p.id=id);
 placements.set(course,people);return people;
}
export const makeSpectatorState=()=>({spectatorHits:[],spectatorBodies:[]});
function sweptDistance(person,car){
 const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),length=SPECTATOR_PHYSICS.carHalfLength,a={x:car.lastX,z:car.lastZ},b={x:car.x,z:car.z};
 const corners=[{x:a.x-fx*length,z:a.z-fz*length},{x:a.x+fx*length,z:a.z+fz*length},{x:b.x+fx*length,z:b.z+fz*length},{x:b.x-fx*length,z:b.z-fz*length}];
 let positive=false,negative=false,area=0,distance=Infinity;
 for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4],cross=(q.x-p.x)*(person.z-p.z)-(q.z-p.z)*(person.x-p.x);positive||=cross>1e-9;negative||=cross< -1e-9;area+=p.x*q.z-q.x*p.z;distance=Math.min(distance,segmentDistance(person.x,person.z,p,q));}
 return Math.abs(area)>1e-9&&!(positive&&negative)?0:distance;
}
export function stepSpectators(world,dt,course,onlyTeam=null){
 world.spectatorHits??=[];if(!(dt>0)||world.phase&&world.phase!=='running')return world.spectatorHits;
 const hit=new Set(world.spectatorHits.map(event=>event.id));
 for(const person of course.spectators||generateSpectators(course)){
  if(hit.has(person.id)||world.spectatorHits.length>=SPECTATOR_PHYSICS.maxPeople)continue;
  for(let team=0;team<world.cars.length;team++){
   if(onlyTeam!==null&&team!==onlyTeam)continue;
   const car=world.cars[team],speed=Math.hypot(car.vx||0,car.vz||0);
   if(car.dead||car.finish>=0||Math.abs((car.y??person.y+.68)-.68-person.y)>2.2*(person.scale??1)||speed<=SPECTATOR_PHYSICS.minHitSpeed||![car.lastX,car.lastZ,car.x,car.z].every(Number.isFinite)||Math.hypot(car.x-car.lastX,car.z-car.lastZ)<1e-6)continue;
   if(sweptDistance(person,car)>SPECTATOR_PHYSICS.carRadius+SPECTATOR_PHYSICS.radius*(person.scale??1))continue;
   const rand=random(Math.imul(person.id+1,1597334677)^(course.seed||1)),gain=Math.min(.35,9/speed),side=(person.x-car.x)*Math.cos(car.yaw)-(person.z-car.z)*Math.sin(car.yaw);
   const event={id:person.id,time:round(world.elapsed),x:person.x,y:round(spectatorFloor(course)(person.x,person.z,person.y)),z:person.z,vx:round(car.vx*gain),vy:round(4+Math.min(speed,25)*.06+rand()*.6),vz:round(car.vz*gain),spin:round((side<0?-1:1)*(4.5+rand()*4)),scale:person.scale||1,car:{x:car.x,y:car.y,z:car.z,yaw:car.yaw,vx:car.vx,vz:car.vz},team};
   world.spectatorHits.push(event);beginSpectatorRagdoll(world,event,person);hit.add(person.id);break;
  }
 }
 return world.spectatorHits;
}
export function sampleSpectatorHit(hit,worldElapsed){
 const t=Math.max(0,worldElapsed-hit.time),flightTime=Math.min(SPECTATOR_PHYSICS.maxFlightSeconds,Math.max(.1,2*hit.vy/SPECTATOR_PHYSICS.gravity)),flight=Math.min(t,flightTime),progress=flight/flightTime,smooth=clamp((progress-.75)/.25,0,1),blend=smooth*smooth*(3-2*smooth),side=Math.sign(hit.spin)||1,rest=side*Math.PI/2+Math.round((hit.spin*flightTime-side*Math.PI/2)/(Math.PI*2))*Math.PI*2;
 return{x:hit.x+hit.vx*flight,y:hit.y+Math.max(0,hit.vy*flight-.5*SPECTATOR_PHYSICS.gravity*flight*flight),z:hit.z+hit.vz*flight,t,flightTime,settled:t>=flightTime,roll:hit.spin*flight*(1-blend)+rest*blend,yawOffset:hit.spin*.12*flight};
}
