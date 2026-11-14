import test from 'node:test';
import assert from 'node:assert/strict';
import {ImpactShake} from './impact-shake.js';
import {CarPresentation} from './car-presentation.js';
import {RenderBudget} from './render-budget.js';
import {readDrivingSettings} from './driving-settings.js';
import {Network} from './network.js';
import {makeCar,stepCar,steeringLimit} from '../shared/physics.js';
import {generateCourse,STAGES} from '../shared/course.js';

const straight={points:Array.from({length:2000},(_,i)=>({x:0,y:20,z:i*2})),width:5,trees:[]};

test('repeated TREE\'D snapshots produce one short impact and a completely still result view',()=>{
  const shake=new ImpactShake();let peak=0;
  for(let frame=0;frame<300;frame++){
    // The server can stop stepping an ended race with jolt still equal to one.
    const offset=shake.update({dead:true,jolt:1},1/60);
    peak=Math.max(peak,Math.abs(offset.x),Math.abs(offset.y),Math.abs(offset.z));
    if(frame>=30)assert.deepEqual(offset,{x:0,y:0,z:0});
  }
  assert.ok(peak>0&&peak<=.025);
});

test('navigator moves smoothly across 650ms packet gaps using driver controls, then expires them',()=>{
  const presentation=new CarPresentation(straight,{remote:true});let authority=makeCar(straight);
  Object.assign(authority,{speed:12,vz:12});let previous;
  for(let frame=0;frame<390;frame++){
    if(frame%39===0){
      presentation.accept(authority,{input:{throttle:1,steer:0,ttl:1.5},phase:'running',latencySeconds:.325});
    }
    // Navigator throttle/steer must never affect the shared car.
    const rendered=presentation.advance(1/60,{throttle:-1,steer:1},'running');
    if(previous!==undefined&&frame>60)assert.ok(rendered.z-previous>.1,'no stationary frames between packets');
    assert.equal(rendered.x,0);previous=rendered.z;
    stepCar(authority,{throttle:1},1/60,straight);
  }
  for(let i=0;i<120;i++)presentation.advance(1/60,{throttle:1},'running');
  const expiredSpeed=presentation.predicted.speed;
  for(let i=0;i<120;i++)presentation.advance(1/60,{throttle:1},'running');
  assert.ok(presentation.predicted.speed<expiredSpeed,'a missing driver does not accelerate forever');
});

test('driving prediction at 20fps covers the same distance as 60fps',()=>{
  const run=fps=>{const p=new CarPresentation(straight);p.accept(makeCar(straight));for(let i=0;i<fps*5;i++)p.advance(1/fps,{throttle:1},'running');return p.predicted.z;};
  assert.ok(Math.abs(run(20)-run(60))<.5,'low frame rates must not slow the local physics clock');
});

test('all original-sized co-op roads stay 5m while race roads retain two-car clearance',()=>{
  for(const stage of STAGES){
    const coop=generateCourse(12345,'coop',stage.blocks,stage.seed),race=generateCourse(12345,'race',stage.blocks,stage.seed);
    assert.equal(coop.width,5);assert.equal(race.width,9.5);assert.deepEqual(coop.points,race.points);
    assert.ok(Math.abs(Math.hypot(coop.trees[0].x-coop.points[1].x,coop.trees[0].z-coop.points[1].z)-4.3)<.01,'matching boundary trees move in with the road');
  }
});

test('native speed-dependent steering preserves parking lock but limits high-speed yaw',()=>{
  assert.ok(Math.abs(steeringLimit(0)-30*Math.PI/180)<1e-12);
  assert.ok(Math.abs(steeringLimit(80/3.6)-9*Math.PI/180)<1e-12);
  const car=makeCar(straight);Object.assign(car,{speed:20,vz:20});
  for(let i=0;i<25;i++)stepCar(car,{throttle:1,steer:1},.02,straight);
  assert.ok(Math.abs(car.yaw)<.8,'a half-second key hold cannot whip the car through a right angle');
  assert.ok(car.x<0,'D still steers right in the reflected native cabin');
});

test('invalid stored sensitivity is ignored and auto quality remains bounded',()=>{
  assert.deepEqual(readDrivingSettings({getItem:()=>'{"steering":1000,"mouse":-2}'}),{steering:1,mouse:.1});
  const budget=new RenderBudget();for(let i=0;i<1000;i++)budget.sample(.05);
  assert.equal(budget.scale,.75);for(let i=0;i<5000;i++)budget.sample(1/60);
  assert.equal(budget.scale,1.25);
});

test('a turn queued behind a delayed poll sends the latest input and keeps discrete actions',async t=>{
  const previousFetch=globalThis.fetch,packets=[];let finishPoll;
  globalThis.fetch=async(path,options)=>{
    if(path==='/api/poll')await new Promise(resolve=>finishPoll=resolve);
    else packets.push(JSON.parse(options.body).message);
    return new Response(JSON.stringify({messages:[]}));
  };
  const network=new Network({storage:null});network.connected=true;network.transport='http';network.session={id:'test',token:'test'};
  t.after(()=>{network.close();globalThis.fetch=previousFetch;});
  const poll=network.request('/api/poll');await Promise.resolve();
  network.send({type:'input',seq:1,steer:1,actions:[{id:1,kind:'grab'}]});
  network.send({type:'input',seq:2,steer:-1,actions:[]});
  finishPoll();await poll;
  while(network.flushing)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(packets.length,1);assert.equal(packets[0].seq,2);assert.equal(packets[0].steer,-1);assert.deepEqual(packets[0].actions,[{id:1,kind:'grab'}]);
});
