import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {Font} from 'three/addons/loaders/FontLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CockpitCluster,makeClusterTextGeometry,roundClusterSpeed} from './cockpit-cluster.js';

const asset=path=>new URL(`../public/assets/${path}`,import.meta.url);
const metadata=()=>JSON.parse(readFileSync(asset('cockpit.json'),'utf8'));
const font=()=>new Font(JSON.parse(readFileSync(asset('fonts/NativeCockpit.typeface.json'),'utf8')));

// Use the actual exported car hierarchy and authored transforms. Loading only
// its nodes avoids DOM/image/GPU dependencies in this focused renderer check.
function originalCar(){
 const bytes=readFileSync(asset('car.glb')),length=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+length));
 const nodes=data.nodes.map(spec=>{const node=new THREE.Group();node.name=spec.name||'';if(spec.translation)node.position.fromArray(spec.translation);if(spec.rotation)node.quaternion.fromArray(spec.rotation);if(spec.scale)node.scale.fromArray(spec.scale);return node;});
 data.nodes.forEach((spec,i)=>{for(const child of spec.children||[])nodes[i].add(nodes[child]);});
 const root=new THREE.Group();for(const index of data.scenes[data.scene||0].nodes)root.add(nodes[index]);root.updateMatrixWorld(true);return root;
}
const car=(speed=0)=>({speed,vx:0,vz:speed,finish:-1,dead:false,grounded:1,doorAngle:0});
function fixture(){const model=originalCar(),cluster=new CockpitCluster(model,font(),metadata());return {model,cluster};}

test('the original gauge nodes receive all eight native labels without replacing the housing',()=>{
 const model=originalCar(),before=new Set();model.traverse(node=>before.add(node));const cluster=new CockpitCluster(model,font(),metadata());
 assert.equal(cluster.ready,true);assert.equal(cluster.labels.length,8);
 assert.deepEqual(cluster.labels.map(label=>label.value).sort(),['0','0','120','160','40','80','km/h','x1000'].sort());
 assert.equal(cluster.speedNeedle.parent.name,'Speedo');assert.equal(cluster.rpmNeedle.parent.name,'Tach');
 const added=[];model.traverse(node=>{if(!before.has(node))added.push(node);});assert.equal(added.length,8);assert.ok(added.every(node=>node.name==='NativeClusterText'));
 for(const label of cluster.labels){const positions=label.mesh.geometry.attributes.position;assert.ok(positions.count>0);assert.ok(Array.from(positions.array).every(Number.isFinite));assert.equal(label.mesh.material.toneMapped,false);assert.equal(label.mesh.material.fog,false);}
 assert.ok(Math.abs(cluster.speedNeedle.rotation.z-120*Math.PI/180)<1e-7);
 cluster.dispose();
});

test('actual GLTFLoader duplicate-name suffixes retain source-ID needle and label bindings',async()=>{
 const loader=new GLTFLoader();
 // Parse the actual GLB's nodes/meshes with the production loader. Only image
 // materials are stubbed so this check needs no DOM, bitmap decoder or GPU.
 loader.register(parser=>({name:'NODE_TEST_MATERIALS',loadMaterial:index=>Promise.resolve(new THREE.MeshBasicMaterial({name:parser.json.materials[index]?.name||''}))}));
 const bytes=readFileSync(asset('car.glb')),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const {scene}=await loader.parseAsync(buffer,'');const cluster=new CockpitCluster(scene,font(),metadata());
 assert.equal(cluster.speedNeedle.name,'NeedlePivot_1');assert.equal(cluster.rpmNeedle.name,'NeedlePivot');
 assert.equal(cluster.speedNeedle.userData.unityPathId,9068);assert.equal(cluster.rpmNeedle.userData.unityPathId,9386);
 assert.equal(cluster.labels.length,8);assert.equal(cluster.readout.node.userData.unityPathId,9247);
 cluster.update(car(20),{throttle:1},1/60,'running');assert.notEqual(cluster.readout.value,'0');cluster.dispose();
 const geometries=new Set(),materials=new Set();scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of(Array.isArray(node.material)?node.material:node.material?[node.material]:[]))materials.add(material);});
 geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
});

test('speed and RPM animate independently of Web Audio with the original sweep and exponential follow',()=>{
 const a=fixture().cluster,b=fixture().cluster,dt=1/60,state=car(80/3.6);a.update(state,{throttle:1},dt,'running');
 const fraction=1-Math.exp(-14*dt);assert.ok(Math.abs(a.displayKmh-80*fraction)<1e-10);
 assert.ok(Math.abs(a.speedNeedle.rotation.z-(120-240*a.displayKmh/160)*Math.PI/180)<1e-10);
 assert.ok(Math.abs(a.rpmNeedle.rotation.z-(120-240*a.displayRpm/9000)*Math.PI/180)<1e-10);
 // Two occupants receiving the same driver command/state show the same dials.
 b.update(state,{throttle:1},dt,'running');
 for(let i=0;i<120;i++){a.update(state,{throttle:1},dt,'running');b.update(state,{throttle:1},dt,'running');}
 assert.equal(a.engine.rpm,b.engine.rpm);assert.equal(a.displayRpm,b.displayRpm);assert.equal(a.readout.value,'80');
 assert.ok(Math.abs(a.speedNeedle.rotation.z)<1e-6,'80km/h is the midpoint of the original160km/h dial');
 // Ready/countdown keys cannot make the dashboard rev before driving begins.
 const waiting=fixture().cluster;for(let i=0;i<120;i++)waiting.update(car(),{throttle:1},dt,'waiting');assert.equal(waiting.engine.rpm,1000);
 const revving=fixture().cluster;for(let i=0;i<120;i++)revving.update(car(),{throttle:1},dt,'running');assert.equal(revving.engine.rpm,8400);assert.ok(revving.displayRpm>8300);
 revving.update({...car(),elapsed:1.234},{throttle:1},dt,'running');const dip=250+850*Math.abs(Math.sin(1.234*21))*Math.abs(Math.sin(1.234*52));
 assert.ok(Math.abs(revving.rpmNeedle.rotation.z-(120-240*(revving.displayRpm-dip)/9000)*Math.PI/180)<1e-10,'limiter shakes the needle below the smoothed RPM with the recovered source curve');
 revving.engine.step=()=>[];revving.engine.limiter=.04;revving.update({...car(),elapsed:1.234},{throttle:1},0,'running');assert.ok(Math.abs(revving.rpmNeedle.rotation.z-(120-240*revving.displayRpm/9000)*Math.PI/180)<1e-10,'native gauge limiter threshold is .05, distinct from audio ducking');
 const drifting=fixture().cluster;drifting.update({...car(1),vx:6,vz:8},{},dt,'running');assert.ok(Math.abs(drifting.displayKmh-36*fraction)<1e-10,'the speedometer includes lateral drift, like the native planar speed getter');
 for(const cluster of [a,b,waiting,revving,drifting])cluster.dispose();
});

test('native glyph reflection and RoundToInt are preserved and unchanged readouts reuse geometry',()=>{
 assert.deepEqual([.5,1.5,2.5,3.5,12.49,12.51].map(roundClusterSpeed),[0,2,2,4,12,13]);
 const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(2,0);shape.lineTo(0,1);shape.closePath();
 const geometry=makeClusterTextGeometry({generateShapes:()=>[shape]},'F',{fontSize:40,characterSize:.0022,anchor:6});geometry.computeBoundingBox();
 assert.equal(geometry.boundingBox.max.x,0);assert.equal(geometry.boundingBox.min.x,-2,'new glyph vertices reflect X just like original GLB geometry');geometry.dispose();
 const {cluster}=fixture(),initial=cluster.readout.mesh.geometry;cluster.update(car(),{},1/60,'running');assert.equal(cluster.readout.mesh.geometry,initial);
 let disposed=0;initial.addEventListener('dispose',()=>disposed++);cluster.update(car(20),{},1/60,'running');assert.equal(disposed,1);assert.notEqual(cluster.readout.mesh.geometry,initial);cluster.dispose();
});

test('disposal removes only restored glyphs, restores original needle pose, and is safe twice',()=>{
 const model=originalCar(),needles=[];model.traverse(node=>{if(node.name==='NeedlePivot')needles.push({node,rest:node.quaternion.clone()});});
 const originalCount=[];model.traverse(node=>originalCount.push(node));const cluster=new CockpitCluster(model,font(),metadata());cluster.update(car(35),{throttle:1},.05,'running');
 const geometries=cluster.labels.map(label=>label.mesh.geometry),materials=[...cluster.materials.values()];let geometryDisposals=0,materialDisposals=0;
 geometries.forEach(geometry=>geometry.addEventListener('dispose',()=>geometryDisposals++));materials.forEach(material=>material.addEventListener('dispose',()=>materialDisposals++));
 cluster.dispose();cluster.dispose();assert.equal(geometryDisposals,8);assert.equal(materialDisposals,materials.length);
 const remaining=[];model.traverse(node=>remaining.push(node));assert.deepEqual(remaining,originalCount);
 for(const {node,rest} of needles)assert.ok(node.quaternion.angleTo(rest)<1e-7);
});
