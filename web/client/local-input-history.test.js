import test from'node:test';import assert from'node:assert/strict';
import{LocalInputHistory}from'./local-input-history.js';
import{CarPresentation}from'./car-presentation.js';
import{measureInputResponse}from'./input-responsiveness.js';
import{makeCar,stepCar}from'../shared/physics.js';
const course={points:Array.from({length:1000},(_,i)=>({x:0,y:20,z:i*3})),width:100,trees:[]};
const controls=frame=>({throttle:frame<12?1:-1,steer:frame>=3&&frame<10?1:0,handbrake:frame>=3&&frame<8});

test('replay preserves every unacknowledged input edge and subtracts time already simulated by the authority',()=>{
 const history=new LocalInputHistory(),car=makeCar(course);Object.assign(car,{speed:18,vz:18});let captured;
 history.advance(0,{},'running');
 for(let frame=0;frame<20;frame++){
  if(frame%3===0)history.mark(frame/3+1);
  const input=controls(frame);history.advance(.02,input,'running');stepCar(car,input,.02,course);
  if(frame===5)captured=structuredClone(car);
 }
 const replay=history.replay(captured,{seq:2},.06,course);assert.ok(replay);
 for(const field of ['x','y','z','vx','vz','yaw','steer','steerVelocity','yawRate','handbrakeAmount','handbrakeHold','handbrakeCatch'])assert.ok(Math.abs(replay[field]-car[field])<1e-8,field);
 assert.equal(replay.handbrakeWasHeld,false,'old held-Space authority must replay the newer release');
});

test('local reconciliation keeps the instantaneous camera pose and restores current controls',()=>{
 const p=new CarPresentation(course),car=makeCar(course);Object.assign(car,{speed:18,vz:18});p.accept(car);let captured;
 for(let frame=0;frame<20;frame++){
  if(frame%3===0)p.recordInput(frame/3+1);
  p.advance(.02,controls(frame),'running');stepCar(car,controls(frame),.02,course);if(frame===5)captured=structuredClone(car);
 }
 const rendered={...p.rendered};p.accept(captured,{phase:'running',input:{seq:2},inputAgeSeconds:.06,latencySeconds:.18});
 assert.equal(p.replayActive,true);assert.deepEqual(p.rendered,rendered,'receiving a packet cannot teleport the camera');
 assert.equal(p.predicted.handbrakeWasHeld,false);assert.ok(Math.abs(p.predicted.steer-car.steer)<1e-8);
});

test('driver response stays close to local handling under long RTT instead of fighting stale steering',()=>{
 const local=measureInputResponse(CarPresentation,{rtt:0});
 for(const rtt of [.18,.36,.6]){
  const delayed=measureInputResponse(CarPresentation,{rtt});
  assert.ok(delayed.firstVisibleTurnMs<=local.firstVisibleTurnMs+35,JSON.stringify({rtt,local:local.firstVisibleTurnMs,delayed:delayed.firstVisibleTurnMs}));
  assert.ok(delayed.steerAfter200ms>=local.steerAfter200ms*.85,'older authority cannot suppress most of the current turn');
  assert.ok(Math.abs(delayed.steer100msAfterRelease-local.steer100msAfterRelease)<.04,'keyup response must not depend on RTT');
 }
});

test('input history stays bounded and cannot replay a paused, missing or excessively old acknowledgement',()=>{
 const history=new LocalInputHistory();history.advance(0,{},'running');for(let i=0;i<600;i++){history.mark(i+1);history.advance(1/60,{throttle:1},'running');}
 assert.ok(history.frames.length<=122);assert.ok(history.markers.size<=122);
 assert.equal(history.replay(makeCar(course),{seq:1},0,course),null);
 assert.equal(history.replay(makeCar(course),{seq:9999},0,course),null);
 history.advance(.02,{},'paused');assert.equal(history.frames.length,0);assert.equal(history.markers.size,0);
});

test('high-RTT throttle, brake and Space retain their local response and release',()=>{
 for(const control of['throttle','brake','handbrake']){const local=measureInputResponse(CarPresentation,{rtt:0,control});for(const rtt of[.18,.36,.6]){
  const remote=measureInputResponse(CarPresentation,{rtt,control});
  assert.ok(Math.abs(remote.speedChange200ms-local.speedChange200ms)<.4,`${control} at ${rtt}s: ${remote.speedChange200ms} vs ${local.speedChange200ms}`);
  if(control==='handbrake'){assert.ok(Math.abs(remote.handbrakeAfter200ms-local.handbrakeAfter200ms)<=.02/.3+1e-6);assert.equal(remote.handbrakeAfterRelease,0);}
 }}
});

test('steering and brake feedback begin on the first rendered input frame at local and high RTT',()=>{
 for(const rtt of[0,.18,.36,.6])for(const offset of[0,.003,.009,.015]){
  const steering=measureInputResponse(CarPresentation,{rtt,steerAt:2+offset}),braking=measureInputResponse(CarPresentation,{rtt,control:'brake',steerAt:2+offset});
  assert.ok(steering.firstSteerResponseMs<=1000/60,`steering ${rtt}: ${steering.firstSteerResponseMs}`);
  assert.ok(braking.firstBrakeResponseMs<=1000/60,`braking ${rtt}: ${braking.firstBrakeResponseMs}`);
  assert.ok(steering.firstVisibleTurnMs-steering.firstSteerResponseMs<=105,'vehicle heading still builds progressively but must not wait for the full steering spring');
 }
});

test('first-frame brake feedback and steering are not suppressed before the first usable acknowledgement',()=>{
 for(const input of[{throttle:-1,steer:0},{throttle:.06,steer:1}]){
  const p=new CarPresentation(course),car=makeCar(course);Object.assign(car,{speed:20,vz:20});p.accept(car,{input:{throttle:.06,steer:0}});
  const before={...p.predicted};p.advance(1/60,input,'running');
  if(input.throttle<0){assert.ok(p.predicted.speed<before.speed-.25);assert.equal(p.rendered.speed,p.predicted.speed);}
  else{assert.ok(p.predicted.steer>.02);assert.ok(p.predicted.yaw<before.yaw);assert.equal(p.rendered.yaw,p.predicted.yaw);}
  const visible={...p.rendered};p.accept(car,{input:{throttle:.06,steer:0},latencySeconds:.18});assert.deepEqual(p.rendered,visible,'an old packet cannot jerk the rendered car');
  p.advance(1/60,input,'running');if(input.throttle<0)assert.ok(p.predicted.speed<before.speed-.5);else assert.ok(p.predicted.steer>.1);
 }
});

test('an acknowledgement between frames remains usable up to one physics tick ahead',()=>{
 const history=new LocalInputHistory(),car=makeCar(course);history.advance(0,{},'running');history.mark(1);history.advance(1/60,{throttle:1},'running');
 assert.deepEqual(history.replay(car,{seq:1},.02,course),car);assert.equal(history.replay(car,{seq:1},.06,course),null,'a substantially future acknowledgement must not be replayed');
});
