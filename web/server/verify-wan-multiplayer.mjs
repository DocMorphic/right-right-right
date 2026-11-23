import './spectator-terrain.js';
/** Real public WSS acceptance with ordered artificial WAN delay. This is not
 * a claim that the clients physically ran in India. No state-placement commands. */
import assert from 'node:assert/strict';
import{writeFile}from'node:fs/promises';
import{setTimeout as wait}from'node:timers/promises';
import{WebSocket}from'ws';
import{pathToFileURL}from'node:url';
import path from'node:path';
const {NetworkTiming}=await import(process.env.RRR_TIMING_MODULE?pathToFileURL(path.resolve(process.env.RRR_TIMING_MODULE)).href:new URL('../client/network-timing.js',import.meta.url).href);
import{CarPresentation}from'../client/car-presentation.js';
import{STAGES,generateCourse}from'../shared/course.js';
import{routeInput}from'./route-driver.js';
const base=new URL(process.argv[2]),url=new URL('/ws',base);url.protocol=base.protocol==='https:'?'wss:':'ws:';
const scenario=process.argv[4]||'india_navigator',seconds=Number(process.env.RRR_WAN_SECONDS||40);
const slow={delay:Number(process.env.RRR_WAN_DELAY_MS||180),jitter:Number(process.env.RRR_WAN_JITTER_MS||25),stall:350},fast={delay:0,jitter:0,stall:0};
const profiles=scenario==='india_driver'?[slow,fast]:scenario==='race'?[fast,slow,slow,fast]:[fast,slow];
const peers=[],timers=[],links=[];let course,epoch=0,driving=false,stopping=false,runAt=0,hostPauseMs=0;
const percentile=(a,q)=>a.length?Number(a.toSorted((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))].toFixed(3)):null;
function link(profile,direction){let last=0,at=performance.now(),serial=0;const pending=new Set();const send=(value,deliver)=>{
 const now=performance.now(),elapsed=(now-at)/1000,n=serial++,burst=direction==='down'&&elapsed%8>.5&&elapsed%8<.7?profile.stall:0;
 const due=last=Math.max(last,now+Math.max(0,profile.delay+Math.sin(n*.73)*profile.jitter+burst));
 const timer=setTimeout(()=>{pending.delete(timer);deliver(value);},Math.max(0,due-now));pending.add(timer);
 };links.push(()=>{for(const timer of pending)clearTimeout(timer);pending.clear();});return send;}
async function client(slot){
 const profile=profiles[slot],up=link(profile,'up'),down=link(profile,'down'),ws=new WebSocket(url,{origin:'https://right-right-right.vercel.app'}),timing=new NetworkTiming(),messages=[],waiters=[];
 const p={ws,timing,slot,seq:0,messages,intervals:[],ages:[],ageErrors:[],frameDistances:[],yawSteps:[],targetErrors:[],rtts:[],corrections:[],lastSnapshotAt:0,lastPose:null,presentation:null,state:null,input:{},inputSent:0};peers.push(p);
 p.send=m=>up(m,v=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(v));});
 p.next=predicate=>{const found=messages.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const w={predicate,resolve,reject};w.timer=setTimeout(()=>reject(Error('Timed out waiting for slot '+slot)),15000);waiters.push(w);});};
 ws.on('error',error=>{for(const w of waiters)w.reject(error);});
 ws.on('message',raw=>down(JSON.parse(raw),m=>{
  const now=performance.now();messages.push(m);if(messages.length>3000)messages.shift();
  if(m.type==='pong'&&timing.acceptPong(m))p.rtts.push(timing.samples.at(-1).rtt);
  if(m.type==='snapshot'&&m.epoch===epoch){
   p.state=m;if(p.lastSnapshotAt)p.intervals.push(now-p.lastSnapshotAt);p.lastSnapshotAt=now;
   if(course){const team=Math.floor(slot/2),drive=m.inputs?.[team*2]||{},age=timing.snapshotAgeSeconds(m.time);
    p.presentation??=new CarPresentation(course,{remote:slot%2!==0});
    p.presentation.accept(m.cars[team],{phase:m.phase,latencySeconds:age,input:drive,inputAgeSeconds:Math.max(0,m.time-(drive.arrived??m.time))});if(p.presentation.replayActive)p.replaySnapshots=(p.replaySnapshots||0)+1;
    if(driving){p.ages.push(age*1000);p.ageErrors.push(Math.abs(age*1000-(Date.now()-m.time*1000)));}
   }
  }
  for(const w of [...waiters])if(w.predicate(m)){clearTimeout(w.timer);waiters.splice(waiters.indexOf(w),1);w.resolve(m);}
 }));
 await p.next(m=>m.type==='welcome');return p;
}
try{
 await Promise.all(profiles.map((_,i)=>client(i)));peers.sort((a,b)=>a.slot-b.slot);const host=peers[0],mode=profiles.length===4?'race':'coop';
 host.send({type:'create',mode,profile:6,seed:12345,name:'WAN verifier driver'});const code=(await host.next(m=>m.type==='joined')).code;
 for(const p of peers.slice(1)){p.send({type:'join',code,name:'WAN verifier '+p.slot});const joined=await p.next(m=>m.type==='joined');assert.equal(joined.slot,p.slot,'test peer must own the role it drives');}
 for(const p of peers)p.send({type:'ready',ready:true,catalog:9});await host.next(m=>m.type==='lobby'&&m.seats.every(s=>s?.ready));
 host.send({type:'start',stageReady:true});const races=await Promise.all(peers.map(p=>p.next(m=>m.type==='race')));epoch=races[0].epoch;assert.ok(races.every(r=>r.courseHash===races[0].courseHash));
 const stage=STAGES[races[0].profile];course=generateCourse(races[0].seed,mode,stage.blocks,stage.seed);
 timers.push(setInterval(()=>{for(const p of peers)p.send(timingPing(p));},500));
 let last=performance.now();timers.push(setInterval(()=>{
  const now=performance.now(),gap=now-last,dt=Math.min(.1,gap/1000);last=now;if(gap>500)hostPauseMs=Math.max(hostPauseMs,gap);
  for(const p of peers){
   let input={throttle:0,steer:0,handbrake:stopping,wipe:false,pitch:0,yaw:0,actions:[]};
   if(driving&&p.slot%2===0&&p.state&&(p.slot!==2||now-runAt>5000)){const cars=p.state.cars.map((c,i)=>i===Math.floor(p.slot/2)&&p.presentation? p.presentation.predicted:c);input=routeInput(course,{...p.state,cars},Math.floor(p.slot/2),{maxSpeed:p.slot===2?9:13,responseSeconds:.05});}
   if(p.slot%2===1){input.pitch=46.6;input.wipe=driving&&(now-runAt)%12000>9000;}
   p.input=input;
   if(epoch&&now-p.inputSent>=40){const sentSeq=++p.seq;p.presentation?.recordInput(sentSeq);p.send({type:'input',epoch,seq:sentSeq,...input});p.inputSent=now;}
   if(p.presentation){const r=p.presentation.advance(dt,input,p.state.phase);
    if(driving&&now-runAt>3000&&r&&p.lastPose){const distance=Math.hypot(r.x-p.lastPose.x,r.z-p.lastPose.z);p.frameDistances.push(distance);p.maxFrameDt=Math.max(p.maxFrameDt||0,dt);if(distance>1){p.largeFrames??=[];p.largeFrames.push({distance,dt,at:now-runAt,replay:p.presentation.replayActive,speed:p.presentation.predicted.speed,offset:{...p.presentation.renderOffset},seq:p.state.seq});p.largeFrames=p.largeFrames.slice(-12);}p.yawSteps.push(Math.abs(Math.atan2(Math.sin(r.yaw-p.lastPose.yaw),Math.cos(r.yaw-p.lastPose.yaw))));p.targetErrors.push(Math.hypot(p.presentation.predicted.x-p.presentation.target.x,p.presentation.predicted.z-p.presentation.target.z));}
    if(r)p.lastPose={...r};
   }
  }
 },1000/60));
 host.send({type:'stageReady',epoch,ready:true});await host.next(m=>m.type==='snapshot'&&m.epoch===epoch&&m.stageReady?.[0]);await wait(400);assert.equal(host.state.phase,'waiting');
 for(const p of peers.slice(1))p.send({type:'stageReady',epoch,ready:true});await host.next(m=>m.type==='snapshot'&&m.epoch===epoch&&m.phase==='running');driving=true;runAt=performance.now();const initial=structuredClone(host.state.cars);
 await wait(seconds*1000);driving=false;stopping=true;await wait(3000);
 assert.equal(hostPauseMs,0,`Test host event loop paused for ${hostPauseMs.toFixed(0)} ms (sleep/overload); rerun this interrupted test`);
 assert.ok(host.state.cars.every(c=>!c.dead),'route driving collided: '+JSON.stringify(host.state.cars.map(c=>({dead:c.dead,progress:c.progress,speed:c.speed}))));
 const moved=host.state.cars.map((c,i)=>Math.hypot(c.x-initial[i].x,c.z-initial[i].z));assert.ok(moved.every(x=>x>seconds*(profiles.length===4?3:5)),'insufficient route distance');
 assert.ok(host.state.cars.every(c=>Math.abs(c.speed)<1),'braking did not settle');
 for(const p of peers){if(p.slot%2===0)assert.ok(p.replaySnapshots>seconds*5,'driver history replay did not run');assert.ok(p.frameDistances.length>seconds*20);assert.ok(Math.max(...p.frameDistances)<1.5,'visible packet teleport');assert.ok(p.ageErrors.length>100);}
 const agreement=peers.slice(1).map(p=>{const ticks=new Map(p.messages.filter(m=>m.type==='snapshot'&&m.epoch===epoch).map(m=>[m.seq,m]));let count=0;for(const m of host.messages.filter(m=>m.type==='snapshot'&&m.epoch===epoch)){const other=ticks.get(m.seq);if(other){assert.deepEqual(m.cars,other.cars);assert.deepEqual(m.spectatorBodies,other.spectatorBodies);count++;}}assert.ok(count>seconds*10);return count;});
 stopping=false;await wait(600);host.send({type:'retry'});const retries=await Promise.all(peers.map(p=>p.next(m=>m.type==='race'&&m.epoch>epoch)));assert.ok(retries.every(m=>m.snapshot.phase==='countdown'));
 const report={ok:true,checkedAt:new Date().toISOString(),url:base.origin,scenario,legacyClientTiming:Boolean(process.env.RRR_TIMING_MODULE),physicalMachines:1,artificialDelay:true,profiles,seconds,movedMeters:moved.map(x=>Number(x.toFixed(2))),matchingTicks:agreement,clients:peers.map(p=>({slot:p.slot,role:p.slot%2?'navigator':'driver',replayedInputSnapshots:p.replaySnapshots||0,clockFit:p.timing.offsetMs!==null,rttMs:{p50:percentile(p.rtts,.5),p95:percentile(p.rtts,.95)},snapshotGapMs:{p50:percentile(p.intervals,.5),p95:percentile(p.intervals,.95),max:Math.max(...p.intervals)},estimatedAgeErrorMs:{p50:percentile(p.ageErrors,.5),p95:percentile(p.ageErrors,.95)},frameMovementMeters:{p95:percentile(p.frameDistances,.95),max:Math.max(...p.frameDistances)},maxFrameYawRadians:Math.max(...p.yawSteps),predictionResidualMeters:{p95:percentile(p.targetErrors,.95),max:Math.max(...p.targetErrors)}})),verified:['public WSS','all seats ready','countdown','route driving from predicted car','packet-stall recovery','normal braking','same-tick authority agreement','retry'],limitation:'Synthetic ordered WAN delays on one Mac talking to the specified authority; not physical India/Germany gameplay or a GPU frame-rate test. Snapshot age error assumes client/server wall clocks are synchronized.'};
 await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({ok:false,scenario,error:error.message,clients:peers.map(p=>({slot:p.slot,clockFit:p.timing.offsetMs!==null,frameMovementMax:Math.max(...p.frameDistances),maxFrameDt:p.maxFrameDt,largeFrames:p.largeFrames,lastState:p.state?.cars.map(c=>({dead:c.dead,speed:c.speed,progress:c.progress,finish:c.finish,x:c.x,z:c.z})),rttMs:percentile(p.rtts,.5)}))},null,2)+'\n');throw error;
}finally{for(const timer of timers)clearInterval(timer);for(const close of links)close();for(const p of peers){p.ws.close();setTimeout(()=>p.ws.terminate(),250).unref();}}
function timingPing(p){return p.timing.ping();}
