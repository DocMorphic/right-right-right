import {Vec3,Quaternion} from './tablet-math.js';
// Only the authority simulates loose props. Vite removes this branch and its
// WASM payload from browser builds; clients display authoritative poses.
let RAPIER;
if(import.meta.env ? import.meta.env.SSR : typeof window==='undefined'){RAPIER=(await import('@dimforge/rapier3d-compat')).default;await RAPIER.init();}
import NATIVE from './native-tablet.json' with {type:'json'};
import {TABLET_CATCH as T} from './tablet-catch.js';

// One authoritative, bounded rigid body world per loose tablet. Nothing from
// this solver is transmitted: both players receive the same compact pose.
const simulations=new WeakMap(),observations=new WeakMap();
// PhysX patch friction holds slow contacts more firmly than Rapier's single
// Coulomb coefficient. Calibrated against native 9–30 m/s² turn captures; the
// adapter fades out during a fast slide instead of delaying ejection by time.
export const TABLET_CONTACT=Object.freeze({patchScale:1.5,staticPatchScale:5.5,stickSpeed:.06,unstickSpeed:.18,stickSpin:.25,slideStart:2,slideSpeed:4,staticSpeed:.08,bounceThreshold:2});
const lerp=(a,b,t)=>{const out=new Vec3();a.lerp(b,t,out);return out;};
const V=a=>new Vec3(...a),Q=a=>new Quaternion(...a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angular=(a,b,dt)=>{const d=b.mult(a.conjugate());if(d.w<0)d.set(-d.x,-d.y,-d.z,-d.w);const s=Math.hypot(d.x,d.y,d.z),angle=2*Math.atan2(s,clamp(d.w,-1,1));return s>1e-9?new Vec3(d.x,d.y,d.z).scale(angle/(s*dt)):new Vec3();};
export function tabletCarFrame(car){
 const sn=Math.sin(car.yaw),cs=Math.cos(car.yaw),sx=car.groundSlopeX||0,sz=car.groundSlopeZ||0;
 const pitch=car.grounded===false?(car.airPitch||0):-Math.atan(sx*sn+sz*cs),roll=car.grounded===false?0:Math.atan(sx*cs-sz*sn);
 return {position:new Vec3(car.x,car.y-.68,car.z),quaternion:new Quaternion().setFromEuler(pitch,car.yaw,roll,'YXZ')};
}
export function observeTabletCar(car,dt){const frame=tabletCarFrame(car),old=observations.get(car);frame.omega=old?angular(old.quaternion,frame.quaternion,dt):new Vec3();observations.set(car,frame);return frame;}
function euler(p,q){
 const{x,y,z,w}=q,m13=2*(x*z+w*y),m23=2*(y*z-w*x),m33=1-2*(x*x+y*y),m12=2*(x*y-w*z),m11=1-2*(y*y+z*z);
 p.ry=Math.asin(clamp(m13,-1,1));p.rx=Math.atan2(-m23,m33);p.rz=Math.atan2(-m12,m11);
 p.qx=x;p.qy=y;p.qz=z;p.qw=w;
}
export function nativeRelease(p,car){
 const slot=p.holder??1,frame=tabletCarFrame(car),anchor=V(NATIVE.anchors[slot%2?'passenger':'driver']),offset=frame.quaternion.vmult(anchor),world=frame.position.vadd(offset),omega=observations.get(car)?.omega||new Vec3(),pointVelocity=omega.cross(offset),extra=frame.quaternion.vmult(V([.5,0,1.6]));
 // ForceDrop's lift is Vector3.up, not the car's local up vector.
 extra.y+=.35;Object.assign(p,{holder:-1,inCabin:true,lx:anchor.x,ly:anchor.y,lz:anchor.z,x:world.x,y:world.y,z:world.z,vx:car.vx+pointVelocity.x+extra.x,vy:(car.vy||0)+pointVelocity.y+extra.y,vz:car.vz+pointVelocity.z+extra.z,lvx:.5,lvy:.35,lvz:1.6,wx:0,wy:0,wz:0,contact:false,physics:2,release:(p.release||0)+1});
 euler(p,Q(NATIVE.anchors.quaternion));delete p.groundHeading;discardTabletSimulation(p);create(p,car);
}
function shape(world,body,spec){
 const desc=spec.kind==='box'?RAPIER.ColliderDesc.cuboid(...spec.half):RAPIER.ColliderDesc.capsule(Math.max(0,spec.height/2-spec.radius),spec.radius);
 desc.setTranslation(...spec.position).setRotation(Q(spec.quaternion||[0,0,0,1])).setFriction(spec.material==='body'?.35:.6).setRestitution(spec.material==='body'?.35:0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
 if(spec.material==='body')desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
 return world.createCollider(desc,body);
}
const cleanup=new FinalizationRegistry(world=>world.free());
export function discardTabletSimulation(p){const sim=simulations.get(p);if(sim){sim.world.free();cleanup.unregister(p);simulations.delete(p);}}
function create(p,car){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.numSolverIterations=12;world.maxCcdSubsteps=4;
 const frame=tabletCarFrame(car),origin=frame.position.clone(),shell=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setRotation(frame.quaternion)),door=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()),driverDoor=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
 const bodyColliders=[];for(const s of NATIVE.shapes)if(s.name!=='DoorRight'&&s.name!=='DoorLeft'){const collider=shape(world,shell,s);if(s.material==='body')bodyColliders.push(collider);}
 const addBox=(position,half)=>shape(world,shell,{kind:'box',position,half});
 addBox([T.x,T.y,T.z],[T.width/2,.012,T.depth/2]);
 for(const side of[-1,1])addBox([T.x,T.y+T.lip/2,T.z+side*T.depth/2],[T.width/2,T.lip/2,.009]);
 addBox([T.x+T.width/2,T.y+T.lip/2,T.z],[.009,T.lip/2,T.depth/2]);addBox([T.x-T.width/2,T.y+T.exitLip/2,T.z],[.009,T.exitLip/2,T.depth/2]);
 for(const hinge of[door,driverDoor])shape(world,hinge,{kind:'box',position:[0,0,0],half:[.025,.56,.455]});
 const doorAngle=car.door?car.doorAngle||0:0,dp=doorPose(frame,doorAngle,origin);door.setTranslation(dp.position,false);door.setRotation(dp.quaternion,false);
 const driverDoorAngle=car.driverDoorAngle||0,ddp=doorPose(frame,driverDoorAngle,origin,1);driverDoor.setTranslation(ddp.position,false);driverDoor.setRotation(ddp.quaternion,false);
 const localRotation=Q([p.qx??0,p.qy??0,p.qz??0,p.qw??1]);
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x-origin.x,p.y-origin.y,p.z-origin.z).setRotation(frame.quaternion.mult(localRotation)).setLinvel(p.vx,p.vy,p.vz).setAngvel({x:p.wx||0,y:p.wy||0,z:p.wz||0}).setAngularDamping(NATIVE.angularDamping).setLinearDamping(0).setCcdEnabled(false).setSoftCcdPrediction(.01));
 const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(...NATIVE.half).setMass(NATIVE.mass).setFriction(NATIVE.dynamicFriction).setRestitution(NATIVE.bounciness).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average),body);
 shell.setLinvel({x:car.vx,y:car.vy||0,z:car.vz},false);shell.setAngvel(observations.get(car)?.omega||{x:0,y:0,z:0},false);
 const sim={world,body,collider,bodyColliders,shell,door,driverDoor,origin,frame,doorAngle,driverDoorAngle,release:p.release};simulations.set(p,sim);cleanup.register(p,world,p);return sim;
}
function doorPose(frame,angle,origin,side=-1){
 const rot=new Quaternion().setFromAxisAngle(new Vec3(0,1,0),-side*angle*Math.PI/180),center=rot.vmult(new Vec3(0,0,-.455)).vadd(new Vec3(side*.725,.88,.55));
 return{position:frame.position.vsub(origin).vadd(frame.quaternion.vmult(center)),quaternion:frame.quaternion.mult(rot)};
}
function move(body,target){body.setNextKinematicTranslation(target.position);body.setNextKinematicRotation(target.quaternion);}
function contactResponse(sim,supportVelocity){
 const speed=sim.body.linvel(),solvedSupport=sim.shell.velocityAtPoint(sim.body.translation()),relative={x:speed.x-solvedSupport.x,y:speed.y-solvedSupport.y,z:speed.z-solvedSupport.z},slip=Math.hypot(relative.x,relative.z);
 const scale=1+(TABLET_CONTACT.patchScale-1)*Math.max(0,Math.min(1,1-(slip-TABLET_CONTACT.slideStart)/(TABLET_CONTACT.slideSpeed-TABLET_CONTACT.slideStart)));

 let normalSpeed=0,contacts=0;
 sim.world.contactPairsWith(sim.collider,other=>sim.world.contactPair(sim.collider,other,manifold=>{
  const normal=manifold.normal();for(let i=0;i<manifold.numSolverContacts();i++){
   const point=manifold.solverContactPoint(i);if(!point)continue;contacts++;
   const a=sim.body.linvel(),b=other.parent()?.velocityAtPoint(point)||{x:0,y:0,z:0};
   normalSpeed=Math.max(normalSpeed,Math.abs((a.x-b.x)*normal.x+(a.y-b.y)*normal.y+(a.z-b.z)*normal.z));
  }
 }));
 if(!contacts)normalSpeed=Math.hypot(speed.x-supportVelocity.x,speed.y-supportVelocity.y,speed.z-supportVelocity.z);
 const spin=sim.body.angvel(),supportSpin=sim.shell.angvel(),relativeSpin=Math.hypot(spin.x-supportSpin.x,spin.y-supportSpin.y,spin.z-supportSpin.z);
 if(!contacts||slip>TABLET_CONTACT.unstickSpeed)sim.sticking=false;
 else if(slip<TABLET_CONTACT.stickSpeed&&relativeSpin<TABLET_CONTACT.stickSpin)sim.sticking=true;
 // A settled contact patch uses static friction until actual sliding breaks
 // it. The solver still controls all motion; this never fixes a pose or waits
 // for an ejection timer.
 const grip=sim.sticking?TABLET_CONTACT.staticPatchScale:scale;
 sim.collider.setFriction((sim.sticking||slip<TABLET_CONTACT.staticSpeed?NATIVE.staticFriction:NATIVE.dynamicFriction)*grip);
 // A cached/predictive contact does not rule out a new fast impact. In
 // particular, a falling tablet can already have a manifold before it hits.
 const bounce=normalSpeed>=TABLET_CONTACT.bounceThreshold;
 sim.collider.setRestitution(bounce?NATIVE.bounciness:0);
 for(const collider of sim.bodyColliders){collider.setFriction(.35*grip);collider.setRestitution(bounce?.35:0);}
}
export function stepCabinTablet(p,car,dt){
 let sim=simulations.get(p);if(!sim||sim.release!==p.release)sim=create(p,car);
 const{body,shell,door,driverDoor,world,origin}=sim,next=tabletCarFrame(car),endAngle=car.door?car.doorAngle||0:0,endDriverAngle=car.driverDoorAngle||0;
 const changed=next.position.distanceTo(sim.frame.position)>1e-7||Math.abs(endAngle-sim.doorAngle)>.001||Math.abs(endDriverAngle-sim.driverDoorAngle)>.001;
 if(changed)body.wakeUp();
 // Swept CCD against the translated kinematic shell can add energy even at
 // constant road speed. Predictive contacts and bounded relative-motion
 // substeps retain thin-wall/hinge contacts without that spurious clipping.
 const linear=body.linvel(),motion=next.position.vsub(sim.frame.position).scale(1/dt),motionSpin=body.angvel(),motionOmega=angular(sim.frame.quaternion,next.quaternion,dt);
 const relativeSpeed=Math.hypot(linear.x-motion.x,linear.y-motion.y,linear.z-motion.z)+.21*Math.hypot(motionSpin.x-motionOmega.x,motionSpin.y-motionOmega.y,motionSpin.z-motionOmega.z)+.455*Math.max(Math.abs(endAngle-sim.doorAngle),Math.abs(endDriverAngle-sim.driverDoorAngle))*Math.PI/(180*dt);
 const count=clamp(Math.ceil(relativeSpeed*dt/.05),6,32),h=dt/count;world.timestep=h;
 for(let i=1;i<=count;i++){
  const t=i/count,frame={position:lerp(sim.frame.position,next.position,t),quaternion:sim.frame.quaternion.slerp(next.quaternion,t,new Quaternion())};
  const omega=angular(sim.frame.quaternion,next.quaternion,dt),offset=new Vec3(body.translation().x,body.translation().y,body.translation().z).vsub(frame.position.vsub(origin)),supportVelocity=next.position.vsub(sim.frame.position).scale(1/dt).vadd(omega.cross(offset));contactResponse(sim,supportVelocity);
  move(shell,{position:frame.position.vsub(origin),quaternion:frame.quaternion});move(door,doorPose(frame,sim.doorAngle+(endAngle-sim.doorAngle)*t,origin));move(driverDoor,doorPose(frame,sim.driverDoorAngle+(endDriverAngle-sim.driverDoorAngle)*t,origin,1));world.step();
 }
 const inv=next.quaternion.conjugate(),pos=body.translation(),worldPos=new Vec3(pos.x,pos.y,pos.z).vadd(origin),local=inv.vmult(worldPos.vsub(next.position)),rotation=(()=>{const q=body.rotation();return Q([q.x,q.y,q.z,q.w]);})(),velocity=body.linvel(),spin=body.angvel();
 p.x=worldPos.x;p.y=worldPos.y;p.z=worldPos.z;p.vx=velocity.x;p.vy=velocity.y;p.vz=velocity.z;p.lx=local.x;p.ly=local.y;p.lz=local.z;euler(p,inv.mult(rotation));
 const localV=inv.vmult(new Vec3(velocity.x-car.vx,velocity.y-(car.vy||0),velocity.z-car.vz));p.lvx=localV.x;p.lvy=localV.y;p.lvz=localV.z;p.wx=spin.x;p.wy=spin.y;p.wz=spin.z;p.contact=false;world.contactPairsWith(sim.collider,()=>{p.contact=true;});
 sim.frame=next;sim.doorAngle=endAngle;sim.driverDoorAngle=endDriverAngle;
 const axes=[new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)].map(a=>inv.mult(rotation).vmult(a)),extentX=axes.reduce((sum,a,i)=>sum+Math.abs(a.x)*NATIVE.half[i],0);
 if(car.door&&local.x+extentX<-.755||car.driverDoorAngle>45&&local.x-extentX>.755||local.y<.1&&Math.abs(local.x)>.7){p.inCabin=false;euler(p,rotation);discardTabletSimulation(p);}
}
