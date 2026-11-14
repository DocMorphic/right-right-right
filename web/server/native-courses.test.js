import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpFixture} from './http-fixture.js';
import {STAGES,generateCourse} from '../shared/course.js';
import {courseHash} from './rooms.js';
import {CAR} from '../shared/physics.js';
import {routeInput} from './route-driver.js';
const find=(reply,type)=>reply.messages?.find(message=>message.type===type);
async function setup(t,mode='coop'){
 let time=1000000,requests=0,code;const fixture=await createHttpFixture({clock:()=>time});t.after(()=>fixture.close());
 const players=[];
 const post=async(route,body,expected=200)=>{const response=await fetch(fixture.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.url},body:JSON.stringify(body)});requests++;const reply=await response.json();assert.equal(response.status,expected,JSON.stringify(reply));return reply;};
 for(let slot=0;slot<(mode==='race'?4:2);slot++)players.push({...await post('/api/session',{}),epoch:0,seq:0});
 const deliver=(slot,reply)=>{const race=find(reply,'race');if(race)players[slot].epoch=race.epoch;return reply;};
 const send=async(slot,message,expected=200)=>deliver(slot,await post('/api/message',{id:players[slot].id,token:players[slot].token,epoch:players[slot].epoch,message},expected));
 const poll=async slot=>deliver(slot,await post('/api/poll',{id:players[slot].id,token:players[slot].token,epoch:players[slot].epoch}));
 code=find(await send(0,{type:'create',mode,seed:12345}),'joined').code;
 for(let slot=1;slot<players.length;slot++)await send(slot,{type:'join',code});
 const ready=(catalog=9)=>Promise.all(players.map((_,slot)=>send(slot,{type:'ready',ready:true,catalog})));
 const configure=profile=>send(0,{type:'configure',profile,seed:12345});
 const start=async()=>find(await send(0,{type:'start'}),'race');
 const input=(slot,controls={})=>send(slot,{type:'input',epoch:players[slot].epoch,seq:++players[slot].seq,throttle:0,steer:0,pitch:0,yaw:0,actions:[],...controls});
 return {players,send,poll,ready,configure,start,input,advance(dt){time+=dt;},get requests(){return requests;}};
}

test('all nine room profiles start through real HTTP with matching guest course hashes and catalog gating',async t=>{
 assert.equal(STAGES.length,9);const s=await setup(t);
 for(let profile=0;profile<STAGES.length;profile++){
  await s.configure(profile);await s.ready();const race=await s.start(),stage=STAGES[profile],course=generateCourse(race.seed,race.mode,stage.blocks,stage.seed);
  assert.equal(race.profile,profile);assert.equal(race.courseHash,courseHash(course));const guest=find(await s.poll(1),'race');assert.equal(guest.epoch,race.epoch);assert.equal(guest.courseHash,race.courseHash);
  if(profile>=6){assert.equal(Number(course.nativeScene),profile-5);assert.ok(course.roadMesh.positions.length>0);assert.ok(course.finishIndex<course.points.length-1);assert.equal(race.snapshot.cars[0].x,course.startPose.position[0]);assert.equal(race.snapshot.cars[0].z,course.startPose.position[2]);}
  await s.send(0,{type:'lobby'});
 }
 await s.configure(6);await s.send(0,{type:'ready',ready:true,catalog:9});await s.send(1,{type:'ready',ready:true,catalog:6});
 const rejected=await s.send(0,{type:'start'},400);assert.equal(find(rejected,'error').code,'content');
 await s.send(1,{type:'ready',ready:true,catalog:9});assert.equal((await s.start()).profile,6);
 t.diagnostic(JSON.stringify({profiles:9,nativeProfiles:[6,7,8],catalogHandshake:true,httpRequests:s.requests}));
});

test('original narrow roads keep both four-player cars clear of each other and original trees at spawn',async t=>{
 const s=await setup(t,'race');
 for(const profile of [6,7,8]){
  await s.configure(profile);await s.ready();const race=await s.start(),stage=STAGES[profile],course=generateCourse(12345,'race',stage.blocks,stage.seed),initial=race.snapshot.cars;
  assert.ok(course.width<6.4);assert.equal(initial[0].yaw,initial[1].yaw);
  const dx=initial[1].x-initial[0].x,dz=initial[1].z-initial[0].z,yaw=initial[0].yaw;
  const sideGap=Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw)),endGap=Math.max(0,Math.abs(dx*Math.sin(yaw)+dz*Math.cos(yaw))-2*CAR.halfLength);
  assert.ok(Math.hypot(sideGap,endGap)>CAR.radius*2+.1,'parallel car capsules must have a clear starting gap');
  for(let slot=1;slot<4;slot++)await s.poll(slot);
  let snapshot=race.snapshot;
  for(let step=0;step<30;step++){for(let slot=0;slot<4;slot++)await s.input(slot);s.advance(.2);snapshot=find(await s.poll(0),'snapshot');}
  assert.equal(snapshot.phase,'running');assert.equal(snapshot.stats.impacts,0);assert.equal(snapshot.stats.treeDeaths,0);
  snapshot.cars.forEach((car,index)=>{const displacement=Math.hypot(car.x-initial[index].x,car.z-initial[index].z);assert.equal(car.dead,false);assert.ok(displacement<.00001,JSON.stringify({profile,team:index,stationarySpawnDisplacement:displacement}));});
  for(let step=0;step<60;step++){
   for(const slot of [0,2])await s.input(slot,routeInput(course,snapshot,slot/2,{maxSpeed:8}));
   if(step%10===0)for(const slot of [1,3])await s.poll(slot);
   s.advance(.1);snapshot=find(await s.poll(0),'snapshot');
  }
  assert.equal(snapshot.stats.treeDeaths,0,'both cars must be able to leave the starting grid');
  snapshot.cars.forEach((car,index)=>{assert.equal(car.dead,false);assert.ok(Math.hypot(car.x-initial[index].x,car.z-initial[index].z)>10);});
  await s.send(0,{type:'lobby'});
 }
 t.diagnostic(JSON.stringify({nativeRaceGrids:3,clients:4,httpRequests:s.requests,spawnContacts:0}));
});

test('all three original courses finish through normal HTTP driving with no state placement',async t=>{
 const s=await setup(t),results=[];
 for(const profile of [6,7,8]){
  await s.configure(profile);await s.ready();const race=await s.start(),stage=STAGES[profile],course=generateCourse(12345,'coop',stage.blocks,stage.seed);await s.poll(1);
  let snapshot=race.snapshot,steps=0;
  for(;steps<15000&&snapshot.phase!=='ended';steps++){
   s.advance(.1);snapshot=find(await s.input(0,routeInput(course,snapshot,0,{maxSpeed:8})),'snapshot');if(steps%10===0)await s.poll(1);
  }
  assert.equal(snapshot.cars[0].dead,false,JSON.stringify({profile,progress:snapshot.cars[0].progress,steps}));assert.ok(snapshot.cars[0].finish>0,JSON.stringify({profile,phase:snapshot.phase,progress:snapshot.cars[0].progress,steps}));assert.equal(snapshot.winner,0);
  assert.ok(snapshot.cars[0].progress>=course.finishIndex-3);assert.ok(snapshot.cars[0].progress<=course.finishIndex+4,'the native finish metadata, not last-9, decides the finish');
  const guest=find(await s.poll(1),'snapshot');assert.equal(guest.cars[0].finish,snapshot.cars[0].finish);
  results.push({profile,nativeScene:course.nativeScene,meters:Math.round(course.length),finishIndex:course.finishIndex,pointCount:course.points.length,finishSeconds:Number(snapshot.cars[0].finish.toFixed(2)),normalInputPackets:steps,statePlacements:0});
  await s.send(0,{type:'lobby'});
 }
 t.diagnostic(JSON.stringify({originalRoutes:results,httpRequests:s.requests,clock:'fixture clock; real HTTP Worker and SQLite D1'}));
});
