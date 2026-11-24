import * as THREE from 'three';
import {LIVE_ROAD} from '../shared/live-road.js';
import {roadBuffers} from './live-road-buffers.js';
const UP=new THREE.Vector3(0,1,0),CAPACITY=512;
/** Fixed GPU buffers + pooled original forest instances. No cabin rebuilds. */
export class LiveRoadView {
  constructor(world,course,{roadMaterial,groundMaterial,assets,manifest,onError=()=>{},onTrees=()=>{}}){
    this.root=new THREE.Group();world.add(this.root);this.manifest=manifest;this.groups=[];this.forest=[];this.dirty=true;this.revision=course.roadPlan.revision;
    this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.placement=new THREE.Matrix4();this.matrix=new THREE.Matrix4();
    const geometry=this.geometry=new THREE.BufferGeometry(),positions=new Float32Array(LIVE_ROAD.maxPoints*6),uvs=new Float32Array(LIVE_ROAD.maxPoints*4),normals=new Float32Array(LIVE_ROAD.maxPoints*6),indices=new Uint16Array((LIVE_ROAD.maxPoints-1)*6);
    for(let i=0;i<LIVE_ROAD.maxPoints;i++){normals[i*6+1]=normals[i*6+4]=1;if(i){const n=i*2;indices.set([n-2,n+1,n-1,n-2,n,n+1],(i-1)*6);}}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(new THREE.BufferAttribute(indices,1));
    const road=new THREE.Mesh(geometry,roadMaterial);road.receiveShadow=true;this.root.add(road);this.install(roadBuffers(course));
    this.groundGeometry=new THREE.PlaneGeometry(2048,2048);this.groundGeometry.rotateX(-Math.PI/2);const gp=this.groundGeometry.attributes.position,gu=this.groundGeometry.attributes.uv;for(let i=0;i<gp.count;i++)gu.setXY(i,gp.getX(i)/4.5,gp.getZ(i)/4.5);
    this.ground=new THREE.Mesh(this.groundGeometry,groundMaterial);this.ground.position.y=19.75;this.ground.receiveShadow=true;this.root.add(this.ground);
    for(let variant=0;variant<6;variant++){const source=assets['tree'+variant];source.updateMatrixWorld(true);source.traverse(mesh=>{if(!mesh.isMesh)return;const instances=new THREE.InstancedMesh(mesh.geometry,mesh.material,CAPACITY);instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instances.count=0;instances.castShadow=true;instances.receiveShadow=true;this.root.add(instances);this.groups.push({variant,instances,base:mesh.matrixWorld.clone()});});}
    this.worker=new Worker(new URL('./live-road-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=event=>{this.busy=false;const data=event.data;if(data.error)onError(data.error);else if(data.revision===this.revision){this.install(data);this.forest=data.forest;this.dirty=true;onTrees(data.trees);}if(this.pending){const plan=this.pending;this.pending=null;this.request(plan);}};
    this.worker.onerror=()=>onError('Road scenery could not be prepared.');this.request(course.roadPlan);
  }
  install(data){
    if(data.count>LIVE_ROAD.maxPoints)throw Error('Road exceeds the fixed render capacity');
    for(const[name,array]of[['position',data.positions],['uv',data.uvs]]){const attribute=this.geometry.attributes[name];attribute.array.set(array);attribute.clearUpdateRanges();attribute.addUpdateRange(0,array.length);attribute.needsUpdate=true;}
    this.geometry.setDrawRange(0,(data.count-1)*6);
    const box=this.geometry.boundingBox??=new THREE.Box3();box.makeEmpty();for(let i=0;i<data.positions.length;i+=3)box.expandByPoint(this.position.fromArray(data.positions,i));box.getBoundingSphere(this.geometry.boundingSphere??=new THREE.Sphere());
  }
  request(plan){this.revision=plan.revision;if(this.busy){this.pending=plan;return;}this.busy=true;this.worker.postMessage(plan);}
  update(x,z,far=200,low=false){
    this.ground.position.x=Math.round(x/288)*288;this.ground.position.z=Math.round(z/288)*288;
    if(!this.dirty&&Math.hypot(x-(this.lastX??Infinity),z-(this.lastZ??Infinity))<16)return;
    this.lastX=x;this.lastZ=z;this.dirty=false;
    for(const group of this.groups){const data=this.forest[group.variant]||[],center=this.manifest.models.trees[group.variant].collider?.center||[0,0,0];let count=0;
      for(let i=0;i<data.length&&count<CAPACITY;i+=5){const tx=data[i],ty=data[i+1],tz=data[i+2],yaw=data[i+3],s=data[i+4];if((tx-x)**2+(tz-z)**2>far*far||low&&i%10&&Math.hypot(tx-x,tz-z)>60)continue;
        const dx=(Math.cos(yaw)*center[0]+Math.sin(yaw)*center[2])*s,dz=(-Math.sin(yaw)*center[0]+Math.cos(yaw)*center[2])*s;
        this.placement.compose(this.position.set(tx-dx,ty,tz-dz),this.rotation.setFromAxisAngle(UP,yaw),this.scale.setScalar(s));this.matrix.multiplyMatrices(this.placement,group.base);group.instances.setMatrixAt(count++,this.matrix);
      }group.instances.count=count;group.instances.instanceMatrix.needsUpdate=true;group.instances.computeBoundingSphere();group.instances.castShadow=!low;
    }
  }
  dispose(){this.worker.terminate();this.geometry.dispose();this.groundGeometry.dispose();for(const group of this.groups)group.instances.dispose();this.root.removeFromParent();}
}
