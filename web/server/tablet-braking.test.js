import test from'node:test';import assert from'node:assert/strict';import{Quaternion,Euler,Vector3}from'three';
import REFERENCE from'../client/fixtures/native-tablet-braking.json'with{type:'json'};
import{releaseTablet,stepLooseTablet}from'../shared/tablet-physics.js';import{discardTabletSimulation}from'../shared/tablet-rigidbody.js';
import{newRoom,commandRoom,advanceRoom,courseFor}from'./rooms.js';import{stepWorld,applyActions}from'../shared/physics.js';
function fixture(name,{speed}={}){
 const ref=REFERENCE.rows.find(r=>r.scenario===name),q=new Quaternion(ref.carRotation[0],-ref.carRotation[1],-ref.carRotation[2],ref.carRotation[3]).normalize(),e=new Euler().setFromQuaternion(q,'YXZ'),f=new Vector3(0,0,1).applyQuaternion(q),v=speed??(ref.crash||ref.brake&&18||0),c={x:1500,y:.68,z:-3000,yaw:e.y,vx:f.x*v,vz:f.z*v,vy:f.y*v,door:false,doorAngle:0,groundSlopeX:-Math.tan(e.x)*Math.sin(e.y)+Math.tan(e.z)*Math.cos(e.y),groundSlopeZ:-Math.tan(e.x)*Math.cos(e.y)-Math.tan(e.z)*Math.sin(e.y)},p={holder:name.startsWith('driver')?0:1};releaseTablet(p,c);
 const tick=()=>{c.x+=c.vx*.02;c.y+=c.vy*.02;c.z+=c.vz*.02;stepLooseTablet(p,c,[c],.02,()=>-100,()=>[]);};
 for(let i=0;i<ref.warmupSeconds*50;i++)tick();
 return{ref,c,p,tick,step(){for(const[k,dir]of[['vx',f.x],['vy',f.y],['vz',f.z]])c[k]-=dir*ref.brake*.02;tick();},free:()=>discardTabletSimulation(p)};
}
for(const speed of[6,18,30])test(`a loose tablet at ${speed} m/s retains the parked contact trajectory without added cabin energy`,()=>{
 const a=fixture('passenger-rest'),b=fixture('passenger-rest',{speed});try{for(let i=0;i<150;i++){a.tick();b.tick();assert.ok(b.p.inCabin);assert.ok(Math.hypot(b.p.lx-a.p.lx,b.p.ly-a.p.ly,b.p.lz-a.p.lz)<.045,'constant translation must not throw the tablet around');}}finally{a.free();b.free();}
});
for(const name of['passenger-brake4','passenger-brake8','passenger-brake14','passenger-settled-brake4','passenger-settled-brake8','passenger-settled-brake14'])test(`${name}: slide/rest trajectory stays within 4cm RMS of original capture`,()=>{
 const f=fixture(name);try{let error=0,n=0;for(let i=0;i<50;i++){f.step();const r=f.ref.checkpoints.find(r=>Math.abs(r.time-(i+1)*.02)<1e-5);if(r){error+=(f.p.lx+r.position[0])**2+(f.p.ly-r.position[1])**2+(f.p.lz-r.position[2])**2;n++;}assert.ok(f.p.inCabin);}assert.ok(Math.sqrt(error/n)<.04,`RMS ${Math.sqrt(error/n)}m`);}finally{f.free();}
});
for(const name of['passenger-settled-crash2','passenger-settled-crash6','passenger-settled-crash12','driver-settled-crash6'])test(`${name}: abrupt-stop contact stays inside and follows the original envelope`,()=>{
 const f=fixture(name);try{f.c.vx=f.c.vy=f.c.vz=0;let error=0,n=0;for(let i=0;i<100;i++){f.step();const r=f.ref.checkpoints.find(r=>Math.abs(r.time-(i+1)*.02)<1e-5);if(r&&i<50){error+=(f.p.lx+r.position[0])**2+(f.p.ly-r.position[1])**2+(f.p.lz-r.position[2])**2;n++;}assert.ok(f.p.inCabin);assert.ok([f.p.x,f.p.y,f.p.z,f.p.qx,f.p.qy,f.p.qz,f.p.qw].every(Number.isFinite));assert.ok(Math.abs(f.p.lx)<.76&&f.p.lz<.57);}assert.ok(Math.sqrt(error/n)<.105,`RMS ${Math.sqrt(error/n)}m`);}finally{f.free();}
});
test('a crash settles loose props after the result while car, timer and input stay stopped, then stops background work',()=>{
 const session={id:'settle-driver',name:'Driver'},room=newRoom('ABC123',session,{mode:'coop',practice:true,profile:7,seed:12345},1000);commandRoom(room,session,{type:'ready',ready:true,catalog:9},1000);commandRoom(room,session,{type:'start'},1000);advanceRoom(room,1002);advanceRoom(room,1004);
 const w=room.world,c=w.cars[0];applyActions(w,0,{pitch:60,yaw:0,actions:[{id:1,kind:'grab'}]});assert.equal(w.tablets[0].holder,-1);c.dead=true;c.vx=c.vz=c.speed=0;
 // End via the ordinary world transition, then use the room scheduler itself.
 stepWorld(w,[{},{}],.02,courseFor(room));assert.equal(w.phase,'ended');const clock=w.elapsed,carPose=[c.x,c.y,c.z],pad=w.tablets[0],initial=[pad.x,pad.y,pad.z],seq=w.seq;advanceRoom(room,1004.5);assert.ok(Math.hypot(pad.x-initial[0],pad.y-initial[1],pad.z-initial[2])>.01);assert.equal(w.elapsed,clock);assert.deepEqual([c.x,c.y,c.z],carPose);assert.ok(w.seq>seq);advanceRoom(room,1006.5);advanceRoom(room,1008);assert.equal(w.tabletSettleRemaining,0);const settled=[pad.x,pad.y,pad.z,w.seq];advanceRoom(room,1009);assert.deepEqual([pad.x,pad.y,pad.z,w.seq],settled);assert.equal(w.elapsed,clock);discardTabletSimulation(pad);
});
for(const down of[1,3])test(`a ${down} m/s interior drop rebounds within the original vertical envelope and settles without escape`,()=>{
 const f=fixture(`passenger-bounce${down}`);try{discardTabletSimulation(f.p);const q=new Quaternion(f.ref.carRotation[0],-f.ref.carRotation[1],-f.ref.carRotation[2],f.ref.carRotation[3]),point=new Vector3(-.333165,1.15,.28).applyQuaternion(q);Object.assign(f.p,{x:f.c.x+point.x,y:f.c.y-.68+point.y,z:f.c.z+point.z,vx:0,vy:-down,vz:0,wx:0,wy:0,wz:0});let peak=-Infinity;for(let i=0;i<150;i++){f.tick();if(i>=2&&i<50)peak=Math.max(peak,f.p.vy);assert.ok(f.p.inCabin);assert.ok([f.p.x,f.p.y,f.p.z].every(Number.isFinite));}assert.ok(peak>.1,'real contact must rebound rather than stick or teleport');assert.ok(Math.abs(peak-f.ref.peakUp)<.35,`native peak ${f.ref.peakUp}, browser ${peak}`);assert.ok(Math.hypot(f.p.lvx,f.p.lvy,f.p.lvz)<.2,'contact should settle after its rebound');}finally{f.free();}
});
