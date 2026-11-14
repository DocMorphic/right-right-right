/** Verify a deployed HTTP multiplayer host without browser automation or credentials. */
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
const origin=process.argv[2];
if(!origin||!/^https?:\/\//.test(origin))throw new Error('Usage: node server/verify-host.mjs https://deployed-game.example');
const base=new URL(origin).origin,players=[];const counts={requests:0,retries:0};
async function post(route,body){
  for(let attempt=0;attempt<6;attempt++){
    const response=await fetch(new URL(route,base),{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});counts.requests++;
    const data=await response.json();if(response.status===409){counts.retries++;await wait(100);continue;}
    if(!response.ok)throw new Error(`${route}: ${response.status}: ${JSON.stringify(data.messages)}`);
    return data;
  }
  throw new Error('The deployed server remained busy after retries.');
}
const find=(reply,type)=>reply.messages.find(m=>m.type===type);
const send=(player,message)=>post('/api/message',{id:player.id,token:player.token,epoch:player.epoch||0,message});
const poll=player=>post('/api/poll',{id:player.id,token:player.token,epoch:player.epoch||0});
try{
  const health=await fetch(new URL('/health',base));assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  for(let i=0;i<4;i++)players.push(await post('/api/session',{}));
  const created=await send(players[0],{type:'create',mode:'race',name:'Verification A',seed:12345});const code=find(created,'joined').code;
  await Promise.all(players.slice(1).map((player,i)=>send(player,{type:'join',code,name:`Verification ${i+1}`})));
  await Promise.all(players.map(player=>send(player,{type:'ready',ready:true})));
  const started=await send(players[0],{type:'start'}),race=find(started,'race');assert.equal(race.snapshot.cars.length,2);
  const received=await Promise.all(players.map(player=>poll(player)));assert.ok(received.every(reply=>find(reply,'race')?.courseHash===race.courseHash));
  for(const player of players)player.epoch=race.epoch;
  const acknowledgments=await Promise.all(players.map((player,i)=>send(player,{type:'input',epoch:race.epoch,seq:1,throttle:1,steer:0,pitch:0,yaw:0,slot:0,actions:i===1?[{id:1,kind:'grab'}]:[]})));
  const state=find(await poll(players[0]),'snapshot');assert.equal(state.inputs.filter(Boolean).length,4);assert.equal(state.inputs[1].throttle,0);assert.equal(state.inputs[3].throttle,0);assert.equal(state.inputs[1].actionId,1);
  assert.ok(acknowledgments.every(reply=>find(reply,'snapshot')));
  const retried=await send(players[0],{type:'retry'});assert.equal(find(retried,'race').epoch,2);assert.equal(find(await poll(players[1]),'race').epoch,2);
  await send(players[0],{type:'lobby'});
  for(const player of players.slice(2))await send(player,{type:'leave'});
  const changed=await send(players[0],{type:'configure',mode:'coop',seed:54321});assert.equal(find(changed,'lobby').playersRequired,2);
  await Promise.all(players.slice(0,2).map(player=>send(player,{type:'ready',ready:true})));
  const coop=await send(players[0],{type:'start'});assert.equal(find(coop,'race').snapshot.cars.length,1);assert.equal(find(coop,'race').seed,54321);
  console.log(JSON.stringify({ok:true,host:base,verified:['health','four-client-race','concurrent-input-CAS','driver-ownership','action-ack','guest-bootstrap','retry-epoch','lobby-mode-change','two-client-coop'],...counts}));
}finally{
  await Promise.allSettled(players.map(player=>send(player,{type:'leave'})));
}
