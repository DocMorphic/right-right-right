import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpFixture} from './http-fixture.js';
import {generateCourse,STAGES,direction,nearestPoint} from '../shared/course.js';
import {carAnchor} from '../shared/physics.js';
import {routeInput} from './route-driver.js';
import {setTimeout as wait} from 'node:timers/promises';
const find=(reply,type)=>reply.messages?.find(message=>message.type===type);

async function scenario(t,mode='coop'){
  let time=1000000,requests=0,placements=0,epoch=0,code;
  const fixture=await createHttpFixture({clock:()=>time});t.after(()=>fixture.close());
  const post=async(route,body,allowError=false)=>{
    const response=await fetch(fixture.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.url},body:JSON.stringify(body)});requests++;
    const reply=await response.json();if(!allowError)assert.equal(response.status,200,JSON.stringify(reply));return {status:response.status,...reply};
  };
  const players=[];for(let i=0;i<(mode==='race'?4:2);i++)players.push({...await post('/api/session',{}),seq:0,actionId:0});
  const send=async(slot,message,allowError=false)=>{const p=players[slot],reply=await post('/api/message',{id:p.id,token:p.token,epoch,message},allowError);const race=find(reply,'race');if(race)epoch=race.epoch;return reply;};
  const poll=async slot=>{const p=players[slot];return post('/api/poll',{id:p.id,token:p.token,epoch});};
  code=find(await send(0,{type:'create',mode,seed:12345}),'joined').code;
  for(let i=1;i<players.length;i++)await send(i,{type:'join',code});
  const ready=()=>Promise.all(players.map((_,slot)=>send(slot,{type:'ready',ready:true})));
  await ready();const initialRace=find(await send(0,{type:'start'}),'race');
  const input=async(slot,controls={})=>send(slot,{type:'input',epoch,seq:++players[slot].seq,throttle:0,steer:0,pitch:0,yaw:0,handbrake:false,wipe:false,actions:[],...controls});
  const action=(slot,kind,controls={})=>input(slot,{...controls,actions:[{id:++players[slot].actionId,kind}]});
  const tick=async(dt=.1,controls={})=>{for(const [slot,value] of Object.entries(controls))await input(Number(slot),value);time+=dt;return find(await poll(0),'snapshot');};
  const room=()=>JSON.parse(fixture.sqlite.prepare('SELECT data FROM rooms WHERE code = ?').get(code).data);
  const place=mutate=>{const record=fixture.sqlite.prepare('SELECT revision,data FROM rooms WHERE code = ?').get(code),state=JSON.parse(record.data);mutate(state);state.revision=record.revision+1;fixture.sqlite.prepare('UPDATE rooms SET revision = revision + 1, data = ? WHERE code = ?').run(JSON.stringify(state),code);placements++;};
  return {fixture,players,post,send,poll,ready,input,action,tick,room,place,initialRace,get code(){return code;},get epoch(){return epoch;},get requests(){return requests;},get placements(){return placements;},advance(dt){time+=dt;}};
}

test('real HTTP co-op drives an entire native course through normal input without any state placement',async t=>{
  const s=await scenario(t),race=s.initialRace,stage=STAGES[race.profile],course=generateCourse(race.seed,race.mode,stage.blocks,stage.seed);
  let snapshot=race.snapshot,steps=0,left=0,right=0,wipes=0,distance=0,last=snapshot.cars[0];
  for(;steps<12000&&snapshot.phase!=='ended';steps++){
    const controls=routeInput(course,snapshot);if(controls.steer>.05)right++;if(controls.steer<-.05)left++;if(controls.wipe)wipes++;
    s.advance(.1);snapshot=find(await s.input(0,controls),'snapshot');
    if(steps%10===0)await s.poll(1);
    const car=snapshot.cars[0];distance+=Math.hypot(car.x-last.x,car.z-last.z);last=car;
  }
  assert.equal(s.placements,0);assert.equal(snapshot.phase,'ended');assert.equal(snapshot.winner,0);assert.equal(snapshot.cars[0].dead,false);
  assert.ok(snapshot.cars[0].finish>300);assert.ok(snapshot.cars[0].progress>=course.points.length-10);assert.ok(distance>course.length*.95);
  assert.ok(left>50&&right>50);assert.equal(snapshot.stats.mud,course.mud.length);assert.ok(wipes>100);assert.ok(snapshot.cars[0].mud<.1);
  const observer=find(await s.poll(1),'snapshot');assert.equal(observer.cars[0].finish,snapshot.cars[0].finish);assert.equal(observer.winner,0);
  const priorSeed=race.seed,priorEpoch=race.epoch,retry=find(await s.send(0,{type:'retry'}),'race');assert.equal(retry.epoch,priorEpoch+1);assert.equal(retry.seed,priorSeed);assert.equal(retry.snapshot.elapsed,0);assert.equal(retry.snapshot.cars[0].dead,false);
  await s.send(0,{type:'lobby'});const lobby=find(await s.poll(1),'lobby');assert.equal(lobby.status,'lobby');assert.equal(lobby.seats.filter(Boolean).length,2);
  t.diagnostic(JSON.stringify({routeMeters:Math.round(course.length),drivenMeters:Math.round(distance),finishSeconds:Number(snapshot.cars[0].finish.toFixed(2)),physicsSteps:Math.round(snapshot.cars[0].finish*50),httpRequests:s.requests,normalInputSteps:steps,statePlacements:s.placements,mudDeposits:course.mud.length,leftSteeringPackets:left,rightSteeringPackets:right,wipePackets:wipes}));
});

test('real HTTP four-client race covers doors, tablets, collisions, fatal trees, results, retry, modes and disconnect',async t=>{
  const s=await scenario(t,'race'),stage=STAGES[0],course=generateCourse(12345,'race',stage.blocks,stage.seed);
  // The complete no-placement route above verifies natural course traversal. These
  // bounded arrangements bring multiplayer interactions/hazards into immediate reach.
  const park=(car,x,z)=>{const near=nearestPoint(course,x,z);Object.assign(car,{x,z,y:near.y+.68,yaw:0,vx:0,vz:0,speed:0,steer:0,lastX:x,lastZ:z,nearest:near.index,progress:near.index,dead:false,finish:-1});};
  s.place(room=>{room.world.phase='running';room.world.countdown=0;room.world.elapsed=20;park(room.world.cars[0],-.6,80);park(room.world.cars[1],.6,80);room.world.cars[0].vx=5;room.world.cars[1].vx=-5;});
  let state=await s.tick(.02);assert.equal(state.stats.impacts,1);assert.ok(state.cars.every(car=>!car.dead&&car.jolt>0));
  s.place(room=>{park(room.world.cars[0],0,80);park(room.world.cars[1],-2,80);for(const car of room.world.cars)car.mud=1;});
  for(let i=0;i<10;i++)state=await s.tick(.1,{0:{wipe:true},1:{throttle:1,steer:1},3:{wipe:true}});
  assert.ok(state.cars.every(car=>car.mud<.6));assert.equal(state.inputs[1].throttle,0);assert.equal(state.inputs[1].steer,0);assert.equal(state.cars[0].z,80);
  s.place(room=>{park(room.world.cars[0],0,80);Object.assign(room.world.cars[0],{speed:8,vz:8});});
  // Above 16km/h native Space preserves momentum for a slide, rather than
  // halving speed like the former artificial drag brake.
  for(let i=0;i<5;i++)state=await s.tick(.1,{0:{handbrake:true}});assert.ok(state.cars[0].speed>5&&state.cars[0].speed<8);
  const beforeReverse=state.cars[0].z;for(let i=0;i<15;i++)state=await s.tick(.1,{0:{throttle:-1}});assert.ok(state.cars[0].speed<0);assert.ok(state.cars[0].z<beforeReverse);
  // An actual sustained hard-turn input opens a scheduled door; G closes it.
  s.place(room=>{park(room.world.cars[0],0,80);park(room.world.cars[1],-2,80);Object.assign(room.world.cars[0],{speed:7,vz:7,nextDoor:0,turnHold:0});});
  for(let i=0;i<8;i++)state=await s.tick(.1,{0:{throttle:.8,steer:.9}});
  assert.equal(state.cars[0].door,true);assert.ok(state.cars[0].doorAngle>30);assert.ok(state.stats.doors>=1);
  state=find(await s.action(0,'door'),'snapshot');assert.equal(state.cars[0].door,false);assert.equal(state.cars[0].doorAngle,0);
  // Crew B drops its tablet inside a closed cabin. Crew A's driver cannot steal it.
  s.place(room=>{for(const [i,car] of room.world.cars.entries()){park(car,i?-1.9:0,80);car.door=false;car.doorAngle=0;}for(const p of room.world.tablets){p.holder=p.id*2+1;p.carrier=p.id;p.inCabin=true;Object.assign(p,carAnchor(room.world.cars[p.carrier],p.holder));}});
  state=find(await s.action(3,'grab'),'snapshot');assert.equal(state.tablets[1].holder,-1);
  state=find(await s.action(0,'grab',{yaw:90}),'snapshot');assert.equal(state.tablets[1].holder,-1);assert.equal(state.tablets[1].inCabin,true);assert.equal(state.stats.steals,0);
  // Trigger the rival's door from driving, then park crews together for a reachable grab.
  s.place(room=>Object.assign(room.world.cars[1],{speed:7,vz:7,nextDoor:0,turnHold:0}));
  for(let i=0;i<8;i++)state=await s.tick(.1,{2:{throttle:.8,steer:.9}});
  assert.equal(state.cars[1].door,true);assert.ok(state.cars[1].doorAngle>30);
  s.place(room=>{park(room.world.cars[0],0,80);park(room.world.cars[1],-1.9,80);const p=room.world.tablets[1];Object.assign(p,{holder:-1,carrier:1,inCabin:true},carAnchor(room.world.cars[1],3));});
  for(let i=0;i<5;i++)state=await s.tick(.1,{2:{throttle:0,steer:0}});assert.equal(state.tablets[1].inCabin,true,'loose tablet no longer drops out almost immediately');
  for(let i=0;i<15;i++)state=await s.tick(.1,{2:{throttle:0,steer:0}});assert.equal(state.tablets[1].inCabin,false);
  s.place(room=>{const p=room.world.tablets[1];Object.assign(p,{holder:3,carrier:1,inCabin:true},carAnchor(room.world.cars[1],3));});
  state=find(await s.action(0,'grab',{yaw:90}),'snapshot');assert.equal(state.tablets[1].holder,3);assert.equal(state.stats.steals,0,'held tablets remain protected even through an open door');
  state=find(await s.action(3,'grab'),'snapshot');assert.equal(state.tablets[1].holder,-1);
  state=find(await s.action(0,'grab',{yaw:90}),'snapshot');assert.equal(state.tablets[1].holder,0);assert.equal(state.tablets[1].carrier,0);assert.equal(state.stats.steals,1);
  state=find(await s.action(0,'grab'),'snapshot');assert.equal(state.tablets[1].holder,-1);
  // Own navigator can retrieve a dropped tablet at close range.
  state=find(await s.action(1,'grab',{yaw:0,pitch:45}),'snapshot');assert.equal(state.tablets[0].holder,-1);
  state=find(await s.action(1,'grab',{yaw:0,pitch:45}),'snapshot');assert.equal(state.tablets[0].holder,1);
  // Tree placement uses an existing generated trunk, not an artificial collision wall.
  const tree=course.trees.find(tree=>tree.z>100&&tree.z<110&&tree.x>0),finishIndex=course.points.length-9,p=course.points[finishIndex-2],f=direction(course.points,finishIndex);
  s.place(room=>{park(room.world.cars[1],tree.x,tree.z-2);Object.assign(room.world.cars[1],{vz:8,speed:8});park(room.world.cars[0],p.x,p.z);Object.assign(room.world.cars[0],{yaw:Math.atan2(f.x,f.z),vx:f.x*8,vz:f.z*8,speed:8,progress:finishIndex-2,nearest:finishIndex-2});});
  for(let i=0;i<15&&state.phase!=='ended';i++)state=await s.tick(.1,{0:{throttle:1},2:{throttle:1}});
  assert.equal(state.cars[1].dead,true);assert.ok(state.cars[0].finish>0);assert.equal(state.winner,0);assert.equal(state.phase,'ended');assert.ok(state.stats.treeDeaths>=1);
  const results=await Promise.all(s.players.map((_,slot)=>s.poll(slot)));assert.ok(results.every(reply=>find(reply,'snapshot').winner===0));
  const oldSeed=s.room().seed;let retry=find(await s.send(0,{type:'retry'}),'race');assert.equal(retry.seed,oldSeed);assert.ok(retry.snapshot.cars.every(car=>!car.dead&&car.finish<0));
  retry=find(await s.send(0,{type:'retry',newSeed:true}),'race');assert.notEqual(retry.seed,oldSeed);
  await s.send(0,{type:'lobby'});const rejected=await s.send(0,{type:'configure',mode:'coop'},true);assert.equal(find(rejected,'error').code,'too_many');
  await s.send(2,{type:'leave'});await s.send(3,{type:'leave'});let lobby=find(await s.send(0,{type:'configure',mode:'coop'}),'lobby');assert.equal(lobby.playersRequired,2);assert.equal(lobby.seats.length,2);
  for(const slot of [0,1])await s.send(slot,{type:'ready',ready:true});let coop=find(await s.send(0,{type:'start'}),'race');assert.equal(coop.snapshot.cars.length,1);
  // A silent peer pauses the session; polling it again resumes the same run.
  s.advance(11);state=find(await s.poll(0),'snapshot');assert.equal(state.phase,'paused');state=find(await s.poll(1),'snapshot');assert.equal(state.phase,'countdown');
  await s.send(0,{type:'leave'});let remaining=await s.poll(1);assert.equal(find(remaining,'lobby').hostId,s.players[1].id);assert.equal(find(remaining,'snapshot').phase,'paused');
  await s.send(1,{type:'lobby'});await s.send(1,{type:'leave'});assert.equal(s.fixture.sqlite.prepare('SELECT COUNT(*) count FROM rooms WHERE code = ?').get(s.code).count,0);
  t.diagnostic(JSON.stringify({clients:4,httpRequests:s.requests,statePlacements:s.placements,verified:['nonfatal-car-contact','navigator-drive-spoof-rejected','handbrake-and-reverse','driver-and-navigator-wiping','turn-open-and-G-close','E-drop-and-grab','closed-rival-door-theft-guard','loose-tablet-door-ejection','held-tablet-protection','open-rival-door-steal','tree-DNF','race-result-agreement','same-seed-and-new-seed-retry','four-to-two-player-mode','silent-peer-pause-resume','host-disconnect-migration','empty-room-cleanup']}));
});

test('real HTTP controls remain usable at650ms latency and a full course still finishes without placement',async t=>{
  const s=await scenario(t),race=s.initialRace,stage=STAGES[race.profile],course=generateCourse(race.seed,race.mode,stage.blocks,stage.seed);
  let snapshot=race.snapshot,steps=0;
  for(;steps<3000&&snapshot.phase!=='ended';steps++){
    s.advance(.65);snapshot=find(await s.input(0,routeInput(course,snapshot,0,{maxSpeed:8.5,responseSeconds:.65})),'snapshot');
    await s.poll(1);
  }
  assert.equal(s.placements,0);assert.equal(snapshot.cars[0].dead,false);assert.ok(snapshot.cars[0].finish>0);assert.equal(snapshot.winner,0);
  t.diagnostic(JSON.stringify({requestCadenceMs:650,finishSeconds:snapshot.cars[0].finish,normalInputPackets:steps,statePlacements:0,httpRequests:s.requests}));
});

test('650ms HTTP input gaps match continuous controls, then the bounded hold expires safely',async t=>{
  const coarse=await scenario(t),fine=await scenario(t),catchup=await scenario(t),fineExpiry=await scenario(t);
  for(const s of [coarse,fine,catchup,fineExpiry]){s.place(room=>{room.world.phase='running';room.world.countdown=0;});await s.input(0,{throttle:1});}
  const a=await coarse.tick(.65);let b;
  for(let i=0;i<6;i++)b=await fine.tick(.1,{0:{throttle:1}});b=await fine.tick(.05,{0:{throttle:1}});
  assert.equal(a.inputs[0].ttl,1.5);assert.ok(a.inputs[0].arrived<=a.time);assert.ok(Math.abs(a.cars[0].speed-b.cars[0].speed)<.0001);assert.ok(Math.abs(a.cars[0].z-b.cars[0].z)<.0001);
  const largeSlice=await catchup.tick(1.8);let smallSlices;for(let i=0;i<18;i++)smallSlices=await fineExpiry.tick(.1);
  assert.ok(Math.abs(largeSlice.cars[0].speed-smallSlices.cars[0].speed)<.0001);assert.ok(Math.abs(largeSlice.cars[0].z-smallSlices.cars[0].z)<.0001,'expiry is evaluated at each physics step, not once against the final request time');
  // Keep the comparison driver pressing W while the coarse client's controls stop arriving.
  let expired=a,continuous=b;for(let i=0;i<20;i++){expired=await coarse.tick(.1);continuous=await fine.tick(.1,{0:{throttle:1}});}
  assert.ok(expired.time-expired.inputs[0].arrived>1.5);assert.ok(expired.cars[0].speed<continuous.cars[0].speed-2);
  const before=expired.cars[0].speed;expired=await coarse.tick(.5);assert.ok(expired.cars[0].speed<before);
  t.diagnostic(JSON.stringify({gapMs:650,holdSeconds:a.inputs[0].ttl,coarseSpeed:a.cars[0].speed,continuousSpeed:b.cars[0].speed,expiredSpeed:expired.cars[0].speed}));
});

test('wall-time HTTP driving remains active with actual650ms response latency and no clock override',{timeout:20000},async t=>{
  const fixture=await createHttpFixture({afterResponse:async({body})=>{if(body?.message?.type==='input')await wait(650);}});t.after(()=>fixture.close());
  const post=async(route,body)=>{const response=await fetch(fixture.url+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.url},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
  const players=[];for(let i=0;i<2;i++)players.push(await post('/api/session',{}));
  const send=(slot,message)=>post('/api/message',{id:players[slot].id,token:players[slot].token,epoch:1,message});
  const poll=slot=>post('/api/poll',{id:players[slot].id,token:players[slot].token,epoch:1});
  const code=find(await send(0,{type:'create',mode:'coop',seed:12345}),'joined').code;await send(1,{type:'join',code});
  await Promise.all([0,1].map(slot=>send(slot,{type:'ready',ready:true})));let state=find(await send(0,{type:'start'}),'race').snapshot;
  const start=state.cars[0].z;for(let i=0;i<24&&state.phase==='countdown';i++){await wait(250);state=find(await poll(0),'snapshot');await poll(1);}
  assert.equal(state.phase,'running');let maxReplyAge=0;
  for(let seq=1;seq<=8;seq++){state=find(await send(0,{type:'input',epoch:1,seq,throttle:1,steer:0,pitch:0,yaw:0}),'snapshot');maxReplyAge=Math.max(maxReplyAge,Date.now()/1000-state.time);await poll(1);}
  assert.ok(maxReplyAge>.6);assert.ok(state.cars[0].speed>7);assert.ok(state.cars[0].z>start+15);assert.equal(state.cars[0].dead,false);
  t.diagnostic(JSON.stringify({actualResponseDelayMs:650,maxReplyAgeSeconds:Number(maxReplyAge.toFixed(3)),speed:state.cars[0].speed,distance:state.cars[0].z-start,clockOverride:false,statePlacements:0}));
});
