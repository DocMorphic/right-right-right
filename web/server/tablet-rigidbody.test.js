import test from 'node:test';import assert from 'node:assert/strict';
import {releaseTablet,stepLooseTablet,tabletCorners} from '../shared/tablet-physics.js';
import {observeTabletCar,discardTabletSimulation} from '../shared/tablet-rigidbody.js';
import NATIVE from '../shared/native-tablet.json' with {type:'json'};
const car=()=>({x:0,y:.68,z:0,yaw:0,vx:0,vz:0,vy:0,door:false,doorAngle:0});
const tick=(p,c,count=1)=>{for(let i=0;i<count;i++)stepLooseTablet(p,c,[c],.02,()=>0,()=>[]);};
test('native release preserves each seat lap position and tilt, exact toss and point momentum',()=>{
 for(const slot of[0,1]){const c=car(),p={holder:slot};c.vx=3;c.vz=12;releaseTablet(p,c);assert.deepEqual([p.lx,p.ly,p.lz],NATIVE.anchors[slot?'passenger':'driver']);assert.ok(Math.abs(p.rx+25*Math.PI/180)<1e-7);assert.equal(p.vx,3.5);assert.equal(p.vy,.35);assert.equal(p.vz,13.6);assert.equal(p.wx,0);discardTabletSimulation(p);}
 const c=car();observeTabletCar(c,.02);c.yaw=.02;observeTabletCar(c,.02);const p={holder:1};releaseTablet(p,c);assert.ok(Math.abs(p.vz-1.6)>.2,'turning car contributes velocity at the actual lap point');
});
test('opening a door on a parked car never ejects a held or settled loose tablet',()=>{
 const c=car(),p={holder:1};releaseTablet(p,c);tick(p,c,150);const before={x:p.lx,y:p.ly,z:p.lz};c.door=true;for(let i=0;i<45;i++){c.doorAngle+=2;tick(p,c);}tick(p,c,500);assert.ok(p.inCabin);assert.ok(Math.hypot(p.lx-before.x,p.ly-before.y,p.lz-before.z)<.025);discardTabletSimulation(p);
});
test('gentle cornering retains a dropped tablet; a hard sustained turn can lose it through the actual opening',()=>{
 for(const accel of[3,24]){const c=car(),p={holder:1};c.door=true;c.doorAngle=90;releaseTablet(p,c);tick(p,c,100);let lost=false;for(let i=0;i<150;i++){c.vx+=accel*.02;c.x+=c.vx*.02;tick(p,c);if(!p.inCabin){lost=true;break;}}assert.equal(lost,accel===24);discardTabletSimulation(p);}
});
test('closing the door while the passenger holds the tablet leaves ownership and lap pose intact',async()=>{
 const{makeWorld,applyActions,stepWorld}=await import('../shared/physics.js');const course={seed:1,width:5,trees:[],mud:[],points:Array.from({length:100},(_,i)=>({x:0,y:0,z:i*2}))},w=makeWorld(course,'coop',1);w.phase='running';w.cars[0].door=true;w.cars[0].doorAngle=90;applyActions(w,1,{actions:[{id:1,kind:'door'}]});stepWorld(w,[{},{}],.02,course);assert.equal(w.cars[0].door,false);assert.equal(w.tablets[0].holder,1);
});
test('closed doors and dash withstand a braking/sideways impulse without leaking the loose tablet',()=>{
 const c=car(),p={holder:1};releaseTablet(p,c);tick(p,c,100);for(let i=0;i<150;i++){c.vx+=.3;c.vz-=.2;c.x+=c.vx*.02;c.z+=c.vz*.02;tick(p,c);assert.ok(p.inCabin);assert.ok(Math.abs(p.lx)<.75);assert.ok(p.lz<.56);assert.ok([p.x,p.y,p.z,p.qx,p.qy,p.qz,p.qw].every(Number.isFinite));}discardTabletSimulation(p);
});
test('resting tablet is stable at the same local pose in a translating car, and dropping is not a world-space teleport',()=>{
 const c=car(),p={holder:1};c.x=1500;c.z=-3000;c.vz=18;releaseTablet(p,c);assert.ok(Math.abs(p.z-c.z-.28)<1e-9);for(let i=0;i<180;i++){c.z+=c.vz*.02;tick(p,c);}const a=[p.lx,p.ly,p.lz];for(let i=0;i<80;i++){c.z+=c.vz*.02;tick(p,c);}assert.ok(Math.hypot(p.lx-a[0],p.ly-a[1],p.lz-a[2])<.01);discardTabletSimulation(p);
});

test('leaving through the open doorway preserves outward momentum instead of hitting an invisible closed chassis',()=>{
 const c=car();c.door=true;c.doorAngle=90;const p={holder:-1,inCabin:false,x:-.92,y:.85,z:.2,vx:-3,vy:0,vz:0,rx:0,ry:0,rz:0,wx:0,wy:0,wz:0,physics:2};stepLooseTablet(p,c,[c],.02,()=>-10,()=>[]);assert.equal(p.vx,-3);assert.ok(p.x<-.97);assert.ok(p.vy<0);
});
test('native driver-side wall blocks a tablet at the doorway when closed and permits outward motion when open',()=>{
 for(const open of[false,true]){const c=car(),p={holder:0};c.driverDoor=open;c.driverDoorAngle=open?80:0;releaseTablet(p,c);discardTabletSimulation(p);Object.assign(p,{x:.5,y:1.15,z:.1,vx:4,vy:0,vz:0,qx:0,qy:0,qz:0,qw:1});let lost=false;for(let i=0;i<30;i++){tick(p,c);if(!p.inCabin){lost=true;assert.ok(p.lx>.75,'leaves through positive-X driver door');break;}}assert.equal(lost,open);discardTabletSimulation(p);}
});
