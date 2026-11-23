import test from'node:test';import assert from'node:assert/strict';
import{makeCar,stepCar}from'../shared/physics.js';import{stepHandling,steeringLimit}from'../shared/native-handling.js';
const course={points:Array.from({length:1000},(_,i)=>({x:0,y:20,z:i*3})),width:100,trees:[]};
test('faster steering preserves full lock, high-speed steering limits and gradual body rotation',()=>{
 for(const speed of[0,10,20,35]){const c=makeCar(course);Object.assign(c,{speed,vz:speed});stepCar(c,{steer:1,throttle:.06},1/60,course);
  assert.ok(c.steer>.02&&c.steer<.7,'first-frame input is visible without snapping to full steering lock');assert.ok(Math.abs(c.yaw)<.01,'the body does not teleport into a turn');
  for(let i=0;i<100;i++)stepCar(c,{steer:1,throttle:.06},.02,course);assert.ok(c.steer<=1&&c.steer>.99);assert.ok(Math.abs(c.yawRate)<1.85,'normal steering does not become an unrestricted drift');
 }
 assert.equal(steeringLimit(0),30*Math.PI/180);assert.equal(steeringLimit(80/3.6),9*Math.PI/180);
});
test('brake strength stays unchanged and stops forward travel before normal reverse takes over',()=>{
 const c=makeCar(course),reference={yaw:0,vx:0,vz:20,speed:20};Object.assign(c,{vz:20,speed:20});
 for(let i=0;i<40;i++){stepCar(c,{throttle:-1},.02,course);stepHandling(reference,{throttle:-1},.02);assert.ok(Math.abs(c.speed-reference.speed)<1e-9,'response changes must not increase brake force');}
 assert.ok(c.speed>0&&c.speed<6);for(let i=0;i<100;i++)stepCar(c,{throttle:-1},.02,course);assert.ok(c.speed<0&&c.speed>=-28/3.6,'reverse remains controlled');
});

test('a fast countersteer moves the wheel immediately while the body changes direction progressively',()=>{
 const c=makeCar(course);Object.assign(c,{speed:20,vz:20});
 for(let i=0;i<20;i++)stepCar(c,{throttle:.06,steer:.7},.02,course);
 const beforeSteer=c.steer,beforeYaw=c.yaw;stepCar(c,{throttle:.06,steer:-.7},.02,course);
 assert.ok(c.steer<beforeSteer-.05&&c.steer>-.7,'wheel responds to countersteering without snapping to the opposite lock');assert.ok(Math.abs(c.yaw-beforeYaw)<.02,'body keeps rotational inertia');
 for(let i=0;i<29;i++){stepCar(c,{throttle:.06,steer:-.7},.02,course);assert.ok(Math.abs(c.steer)<=.701);assert.ok(Math.abs(c.yawRate)<1.85);}
 assert.ok(c.steer<-.69&&c.yawRate>0,'the turn must actually reverse instead of sticking in the old direction');
});
