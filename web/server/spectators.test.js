import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,STAGES} from '../shared/course.js';
import {generateSpectators,makeSpectatorState,stepSpectators,sampleSpectatorHit,SPECTATOR_PHYSICS} from '../shared/spectators.js';
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
test('all nine stages produce deterministic roadside groups clear of roads, trunks and gate areas',t=>{
 const counts=[];
 for(let profile=0;profile<STAGES.length;profile++){
  const stage=STAGES[profile],course=generateCourse(12345,'coop',stage.blocks,stage.seed),people=generateSpectators(course);
  assert.deepEqual(generateSpectators({...course}),people);assert.ok(people.length>=6&&people.length<=96,JSON.stringify({profile,count:people.length}));counts.push(people.length);
  const start=course.startPose?{x:course.startPose.position[0],z:course.startPose.position[2]}:course.points[course.startIndex??8],finish=course.finishPose?{x:course.finishPose.position[0],z:course.finishPose.position[2]}:course.points[course.finishIndex??course.points.length-9];
  for(const [id,p]of people.entries()){
   assert.equal(p.id,id);assert.ok(p.variant>=0&&p.variant<4);assert.ok(p.scale>=.9&&p.scale<=1.1);assert.ok(Math.hypot(p.x-start.x,p.z-start.z)>=24.99);assert.ok(Math.hypot(p.x-finish.x,p.z-finish.z)>=24.99);
   for(let i=0;i<course.points.length-1;i++)assert.ok(distance(p,course.points[i],course.points[i+1])>=Math.max(course.widths?.[i]??course.width,course.widths?.[i+1]??course.width)/2+.79,`profile ${profile}, spectator ${id} crowds the road`);
   for(const tree of course.trees)assert.ok(Math.hypot(p.x-tree.x,p.z-tree.z)>=(tree.radius??.4)+.59,`profile ${profile}, spectator ${id} overlaps a trunk`);
  }
 }
 t.diagnostic(JSON.stringify({nineStageCrowdCounts:counts,maxPeople:96}));
});
const person=(id,x,z)=>({id,x,y:20,z,yaw:0,variant:0,phase:0,scale:1});
const car=(x=0,z=0)=>({x,y:20.68,z,lastX:x,lastZ:z,yaw:0,vx:0,vz:0,speed:0,dead:false,finish:-1});
const course=people=>({seed:12345,points:[{x:0,y:20,z:0},{x:0,y:20,z:100}],width:5,trees:[],spectators:people});
test('parked/slow cars do not hit people; swept capsules catch crossings without changing the car',()=>{
 const c=car(),world={...makeSpectatorState(),cars:[c],elapsed:3,phase:'running'},map=course([person(0,0,0),person(1,50,0)]);
 Object.assign(c,{vx:8,vz:0,speed:8});stepSpectators(world,.02,map);assert.equal(world.spectatorHits.length,0,'velocity without actual movement cannot hit someone');
 Object.assign(c,{lastX:-8,x:8,yaw:Math.PI/2,vx:2,speed:2});stepSpectators(world,.02,map);assert.equal(world.spectatorHits.length,0);
 Object.assign(c,{vx:8,speed:8});const before=structuredClone(c);stepSpectators(world,.02,map);assert.deepEqual(c,before);assert.equal(world.spectatorHits.length,1);assert.equal(world.spectatorHits[0].id,0);assert.equal(world.spectatorHits[0].time,3);
 for(let i=0;i<20;i++){world.elapsed+=.02;stepSpectators(world,.02,map);}assert.equal(world.spectatorHits.length,1,'a person is hit only once during the run');
});
test('capsule ends and lateral sweeps count while distant collinear people remain untouched',()=>{
 const a=car(8,0);Object.assign(a,{lastX:-8,yaw:Math.PI/2,vx:8});const first={...makeSpectatorState(),cars:[a],elapsed:1,phase:'running'};
 stepSpectators(first,.02,course([person(0,9.8,0),person(1,50,0)]));assert.deepEqual(first.spectatorHits.map(hit=>hit.id),[0]);
 const b=car(5,0);Object.assign(b,{lastX:-5,vx:8});const second={...makeSpectatorState(),cars:[b],elapsed:1,phase:'running'};stepSpectators(second,.02,course([person(0,0,0)]));assert.equal(second.spectatorHits.length,1);
});
test('two cars synchronize one event per person and retry state starts empty',()=>{
 const a=car(0,5),b=car(10,5);for(const c of[a,b])Object.assign(c,{lastZ:-5,vz:8,speed:8});const world={...makeSpectatorState(),cars:[a,b],elapsed:2,phase:'running'};
 const map=course([person(0,0,0),person(1,10,0)]);stepSpectators(world,.02,map);assert.deepEqual(world.spectatorHits.map(hit=>[hit.id,hit.team]),[[0,0],[1,1]]);
 const before=JSON.stringify(world.cars);stepSpectators(world,.02,map);assert.equal(world.spectatorHits.length,2);assert.equal(JSON.stringify(world.cars),before);
 const shared={...makeSpectatorState(),cars:[a,structuredClone(a)],elapsed:2,phase:'running'};stepSpectators(shared,.02,course([person(0,0,0)]));assert.equal(shared.spectatorHits.length,1,'two cars cannot hit the same spectator twice in one tick');
 const retry={...makeSpectatorState(),cars:[a,b],elapsed:0,phase:'running'};assert.equal(retry.spectatorHits.length,0);stepSpectators(retry,.02,map);assert.equal(retry.spectatorHits.length,2);assert.notEqual(retry.spectatorHits,world.spectatorHits);
});
test('late joiners reconstruct ballistic impact and permanent side-rest from the same compact event',()=>{
 const hit={id:1,time:10,x:4,y:20,z:8,vx:6,vy:5,vz:2,spin:7,team:0},start=sampleSpectatorHit(hit,10),air=sampleSpectatorHit(hit,10.3),end=sampleSpectatorHit(hit,13),later=sampleSpectatorHit(hit,100);
 assert.deepEqual([start.x,start.y,start.z],[4,20,8]);assert.ok(air.y>20&&!air.settled);assert.equal(end.settled,true);assert.equal(end.y,20);assert.ok(end.flightTime<=SPECTATOR_PHYSICS.maxFlightSeconds);
 for(const key of['x','y','z','roll','yawOffset'])assert.equal(end[key],later[key]);assert.ok(Math.abs(Math.abs(Math.sin(end.roll))-1)<.00001);
});
