import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket}from'ws';
import {createGameServer}from'./index.js';import{openDoor}from'../shared/physics.js';import{setTimeout as wait}from'node:timers/promises';
test('two WebSocket players receive identical drop, open-door ejection, pickup and close-held state',{timeout:25000},async()=>{
 const game=createGameServer({host:'127.0.0.1',port:0}),address=await game.listen(),peers=[];let force;
 async function peer(){const ws=new WebSocket(`ws://127.0.0.1:${address.port}/ws`),messages=[];ws.on('message',d=>messages.push(JSON.parse(d)));const p={ws,messages,send:m=>ws.send(JSON.stringify(m))};peers.push(p);await until(()=>messages.find(m=>m.type==='welcome'));return p;}
 async function until(fn){const start=Date.now();while(Date.now()-start<9000){const value=fn();if(value)return value;await wait(10);}throw Error('Tablet network fixture timed out');}
 try{const[a,b]=await Promise.all([peer(),peer()]);a.send({type:'create',mode:'coop',profile:7,seed:12345});const joined=await until(()=>a.messages.find(m=>m.type==='joined'));b.send({type:'join',code:joined.code});await until(()=>b.messages.find(m=>m.type==='joined'));for(const p of peers)p.send({type:'ready',ready:true,catalog:9});await until(()=>a.messages.find(m=>m.type==='lobby'&&m.seats.every(s=>s?.ready)));a.send({type:'start',stageReady:true});const race=await until(()=>a.messages.find(m=>m.type==='race'));for(const p of peers)p.send({type:'stageReady',epoch:race.epoch,ready:true});await until(()=>a.messages.find(m=>m.type==='snapshot'&&m.phase==='running'));
 const room=game.service.rooms.get(joined.code);
 // Controlled contact fixture: opening is induced on the authoritative test
 // world. Player pickup/drop/close actions still cross real WebSockets.
 openDoor(room.world,0);room.world.cars[0].doorAngle=90;
 let seq=0,id=0;const action=(p,kind)=>p.send({type:'input',epoch:race.epoch,seq:++seq,throttle:0,steer:0,pitch:60,yaw:0,actions:[{id:++id,kind}]});
 action(b,'grab');await until(()=>a.messages.find(m=>m.type==='snapshot'&&m.tablets[0].holder<0));await wait(1000);assert.equal(room.world.tablets[0].inCabin,true);
 // Reproducible lateral acceleration isolates the opening from roadside trees.
 // This is an adversarial server fixture, not a manual driving parity claim.
 const c=room.world.cars[0],startX=c.x;let t=0;force=setInterval(()=>{t+=.02;c.x=startX+12*t*t;c.vx=24*t;c.vz=0;c.speed=0;c.yaw=0;c.lastX=c.x;c.lastZ=c.z;},20);
  await until(()=>peers.every(p=>p.messages.some(m=>m.type==='snapshot'&&m.tablets[0].inCabin===false)));clearInterval(force);force=null;
 const keys=new Map(b.messages.filter(m=>m.type==='snapshot').map(m=>[m.seq,m]));let matched=0,ejected=0;for(const m of a.messages.filter(m=>m.type==='snapshot'))if(keys.has(m.seq)){assert.deepEqual(m.tablets,keys.get(m.seq).tablets);matched++;if(!m.tablets[0].inCabin)ejected++;}assert.ok(matched>10);assert.ok(ejected>0);
 // Put the test car within ordinary pickup reach of the lost tablet. No held
 // state is assigned: the navigator has to retrieve it through the protocol.
 const p=room.world.tablets[0];Object.assign(c,{x:p.x+.33,z:p.z-.28,y:p.y+.65,vx:0,vz:0,speed:0,dead:false,yaw:0});action(b,'grab');await until(()=>room.world.tablets[0].holder===1);action(b,'door');await until(()=>!room.world.cars[0].door);assert.equal(room.world.tablets[0].holder,1);
 console.log(JSON.stringify({test:'network tablet ejection',independentClients:2,physicalMachines:1,matchingTabletSnapshots:matched,ejectedSnapshots:ejected,controlledFixture:true,navigatorRecovered:true,closedDoorWhileHeld:true}));
 }finally{if(force)clearInterval(force);for(const p of peers)p.ws.terminate();await game.close();}
});
