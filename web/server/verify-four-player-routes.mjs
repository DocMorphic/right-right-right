import './spectator-terrain.js';
import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';
import{GameService}from'./service.js';import{STAGES,generateCourse,direction}from'../shared/course.js';import{routeInput}from'./route-driver.js';
let time=1000;const ids=['host','driver-a','driver-b','navigator-b'],latest=new Map(),service=new GameService({now:()=>time,send:(id,m)=>{if(!latest.has(id))latest.set(id,new Map());latest.get(id).set(m.type,m);if(m.type==='error')throw Error(JSON.stringify(m));}});
for(const id of ids)service.connect(id);service.receive(ids[0],{type:'create',mode:'race',profile:6,seed:12345});const room=[...service.rooms.values()][0];for(const id of ids.slice(1))service.receive(id,{type:'join',code:room.code});service.receive(ids[0],{type:'seat',slot:1,swap:true});const results=[];
for(const profile of [6,7,8,0,1,2,3,4,5]){
 if(room.status!=='lobby')service.receive(ids[0],{type:'lobby'});
 service.receive(ids[0],{type:'configure',profile,seed:12345});for(const id of ids)service.receive(id,{type:'ready',ready:true,catalog:9});service.receive(ids[0],{type:'start',stageReady:true});for(const id of ids)service.receive(id,{type:'stageReady',epoch:room.epoch,ready:true});for(let i=0;i<4;i++){time++;service.tick();}
 const stage=STAGES[profile],course=generateCourse(12345,'race',stage.blocks,stage.seed),end=course.distances[course.finishIndex??course.points.length-9];
 // The second crew takes a normal passing line around the first car stopped
 // at the finish. This changes the feedback driver's target, never map geometry.
 const passing={...course,points:course.points.map((p,i)=>{const d=direction(course.points,i),t=Math.max(0,Math.min(1,(course.distances[i]-(end-35))/20)),offset=1.9*t*t*(3-2*t);return{...p,x:p.x+d.z*offset,z:p.z-d.x*offset};})};
 const seq=[0,0,0,0];let ticks=0,wipes=[0,0],lastProgress=[0,0],stalled=[0,0];const begin=performance.now();
 while(room.world.phase!=='ended'&&room.world.elapsed<3000){
  const world=room.world,controls=[routeInput(course,world,0,{maxSpeed:7,responseSeconds:0}),routeInput(passing,world,1,{maxSpeed:6,responseSeconds:0})];
  const a=world.cars[0],b=world.cars[1],gap=(course.distances[a.nearest]??0)-(course.distances[b.nearest]??0);
  if(a.finish<0&&gap<14)controls[1].throttle=b.speed>.2?-1:0;
  for(let slot=0;slot<4;slot++){const team=Math.floor(slot/2),drive=slot%2?{throttle:0,steer:0,wipe:world.cars[team].mud>.05,pitch:0,yaw:0}:controls[team];if(drive.wipe)wipes[team]++;service.receive(room.seats[slot].id,{type:'input',epoch:room.epoch,seq:++seq[slot],...drive});}
  time+=.1;service.tick();ticks++;
  for(let team=0;team<2;team++){const car=world.cars[team];assert.equal(car.dead,false,JSON.stringify({stage:stage.name,team,elapsed:world.elapsed,car}));stalled[team]=car.progress>lastProgress[team]||car.finish>=0||team===1&&gap<14?0:stalled[team]+.1;lastProgress[team]=car.progress;assert.ok(stalled[team]<90,JSON.stringify({stage:stage.name,team,reason:'feedback driver stalled',car}));}
  if(ticks%100===0)service.snapshots();
 }
 assert.equal(room.world.phase,'ended',stage.name);assert.ok(room.world.cars.every(c=>c.finish>0&&!c.dead),stage.name);service.snapshots();const snapshots=ids.map(id=>latest.get(id).get('snapshot'));for(const s of snapshots.slice(1))assert.deepEqual(s.cars,snapshots[0].cars);assert.ok(snapshots.every(s=>s.tablets.length===2));
 const report={stage:stage.name,profile,epoch:room.epoch,normalInputPackets:seq.reduce((a,b)=>a+b,0),statePlacements:0,finishSeconds:room.world.cars.map(c=>+c.finish.toFixed(2)),mud:wipes,winner:room.world.winner,carImpacts:room.world.stats.impacts,hostSlot:room.seats.findIndex(s=>s?.id===ids[0]),wallSeconds:+((performance.now()-begin)/1000).toFixed(2)};results.push(report);console.log(JSON.stringify(report));
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify({ok:results.length===9,clients:4,physicalMachines:1,transport:'deterministic service audit; separate WebSocket acceptance required',statePlacements:0,results},null,2));
}
