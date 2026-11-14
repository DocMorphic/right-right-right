import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkTiming} from './network-timing.js';
import {Network} from './network.js';
import {CarPresentation} from './car-presentation.js';
import {makeCar,stepCar} from '../shared/physics.js';
import {createGameServer} from '../server/index.js';
import {setTimeout as delay} from 'node:timers/promises';
function clock(){
 let at=1000;const offset=1800000000000,timing=new NetworkTiming({now:()=>at});
 return{timing,offset,get now(){return at;},advance(ms){at+=ms;},sample(rtt=40,outward=rtt/2){const ping=timing.ping(),serverTime=(at+outward+offset)/1000;at+=rtt;assert.equal(timing.acceptPong({...ping,type:'pong',serverTime}),true);},captureAge(ms){return(at+offset-ms)/1000;}};
}
test('snapshot timing measures a 200ms delayed burst instead of assuming half of the normal RTT',()=>{
 const c=clock();c.sample();assert.equal(c.timing.roundTripMs,40);
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(220))-.22)<.00001);
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(20))-.02)<.00001);
 assert.ok(c.timing.snapshotAgeSeconds(c.captureAge(220))>c.timing.roundTripMs/2000+.19);
 c.advance(1000);c.sample(600,580);assert.ok(c.timing.roundTripMs>40,'RTT records the spike');
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(220))-.22)<.00001,'a slow asymmetric pong cannot move the low-RTT clock fit');
});
test('timing rejects unsolicited/duplicate echoes, bounds sample memory, and falls back without a trustworthy clock',()=>{
 const c=clock();assert.equal(c.timing.acceptPong({clientTime:0,serverTime:1}),false);
 const ping=c.timing.ping();c.advance(40);const pong={...ping,serverTime:c.captureAge(20)};assert.equal(c.timing.acceptPong(pong),true);assert.equal(c.timing.acceptPong(pong),false);
 for(let i=0;i<40;i++){c.advance(1000);c.sample();}assert.ok(c.timing.samples.length<=20);
 for(let i=0;i<40;i++){c.advance(1);c.timing.ping();}assert.equal(c.timing.pending.size,8);
 assert.equal(c.timing.snapshotAgeSeconds(c.captureAge(-100)),0);assert.equal(c.timing.snapshotAgeSeconds(c.captureAge(9000)),2);
 c.timing.reset();c.sample(600,580);assert.equal(c.timing.offsetMs,null);assert.equal(c.timing.snapshotAgeSeconds(c.captureAge(200)),.3);
 c.timing.reset();assert.equal(c.timing.pending.size,0);assert.equal(c.timing.snapshotAgeSeconds(0),0);
});
test('a clock fit expires after silence and HTTP always keeps its half-RTT fallback',()=>{
 const c=clock();c.sample();c.advance(60001);assert.equal(c.timing.snapshotAgeSeconds(c.captureAge(200)),.02);
 const network=new Network({storage:null,timing:c.timing});network.transport='http';network.roundTripMs=240;
 assert.equal(network.snapshotAgeSeconds({time:c.captureAge(2000)}),.12);network.close();
});
test('late snapshots forecast only the remaining input TTL and never renew expired remote throttle',()=>{
 const c=clock();c.sample();const course={points:Array.from({length:200},(_,i)=>({x:0,y:20,z:i*2})),width:5,trees:[]},car=makeCar(course);Object.assign(car,{speed:10,vz:10});
 const presentation=new CarPresentation(course,{remote:true}),input={throttle:1,steer:0,ttl:.5},age=c.timing.snapshotAgeSeconds(c.captureAge(300));
 presentation.accept(car,{phase:'running',latencySeconds:age,inputAgeSeconds:.35,input});assert.equal(presentation.hold,0);
 const expected=structuredClone(car);for(let i=0;i<15;i++)stepCar(expected,input,.01,course);
 assert.ok(Math.abs(presentation.target.z-expected.z)<.02,'a 300ms packet cannot apply more than the 150ms unexpired control');
 const speed=presentation.predicted.speed;for(let i=0;i<30;i++)presentation.advance(1/60,{throttle:1},'running');assert.ok(presentation.predicted.speed<speed,'navigator keys cannot revive expired driver throttle');
 const expired=new CarPresentation(course,{remote:true});expired.accept(car,{latencySeconds:age,inputAgeSeconds:.6,input});assert.equal(expired.hold,0);assert.equal(expired.target.z,car.z);
});
test('WebSocket pings update RTT and every close/failure/reconnect clears the old timer',async t=>{
 const previous={WebSocket:globalThis.WebSocket,location:globalThis.location,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval},intervals=new Map(),sockets=[];let nextTimer=0;
 class Socket extends EventTarget{
  static OPEN=1;
  constructor(){super();this.readyState=0;this.packets=[];sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  send(raw){this.packets.push(JSON.parse(raw));}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 globalThis.WebSocket=Socket;globalThis.location=new URL('http://game.example/');globalThis.setInterval=(fn,ms)=>{assert.equal(ms,1000);const id=++nextTimer;intervals.set(id,fn);return id;};globalThis.clearInterval=id=>intervals.delete(id);
 const c=clock(),network=new Network({storage:null,timing:c.timing});t.after(()=>{network.close();Object.assign(globalThis,previous);});
 await network.connect();assert.equal(intervals.size,1);assert.equal(sockets[0].packets[0].type,'ping');
 const ping=sockets[0].packets[0];c.advance(40);network.deliver([{type:'pong',clientTime:ping.clientTime,serverTime:c.captureAge(20)}]);
 assert.equal(network.roundTripMs,40);assert.ok(Math.abs(network.snapshotAgeSeconds({time:c.captureAge(220)})-.22)<.00001);
 c.advance(1000);[...intervals.values()][0]();assert.equal(sockets[0].packets.length,2);
 network.failed(new Error('test disconnect'));assert.equal(intervals.size,0);assert.equal(c.timing.pending.size,0);
 await network.connect();assert.equal(intervals.size,1);sockets[0].close();assert.equal(intervals.size,1,'an old socket close must not stop a newer connection');assert.equal(network.connected,true);
 sockets[1].close();assert.equal(intervals.size,0);await network.connect();assert.equal(intervals.size,1);
 sockets[2].dispatchEvent(new Event('error'));assert.equal(intervals.size,0,'socket errors stop the ping timer before close arrives');
 network.close();assert.equal(intervals.size,0);assert.equal(c.timing.pending.size,0);
});
test('Network learns a usable clock fit from the actual Node WebSocket pong protocol',async t=>{
 const game=createGameServer({port:0,host:'127.0.0.1'}),address=await game.listen(),previousLocation=globalThis.location,network=new Network({storage:null});
 globalThis.location=new URL(`http://127.0.0.1:${address.port}/`);
 t.after(async()=>{network.close();await game.close();globalThis.location=previousLocation;});
 await network.connect();const deadline=performance.now()+2000;
 while(network.timing.offsetMs===null&&performance.now()<deadline)await delay(5);
 assert.ok(Number.isFinite(network.roundTripMs));assert.notEqual(network.timing.offsetMs,null);
 const age=network.snapshotAgeSeconds({time:Date.now()/1000-.2});assert.ok(Math.abs(age-.2)<.03,JSON.stringify({estimatedAge:age,rtt:network.roundTripMs}));
 network.close();assert.equal(network.pingTimer,undefined);
});
