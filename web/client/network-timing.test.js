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

test('a consistently long-distance connection learns its clock and recognizes a stalled packet',()=>{
 const c=clock();
 for(let i=0;i<4;i++){c.advance(1000);c.sample(300,150);}
 assert.notEqual(c.timing.offsetMs,null,'a steady 300ms connection must not permanently disable the clock fit');
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(500))-.5)<.00001);
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(150))-.15)<.00001);
 c.advance(1000);c.sample(900,750);
 assert.ok(Math.abs(c.timing.snapshotAgeSeconds(c.captureAge(500))-.5)<.00001,'a burst must not move the established low-RTT clock');
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

test('an explicitly hosted backend is used for both WebSocket and HTTP fallback, never the obsolete frontend API',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location},requests=[];
 globalThis.location=new URL('https://game.vercel.app/?transport=http');
 globalThis.fetch=async(url)=>{requests.push(String(url));return Response.json({id:'qa',token:'qa',messages:[]});};
 const network=new Network({storage:null,serverOrigin:'https://realtime.game.example/'});network.poll=()=>{};
 t.after(()=>{network.close();Object.assign(globalThis,previous);});
 await network.connect();await network.request('/api/poll');
 assert.deepEqual(requests,['https://realtime.game.example/api/session','https://realtime.game.example/api/poll']);
 assert.equal(network.endpoint('/ws'),'https://realtime.game.example/ws');
});


test('an unreachable fallback times out instead of leaving the menu connecting indefinitely',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location};
 globalThis.location=new URL('https://game.example/?transport=http');
 globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 const network=new Network({storage:null,serverOrigin:'https://unreachable.example',requestTimeoutMs:10});
 const keepAlive=setTimeout(()=>{},100);
 t.after(()=>{clearTimeout(keepAlive);network.close();Object.assign(globalThis,previous);});
 await assert.rejects(network.connect(),{name:'TimeoutError'});
 assert.equal(network.connected,false);assert.equal(network.connecting,null);
});

test('a sleeping cloud host is awakened before opening the room WebSocket',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location},requests=[],statuses=[];
 globalThis.location=new URL('https://game.vercel.app/');
 globalThis.fetch=async(url,options)=>{requests.push({url:String(url),cache:options.cache});
  return requests.length===1?new Response('Starting service…',{status:503}):requests.length===2?new Response('<html>Loading</html>'):Response.json({ok:true,protocol:1,transport:'websocket'});
 };
 const network=new Network({storage:null,serverOrigin:'https://game.onrender.com',wakeBeforeConnect:true,wakeRetryMs:0});
 let sockets=0;network.openSocket=async()=>{sockets++;assert.equal(requests.length,3);network.connected=true;};
 network.addEventListener('status',event=>statuses.push(event.detail.message));
 t.after(()=>{network.close();Object.assign(globalThis,previous);});
 await network.connect();assert.equal(sockets,1);assert.ok(statuses[0].includes('Waking'));assert.equal(statuses.at(-1),'Connecting to your crew...');
 assert.ok(requests.every(r=>r.url==='/health'&&r.cache==='no-store'),'wake-up stays on the frontend origin even when gameplay uses an external backend');
});

test('an incompatible cloud authority cannot start a room or silently use an old backend',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location};globalThis.location=new URL('https://game.vercel.app/');
 globalThis.fetch=async()=>Response.json({ok:true,protocol:1,transport:'http'});
 const network=new Network({storage:null,serverOrigin:'https://game.onrender.com',wakeBeforeConnect:true,wakeTimeoutMs:15,wakeRetryMs:1});
 network.openSocket=async()=>assert.fail('incompatible authority opened a socket');
 t.after(()=>{network.close();Object.assign(globalThis,previous);});
 await assert.rejects(network.connect(),/taking too long to wake/);assert.equal(network.connected,false);
});

test('closing while the server wakes cannot open a late connection',async t=>{
 const previous={fetch:globalThis.fetch,location:globalThis.location};globalThis.location=new URL('https://game.vercel.app/');
 let finish;globalThis.fetch=()=>new Promise(resolve=>finish=resolve);
 const network=new Network({storage:null,serverOrigin:'https://game.onrender.com',wakeBeforeConnect:true});
 network.openSocket=async()=>assert.fail('closed wake opened a socket');
 t.after(()=>{network.close();Object.assign(globalThis,previous);});
 const connecting=network.connect();network.close();finish(Response.json({ok:true,protocol:1,transport:'websocket'}));
 await assert.rejects(connecting,/Connection was closed/);
});

test('cloud wake health supports the configured frontend without enabling other WebSocket origins',async t=>{
 const game=createGameServer({port:0,host:'127.0.0.1',allowedOrigin:'https://game.vercel.app'}),address=await game.listen();t.after(()=>game.close());
 const health=await fetch(`http://127.0.0.1:${address.port}/health`,{headers:{Origin:'https://game.vercel.app'}});
 assert.equal(health.headers.get('access-control-allow-origin'),'https://game.vercel.app');assert.equal((await health.json()).transport,'websocket');
 const other=await fetch(`http://127.0.0.1:${address.port}/health`,{headers:{Origin:'https://other.example'}});
 assert.notEqual(other.headers.get('access-control-allow-origin'),'https://other.example');
});
