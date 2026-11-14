import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from './worker.js';

/** Real SQLite storage with the small asynchronous D1 prepared statement interface. */
function d1(sqlite){return {prepare(sql){return {values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async run(){const result=sqlite.prepare(sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)}};}};},async batch(queries){return Promise.all(queries.map(q=>q.run()));}};}
async function setup(t){const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile(new URL('../drizzle/0000_browser_rooms.sql',import.meta.url),'utf8'));t.after(()=>sqlite.close());const env={DB:d1(sqlite),ASSETS:{fetch:()=>new Response('asset')}};const post=async(path,body)=>{const response=await worker.fetch(new Request(`https://game.example${path}`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://game.example'},body:JSON.stringify(body)}),env,{waitUntil:()=>{}});return {status:response.status,...await response.json()};};const session=async()=>{const s=await post('/api/session',{});assert.equal(s.status,200);return s;};const send=(s,message)=>post('/api/message',{id:s.id,token:s.token,epoch:message.epoch??s.epoch??0,message});return {sqlite,env,post,session,send};}
const message=(r,type)=>r.messages.find(m=>m.type===type);

test('Worker D1 multiplayer works across independent requests with concurrent CAS inputs and session resumption',async t=>{
  const {sqlite,post,session,send}=await setup(t);const players=await Promise.all(Array.from({length:4},()=>session()));const [a,b]=players;
  const created=await send(a,{type:'create',mode:'race',seed:12345,name:'Host'}),code=message(created,'joined').code;
  const joins=await Promise.all(players.slice(1).map((s,i)=>send(s,{type:'join',code,name:`Peer ${i}`})));assert.ok(joins.every(j=>j.status===200));
  const ready=await Promise.all(players.map(s=>send(s,{type:'ready',ready:true})));assert.ok(ready.every(r=>r.status===200));
  const started=await send(a,{type:'start'});assert.equal(started.status,200);const race=message(started,'race');assert.equal(race.snapshot.cars.length,2);
  const inputs=await Promise.all(players.map((s,i)=>send(s,{type:'input',epoch:race.epoch,seq:1,throttle:1,steer:i*.1,pitch:0,yaw:0,slot:0})));
  assert.ok(inputs.every(i=>i.status===200));const record=sqlite.prepare('SELECT data, revision FROM rooms WHERE code = ?').get(code),room=JSON.parse(record.data);
  assert.equal(room.inputs.filter(Boolean).length,4);assert.equal(room.inputs[1].throttle,0);assert.equal(room.inputs[3].steer,0);assert.ok(record.revision>=11);
  const resumed=await post('/api/session',{id:b.id,token:b.token});assert.equal(message(resumed,'joined').code,code);assert.equal(message(resumed,'race').seed,12345);
  const forged=await post('/api/message',{id:a.id,token:b.token,message:{type:'lobby'}});assert.equal(forged.status,401);
  const bootstrapped=await post('/api/poll',{id:b.id,token:b.token,epoch:0});assert.equal(message(bootstrapped,'race').epoch,1);
  const poll=await post('/api/poll',{id:a.id,token:a.token,epoch:1});assert.equal(message(poll,'lobby').playersRequired,4);assert.equal(message(poll,'snapshot').epoch,1);
  const retried=await send(a,{type:'retry'});assert.equal(message(retried,'race').epoch,2);
  await send(a,{type:'lobby'});const oldInput=await send(b,{type:'input',epoch:1,seq:2,throttle:1,steer:0,pitch:0,yaw:0});assert.equal(message(oldInput,'error').code,'epoch');
});
test('Worker practice is explicitly solo; rejects cross-origin, malformed input and unauthenticated updates',async t=>{
  const {env,post,session,send}=await setup(t);const a=await session(),b=await session();assert.deepEqual((await post('/api/poll',{id:a.id,token:a.token})).messages,[]);const created=await send(a,{type:'create',mode:'coop',practice:true,seed:1});
  assert.equal(message(created,'lobby').playersRequired,1);assert.equal(message(created,'lobby').practice,true);
  const joined=await send(b,{type:'join',code:message(created,'joined').code});assert.equal(message(joined,'error').code,'practice');
  await send(a,{type:'ready',ready:true});const started=await send(a,{type:'start'});assert.equal(message(started,'race').snapshot.tablets[0].holder,0);
  const malformed=await send(a,{type:'input',epoch:1,seq:1,throttle:2,steer:0,pitch:0,yaw:0});assert.equal(message(malformed,'error').code,'input');
  const response=await worker.fetch(new Request('https://game.example/api/session',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),env,{});assert.equal(response.status,403);
  const unauthenticated=await post('/api/poll',{id:a.id,token:'0'.repeat(64)});assert.equal(unauthenticated.status,401);
});
