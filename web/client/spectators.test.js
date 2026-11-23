import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {spectatorTemplate,SpectatorPerson} from './spectator-people.js';
import {Spectators,spectatorGround} from './spectators.js';
const asset=new URL('../public/assets/navigator-rig.glb',import.meta.url),available=fs.existsSync(asset);
async function rig(name='navigator-rig'){
 const b=fs.readFileSync(new URL(`../public/assets/${name}.glb`,import.meta.url)),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12))),start=20+b.readUInt32LE(12),bin=b.subarray(start+8,start+8+b.readUInt32LE(start));delete j.images;delete j.textures;
 for(const m of j.materials){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.normalTexture;delete m.emissiveTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;}j.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
 globalThis.ProgressEvent??=class{constructor(type,options){Object.assign(this,{type},options);}};return(await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene;
}
test('original skinned characters stand, wave articulated arms and retain a single shared draw per person',{skip:!available},async()=>{
 const sources=[await rig(),await rig('driver-rig')];
 for(let variant=0;variant<6;variant++){
  const source=sources[variant%2],before=JSON.stringify(source.toJSON()),template=spectatorTemplate(source,variant),p=new SpectatorPerson(template);let meshCount=0;p.root.traverse(n=>{if(n.isMesh)meshCount++;});assert.equal(meshCount,1);assert.ok(template.vertices>1000);assert.equal(p.mesh.geometry,template.geometry);assert.notEqual(p.mesh.skeleton,template.root.getObjectByName('OriginalSpectator').skeleton);
  p.pose(1.2,.5,variant);p.mesh.skeleton.update();p.mesh.computeBoundingBox();const bounds=new T.Box3().setFromObject(p.root,true),head=p.bones.Head.getWorldPosition(new T.Vector3()),wrist=p.bones.WristL.getWorldPosition(new T.Vector3());assert.ok(bounds.min.y>-.02&&bounds.min.y<.15,JSON.stringify(bounds));assert.ok(head.y>1.4&&head.y<2);assert.ok(wrist.y>1.0&&wrist.y<2.1,'the sampled gesture stays within an anatomically reachable cheering range');const first=wrist.clone();p.pose(1.7,.5,variant);assert.ok(p.bones.WristL.getWorldPosition(wrist).distanceTo(first)>.01,'hands move independently of the root');assert.equal(JSON.stringify(source.toJSON()),before,'source cockpit rig is untouched');p.dispose();template.geometry.dispose();template.material.dispose();
 }
});
test('native crowd grounding samples transformed original terrain heights',()=>{
 const heights=new Uint16Array([0,100,200,300]),matrix=new T.Matrix4().makeTranslation(20,5,30).toArray(),scenery={scenes:new Map([['1',{data:{terrain:{matrix,resolution:2,size:[10,10,10],heightDivisor:100,spacing:[10,1,10]}},heights:heights.buffer}]])},height=spectatorGround({nativeScene:1},scenery);assert.equal(height(15,35,0),6.5);assert.equal(height(20,30,0),5);assert.equal(height(0,0,17),17);assert.equal(spectatorGround({},null)(0,0,20),19.75);
});
test('crowd pool is bounded, impacts rest above ground and retry restores everyone',{skip:!available},async()=>{
 const oldDocument=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}})})};
 const course={points:[{x:0,y:20,z:0},{x:0,y:20,z:100}],spectators:Array.from({length:40},(_,id)=>({id,group:Math.floor(id/4),side:1,x:(id%4)*2,y:20,z:20+Math.floor(id/4)*5,yaw:0,variant:id%4,phase:id,scale:1}))},crowd=new Spectators(new T.Group(),course,await rig(),null),camera=new T.Vector3(0,21,20),hit={id:0,time:0,x:0,y:20,z:20,vx:4,vy:5,vz:2,spin:7,team:0};
 try{crowd.update({epoch:1,elapsed:4,phase:'ended',spectatorHits:[hit]},camera,4000);assert.equal(crowd.stats.total,40);assert.ok(crowd.stats.visible<=16);assert.equal(crowd.stats.hit,1);const p=crowd.assigned.get(0);assert.ok(p);p.root.updateMatrixWorld(true);p.mesh.skeleton.update();p.mesh.computeBoundingBox();assert.ok(new T.Box3().setFromObject(p.root,true).min.y>=19.76,'resting body clears the ground');
  const rest=p.root.position.clone();crowd.update({epoch:1,elapsed:5,phase:'ended',spectatorHits:[hit]},camera,5000);assert.ok(rest.distanceTo(p.root.position)<1e-6,'settled body does not drift');crowd.update({epoch:2,elapsed:0,phase:'countdown',spectatorHits:[]},camera,5001);assert.equal(crowd.stats.hit,0);assert.equal(crowd.assigned.get(0).root.rotation.x,0);crowd.update({epoch:2,elapsed:0,phase:'countdown',spectatorHits:[]},new T.Vector3(1000,20,1000),5002);assert.equal(crowd.stats.visible,0);assert.ok(crowd.pool.every(p=>!p.root.visible));
 }finally{crowd.dispose();globalThis.document=oldDocument;}
});

import {createRagdoll,stepRagdoll,encodeRagdoll} from '../shared/spectator-ragdoll.js';
import {RagdollPlayback} from './ragdoll-playback.js';
test('the original skin follows physical pelvis, head and wrist joints while tumbling',{skip:!available},async()=>{
 const template=spectatorTemplate(await rig(),0),skin=new SpectatorPerson(template),car={team:0,x:0,y:.68,z:-1.9,yaw:0,vx:0,vz:14},hit={id:0,time:0,x:0,y:0,z:0,team:0,scale:1,car:{...car}},body=createRagdoll(hit,{id:0,x:0,y:0,z:0,yaw:Math.PI,variant:0,phase:0,scale:1});
 for(let tick=0;tick<60;tick++){car.z+=.28;stepRagdoll(body,.02,[car],()=>0);skin.ragdoll(body.points);const pelvis=skin.bones.Hips.getWorldPosition(new T.Vector3());assert.ok(pelvis.distanceTo(new T.Vector3().fromArray(body.points))<.015,'skin hip follows the physical pelvis');const head=skin.bones.Head.getWorldPosition(new T.Vector3()),wrist=skin.bones.WristL.getWorldPosition(new T.Vector3());assert.ok(head.distanceTo(new T.Vector3().fromArray(body.points,9))<.19,JSON.stringify({tick,head:head.toArray(),target:Array.from(body.points.slice(9,12)),error:head.distanceTo(new T.Vector3().fromArray(body.points,9))}));assert.ok(wrist.distanceTo(new T.Vector3().fromArray(body.points,18))<.19,JSON.stringify({tick,wrist:wrist.toArray(),target:Array.from(body.points.slice(18,21)),error:wrist.distanceTo(new T.Vector3().fromArray(body.points,18))}));}
 skin.dispose();template.geometry.dispose();template.material.dispose();
});
test('both players interpolate identical server joints; retry clears old bodies and long stalls stay bounded',()=>{
 const a=new RagdollPlayback(),b=new RagdollPlayback(),points=new Float64Array(48).map((_,i)=>i*.02),origin=[0,0,0],snapshot={epoch:1,elapsed:1,cars:[{x:0,y:.68,z:0,yaw:0}],spectatorBodies:[{id:0,t:1,o:origin,p:encodeRagdoll(points,origin),a:true,c:2,team:0}]};
 for(const client of[a,b])client.accept(JSON.parse(JSON.stringify(snapshot)),1000);const moved=points.map((v,i)=>v+(i%3===2?.1:0));snapshot.elapsed=1.05;snapshot.cars[0].z=.1;snapshot.spectatorBodies[0]={...snapshot.spectatorBodies[0],t:1.05,p:encodeRagdoll(moved,origin)};for(const client of[a,b])client.accept(JSON.parse(JSON.stringify(snapshot)),1050);
 assert.deepEqual(a.sample(0,1075),b.sample(0,1075));const middle=a.sample(0,1075);assert.ok(middle.points[2]>points[2]&&middle.points[2]<moved[2]);assert.deepEqual(a.sample(0,5000).points,a.sample(0,6000).points,'a stalled socket does not start a different local physics simulation');a.accept({...snapshot,epoch:2,elapsed:0,spectatorBodies:[]},6001);assert.equal(a.sample(0,6002),null);
});
test('all six cheer styles transfer into ragdolls without a pelvis jump, including sideways leaning applause',{skip:!available},async()=>{
 const sources=[await rig(),await rig('driver-rig')];for(let variant=0;variant<6;variant++){const template=spectatorTemplate(sources[variant%2],variant),skin=new SpectatorPerson(template),person={id:0,x:0,y:0,z:0,yaw:0,variant,motion:variant,phase:0,tempo:1,scale:1},hit={id:0,time:.4,x:0,y:0,z:0,team:0,scale:1,car:{x:0,y:.68,z:-1.9,yaw:0,vx:0,vz:12}},body=createRagdoll(hit,person);skin.pose(.4,0,variant);skin.ragdoll(body.points);const pelvis=skin.bones.Hips.getWorldPosition(new T.Vector3());assert.ok(pelvis.distanceTo(new T.Vector3().fromArray(body.points))<.015,`style ${variant} displaced the physical pelvis`);skin.dispose();template.geometry.dispose();template.material.dispose();}
});
test('raised-arm cheers curl every finger into the palm rather than leaving the other steering fingers extended',{skip:!available},async()=>{
 for(const name of['navigator-rig','driver-rig']){const template=spectatorTemplate(await rig(name),0),open=new SpectatorPerson(template),fist=new SpectatorPerson(template);open.pose(0,0,0,null,false,{motion:0});fist.pose(0,0,0,null,false,{motion:2});for(const side of['L','R'])for(const finger of['Index','Middle','Ring','Pinky']){const gap=p=>p.bones[finger+'4'+side].getWorldPosition(new T.Vector3()).distanceTo(p.bones['Wrist'+side].getWorldPosition(new T.Vector3()));assert.ok(gap(fist)<gap(open)-.01,`${name} ${finger}${side} did not close`);}open.dispose();fist.dispose();template.geometry.dispose();template.material.dispose();}
});
