import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,stepWorld,CAR} from '../shared/physics.js';
import {generateCourse,STAGES} from '../shared/course.js';
import {generateSpectators,stepSpectators} from '../shared/spectators.js';
const map=()=>({seed:4,mode:'coop',width:5,points:Array.from({length:150},(_,z)=>({x:0,y:20,z:z*2})),trees:[],mud:[],spectators:[{id:0,group:1,side:1,x:0,y:20,z:22,yaw:0,phase:0,scale:1,variant:0}]});
test('real world tick emits crowd hits without changing handling, score or tree-only fatal collisions',()=>{
 const course=map(),control={...course,spectators:[]},a=makeWorld(course,'coop',1),b=makeWorld(control,'coop',1);a.phase=b.phase='running';for(const world of[a,b])Object.assign(world.cars[0],{x:0,z:20,lastX:0,lastZ:20,y:20+CAR.height,vx:0,vz:10,speed:10,yaw:0});
 for(let i=0;i<10;i++){stepWorld(a,[{throttle:.5}],.02,course);stepWorld(b,[{throttle:.5}],.02,control);}assert.equal(a.spectatorHits.length,1);assert.deepEqual(a.cars,b.cars);assert.deepEqual(a.stats,b.stats);assert.equal(a.phase,'running');assert.equal(makeWorld(course,'coop',2).spectatorHits.length,0);
});
test('race authority identifies the actual hitting crew and snapshots replay identical events',()=>{
 const course=map(),world=makeWorld(course,'race',7);world.phase='running';world.cars[0].x=100;Object.assign(world.cars[1],{x:0,z:20,lastX:0,lastZ:20,y:20+CAR.height,vx:0,vz:10,speed:10,yaw:0});stepWorld(world,[],.02,course);assert.equal(world.spectatorHits.length,1);assert.equal(world.spectatorHits[0].team,1);assert.deepEqual(JSON.parse(JSON.stringify(world)).spectatorHits,world.spectatorHits);
});
test('dead, finished, paused and airborne cars cannot trigger unseen crowd hits',()=>{
 for(const condition of[{dead:true},{finish:3},{y:25}]){const course=map(),world=makeWorld(course,'coop',1);world.phase='running';Object.assign(world.cars[0],{lastX:0,lastZ:18,x:0,z:24,y:20+CAR.height,vx:0,vz:20,...condition});stepSpectators(world,.02,course);assert.equal(world.spectatorHits.length,0);}
 const course=map(),world=makeWorld(course,'coop',1);world.phase='paused';Object.assign(world.cars[0],{lastX:0,lastZ:18,x:0,z:24,y:20+CAR.height,vz:20});stepSpectators(world,.02,course);assert.equal(world.spectatorHits.length,0);
});
test('spectators leave original map geometry intact and hit storage is bounded for all nine maps',()=>{
 for(const stage of STAGES){const course=generateCourse(12345,'coop',stage.blocks,stage.seed),before=JSON.stringify([course.points,course.trees,course.roadMesh,course.mud]);const spectators=generateSpectators(course);assert.equal(JSON.stringify([course.points,course.trees,course.roadMesh,course.mud]),before);assert.ok(spectators.length<=96);assert.ok(spectators.every(p=>Number.isFinite(p.group)&&[-1,1].includes(p.side)));}
});

import {WebSocket} from 'ws';
import {createGameServer} from './index.js';
import {courseFor} from './rooms.js';
import {nearestPoint} from '../shared/course.js';
async function socketClient(url){
 const ws=new WebSocket(url),messages=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);for(const w of[...waiters])if(w.predicate(m)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(m);}});
 const next=predicate=>{const old=messages.find(predicate);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const w={predicate,resolve};w.timer=setTimeout(()=>reject(Error('Spectator WebSocket acceptance timed out')),5000);waiters.push(w);});};await next(m=>m.type==='welcome');return{ws,next,send:m=>ws.send(JSON.stringify(m))};
}
test('two real WebSocket players receive the same crowd impact, then retry directly into countdown with an empty hit list',async t=>{
 const game=createGameServer({port:0,host:'127.0.0.1'}),address=await game.listen();t.after(()=>game.close());const url=`ws://127.0.0.1:${address.port}/ws`,[driver,nav]=await Promise.all([socketClient(url),socketClient(url)]);for(const peer of[driver,nav])t.after(()=>peer.ws.terminate());
 driver.send({type:'create',mode:'coop',profile:6,seed:12345});const{code}=await driver.next(m=>m.type==='joined');nav.send({type:'join',code});await nav.next(m=>m.type==='joined');for(const peer of[driver,nav])peer.send({type:'ready',ready:true,catalog:9});await driver.next(m=>m.type==='lobby'&&m.seats.every(s=>s?.ready));driver.send({type:'start'});const race=await nav.next(m=>m.type==='race'),room=game.service.rooms.get(code),course=courseFor(room),person=generateSpectators(course)[0];
 // Place only the isolated test server's car immediately before a real generated
 // crowd, then let normal authority ticks and WebSocket broadcasts do the hit.
 const near=nearestPoint(course,person.x,person.z),car=room.world.cars[0];room.world.phase='running';room.world.elapsed=1;room.lastAt=Date.now()/1000;Object.assign(car,{x:person.x,z:person.z-.2,lastX:person.x,lastZ:person.z-.2,y:person.y+CAR.height,yaw:0,vx:0,vz:10,speed:10,nearest:near.index,progress:near.index});
 driver.send({type:'input',epoch:race.epoch,seq:1,throttle:.2,steer:0});const[a,b]=await Promise.all([driver,nav].map(peer=>peer.next(m=>m.type==='snapshot'&&m.epoch===race.epoch&&m.spectatorHits?.length)));assert.deepEqual(a.spectatorHits,b.spectatorHits);assert.deepEqual(a.spectatorBodies,b.spectatorBodies);assert.equal(a.spectatorBodies[0].p.length,128);assert.ok(a.spectatorBodies[0].a);assert.equal(a.spectatorHits[0].id,person.id);assert.equal(a.cars[0].dead,false);driver.send({type:'retry'});const retried=await Promise.all([driver,nav].map(peer=>peer.next(m=>m.type==='race'&&m.epoch>race.epoch)));for(const r of retried){assert.equal(r.snapshot.phase,'countdown');assert.deepEqual(r.snapshot.spectatorHits,[]);assert.deepEqual(r.snapshot.spectatorBodies,[]);}
});
