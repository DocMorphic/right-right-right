import * as T from 'three';
import {RagdollPlayback} from './ragdoll-playback.js';
import {RAGDOLL} from '../shared/spectator-ragdoll.js';
import {generateSpectators,sampleSpectatorHit} from '../shared/spectators.js';
import {crowdPocket} from './spectator-pocket.js';
import {spectatorTemplate,SpectatorPerson} from './spectator-people.js';

export function spectatorGround(course,scenery){
 const source=scenery?.scenes.get(String(course.nativeScene));if(!source)return(x,z,fallback)=>fallback-.25;
 const spec=source.data.terrain,inverse=new T.Matrix4().fromArray(spec.matrix).invert(),transform=new T.Matrix4().fromArray(spec.matrix),data=new DataView(source.heights),point=new T.Vector3(),r=spec.resolution;
 const at=(x,z)=>data.getUint16((z*r+x)*2,true)/spec.heightDivisor*spec.spacing[1];
 return(x,z,fallback)=>{point.set(x,fallback,z).applyMatrix4(inverse);const u=-point.x/spec.size[0]*(r-1),v=point.z/spec.size[2]*(r-1);if(u<0||v<0||u>r-1||v>r-1)return fallback;const x0=Math.floor(u),z0=Math.floor(v),x1=Math.min(r-1,x0+1),z1=Math.min(r-1,z0+1),a=u-x0,b=v-z0,h=(at(x0,z0)*(1-a)+at(x1,z0)*a)*(1-b)+(at(x0,z1)*(1-a)+at(x1,z1)*a)*b;point.y=h;return point.applyMatrix4(transform).y;};
}
function tapeTexture(){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=16;const c=canvas.getContext('2d');c.fillStyle='#f2eee5';c.fillRect(0,0,128,16);c.fillStyle='#c44436';c.beginPath();c.moveTo(0,0);c.lineTo(64,0);c.lineTo(48,16);c.lineTo(0,16);c.closePath();c.fill();c.beginPath();c.moveTo(112,0);c.lineTo(128,0);c.lineTo(128,16);c.lineTo(96,16);c.closePath();c.fill();const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;texture.repeat.x=4;return texture;
}
export class Spectators{
 constructor(world,course,source,scenery){
  this.ground=spectatorGround(course,scenery);this.people=course.spectators||generateSpectators(course);this.root=new T.Group();this.root.name='RoadsideSpectators';world.add(this.root);this.templates=Array.from({length:6},(_,i)=>spectatorTemplate(source.navigator?(i%2?source.driver:source.navigator):source,i));this.pool=[];this.assigned=new Map();this.pockets=[];this.lastElapsed=0;this.playback=new RagdollPlayback();
  const tape=tapeTexture();this.resources={tape,postGeometry:new T.CylinderGeometry(.018,.018,1,5),baseGeometry:new T.BoxGeometry(.25,.05,.25),coneGeometry:new T.ConeGeometry(.17,.4,4),bandGeometry:new T.CylinderGeometry(.065,.1,.08,4),tapeGeometry:new T.BoxGeometry(1,.045,.018),postMaterial:new T.MeshStandardMaterial({color:'#343b36',roughness:.95}),darkMaterial:new T.MeshStandardMaterial({color:'#3c3a32',roughness:1}),coneMaterial:new T.MeshStandardMaterial({color:'#dd692e',roughness:.95}),whiteMaterial:new T.MeshStandardMaterial({color:'#ebe5cd',roughness:1}),tapeMaterial:new T.MeshStandardMaterial({map:tape,roughness:1})};
  const groups=new Map();for(const p of this.people){const key=`${p.group}:${p.side}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}for(const people of groups.values())if(people.length>1){const pocket=crowdPocket(course,people,this.ground,this.resources);this.root.add(pocket);this.pockets.push(pocket);}
  // Fixed pool bounds CPU skinning and draw calls independently of map length.
  for(let variant=0;variant<4;variant++)for(let i=0;i<4;i++){const person=new SpectatorPerson(this.templates[variant]);person.variant=variant;person.root.visible=false;this.root.add(person.root);this.pool.push(person);}
 }
 update(snapshot,camera,now,quality='auto',cars=[]){
  if(snapshot!==this.snapshot){this.snapshot=snapshot;this.receivedAt=now;if(snapshot)this.playback.accept(snapshot,now);}
  const elapsed=(snapshot?.elapsed??0)+(snapshot?.phase==='running'?Math.max(0,Math.min(.15,(now-(this.receivedAt??now))/1000)):0),hits=new Map((snapshot?.spectatorHits||[]).map(hit=>[hit.id,hit])),distance=quality==='low'?65:100;
  if(snapshot?.epoch!==this.epoch||elapsed<this.lastElapsed){this.assigned.clear();for(const person of this.pool){person.root.visible=false;person.lastTick=-Infinity;person.restKey=null;}this.epoch=snapshot?.epoch;}this.lastElapsed=elapsed;
  const candidates=this.people.map(p=>{const hit=hits.get(p.id),ragdoll=this.playback.sample(p.id,now,snapshot?.phase==='running'),pose=ragdoll?{x:ragdoll.points[0],y:ragdoll.points[1],z:ragdoll.points[2]}:hit?sampleSpectatorHit(hit,elapsed):p;return{p,hit,pose,ragdoll,d:(pose.x-camera.x)**2+(pose.z-camera.z)**2};}).filter(c=>c.d<distance*distance&&!(c.hit?.car&&!c.ragdoll)&&!(c.hit&&elapsed-c.hit.time>RAGDOLL.lifetime)).sort((a,b)=>Number(Boolean(b.ragdoll?.body.a))-Number(Boolean(a.ragdoll?.body.a))||a.d-b.d),selected=[];const counts=[0,0];for(const candidate of candidates)if(counts[candidate.p.variant%2]++<8)selected.push(candidate);
  const ids=new Set(selected.map(c=>c.p.id));for(const[id,person]of this.assigned)if(!ids.has(id)){person.root.visible=false;this.assigned.delete(id);}
  const occupied=new Set(this.assigned.values());let active=0;
  for(const{p,hit,pose,ragdoll,d}of selected){let person=this.assigned.get(p.id);if(!person){person=this.pool.find(v=>v.variant%2===p.variant%2&&!occupied.has(v));if(!person)continue;person.variant=p.variant;person.mesh.geometry=this.templates[p.variant].geometry;person.mesh.material=this.templates[p.variant].material;this.assigned.set(p.id,person);occupied.add(person);person.lastTick=-Infinity;person.restKey=null;}
   const root=person.root;root.visible=true;root.scale.setScalar(p.scale);
   if(ragdoll){
    const points=ragdoll.points,visual=cars[ragdoll.body.team]?.model;
    // Keep contact poses attached to the presented hood/windshield, including
    // the driver's immediate car prediction. The joint pose remains authoritative.
    if(visual&&ragdoll.body.c&7){const source=ragdoll.car,cs=Math.cos(source.yaw),sn=Math.sin(source.yaw),point=new T.Vector3();visual.updateWorldMatrix(true,false);for(let i=0;i<48;i+=3){const dx=points[i]-source.x,dz=points[i+2]-source.z;point.set(cs*dx-sn*dz,points[i+1]-(source.y-.68),sn*dx+cs*dz).applyMatrix4(visual.matrixWorld);point.toArray(points,i);}}
    person.ragdoll(points);
   }else{
   const floor=this.ground(pose.x,pose.z,p.y),startFloor=this.ground(p.x,p.z,p.y),air=hit?pose.y-hit.y:0;
   // Rotate around the torso during flight, then rest on the ground. This avoids
   // rigid people spinning around their feet and clipping a metre underground.
   root.rotation.set(hit?pose.roll:0,p.yaw+(hit?pose.yawOffset:0),hit?Math.sin(pose.t*5+p.phase)*.22*(pose.settled?0:1):0,'YXZ');
   const pivot=.9*p.scale,rotationOffset=new T.Vector3(0,-pivot,0).applyQuaternion(root.quaternion);
   if(hit){const center=pose.settled?floor+.25:startFloor+air+pivot;root.position.set(pose.x+rotationOffset.x,center+rotationOffset.y,pose.z+rotationOffset.z);}else root.position.set(p.x,floor,p.z);
   person.pose(hit?(pose.settled?pose.flightTime:pose.t):elapsed,p.phase,p.variant,hit?pose.t:null,pose.settled,{motion:p.motion??p.variant,tempo:p.tempo??1});
   if(hit&&pose.settled){const key=`${snapshot.epoch}:${p.id}:${hit.time}`;if(person.restKey!==key){person.root.updateMatrixWorld(true);person.mesh.skeleton.update();person.mesh.computeBoundingBox();person.restOffset=floor+.02-new T.Box3().setFromObject(person.root,true).min.y;person.restKey=key;}person.root.position.y+=person.restOffset;}
   }
   person.mesh.castShadow=d<35*35;active++;
  }
  for(const pocket of this.pockets){const c=pocket.userData.center;pocket.visible=(c.x-camera.x)**2+(c.z-camera.z)**2<distance*distance;}
  this.stats={total:this.people.length,visible:active,hit:hits.size,skinDraws:active};
 }
 dispose(){for(const pocket of this.pockets)pocket.userData.dispose?.();for(const p of this.pool)p.dispose();for(const t of this.templates){t.geometry.dispose();t.material.dispose();}for(const r of Object.values(this.resources))r.dispose?.();this.root.removeFromParent();}
}
