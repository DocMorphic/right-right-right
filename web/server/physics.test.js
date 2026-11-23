import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,stepWorld,toggleTablet,openDoor,resolveCarCollision,carAnchor,stepCar,CAR} from '../shared/physics.js';
import {STAGES,generateCourse} from '../shared/course.js';
import {newRoom,joinRoom,commandRoom,advanceRoom,courseFor,courseHash} from './rooms.js';
import {stepHandling} from '../shared/native-handling.js';
import {tabletExtents}from'../shared/tablet-physics.js';
const course={seed:1,width:9.5,points:Array.from({length:120},(_,i)=>({x:0,y:20,z:i*2})),trees:[],mud:[]};
function running(mode='coop'){const w=makeWorld(course,mode,1);w.phase='running';return w;}

test('browser grip tuning settles a sideways slide sooner while full handbrake still drifts',()=>{
 const tuned=makeWorld(course,'coop',1).cars[0];Object.assign(tuned,{vx:4,vz:15,speed:15});const original=structuredClone(tuned);
 for(let i=0;i<25;i++){stepCar(tuned,{throttle:1},.02,course);stepHandling(original,{throttle:1},.02);}
 assert.ok(Math.abs(tuned.vx)<Math.abs(original.vx)*.7,'normal driving recovers lateral traction sooner');
 const a={vx:4,vz:15,yaw:0,handbrakeAmount:1},b=structuredClone(a);
 for(let i=0;i<25;i++){stepHandling(a,{throttle:1,steer:.5,handbrake:true},.02);stepHandling(b,{throttle:1,steer:.5,handbrake:true},.02,{gripMultiplier:1.2});}
 for(const key of ['vx','vz','yaw'])assert.ok(Math.abs(a[key]-b[key])<1e-12,'fully engaged handbrake keeps its deliberate slide');
});

test('grass has no invented drag or grip penalty under identical driving controls',()=>{
 const road=makeWorld(course,'coop',1).cars[0],grass=structuredClone(road);grass.x+=20;
 for(let i=0;i<150;i++){stepCar(road,{throttle:.7,steer:.3},.02,course);stepCar(grass,{throttle:.7,steer:.3},.02,course);}
 for(const property of ['speed','vx','vz','yaw'])assert.ok(Math.abs(road[property]-grass[property])<1e-10,property);
});

test('driver physics uses finite fixed-step movement and navigator cannot drive another seat',()=>{
  const a={id:'a'},b={id:'b'},room=newRoom('ABC123',a,{mode:'coop',seed:1},0);joinRoom(room,b,{},0);
  commandRoom(room,a,{type:'ready',ready:true},0);commandRoom(room,b,{type:'ready',ready:true},0);commandRoom(room,a,{type:'start'},0);
  room.world.phase='running';const z=room.world.cars[0].z;
  commandRoom(room,b,{type:'input',epoch:room.epoch,seq:1,slot:0,throttle:1,steer:1,pitch:0,yaw:0},0);
  advanceRoom(room,.1);assert.equal(room.inputs[1].throttle,0);assert.equal(room.world.cars[0].z,z);
  commandRoom(room,a,{type:'input',epoch:room.epoch,seq:1,throttle:1,steer:0,pitch:0,yaw:0},.1);advanceRoom(room,.3);
  assert.ok(room.world.cars[0].z>z);assert.ok(room.world.cars[0].speed>0);
  assert.throws(()=>commandRoom(room,a,{type:'input',epoch:room.epoch,seq:2,throttle:Infinity,steer:0,pitch:0,yaw:0},.3),/Invalid input/);
});
test('car impacts jolt both cars without killing either crew',()=>{
  const w=running('race');Object.assign(w.cars[0],{x:-.6,z:40,vx:5,vz:0});Object.assign(w.cars[1],{x:.6,z:40,vx:-5,vz:0});
  assert.equal(resolveCarCollision(w),true);assert.equal(w.stats.impacts,1);assert.ok(w.cars.every(c=>!c.dead&&c.jolt>0));assert.ok(w.cars[0].vx<5);assert.ok(w.cars[1].vx>-5);
});
test('tree trunk impact kills the moving crew and ends solo run',()=>{
  const w=running();Object.assign(w.cars[0],{x:0,z:40,vx:0,vz:8,speed:8});
  const treeCourse={...course,trees:[{x:0,y:20,z:41.3,radius:.42}]};stepWorld(w,[{throttle:1}],.02,treeCourse);
  assert.equal(w.cars[0].dead,true);assert.equal(w.stats.treeDeaths,1);assert.equal(w.phase,'ended');assert.equal(w.cars[0].speed,0);
});
test('tablet drop, closed-door theft rejection, open-door stealing, duplicate action rejection',()=>{
  const w=running('race');Object.assign(w.cars[0],{x:0,z:40,yaw:0,driverDoor:true,driverDoorAngle:80});Object.assign(w.cars[1],{x:3.4,z:40,yaw:0});
  const p=w.tablets[1];p.holder=-1;Object.assign(p,carAnchor(w.cars[1],3));
  assert.equal(toggleTablet(w,0,{pitch:0,yaw:-90}),false);openDoor(w,1);w.cars[1].doorAngle=70;
  assert.equal(toggleTablet(w,0,{pitch:0,yaw:-90}),true);assert.equal(p.holder,0);assert.equal(p.carrier,0);assert.equal(w.stats.steals,1);
  assert.equal(toggleTablet(w,0,{}),true);assert.equal(p.holder,-1);
});
test('an open door does not pull a stationary loose tablet out of the car',()=>{
  const w=running();toggleTablet(w,1,{});for(let i=0;i<100;i++)stepWorld(w,[],.02,course);openDoor(w,0);w.cars[0].doorAngle=90;
  for(let i=0;i<1500;i++)stepWorld(w,[],.02,course);
  assert.equal(w.tablets[0].inCabin,true,'a parked tablet stays put even after thirty seconds with the door open');assert.equal(w.tablets[0].holder,-1);
});
test('closing the door during the grace period retains the tablet and held tablets never eject',()=>{
 const w=running(),p=w.tablets[0];p.holder=-1;openDoor(w,0);w.cars[0].doorAngle=70;
 for(let i=0;i<30;i++)stepWorld(w,[],.02,course);
 w.cars[0].door=false;w.cars[0].doorAngle=0;
 for(let i=0;i<100;i++)stepWorld(w,[],.02,course);
 assert.equal(p.inCabin,true);
 p.holder=1;openDoor(w,0);w.cars[0].doorAngle=90;
 for(let i=0;i<150;i++)stepWorld(w,[],.02,course);
 assert.equal(p.inCabin,true);assert.equal(p.holder,1);
});
test('both seats can wipe mud, stale input expires, finish crossing ranks crew',()=>{
  const w=running();const car=w.cars[0];car.mud=1;stepWorld(w,[{}, {wipe:true}],.1,course);assert.ok(car.mud<1);
  w.elapsed=10;Object.assign(car,{z:course.points.at(-9).z-.1,progress:course.points.length-12,nearest:course.points.length-10,vz:10,speed:10});
  stepWorld(w,[{throttle:1}],.02,course);assert.ok(car.finish>10);assert.equal(w.phase,'ended');assert.equal(w.winner,0);
});
test('full steering at speed remains controllable and finite for extended simulation',()=>{
  const car=makeWorld(course,'coop',1).cars[0];for(let i=0;i<3000;i++)stepCar(car,{throttle:1,steer:Math.sin(i*.003),handbrake:i%200<5},.02,course);
  for(const value of [car.x,car.y,car.z,car.yaw,car.speed])assert.ok(Number.isFinite(value));assert.ok(Math.abs(car.speed)<=CAR.maxSpeed);
});
test('action IDs execute at most once, including duplicate actions in the same input packet',()=>{
  const a={id:'a'},room=newRoom('ABC123',a,{mode:'coop',practice:true,seed:1},0);
  commandRoom(room,a,{type:'ready',ready:true},0);commandRoom(room,a,{type:'start'},0);
  const packet={type:'input',epoch:room.epoch,seq:1,throttle:0,steer:0,pitch:0,yaw:0,actions:[{id:1,kind:'grab'},{id:1,kind:'grab'}]};
  commandRoom(room,a,packet,.01);assert.equal(room.world.tablets[0].holder,-1);
  commandRoom(room,a,{...packet,seq:2},.02);assert.equal(room.world.tablets[0].holder,-1);
});
test('stale controls stop accelerating and expired HTTP peer pauses race and transfers host',()=>{
  const a={id:'a'},b={id:'b'},room=newRoom('ABC123',a,{mode:'coop',seed:1},0);joinRoom(room,b,{},0);
  commandRoom(room,a,{type:'ready',ready:true},0);commandRoom(room,b,{type:'ready',ready:true},0);commandRoom(room,a,{type:'start'},0);room.world.phase='running';
  commandRoom(room,a,{type:'input',epoch:1,seq:1,throttle:1,steer:0,pitch:0,yaw:0},0);advanceRoom(room,.49);const speed=room.world.cars[0].speed;
  advanceRoom(room,1);assert.ok(room.world.cars[0].speed<speed);
  commandRoom(room,b,{type:'poll'},31);assert.equal(room.hostId,'b');assert.equal(room.world.phase,'paused');assert.equal(room.seats.filter(Boolean).length,1);
});

test('D steering turns right from the original GLB forward-facing cabin',()=>{
  const car=makeWorld(course,'coop',1).cars[0];
  for(let i=0;i<50;i++)stepCar(car,{throttle:1,steer:1},.02,course);
  assert.ok(car.x<0);assert.ok(car.yaw<0);
});

test('all nine course profiles use identical server/client stages and reject unknown profiles',()=>{
  const a={id:'a'},room=newRoom('ABC123',a,{mode:'race',seed:43210},0);
  for(let index=0;index<STAGES.length;index++){
    commandRoom(room,a,{type:'configure',profile:index},0);
    const stage=STAGES[index],authority=courseFor(room),client=generateCourse(room.seed,room.mode,stage.blocks,stage.seed);
    assert.equal(authority.blocks,stage.blocks);assert.equal(authority.profile,stage.seed);assert.equal(courseHash(authority),courseHash(client));
  }
  assert.equal(STAGES.length,9);
  assert.throws(()=>commandRoom(room,a,{type:'configure',profile:9},0),/Invalid course profile/);
});

test('dropped tablet falls and slides against the real footwell, occupants and dashboard rather than being pinned or phasing through them',()=>{
 const w=running(),p=w.tablets[0];toggleTablet(w,1,{});let high=p.ly,low=high;
 for(let i=0;i<100;i++){stepWorld(w,[{throttle:1,steer:.6}],.02,course);const e=tabletExtents(p);high=Math.max(high,p.ly);low=Math.min(low,p.ly);assert.ok(p.lz+e[2]<=.55001,'front corners stay behind the native dash');assert.ok(p.lz-e[2]>=-.32,'tablet stays within the rear cabin contact region during a tumble');assert.ok(p.ly-e[1]>=.3199,'tablet stays above the actual floor');}
 assert.ok(high-low>.05,'release actually moves and settles on the original lap/body contacts');assert.equal(p.inCabin,true);assert.equal(toggleTablet(w,1,{pitch:50}),true);assert.equal(p.holder,1);
});

test('browser handbrake engages promptly with a stronger drift while preserving stopping and release recovery',()=>{
 const tuned=makeWorld(course,'coop',1).cars[0];Object.assign(tuned,{speed:20,vz:20});const previous=structuredClone(tuned);
 for(let i=0;i<20;i++){const input={throttle:1,steer:.8,handbrake:true};stepCar(tuned,input,.02,course);stepHandling(previous,input,.02,{gripMultiplier:1.2});}
 assert.equal(tuned.handbrakeAmount,1);assert.ok(Math.abs(tuned.yawRate)>Math.abs(previous.yawRate)*1.15,'Space must actually rotate the moving car more strongly');assert.ok(tuned.speed>10,'drift must not just stop the car');
 for(let i=0;i<100;i++)stepCar(tuned,{throttle:0,steer:0},.02,course);
 assert.equal(tuned.handbrakeAmount,0);assert.ok(Math.abs(tuned.yawRate)<.01,'released Space does not keep rotating the car');
 const slow=makeWorld(course,'coop',1).cars[0];Object.assign(slow,{vz:3,speed:3,yawRate:-.9,steer:1});for(let i=0;i<100;i++)stepCar(slow,{throttle:1,steer:1,handbrake:true},.02,course);assert.ok(Math.hypot(slow.vx,slow.vz)<.001);assert.ok(Math.abs(slow.yawRate)<.001);
});

test('a fast car launches off a ramp crest and lands without TREEd; a real trunk still crashes it',()=>{
 const ramp={seed:1,width:10,trees:[],mud:[],points:Array.from({length:180},(_,i)=>({x:0,y:i<=20?20+i*.25:25,z:i})),startIndex:8,finishIndex:170};
 const w=makeWorld(ramp,'coop',1);w.phase='running';const car=w.cars[0];Object.assign(car,{vz:18,speed:18});let airborne=false,peak=0,landed=false;
 for(let i=0;i<160;i++){stepWorld(w,[{throttle:.06}],.02,ramp);if(!car.grounded){airborne=true;peak=Math.max(peak,car.y-CAR.height-25);}else if(airborne)landed=true;assert.equal(car.dead,false,'terrain landing cannot trigger TREEd');}
 assert.ok(airborne&&peak>.15&&landed,JSON.stringify({airborne,peak,landed}));
 ramp.trees.push({x:car.x,y:25,z:car.z+1,radius:.32,solid:true}); // A fresh course avoids mutating a cached collision grid.
 const withTree={...ramp,trees:[...ramp.trees]};stepWorld(w,[{throttle:1}],.02,withTree);assert.equal(car.dead,true);
});
