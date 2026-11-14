import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from './index.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function client(url){
  const ws=new WebSocket(url),messages=[],waiters=[];ws.on('message',data=>{const message=JSON.parse(data);messages.push(message);for(const waiter of [...waiters])if(waiter.predicate(message)){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(message);}});
  const next=(predicate)=>{const existing=messages.find(predicate);if(existing)return Promise.resolve(existing);return new Promise((resolve,reject)=>{const waiter={predicate,resolve};waiter.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(new Error('Timed out waiting for server message'));},3000);waiters.push(waiter);});};
  await next(m=>m.type==='welcome');return {ws,messages,next,send:message=>ws.send(JSON.stringify(message)),clear:()=>{messages.length=0;}};
}

test('four real WebSocket clients share race, reject unready start and ownership spoof, retry and change mode',async t=>{
  const game=createGameServer({port:0,host:'127.0.0.1'}),address=await game.listen();t.after(()=>game.close());
  const url=`ws://127.0.0.1:${address.port}/ws`,clients=await Promise.all(Array.from({length:4},()=>client(url)));
  for(const c of clients)t.after(()=>c.ws.terminate());const [a,b,c,d]=clients;
  a.send({type:'create',mode:'race',seed:12345,name:'Driver A'});const joined=await a.next(m=>m.type==='joined'),code=joined.code;
  for(const [i,peer] of clients.entries())if(i){peer.send({type:'join',code,name:`Peer ${i}`});await peer.next(m=>m.type==='joined');}
  await a.next(m=>m.type==='lobby'&&m.seats.filter(Boolean).length===4);
  a.send({type:'start'});assert.equal((await a.next(m=>m.type==='error')).code,'not_ready');
  for(const peer of clients)peer.send({type:'ready',ready:true});await a.next(m=>m.type==='lobby'&&m.seats.every(s=>s.ready));
  a.clear();a.send({type:'start'});const races=await Promise.all(clients.map(peer=>peer.next(m=>m.type==='race')));assert.equal(new Set(races.map(r=>r.courseHash)).size,1);assert.ok(races.every(r=>r.snapshot.cars.length===2));
  const room=game.service.rooms.get(code);room.world.phase='running';room.lastAt=Date.now()/1000;
  const before=room.world.cars[0].z;
  b.send({type:'input',epoch:room.epoch,seq:1,slot:0,team:0,throttle:1,steer:1,pitch:0,yaw:0});await wait(80);
  assert.equal(room.inputs[1].throttle,0);assert.equal(room.world.cars[0].z,before);
  a.send({type:'input',epoch:room.epoch,seq:1,throttle:1,steer:0,pitch:0,yaw:0});await wait(160);assert.ok(room.world.cars[0].z>before);
  b.clear();b.send({type:'retry'});assert.equal((await b.next(m=>m.type==='error')).code,'host');
  a.clear();a.send({type:'retry'});const retried=await a.next(m=>m.type==='race');assert.equal(retried.epoch,2);assert.equal(retried.seed,12345);assert.equal(retried.snapshot.elapsed,0);
  a.clear();a.send({type:'lobby'});await a.next(m=>m.type==='lobby'&&m.status==='lobby');
  a.send({type:'configure',mode:'coop'});assert.equal((await a.next(m=>m.type==='error')).code,'too_many');
  c.ws.close();d.ws.close();await a.next(m=>m.type==='lobby'&&m.seats.filter(Boolean).length===2);
  a.clear();a.send({type:'configure',mode:'coop',seed:789});const coop=await a.next(m=>m.type==='lobby'&&m.mode==='coop');assert.equal(coop.playersRequired,2);assert.equal(coop.seed,789);
});

test('two real clients start co-op only at exact ready count, host disconnect migrates lobby',async t=>{
  const game=createGameServer({port:0,host:'127.0.0.1'}),address=await game.listen();t.after(()=>game.close());
  const [a,b]=await Promise.all([client(`ws://127.0.0.1:${address.port}/ws`),client(`ws://127.0.0.1:${address.port}/ws`)]);t.after(()=>a.ws.terminate());t.after(()=>b.ws.terminate());
  a.send({type:'create',mode:'coop',seed:17});const joined=await a.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await b.next(m=>m.type==='joined');
  for(const peer of [a,b])peer.send({type:'ready',ready:true});await a.next(m=>m.type==='lobby'&&m.seats.every(s=>s?.ready));
  a.send({type:'start'});const race=await b.next(m=>m.type==='race');assert.equal(race.snapshot.cars.length,1);
  a.ws.close();const paused=await b.next(m=>m.type==='snapshot'&&m.phase==='paused');assert.equal(paused.phase,'paused');
  const lobby=await b.next(m=>m.type==='lobby'&&m.seats.filter(Boolean).length===1);assert.equal(lobby.hostId,b.messages.find(m=>m.type==='welcome').id);
  b.clear();b.send({type:'lobby'});await b.next(m=>m.type==='lobby'&&m.status==='lobby');
});
