import test from 'node:test';
import assert from 'node:assert/strict';
import {CarPresentation} from './car-presentation.js';
import {makeCar} from '../shared/physics.js';
const course={points:Array.from({length:2000},(_,i)=>({x:0,y:20,z:i*2})),width:9.5,trees:[]};

for(const latency of [.2,.65])test(`20m/s delayed authority ${latency*1000}ms never teleports or reverses the rendered car`,()=>{
  const presentation=new CarPresentation(course),pending=[],steps=[];let previous;
  for(let frame=0;frame<900;frame++){
    const now=frame/60;
    if(frame%6===0){const car=makeCar(course);Object.assign(car,{z:20*now,vz:20,speed:20});pending.push({at:now+latency,car});}
    while(pending[0]?.at<=now){
      const before=presentation.rendered&&{...presentation.rendered};
      presentation.accept(pending.shift().car,{latencySeconds:latency,input:{throttle:1,ttl:1.5},phase:'running'});
      if(before)assert.deepEqual(presentation.rendered,before,'a packet never changes the instantaneous camera pose');
    }
    const rendered=presentation.advance(1/60,{throttle:1},'running');
    if(rendered){if(previous!==undefined&&now>3)steps.push(rendered.z-previous);previous=rendered.z;}
  }
  assert.ok(Math.min(...steps)>.25,'the car never saws backwards toward old authority');
  assert.ok(Math.max(...steps)<.42,'no packet-sized forward jump');
  assert.ok(Math.max(...steps)-Math.min(...steps)<.09,'frame motion remains continuous across 10Hz updates');
});

test('arriving height corrections are blended instead of snapping at packet boundaries',()=>{
  const presentation=new CarPresentation(course),car=makeCar(course);
  presentation.accept(car,{phase:'countdown'});const previous={...presentation.rendered};
  presentation.accept({...car,y:car.y+2},{phase:'countdown'});
  assert.equal(presentation.predicted.y,previous.y);
  assert.equal(presentation.rendered.y,previous.y);
  const rendered=presentation.advance(1/60,{},'countdown');
  assert.ok(rendered.y>previous.y&&rendered.y<previous.y+.1);
});

test('stale held-Space snapshots cannot put a released local handbrake back on',()=>{
  const presentation=new CarPresentation(course),car=makeCar(course);
  Object.assign(car,{vz:20,speed:20,handbrakeAmount:1,handbrakeHold:1,handbrakeWasHeld:true});
  presentation.accept(car,{phase:'running',input:{throttle:1,handbrake:true}});
  for(let frame=0;frame<30;frame++){
    // Simulate delayed snapshots which still describe the key before key-up.
    if(frame%6===0)presentation.accept(car,{phase:'running',input:{throttle:1,handbrake:true}});
    presentation.advance(1/60,{throttle:1,handbrake:false},'running');
    if(frame>=6){assert.equal(presentation.predicted.handbrakeAmount,0);assert.equal(presentation.predicted.handbrakeWasHeld,false);}
  }
  assert.equal(presentation.predicted.handbrakeHold,0);
  assert.ok(presentation.predicted.handbrakeCatch<.25,'release carry counts down without being replenished by packets');
});
