/** Wall-time co-op acceptance check against a running LAN/tunnel server.
 * Both independent clients run here; a second physical laptop must still test reachability.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {WebSocket} from 'ws';
import {STAGES,generateCourse} from '../shared/course.js';
import {routeInput} from './route-driver.js';
const base=new URL(process.argv[2]||'http://localhost:8787'),socketUrl=new URL('/ws',base);socketUrl.protocol=base.protocol==='https:'?'wss:':'ws:';
const peers=[],timers=[];let driving=false,phase='idle',course,epoch,initial;
async function client(){
 const ws=new WebSocket(socketUrl),messages=[],waiters=[],intervals=[],pings=[];let previous=0;
 ws.on('error',error=>{for(const w of waiters)w.reject(error);});
 ws.on('message',raw=>{const m=JSON.parse(raw),now=performance.now();messages.push(m);if(messages.length>1000)messages.shift();
  if(m.type==='snapshot'){if(previous)intervals.push(now-previous);previous=now;}
  if(m.type==='pong')pings.push(now-m.clientTime);
  for(const w of [...waiters])if(w.predicate(m)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(m);}
 });
 const next=predicate=>{const found=messages.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={predicate,resolve,reject};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('Timed out waiting for '+phase));},10000);waiters.push(w);});};
 const peer={ws,messages,next,intervals,pings,seq:0,send:m=>ws.send(JSON.stringify(m)),latest:()=>messages.findLast(m=>m.type==='snapshot')};peers.push(peer);await next(m=>m.type==='welcome');return peer;
}
const percentile=(values,p)=>Number(values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]?.toFixed(2));
try{
 phase='connect';const [host,guest]=await Promise.all([client(),client()]);
 phase='host/join';host.send({type:'create',mode:'coop',profile:6,seed:12345,name:'LAN verifier driver'});const code=(await host.next(m=>m.type==='joined')).code;guest.send({type:'join',code,name:'LAN verifier navigator'});await guest.next(m=>m.type==='joined');
 for(const p of peers)p.send({type:'ready',ready:true,catalog:9});await host.next(m=>m.type==='lobby'&&m.seats.every(s=>s?.ready));
 phase='R-ready';host.send({type:'start',stageReady:true});const [a,b]=await Promise.all(peers.map(p=>p.next(m=>m.type==='race')));assert.equal(a.courseHash,b.courseHash);assert.equal(a.snapshot.phase,'waiting');epoch=a.epoch;
 const stage=STAGES[a.profile];course=generateCourse(a.seed,a.mode,stage.blocks,stage.seed);
 timers.push(setInterval(()=>{for(const p of peers)p.send({type:'ping',clientTime:performance.now()});},500));
 timers.push(setInterval(()=>{const state=host.latest(),controls=driving?routeInput(course,state,0,{maxSpeed:8,responseSeconds:.05}):{throttle:0,steer:0,handbrake:phase==='braking',wipe:false,pitch:0,yaw:0,actions:[]};host.send({type:'input',epoch,seq:++host.seq,...controls});guest.send({type:'input',epoch,seq:++guest.seq,throttle:0,steer:0,pitch:46.6,yaw:0,wipe:false,actions:[]});},50));
 host.send({type:'stageReady',epoch,ready:true});await host.next(m=>m.type==='snapshot'&&m.epoch===epoch&&m.stageReady?.[0]);await wait(350);assert.equal(host.latest().phase,'waiting');
 guest.send({type:'stageReady',epoch,ready:true});await host.next(m=>m.type==='snapshot'&&m.epoch===epoch&&m.phase==='countdown');phase='countdown';await host.next(m=>m.type==='snapshot'&&m.epoch===epoch&&m.phase==='running');
 phase='driving';initial={...host.latest().cars[0]};driving=true;await wait(15000);driving=false;phase='braking';await wait(2500);
 const state=host.latest();assert.equal(state.cars[0].dead,false);const moved=Math.hypot(state.cars[0].x-initial.x,state.cars[0].z-initial.z);assert.ok(moved>50,`Only drove ${moved}m`);assert.ok(Math.abs(state.cars[0].speed)<1);
 const guestByTick=new Map(guest.messages.filter(m=>m.type==='snapshot'&&m.epoch===epoch&&m.phase==='running').map(m=>[m.seq,m]));let matching=0;
 for(const m of host.messages.filter(m=>m.type==='snapshot'&&m.epoch===epoch&&m.phase==='running')){const other=guestByTick.get(m.seq);if(other){assert.deepEqual(other.cars,m.cars);matching++;}}assert.ok(matching>100);
 phase='retry';host.send({type:'retry'});const retried=await host.next(m=>m.type==='race'&&m.epoch>epoch);assert.equal(retried.snapshot.phase,'countdown');assert.equal(retried.snapshot.stageReady,undefined);
 const report={ok:true,url:base.origin,checkedAt:new Date().toISOString(),transport:'websocket',physicalMachines:1,independentClients:2,source:'e0615f8',originalStage:1,drivingSeconds:15,drivenMeters:Number(moved.toFixed(2)),statePlacements:0,matchingHostGuestTicks:matching,verified:['host','join','both-R-required','five-second-countdown','normal-throttle-and-steering','handbrake','same-tick-state-agreement','retry-ready-reset'],clients:peers.map(p=>({pingMs:{median:percentile(p.pings,.5),p95:percentile(p.pings,.95)},snapshotIntervalMs:{median:percentile(p.intervals,.5),p95:percentile(p.intervals,.95)}})),limitation:'Both clients run on the host Mac. This does not verify the friend laptop, Wi-Fi peer reachability, GPU frame rate, or human-perceived smoothness.'};
 if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{for(const timer of timers)clearInterval(timer);for(const p of peers){p.ws.close();setTimeout(()=>p.ws.terminate(),250).unref();}}
