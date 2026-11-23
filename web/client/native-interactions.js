import * as THREE from 'three';

// Original level1 CabinGrabber fields and CabinDoor's serialized grab settings.
export const NATIVE_INTERACTION = Object.freeze({reach:1.3,knobAimRadius:.25,doorReach:1.6,aimPadding:.04,lookGain:2,clickShutAngle:4,maxAngle:90,grabOvershoot:30,grabStiffness:18,grabErrorClamp:4,maxFlickSpeed:900,grabFollow:25,hingeDamping:1.2,sealAngle:5,sealStiffness:60,windGain:.15,grabbedForceScale:.25});
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const wrap=degrees=>Math.atan2(Math.sin(degrees*Math.PI/180),Math.cos(degrees*Math.PI/180))*180/Math.PI;
export const hasTablet=(snapshot,slot)=>Boolean(snapshot?.tablets?.some(tablet=>tablet.holder===slot));
const parts=new WeakMap();
function carParts(root){
 let result=parts.get(root);if(result)return result;
 result={knob:null,door:null};root.traverse(node=>{if(node.name==='mud_knob_location')result.knob=node;if(node.name==='door_rf_ok')result.door=node;});
 if(result.door){
  root.updateMatrixWorld(true);const inverse=result.door.matrixWorld.clone().invert(),bounds=new THREE.Box3();
  result.door.traverse(node=>{if(!node.geometry)return;node.geometry.computeBoundingBox();const local=node.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));bounds.union(local);});
  result.bounds=bounds;
 }
 parts.set(root,result);return result;
}
function knobAim(ray,knob){
 if(!knob)return false;
 const delta=knob.getWorldPosition(new THREE.Vector3()).sub(ray.origin),along=delta.dot(ray.direction);
 return along>0&&along<=NATIVE_INTERACTION.reach&&delta.addScaledVector(ray.direction,-along).lengthSq()<=NATIVE_INTERACTION.knobAimRadius**2;
}
function doorAim(ray,door,bounds){
 if(!door||!bounds||bounds.isEmpty())return false;
 const scale=door.getWorldScale(new THREE.Vector3()),padding=new THREE.Vector3(...['x','y','z'].map(axis=>NATIVE_INTERACTION.aimPadding/Math.max(.00001,Math.abs(scale[axis]))));
 const padded=bounds.clone();padded.min.sub(padding);padded.max.add(padding);
 const local=ray.clone().applyMatrix4(door.matrixWorld.clone().invert());
 if(padded.containsPoint(local.origin))return true;
 const hit=local.intersectBox(padded,new THREE.Vector3());
 return Boolean(hit&&hit.applyMatrix4(door.matrixWorld).distanceTo(ray.origin)<=NATIVE_INTERACTION.doorReach);
}

/** Uses the current camera and only the player's own native car hierarchy. */
export function interactionTarget({camera,carRoot,car,snapshot,slot,enabled=true,practice=false}){
 if(!enabled||!camera||!carRoot||!car||car.dead||car.finish>=0||!['running','countdown'].includes(snapshot?.phase)||!(practice||snapshot.practice||slot%2===1))return null;
 carRoot.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(0,0),camera);const {knob,door,bounds}=carParts(carRoot);
 if(!hasTablet(snapshot,slot)&&knobAim(raycaster.ray,knob))return 'knob';
 if(car.door&&doorAim(raycaster.ray,door,bounds))return 'door';
 return null;
}

/** Native hold-to-use controls. The existing server door action commits the latch;
 * continuous free-hinge/car-force synchronization remains the shared simulation's job. */
export class NativeInteractions {
 constructor(){this.reset();}
 reset(){this.clearing=false;this.grab=null;this.slamPending=false;this.lastE=false;this.lastLeft=false;this.epoch=undefined;this.slot=undefined;}
 update({camera,carRoot,car,snapshot,slot,eHeld=false,leftHeld=false,look={},dt=1/60,enabled=true,practice=false}={}){
  if(this.epoch!==snapshot?.epoch||this.slot!==slot){this.reset();this.epoch=snapshot?.epoch;this.slot=slot;}
  const permitted=enabled&&car&&!car.dead&&car.finish<0&&['running','countdown'].includes(snapshot?.phase)&&(practice||snapshot.practice||slot%2===1),canWipe=permitted&&!hasTablet(snapshot,slot);
  if(!car?.door){this.grab=null;this.slamPending=false;}
  const target=interactionTarget({camera,carRoot,car,snapshot,slot,enabled:permitted,practice}),actions=[];
  if(!permitted){this.clearing=false;this.grab=null;}
  if(!eHeld||!canWipe)this.clearing=false;
  if(canWipe&&eHeld&&!this.lastE&&target==='knob'&&!this.grab)this.clearing=true;
  if(!leftHeld)this.grab=null;
  if(permitted&&leftHeld&&!this.lastLeft&&target==='door'&&!this.clearing&&!this.slamPending){
   this.grab={yaw:look.yaw||0,pitch:look.pitch||0,startAngle:car.doorAngle||0,angle:car.doorAngle||0,velocity:car.doorVelocity||0,previousTarget:car.doorAngle||0};
  }
  if(this.grab){
   const g=this.grab,c=NATIVE_INTERACTION,elapsed=clamp(Number.isFinite(dt)?dt:0,0,.25);
   const targetAngle=clamp(g.startAngle-c.lookGain*(wrap((look.yaw||0)-g.yaw)+(look.pitch||0)-g.pitch),-c.grabOvershoot,c.maxAngle);
   const targetVelocity=elapsed>1e-6?(targetAngle-g.previousTarget)/elapsed:0;g.previousTarget=targetAngle;
   // CabinDoor.Simulate uses <=5ms hinge substeps and exponentially follows the
   // hand velocity plus a bounded positional correction.
   let remaining=elapsed;
   while(remaining>1e-6){
    const step=Math.min(.005,remaining);remaining-=step;
    const desired=clamp(targetVelocity+c.grabStiffness*clamp(targetAngle-g.angle,-c.grabErrorClamp,c.grabErrorClamp),-c.maxFlickSpeed,c.maxFlickSpeed);
    g.velocity+=(desired-g.velocity)*(1-Math.exp(-c.grabFollow*step));
    let force=-c.hingeDamping*g.velocity-c.windGain*(car.speed||0)**2*Math.sin(g.angle*Math.PI/180)*c.grabbedForceScale;
    if(g.angle<c.sealAngle)force+=(c.sealAngle-g.angle)*c.sealStiffness;
    g.velocity+=force*step;g.angle+=g.velocity*step;
    if(g.angle<=c.clickShutAngle&&targetAngle<=c.clickShutAngle){actions.push({kind:'door'});this.slamPending=true;this.grab=null;break;}
    g.angle=clamp(g.angle,0,c.maxAngle);
   }
  }
  this.lastE=Boolean(eHeld);this.lastLeft=Boolean(leftHeld);
  return {wipe:Boolean(canWipe&&this.clearing),actions,target:this.slamPending?null:target,holdingDoor:Boolean(this.grab),doorAngle:this.grab?.angle??null};
 }
}
