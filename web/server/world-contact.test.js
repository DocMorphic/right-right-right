import test from'node:test';import assert from'node:assert/strict';
import './spectator-terrain.js';
import{readFileSync}from'node:fs';
import{generateCourse}from'../shared/course.js';
import{nativeTerrainHeight,nativeTrees,worldCollision,registerWorldCollision,buildPropSurface}from'../shared/world-collision.js';
import{RoadSurface}from'../shared/road-surface.js';
import{makeWorld,stepWorld,stepCar,CAR}from'../shared/physics.js';
import{releaseTablet,stepLooseTablet,tabletCorners,tabletExtents}from'../shared/tablet-physics.js';

test('native car support follows original off-road terrain vertices and rock/stump geometry, not the road plane',()=>{
 for(let i=1;i<=3;i++){const c=generateCourse(1,'coop',0,1000+i),s=worldCollision(c),spec=s.terrain,bytes=readFileSync(new URL('../public'+spec.heightUrl,import.meta.url)),r=spec.resolution,surface=new RoadSurface(c);assert.equal(s.heights.byteLength,bytes.length);let checked=0,range=[];
  for(let z=15;z<r-15;z+=47)for(let x=15;x<r-15;x+=41){const wx=spec.matrix[12]-x*spec.size[0]/(r-1),wz=spec.matrix[14]+z*spec.size[2]/(r-1),expected=bytes.readUInt16LE((z*r+x)*2)/spec.heightDivisor*spec.spacing[1]+spec.matrix[13],h=nativeTerrainHeight(c,wx,wz);assert.ok(Math.abs(h-expected)<1e-7);range.push(h);const road=surface.height(wx,wz,-999);assert.ok(road!==-999&&Number.isFinite(road));checked++;}
  assert.ok(checked>50);assert.ok(Math.max(...range)-Math.min(...range)>2);assert.equal(nativeTerrainHeight(c,10000,10000),null);assert.ok(s.props.triangles>20000);
 }
});
test('existing background forest trunks stop a fast car; terrain landings alone never TREEd',()=>{
 const course=generateCourse(7,'coop',0,1001),tree=nativeTrees(course)[100],h=nativeTerrainHeight(course,tree.x,tree.z),w=makeWorld(course,'coop',1);w.phase='running';const car=w.cars[0];Object.assign(car,{x:tree.x,z:tree.z-4,y:h+CAR.height,groundHeight:h,vx:0,vz:40,speed:40,yaw:0,grounded:true,vy:0});
 for(let i=0;i<15&&!car.dead;i++)stepWorld(w,[{throttle:1}],.02,course);assert.ok(car.dead);assert.equal(w.stats.treeDeaths,1);
 const empty={seed:1,width:5,trees:[],mud:[],points:Array.from({length:300},(_,i)=>({x:0,y:20+Math.sin(i*.03)*3,z:i}))},s=makeWorld(empty,'coop',1);s.phase='running';Object.assign(s.cars[0],{grounded:false,y:27,vy:-10,vz:12,speed:12});for(let i=0;i<180;i++)stepWorld(s,[{}],.02,empty);assert.equal(s.cars[0].dead,false);assert.equal(s.stats.treeDeaths,0);assert.ok(s.cars[0].grounded);
});
test('off-road cars rest on the visible slope and a car beyond the authored terrain falls instead of riding an invisible plane',()=>{
 const course=generateCourse(1,'coop',0,1001),s=worldCollision(course),p={x:-200,z:400},h=new RoadSurface(course).support(p.x,p.z,0),car=makeWorld(course,'coop',1).cars[0];Object.assign(car,{...p,y:h+.68,groundHeight:h,vx:0,vz:0,speed:0});for(let i=0;i<50;i++)stepCar(car,{},.02,course);assert.ok(Math.abs(car.y-.68-h)<1e-8);
 Object.assign(car,{x:10000,z:10000,y:10,vy:0,grounded:true});for(let i=0;i<25;i++)stepCar(car,{},.02,course);assert.ok(car.y<9);assert.equal(car.grounded,false);assert.equal(car.dead,false);
});
test('settled tablets stay inside with an open door until sustained lateral force tips them out; outside tablets collide with uneven ground',()=>{
 const car={x:0,y:.68,z:0,yaw:0,vx:0,vz:0,vy:0,door:true,doorAngle:90},p={};releaseTablet(p,car);for(let i=0;i<150;i++)stepLooseTablet(p,car,[car],.02,()=>0,()=>[]);assert.ok(p.inCabin);const initial={x:p.lx,z:p.lz};for(let i=0;i<500;i++)stepLooseTablet(p,car,[car],.02,()=>0,()=>[]);assert.ok(p.inCabin);assert.ok(Math.hypot(p.lx-initial.x,p.lz-initial.z)<.01);
 let exited=false;for(let i=0;i<500;i++){car.vx+=.48;car.x+=car.vx*.02;stepLooseTablet(p,car,[car],.02,()=>0,()=>[]);if(!p.inCabin){exited=true;break;}}assert.ok(exited,'real lateral force can still eject the loose tablet through the open door');
 Object.assign(p,{x:3,y:4,z:0,vx:0,vy:0,vz:0});const floor=(x,z)=>.5+x*.1;for(let i=0;i<300;i++)stepLooseTablet(p,car,[],.02,floor,()=>[]);const gaps=tabletCorners(p).map(([x,y,z])=>p.y+y-floor(p.x+x,p.z+z)).sort((a,b)=>a-b);assert.ok(gaps[0]>=.001&&gaps[3]<.004,'all four lower corners rest on the sloped surface');assert.ok([p.x,p.y,p.z,p.rx,p.ry,p.rz].every(Number.isFinite));
});
test('an original rock protruding through the road remains a nonfatal support surface',()=>{
 const positions=[-1,1,-1,1,1,-1,1,1,1,-1,1,1],indices=[0,1,2,0,2,3];registerWorldCollision('rock-fixture',{props:buildPropSurface({Rock:{positions,indices}},[{model:'Rock',position:[0,0,0],yaw:0,scale:1}])});
 const surface=new RoadSurface({nativeScene:'rock-fixture',roadMesh:{positions:positions.map((v,i)=>i%3===1?0:v),indices}});assert.equal(surface.height(0,0,-2),1,'visible rock is not ignored just because a road triangle exists below it');
});
test('fast loose-tablet rotation is resolved by physical contacts without crossing the dash or closed doors',()=>{
 const car={x:0,y:.68,z:0,yaw:0,vx:0,vz:0,vy:0,door:false,doorAngle:0},p={};releaseTablet(p,car);p.wy=30;for(let i=0;i<400;i++){stepLooseTablet(p,car,[car],.02,()=>0,()=>[]);const e=tabletExtents(p);assert.ok(p.lz+e[2]<=.56);assert.ok(Math.abs(p.lx)+e[0]<=.71);assert.ok(p.inCabin);}
});
