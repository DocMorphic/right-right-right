/** Full deployed co-op route using normal HTTP inputs and wall time, without state access. */
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {generateCourse,STAGES} from '../shared/course.js';
import {routeInput} from './route-driver.js';
const base=process.argv[2],limit=Number(process.argv[3])||1200;
if(!base||!/^https?:\/\//.test(base))throw new Error('Usage: node server/verify-full-course.mjs https://HOST [timeoutSeconds=1200]');
const origin=new URL(base).origin,players=[],counts={requests:0,busyRetries:0},find=(reply,type)=>reply.messages?.find(message=>message.type===type);let epoch=0;
async function post(route,body){
  for(let attempt=0;attempt<12;attempt++){
    const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});counts.requests++;
    const reply=await response.json();if(response.status===409){counts.busyRetries++;await wait(100);continue;}
    if(!response.ok)throw new Error(`${route}: ${response.status}: ${JSON.stringify(reply.messages)}`);return reply;
  }
  throw new Error('Room remained busy after retries.');
}
const send=(slot,message)=>post('/api/message',{id:players[slot].id,token:players[slot].token,epoch,message});
const poll=slot=>post('/api/poll',{id:players[slot].id,token:players[slot].token,epoch});
try{
  for(let i=0;i<2;i++)players.push(await post('/api/session',{}));
  const code=find(await send(0,{type:'create',mode:'coop',seed:12345,name:'Full-route verification driver'}),'joined').code;
  await send(1,{type:'join',code,name:'Full-route verification navigator'});await Promise.all([0,1].map(slot=>send(slot,{type:'ready',ready:true})));
  const race=find(await send(0,{type:'start'}),'race');epoch=race.epoch;const stage=STAGES[race.profile],course=generateCourse(race.seed,race.mode,stage.blocks,stage.seed);
  let snapshot=race.snapshot,seq=0,lastNavigator=0,lastReport=0,responseSeconds=.65;const started=performance.now();
  console.log(JSON.stringify({event:'started',host:origin,mode:'coop',seed:race.seed,routeMeters:Math.round(course.length),statePlacements:0,maxSpeedMetersPerSecond:8.5}));
  while(snapshot.phase!=='ended'&&(performance.now()-started)/1000<limit){
    const at=performance.now(),heartbeat=at-lastNavigator>2000;if(heartbeat)lastNavigator=at;
    const replies=await Promise.all([send(0,{type:'input',epoch,seq:++seq,...routeInput(course,snapshot,0,{maxSpeed:8.5,responseSeconds})}),...(heartbeat?[poll(1)]:[])]);
    responseSeconds=responseSeconds*.85+Math.min(1.2,Math.max(.1,(performance.now()-at)/1000))*.15;
    snapshot=find(replies[0],'snapshot')||find(replies[0],'race')?.snapshot||snapshot;
    if(at-lastReport>10000){lastReport=at;console.log(JSON.stringify({event:'progress',elapsed:Number(snapshot.elapsed.toFixed(1)),progressPercent:Number((100*snapshot.cars[0].progress/course.points.length).toFixed(1)),speed:Number(snapshot.cars[0].speed.toFixed(2)),mud:snapshot.stats.mud,dead:snapshot.cars[0].dead,responseSeconds:Number(responseSeconds.toFixed(3)),...counts}));}
    await wait(Math.max(0,100-(performance.now()-at)));
  }
  assert.equal(snapshot.cars[0].dead,false,'The driving controller hit a tree; this is a failed route verification.');
  assert.ok(snapshot.cars[0].finish>0,'The route did not finish before the verification timeout.');
  const observer=find(await poll(1),'snapshot')||find(await poll(1),'race')?.snapshot;assert.equal(observer.cars[0].finish,snapshot.cars[0].finish);
  console.log(JSON.stringify({event:'passed',host:origin,finishSeconds:snapshot.cars[0].finish,wallSeconds:Number(((performance.now()-started)/1000).toFixed(1)),normalInputPackets:seq,statePlacements:0,mudDeposits:snapshot.stats.mud,...counts}));
}finally{await Promise.allSettled(players.map((_,slot)=>send(slot,{type:'leave'})));}
