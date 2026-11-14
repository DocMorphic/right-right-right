import test from 'node:test';
import assert from 'node:assert/strict';
import {createHttpFixture} from './http-fixture.js';
const find=(reply,type)=>reply.messages.find(message=>message.type===type);
async function setup(t,{mode='coop',practice=false}={}){
 let time=1000000;const fixture=await createHttpFixture({clock:()=>time});t.after(()=>fixture.close());
 const post=async(path,body,status=200)=>{const response=await fetch(fixture.url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.url},body:JSON.stringify(body)}),reply=await response.json();assert.equal(response.status,status,JSON.stringify(reply));return reply;};
 const players=[];for(let slot=0;slot<(practice?1:mode==='race'?4:2);slot++)players.push(await post('/api/session',{}));
 const send=(slot,message,status=200)=>post('/api/message',{id:players[slot].id,token:players[slot].token,epoch:1,message},status);
 const code=find(await send(0,{type:'create',mode,practice,profile:6,seed:12345}),'joined').code;
 for(let slot=1;slot<players.length;slot++)await send(slot,{type:'join',code});
 for(let slot=0;slot<players.length;slot++)await send(slot,{type:'ready',ready:true,catalog:9});
 const race=find(await send(0,{type:'start',stageReady:true}),'race');
 const poll=slot=>post('/api/poll',{id:players[slot].id,token:players[slot].token,epoch:1});
 return{fixture,players,send,poll,race,code,advance(seconds){time+=seconds;}};
}
for(const options of [{mode:'coop'},{mode:'race'},{mode:'coop',practice:true}])test(`stage R readiness waits for exactly ${options.practice?1:options.mode==='race'?4:2} authenticated seats over real HTTP`,async t=>{
 const s=await setup(t,options),count=s.players.length;assert.equal(s.race.profile,6);
 assert.equal(s.race.snapshot.phase,'waiting');assert.deepEqual(s.race.snapshot.stageReady,Array(count).fill(false));
 const held=s.race.snapshot.tablets[0].holder,initial=s.race.snapshot.cars.map(car=>({x:car.x,z:car.z}));
 for(let i=0;i<3;i++){s.advance(2);for(let slot=0;slot<count;slot++)await s.poll(slot);}
 let snapshot=find(await s.send(0,{type:'input',epoch:1,seq:1,throttle:1,steer:1,pitch:0,yaw:0,actions:[{id:1,kind:'grab'}]}),'snapshot');
 assert.equal(snapshot.phase,'waiting');assert.equal(snapshot.elapsed,0);assert.equal(snapshot.tablets[0].holder,held,'tablet actions do not run behind the controls overlay');
 snapshot.cars.forEach((car,team)=>assert.deepEqual({x:car.x,z:car.z},initial[team]));
 const wrong=await s.send(0,{type:'stageReady',epoch:99,ready:true},400);assert.equal(find(wrong,'error').code,'epoch');
 for(let slot=0;slot<count;slot++){
  snapshot=find(await s.send(slot,{type:'stageReady',epoch:1,ready:true,slot:count-1}),'snapshot');
  assert.deepEqual(snapshot.stageReady,Array.from({length:count},(_,i)=>i<=slot),'an untrusted slot field cannot acknowledge a rival seat');
  assert.equal(snapshot.phase,slot===count-1?'countdown':'waiting');
 }
 assert.equal(snapshot.countdown,3);s.advance(1);snapshot=find(await s.poll(0),'snapshot');assert.ok(Math.abs(snapshot.countdown-2)<.00001);
 for(let i=0;i<2;i++){s.advance(1);for(let slot=0;slot<count;slot++)snapshot=find(await s.poll(slot),'snapshot');}
 assert.equal(snapshot.phase,'running');
 // One explicit fixture arrangement isolates post-crash retry; the tree/route tests
 // independently cover collision and finish triggers without this shortcut.
 const record=s.fixture.sqlite.prepare('SELECT data FROM rooms WHERE code = ?').get(s.code),room=JSON.parse(record.data);room.world.phase='ended';room.world.cars[0].dead=true;
 s.fixture.sqlite.prepare('UPDATE rooms SET data = ? WHERE code = ?').run(JSON.stringify(room),s.code);
 const retry=find(await s.send(0,{type:'retry'}),'race');assert.equal(retry.epoch,2);assert.equal(retry.snapshot.phase,'countdown');assert.equal(retry.snapshot.countdown,3);assert.equal(retry.snapshot.cars[0].dead,false);assert.equal(retry.snapshot.stageReady,undefined);
 const stale=await s.send(0,{type:'stageReady',epoch:1,ready:true},400);assert.equal(find(stale,'error').code,'epoch');
 t.diagnostic(JSON.stringify({clients:count,practice:options.practice===true,phaseSequence:['waiting','countdown','running','ended','countdown'],postCrashFixtureArrangements:1}));
});
