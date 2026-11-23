import test from 'node:test';import assert from 'node:assert/strict';
import {createRagdoll,stepRagdoll,encodeRagdoll,decodeRagdoll,RAGDOLL,beginSpectatorRagdoll,stepSpectatorBodies}from'../shared/spectator-ragdoll.js';
const person={id:0,x:0,y:0,z:0,yaw:Math.PI,phase:0,variant:0,scale:1};
function setup(speed=14){const car={team:0,x:0,y:.68,z:-1.9,yaw:0,vx:0,vz:speed,dead:false,finish:-1},hit={id:0,time:0,x:0,y:0,z:0,team:0,scale:1,car:{...car}};return{car,hit,body:createRagdoll(hit,person)};}
test('a front hit folds over the bonnet and windshield, tumbles over the roof and settles with intact joints',()=>{
 const{car,body}=setup();let hood=false,glass=false,overRoof=false,maxHeight=0;
 for(let tick=0;tick<300;tick++){car.z+=car.vz*.02;stepRagdoll(body,.02,[car],()=>0);hood||=Boolean(body.everContacts&1);glass||=Boolean(body.everContacts&2);overRoof||=body.points[2]-car.z<.2&&body.points[1]>1.6;for(let i=1;i<48;i+=3)maxHeight=Math.max(maxHeight,body.points[i]);assert.ok(body.points.every(Number.isFinite));}
 assert.ok(hood&&glass&&overRoof,JSON.stringify({hood,glass,overRoof}));assert.ok(maxHeight<4,'body does not launch like a physics explosion');assert.ok(body.settled);assert.ok(body.points[10]>=.149);for(const[a,b,length]of body.links){const d=Math.hypot(...[0,1,2].map(j=>body.points[a*3+j]-body.points[b*3+j]));assert.ok(Math.abs(d-length)<.035,`joint ${a}/${b}: ${d} vs ${length}`);}
});
test('collision replay is bit deterministic, handles braking/turning cars and never pushes the car',()=>{
 const a=setup(20),b=setup(20);for(let i=0;i<200;i++){for(const s of[a,b]){s.car.yaw+=i>15?.005:0;s.car.vz*=i>25?.97:1;s.car.x+=Math.sin(s.car.yaw)*s.car.vz*.02;s.car.z+=Math.cos(s.car.yaw)*s.car.vz*.02;const before=structuredClone(s.car);stepRagdoll(s.body,.02,[s.car],(x,z)=>Math.sin(z*.01)*.05);assert.deepEqual(s.car,before);}assert.deepEqual(a.body.points,b.body.points);}
});
test('compact joint poses round-trip within 2.5 mm per coordinate at 128 bytes per body',()=>{
 const{body}=setup(),origin=[0,0,0],encoded=encodeRagdoll(body.points,origin),decoded=decodeRagdoll(encoded,origin);assert.equal(encoded.length,128);for(let i=0;i<48;i++)assert.ok(Math.abs(decoded[i]-body.points[i])<=.002501);assert.equal(decodeRagdoll('',origin),null);
});
test('maximum active crowd physics and snapshot size stay bounded; bodies fade but hits remain until retry',()=>{
 const world={elapsed:0,cars:[],spectatorHits:[],spectatorBodies:[]};for(let id=0;id<96;id++){const{hit}=setup();hit.id=id;world.spectatorHits.push(hit);beginSpectatorRagdoll(world,hit,{...person,id,x:id*.1});}const times=[];
 for(let tick=0;tick<150;tick++){world.elapsed+=.02;const start=performance.now();stepSpectatorBodies(world,.02,{points:[{x:0,y:0,z:0}]});times.push(performance.now()-start);assert.ok(world.spectatorBodies.length<=RAGDOLL.maxVisible);assert.ok(world.spectatorBodies.filter(b=>b.a).length<=RAGDOLL.maxActive);}
 assert.ok(JSON.stringify(world.spectatorBodies).length<2400);world.elapsed=10;stepSpectatorBodies(world,.02,{points:[{x:0,y:0,z:0}]});assert.deepEqual(world.spectatorBodies,[]);assert.equal(world.spectatorHits.length,96);assert.ok(world.spectatorHits.every(h=>Object.keys(h).length===3));
 const sorted=times.toSorted((a,b)=>a-b);assert.ok(sorted[Math.floor(sorted.length*.95)]<20,'ragdolls fit within the authority tick budget');console.log(JSON.stringify({eightBodiesTickMedianMs:sorted[Math.floor(sorted.length*.5)],eightBodiesTickP95Ms:sorted[Math.floor(sorted.length*.95)]}));
});
