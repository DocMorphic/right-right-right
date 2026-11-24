import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {setTimeout as wait} from 'node:timers/promises';
import {createGameServer} from './index.js';
import {applyRoadDelta,materializeRoad} from '../shared/live-road.js';
import {courseFor} from './rooms.js';
import {routeInput} from './route-driver.js';

test('two sockets share voice roads, navigator ownership, real driving, compact deltas and retry',{timeout:55000},async()=>{
  const game=createGameServer({host:'127.0.0.1',port:0,diagnostic:()=>{}}),address=await game.listen(),peers=[];
  const until=async(fn,ms=7000)=>{const end=Date.now()+ms;while(Date.now()<end){const result=fn();if(result)return result;await wait(10);}throw Error('Voice road network timeout');};
  async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${address.port}/ws`),peer={ws,messages:[],seq:0,plan:null,send(message){ws.send(JSON.stringify(message));},get latest(){return this.messages.findLast(m=>m.type==='snapshot');}};peers.push(peer);ws.on('message',data=>{const message=JSON.parse(data);peer.messages.push(message);if(message.type==='race')peer.plan=message.roadPlan;if(message.type==='roadUpdate')peer.plan=message.roadPlan||applyRoadDelta(peer.plan,message.delta);});await until(()=>peer.messages.some(m=>m.type==='welcome'));peer.id=peer.messages.find(m=>m.type==='welcome').id;return peer;}
  try{
    const [navigator,driver]=await Promise.all([connect(),connect()]);navigator.send({type:'create',mode:'roadcall',profile:0,seed:23456});const code=(await until(()=>navigator.messages.find(m=>m.type==='joined'))).code;driver.send({type:'join',code});await until(()=>driver.messages.some(m=>m.type==='joined'));
    navigator.send({type:'seat',slot:1,swap:true});await until(()=>navigator.messages.findLast(m=>m.type==='lobby')?.seats[1]?.id===navigator.id);
    const room=game.service.rooms.get(code);assert.equal(room.hostId,navigator.id);assert.equal(room.seats[0].id,driver.id);
    for(const peer of peers)peer.send({type:'ready',ready:true,catalog:9});await until(()=>room.seats.every(s=>s.ready));navigator.send({type:'start',stageReady:true});const race=await until(()=>navigator.messages.find(m=>m.type==='race'));await until(()=>driver.plan);
    for(const peer of peers)peer.send({type:'stageReady',epoch:race.epoch,ready:true});await until(()=>driver.latest?.phase==='running');
    driver.send({type:'roadCommand',epoch:race.epoch,id:1,call:'left'});await until(()=>driver.messages.some(m=>m.type==='error'&&m.code==='role'));
    navigator.send({type:'roadCommand',epoch:race.epoch,id:1,call:'right'});await until(()=>navigator.messages.some(m=>m.type==='roadAck'&&m.id===1));await until(()=>driver.plan?.lastCall?.id===1);
    assert.deepEqual(navigator.plan,driver.plan);assert.deepEqual(materializeRoad(navigator.plan).trees,materializeRoad(driver.plan).trees);
    const revision=room.roadPlan.revision;navigator.send({type:'roadCommand',epoch:race.epoch,id:1,call:'left'});await wait(80);assert.equal(room.roadPlan.revision,revision,'retrying a command never appends a second turn');
    const start={...room.world.cars[0]},deadline=Date.now()+34000;let samples=0;
    while(Date.now()<deadline&&(room.world.roadDistance??0)<165){const snapshot=driver.latest;if(snapshot?.phase==='running'){const controls=routeInput(courseFor(room),snapshot,0,{maxSpeed:8.5,responseSeconds:.08});driver.send({type:'input',epoch:race.epoch,seq:++driver.seq,...controls});samples++;}assert.equal(room.world.cars[0].dead,false,'real inputs should follow the generated bend without a tree crash');await wait(40);}
    driver.send({type:'input',epoch:race.epoch,seq:++driver.seq,throttle:0,steer:0});
    assert.ok(room.world.cars[0].z>145,'driver actually reached the spoken turn');assert.ok(room.world.cars[0].x>5,'right call curved the driven road to the right');assert.ok(room.world.cars[0].z-start.z>110);assert.ok(samples>100);
    await until(()=>peers.every(p=>p.plan.revision===room.roadPlan.revision));assert.deepEqual(navigator.plan,driver.plan);
    const frames=new Map(navigator.messages.filter(m=>m.type==='snapshot').map(m=>[m.seq,m]));let matching=0;for(const m of driver.messages.filter(m=>m.type==='snapshot'))if(frames.has(m.seq)){assert.deepEqual(frames.get(m.seq).cars,m.cars);assert.equal(frames.get(m.seq).roadRevision,m.roadRevision);matching++;if(m.phase==='running')assert.equal(Object.hasOwn(m,'roadPlan'),false);}
    assert.ok(matching>200);const deltas=driver.messages.filter(m=>m.type==='roadUpdate'&&m.delta);assert.ok(deltas.length);const largestDelta=Math.max(...deltas.map(m=>Buffer.byteLength(JSON.stringify(m))));assert.ok(largestDelta<1500);
    const drivenPosition={x:room.world.cars[0].x,z:room.world.cars[0].z};driver.plan=null;driver.send({type:'roadSync',epoch:race.epoch});await until(()=>driver.plan?.revision===room.roadPlan.revision);assert.deepEqual(navigator.plan,driver.plan);
    navigator.send({type:'retry'});const retry=await until(()=>navigator.messages.findLast(m=>m.type==='race')?.epoch>race.epoch&&navigator.messages.findLast(m=>m.type==='race'));await until(()=>driver.messages.findLast(m=>m.type==='race')?.epoch===retry.epoch);assert.equal(retry.roadPlan.lastCall,null);assert.deepEqual(navigator.plan,driver.plan);assert.equal(retry.snapshot.phase,'countdown');
    console.log(JSON.stringify({voiceRoads:true,clients:2,physicalMachines:1,matchingSnapshots:matching,driverInputSamples:samples,largestRoadDeltaBytes:largestDelta,position:drivenPosition,passed:['host navigator','driver authorization','spoken curve','identical forest','bounded deltas','full resync','retry']}));
  }finally{for(const peer of peers)peer.ws.terminate();await game.close();}
});
