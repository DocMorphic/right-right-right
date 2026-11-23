import * as T from 'three';
import {sampleCheer} from '../shared/spectator-cheering.js';
import {JOINT} from '../shared/spectator-ragdoll.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original Casual2 meshes, skin weights and faces. Compact each material's
// indexed vertices into one vertex-coloured skin: one draw, not ten, per person.
const PALETTES=[{shirt:'#eee5d6',pants:'#466789',skin:'#d2a77e',hair:'#32261f'}, {shirt:'#527846',pants:'#303d40',skin:'#e1b18b',hair:'#b8a26e'}, {shirt:'#447bba',pants:'#395a79',skin:'#724b37',hair:'#292520'}, {shirt:'#718caf',pants:'#383c43',skin:'#deb48c',hair:'#b29a68'}, {shirt:'#c5a64c',pants:'#4b493d',skin:'#d9b494',hair:'#82684c'}, {shirt:'#eee5d6',pants:'#554335',skin:'#d2a77e',hair:'#32261f'}];
const V=new T.Vector3(),A=new T.Vector3(),B=new T.Vector3(),Q=new T.Quaternion(),P=new T.Quaternion(),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1);
function compact(mesh,palette){
 const source=mesh.geometry,index=source.index,ids=index?Array.from(new Set(index.array)):Array.from({length:source.attributes.position.count},(_,i)=>i),mapping=new Map(ids.map((v,i)=>[v,i])),geometry=new T.BufferGeometry();
 for(const name of ['position','normal','skinIndex','skinWeight']){const attr=source.attributes[name],values=new attr.array.constructor(ids.length*attr.itemSize);ids.forEach((id,i)=>{for(let j=0;j<attr.itemSize;j++)values[i*attr.itemSize+j]=attr.array[id*attr.itemSize+j];});geometry.setAttribute(name,new T.BufferAttribute(values,attr.itemSize,attr.normalized));}
 geometry.setIndex(index?Array.from(index.array,id=>mapping.get(id)):ids.map((_,i)=>i));
 const material=mesh.material,name=material.name,color=material.color.clone();
 if(name==='LightBrown')color.set(palette.shirt);else if(name==='LightBlue')color.set(palette.pants);else if(name==='Skin'||name==='Skin_Darker')color.set(palette.skin).multiplyScalar(name==='Skin_Darker'?.82:1);else if(name==='Hair'||name==='Eyebrows')color.set(palette.hair);
 const colors=new Float32Array(ids.length*3);for(let i=0;i<ids.length;i++)color.toArray(colors,i*3);geometry.setAttribute('color',new T.BufferAttribute(colors,3));return geometry;
}
export function spectatorTemplate(source,variant){
 const rig=clone(source),meshes=[];rig.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
 if(!meshes.length)throw new Error('Original spectator character skin is missing.');
 const original=meshes[0],parts=meshes.map(m=>compact(m,PALETTES[variant])),geometry=mergeGeometries(parts),material=new T.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0});material.name=`Spectator_${variant}`;
 for(const part of parts)part.dispose();
 const mesh=new T.SkinnedMesh(geometry,material);mesh.name='OriginalSpectator';mesh.position.copy(original.position);mesh.quaternion.copy(original.quaternion);mesh.scale.copy(original.scale);original.parent.add(mesh);mesh.bind(original.skeleton,original.bindMatrix);mesh.bindMode=original.bindMode;mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
 const remove=[];rig.traverse(n=>{if(n.isMesh&&n!==mesh)remove.push(n);});for(const n of remove)n.removeFromParent();
 mesh.skeleton.pose();rig.updateMatrixWorld(true);
 // The source character's neutral bind pose lies along -Z in the seated rig.
 // Stand it up without changing any skin weights or the original face topology.
 const head=rig.getObjectByName('Head'),hips=rig.getObjectByName('Hips'),upright=new T.Group();upright.name='SpectatorUpright';upright.add(rig);upright.quaternion.setFromUnitVectors(head.getWorldPosition(A).sub(hips.getWorldPosition(B)).normalize(),Y);upright.updateMatrixWorld(true);mesh.skeleton.update();mesh.computeBoundingBox();
 const bounds=new T.Box3().setFromObject(upright,true),center=hips.getWorldPosition(new T.Vector3()),offset=new T.Group();offset.add(upright);upright.position.set(-center.x,-bounds.min.y,-center.z);
 const root=new T.Group();root.name='Spectator';root.add(offset);root.updateMatrixWorld(true);return{root,geometry,material,variant,vertices:geometry.attributes.position.count};
}
// Swing each existing bone toward a target in spectator-local space. This
// retains native twists and fingers, rather than replacing people with boxes.
function aim(root,bone,child,direction){
 bone.getWorldPosition(A);child.getWorldPosition(B);A.subVectors(B,A).normalize();B.copy(direction).applyQuaternion(root.getWorldQuaternion(P)).normalize();Q.setFromUnitVectors(A,B);bone.getWorldQuaternion(P);Q.multiply(P);bone.parent.getWorldQuaternion(P).invert();bone.quaternion.copy(P.multiply(Q));bone.updateWorldMatrix(false,true);
}
function cheerHand(root,bones,side,sign,cheer){
 const wrist=bones['Wrist'+side];
 if(cheer.style===2||cheer.style===3){
  // The two raised-arm cheers in the reel use fists, not open steering hands.
  for(const finger of['Index','Middle','Ring','Pinky'])for(const[joint,curl]of[[2,-.95],[3,-.8]])bones[finger+joint+side]?.quaternion.multiply(Q.setFromAxisAngle(new T.Vector3(1,0,0),curl));
  bones['Thumb2'+side]?.quaternion.multiply(Q.setFromAxisAngle(new T.Vector3(1,0,0),-.45));
 }else{
  // Native wrist +Y follows the fingers. Turn the two palm planes towards
  // each other for applause, retaining the original skin/finger bind pose.
  const finger=new T.Vector3(0,cheer.arms[side].wrist[1]<1.25?-1:1,.12).normalize().applyAxisAngle(Z,cheer.lean),normal=new T.Vector3(-sign,0,0).applyAxisAngle(Z,cheer.lean),across=new T.Vector3().crossVectors(finger,normal).normalize();normal.crossVectors(across,finger).normalize();
  const local=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across,finger,normal)),world=root.getWorldQuaternion(new T.Quaternion()).multiply(local),parent=wrist.parent.getWorldQuaternion(new T.Quaternion()).invert();wrist.quaternion.copy(parent.multiply(world));
 }
 wrist.updateWorldMatrix(false,true);
}
export class SpectatorPerson{
 constructor(template){
  this.root=clone(template.root);this.mesh=null;this.root.traverse(n=>{if(n.isSkinnedMesh)this.mesh=n;});this.bones=Object.fromEntries(this.mesh.skeleton.bones.map(n=>[n.name,n]));this.rest=this.mesh.skeleton.bones.map(n=>n.quaternion.clone());this.base=this.root.children[0];this.baseY=this.base.position.y;this.lastTick=-Infinity;this.root.updateMatrixWorld(true);this.pose(0,0,template.variant);this.mesh.skeleton.update();this.mesh.computeBoundingBox();const bounds=new T.Box3().setFromObject(this.root,true);this.baseY-=bounds.min.y;this.base.position.y=this.baseY;this.lastTick=-Infinity;
  // Ragdoll retargeting removes cheer lean/lift. Cache that neutral hip offset,
  // not the constructor's current applause pose (notably the leaning style).
  const poseRotation=this.base.quaternion.clone();this.base.rotation.set(0,0,0);this.root.updateMatrixWorld(true);this.hipsLocal=this.root.worldToLocal(this.bones.Hips.getWorldPosition(new T.Vector3()));this.base.quaternion.copy(poseRotation);this.root.updateMatrixWorld(true);
 }
 pose(time,phase,variant,hitAge=null,settled=false,{motion=variant,tempo=1}={}){
  const tick=Math.floor(time*(hitAge===null?24:45));if(tick===this.lastTick)return;this.lastTick=tick;
  this.mesh.skeleton.bones.forEach((n,i)=>n.quaternion.copy(this.rest[i]));this.base.rotation.set(0,0,0);this.base.position.y=this.baseY;this.root.updateMatrixWorld(true);
  const b=this.bones,wave=Math.sin(time*5+phase),sway=Math.sin(time*2.2+phase),air=hitAge!==null,t=hitAge||0;
  const cheer=air?null:sampleCheer(time,phase,motion,tempo);
  if(cheer){this.base.position.y+=cheer.lift;this.base.rotation.z=cheer.lean;}
  this.root.updateMatrixWorld(true);
  for(const [side,sign]of [['L',1],['R',-1]]){
   let upper,lower,thigh,shin,foot;
   if(air){const flail=Math.sin(t*11+phase+sign),rest=settled?1:0;upper=V.set(sign*(.5+rest*.3),rest?-.5:.25+flail*.7,.25+Math.cos(t*8+sign)*.4);lower=new T.Vector3(sign*.2,rest?-.6:Math.cos(t*10+sign),.6);thigh=new T.Vector3(sign*.18,-1,.1+flail*.5*(1-rest));shin=new T.Vector3(sign*.1,-.85,.18+Math.sin(t*8+sign)*.45*(1-rest));foot=new T.Vector3(0,-.12,1);}
   else{const a=cheer.arms[side];upper=V.fromArray(a.upper).applyAxisAngle(Z,cheer.lean);lower=new T.Vector3().fromArray(a.lower).applyAxisAngle(Z,cheer.lean);thigh=new T.Vector3(sign*.06,-1,.015);shin=new T.Vector3(sign*.015,-1,-.015);foot=new T.Vector3(0,-.08,1);}
   aim(this.root,b['UpperArm'+side],b['LowerArm'+side],upper);aim(this.root,b['LowerArm'+side],b['Wrist'+side],lower);aim(this.root,b['UpperLeg'+side],b['LowerLeg'+side],thigh);aim(this.root,b['LowerLeg'+side],b['Foot'+side],shin);
   if(cheer)cheerHand(this.root,b,side,sign,cheer);
   // Preserve the native foot rotation. PT and Foot_end are oversized IK
   // helper targets, not toe joints; aiming at them makes the shoes dangle.
  }
  b.Head.quaternion.multiply(Q.setFromAxisAngle(Y,air?Math.sin(t*7)*.15:cheer.headYaw));if(cheer)b.Head.quaternion.multiply(Q.setFromAxisAngle(new T.Vector3(1,0,0),cheer.headNod));this.root.updateMatrixWorld(true);
 }
 ragdoll(points){
  const point=(name,target=new T.Vector3())=>target.fromArray(points,JOINT[name]*3),pelvis=point('pelvis'),up=point('chest').sub(pelvis).normalize(),right=point('shoulderL').sub(point('shoulderR')).normalize(),forward=new T.Vector3().crossVectors(right,up).normalize();right.crossVectors(up,forward).normalize();
  this.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward));this.base.rotation.set(0,0,0);this.base.position.y=this.baseY;this.mesh.skeleton.bones.forEach((bone,i)=>bone.quaternion.copy(this.rest[i]));this.root.position.copy(pelvis).sub(this.hipsLocal.clone().multiply(this.root.scale).applyQuaternion(this.root.quaternion));this.root.updateMatrixWorld(true);
  const aimWorld=(bone,child,from,to)=>{const direction=point(to).sub(point(from)).applyQuaternion(this.root.getWorldQuaternion(new T.Quaternion()).invert());aim(this.root,this.bones[bone],this.bones[child],direction);};
  aimWorld('Hips','Chest','pelvis','chest');aimWorld('Chest','Neck','chest','neck');aimWorld('Neck','Head','neck','head');
  for(const side of['L','R']){aimWorld('UpperArm'+side,'LowerArm'+side,'shoulder'+side,'elbow'+side);aimWorld('LowerArm'+side,'Wrist'+side,'elbow'+side,'wrist'+side);aimWorld('UpperLeg'+side,'LowerLeg'+side,'hip'+side,'knee'+side);aimWorld('LowerLeg'+side,'Foot'+side,'knee'+side,'ankle'+side);}
  this.root.updateMatrixWorld(true);this.lastTick=-Infinity;
 }
 dispose(){this.mesh.skeleton.dispose();}
}
