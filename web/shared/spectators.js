/** Deterministic roadside crowds and compact, permanent per-race hit events. */
export const SPECTATOR_PHYSICS=Object.freeze({gravity:9.81,radius:.32,minHitSpeed:2,maxPeople:96,maxFlightSeconds:1.6,carRadius:.85,carHalfLength:.95});
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
  const a=points[i],b=points[i+1],radius=Math.max(course.widths?.[i]??course.width,course.widths?.[i+1]??course.width)/2+.8;
  for(let z=Math.floor((Math.min(a.z,b.z)-radius)/CELL);z<=Math.floor((Math.max(a.z,b.z)+radius)/CELL);z++)for(let x=Math.floor((Math.min(a.x,b.x)-radius)/CELL);x<=Math.floor((Math.max(a.x,b.x)+radius)/CELL);x++)add(road,`${x},${z}`,{a,b,radius});
 }
 for(const tree of course.trees||[])add(trees,key(tree.x,tree.z),tree);
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
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const tree of trees.get(`${gx+dx},${gz+dz}`)||[])if(Math.hypot(x-tree.x,z-tree.z)<(tree.radius??.4)+.6)return false;
 return people.every(person=>Math.hypot(x-person.x,z-person.z)>.95);
}
export function generateSpectators(course){
 if(placements.has(course))return placements.get(course);
 const people=[],points=course.points;if(points.length<2){placements.set(course,people);return people;}
 const rand=random((course.seed||1)^Math.imul(course.profile||0,7919)^0x53504543),distances=geometry(course).distances,startIndex=course.startIndex??Math.min(8,points.length-1),finishIndex=course.finishIndex??Math.max(startIndex,points.length-9);
 const endpoint=(pose,index)=>pose?{x:pose.position[0],z:pose.position[2]}:points[index],spawn=endpoint(course.startPose,startIndex),finish=endpoint(course.finishPose,finishIndex),end=distances[finishIndex]-35;
 for(let distance=distances[startIndex]+50;distance<end&&people.length<SPECTATOR_PHYSICS.maxPeople;distance+=135+rand()*45){
  const count=Math.min(2+Math.floor(rand()*3),SPECTATOR_PHYSICS.maxPeople-people.length);if(count<2)break;
  const side=rand()<.5?-1:1,group=[];
  for(let person=0;person<count;person++){
   let accepted=null;
   for(let attempt=0;attempt<12&&!accepted;attempt++){
    const p=poseAt(course,distance+(person-(count-1)/2)*1.5+Math.floor(attempt/4)*2),chosenSide=attempt%2?side:-side,offset=p.width/2+1.2+Math.floor(attempt/2)*.55;
    const x=p.x+p.fz*offset*chosenSide,z=p.z-p.fx*offset*chosenSide;
    if(clear(course,x,z,[...people,...group],spawn,finish))accepted={x:round(x),y:round(p.y),z:round(z),yaw:round(Math.atan2(p.x-x,p.z-z)),variant:Math.floor(rand()*4),phase:round(rand()*Math.PI*2),scale:round(.9+rand()*.2)};
   }
   if(accepted)group.push(accepted);
  }
  if(group.length>=2)for(const person of group)people.push({id:people.length,...person});
 }
 placements.set(course,people);return people;
}
export const makeSpectatorState=()=>({spectatorHits:[]});
function sweptDistance(person,car){
 const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),length=SPECTATOR_PHYSICS.carHalfLength,a={x:car.lastX,z:car.lastZ},b={x:car.x,z:car.z};
 const corners=[{x:a.x-fx*length,z:a.z-fz*length},{x:a.x+fx*length,z:a.z+fz*length},{x:b.x+fx*length,z:b.z+fz*length},{x:b.x-fx*length,z:b.z-fz*length}];
 let positive=false,negative=false,area=0,distance=Infinity;
 for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4],cross=(q.x-p.x)*(person.z-p.z)-(q.z-p.z)*(person.x-p.x);positive||=cross>1e-9;negative||=cross< -1e-9;area+=p.x*q.z-q.x*p.z;distance=Math.min(distance,segmentDistance(person.x,person.z,p,q));}
 return Math.abs(area)>1e-9&&!(positive&&negative)?0:distance;
}
export function stepSpectators(world,dt,course){
 world.spectatorHits??=[];if(!(dt>0)||world.phase&&world.phase!=='running')return world.spectatorHits;
 const hit=new Set(world.spectatorHits.map(event=>event.id));
 for(const person of course.spectators||generateSpectators(course)){
  if(hit.has(person.id)||world.spectatorHits.length>=SPECTATOR_PHYSICS.maxPeople)continue;
  for(let team=0;team<world.cars.length;team++){
   const car=world.cars[team],speed=Math.hypot(car.vx||0,car.vz||0);
   if(speed<=SPECTATOR_PHYSICS.minHitSpeed||![car.lastX,car.lastZ,car.x,car.z].every(Number.isFinite)||Math.hypot(car.x-car.lastX,car.z-car.lastZ)<1e-6)continue;
   if(sweptDistance(person,car)>SPECTATOR_PHYSICS.carRadius+SPECTATOR_PHYSICS.radius*(person.scale??1))continue;
   const rand=random(Math.imul(person.id+1,1597334677)^(course.seed||1)),gain=Math.min(.35,9/speed),side=(person.x-car.x)*Math.cos(car.yaw)-(person.z-car.z)*Math.sin(car.yaw);
   world.spectatorHits.push({id:person.id,time:round(world.elapsed),x:person.x,y:person.y,z:person.z,vx:round(car.vx*gain),vy:round(4+Math.min(speed,25)*.06+rand()*.6),vz:round(car.vz*gain),spin:round((side<0?-1:1)*(4.5+rand()*4)),team});hit.add(person.id);break;
  }
 }
 return world.spectatorHits;
}
export function sampleSpectatorHit(hit,worldElapsed){
 const t=Math.max(0,worldElapsed-hit.time),flightTime=Math.min(SPECTATOR_PHYSICS.maxFlightSeconds,Math.max(.1,2*hit.vy/SPECTATOR_PHYSICS.gravity)),flight=Math.min(t,flightTime),progress=flight/flightTime,smooth=clamp((progress-.75)/.25,0,1),blend=smooth*smooth*(3-2*smooth),side=Math.sign(hit.spin)||1,rest=side*Math.PI/2+Math.round((hit.spin*flightTime-side*Math.PI/2)/(Math.PI*2))*Math.PI*2;
 return{x:hit.x+hit.vx*flight,y:hit.y+Math.max(0,hit.vy*flight-.5*SPECTATOR_PHYSICS.gravity*flight*flight),z:hit.z+hit.vz*flight,t,flightTime,settled:t>=flightTime,roll:hit.spin*flight*(1-blend)+rest*blend,yawOffset:hit.spin*.12*flight};
}
