import {stepSpectatorBodies,spectatorFloor} from './spectator-ragdoll.js';
import {stepSpectators,makeSpectatorState,generateSpectators} from './spectators.js';
import {MODES,START_COUNTDOWN_SECONDS} from './protocol.js';
import {RoadSurface} from './road-surface.js';
import {nativeTrees} from './world-collision.js';
import {releaseTablet,stepLooseTablet}from'./tablet-physics.js';
import {observeTabletCar,discardTabletSimulation,tabletCarFrame} from './tablet-rigidbody.js';
import {canReachRivalTablet,stepDriverDoor} from './driver-door.js';
import {TABLET_MOUNT,tabletMountIntent} from './tablet-mount.js';
import {Vec3} from './tablet-math.js';
const roadSurfaces=new WeakMap();
function roadSurface(course){if(!roadSurfaces.has(course))roadSurfaces.set(course,new RoadSurface(course));return roadSurfaces.get(course);}
export const VERTICAL=Object.freeze({gravity:9.81,launchSpeed:8,contactTolerance:.02});

export {steeringLimit} from './native-handling.js';
import {HANDLING,stepHandling} from './native-handling.js';
export const CAR=Object.freeze({wheelbase:2.8,radius:.85,halfLength:.95,height:.68,maxSpeed:HANDLING.maxSpeed,reverseSpeed:HANDLING.reverseSpeed});
export const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
// Give the navigator time to retrieve a loose tablet or slam the door.
const HANDLING_TUNING=Object.freeze({gripMultiplier:1.2,handbrakeEngageTime:.3,handbrakeTurnMultiplier:1.15,steeringResponseScale:.45,steeringCenterDeadzone:.015});
const treeGrids = new WeakMap();
const cellSize = 8;
const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
function treeGrid(course) {
  let grid = treeGrids.get(course);
  if (grid) return grid;
  grid = new Map();
  for (const tree of [...(course.trees||[]),...nativeTrees(course)]) {
    if(tree.solid===false)continue;
    const k = key(tree.x, tree.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(tree);
  }
  treeGrids.set(course, grid); return grid;
}
export function direction(points, index) {
  const a = points[Math.max(0, index - 2)], b = points[Math.min(points.length - 1, index + 2)];
  const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return {x:(b.x-a.x)/d, z:(b.z-a.z)/d};
}
export function nearestPoint(course, x, z, previous) {
  const points = course.points;
  let best = Infinity, index = 0;
  const scan = (from, to, stride) => { for (let i = from; i < to; i += stride) { const p = points[i], d = (p.x-x)**2 + (p.z-z)**2; if (d < best) {best=d; index=i;} } };
  if (Number.isInteger(previous)) scan(Math.max(0, previous-35), Math.min(points.length, previous+36), 1);
  if (!Number.isFinite(best) || best > 35**2) { scan(0, points.length, 4); scan(Math.max(0,index-4),Math.min(points.length,index+5),1); }
  return {index, distance:Math.sqrt(best), point:points[index]};
}
export function makeCar(course, team = 0, mode = 'coop') {
  const index = course.startIndex ?? Math.min(8, course.points.length-1), p = course.points[index], f = course.startPose?{x:course.startPose.forward[0],z:course.startPose.forward[2]}:direction(course.points,index);
  const spawn=course.startPose?{x:course.startPose.position[0],z:course.startPose.position[2]}:p;
  // Both cars fit the authored five-metre start without altering the road or backing into its trees.
  const gridOffset=course.width<6.4?1.05:2.3;
  const offset = mode==='race' ? (team===0 ? -gridOffset : gridOffset) : 0;
  const x=spawn.x+f.z*offset,z=spawn.z-f.x*offset;
  const support=roadSurface(course).support(x,z,index);
  return {team,x,y:support+CAR.height,vy:0,grounded:true,groundHeight:support,airPitch:0,z,yaw:Math.atan2(f.x,f.z),
    vx:0,vz:0,speed:0,steer:0,door:false,doorAngle:0,doorVelocity:0,driverDoor:false,driverDoorAngle:0,reach:null,nextDoor:14+team*3,turnHold:0,
    mud:0,dead:false,finish:-1,stoppedAt:-1,progress:index,nearest:index,jolt:0,mudHits:[],lastX:x,lastZ:z};
}
export function carAnchor(car, slot) {
  const side = slot % 2 === 0 ? .369 : -.333;
  return {x:car.x+Math.cos(car.yaw)*side+Math.sin(car.yaw)*.28,y:car.y+.07,z:car.z-Math.sin(car.yaw)*side+Math.cos(car.yaw)*.28};
}
export function makeTablets(cars) {
  return cars.map((car, index) => ({id:index,holder:index*2+1,carrier:index,inCabin:true,mounted:false,...carAnchor(car,index*2+1),vx:0,vy:0,vz:0}));
}
/** Shared deterministic local driving step; only server decides hazards, ownership and finish. */
export function stepCar(car, input, dt, course) {
  car.jolt=Math.max(0,car.jolt-dt*2);
  if(car.dead || car.finish >= 0) return;
  const near=nearestPoint(course,car.x,car.z,car.nearest); car.nearest=near.index;
  stepHandling(car,input,dt,HANDLING_TUNING);
  car.lastX=car.x;car.lastZ=car.z;
  car.x+=car.vx*dt;car.z+=car.vz*dt;
  const surface=roadSurface(course),support=surface.support(car.x,car.z,near.index);
  car.vy??=0;car.grounded??=true;
  const ballistic=car.y+car.vy*dt-.5*VERTICAL.gravity*dt*dt,contact=support===null?-Infinity:support+CAR.height;
  if(support===null)car.grounded=false;
  if(car.grounded&&Math.abs(car.speed)>VERTICAL.launchSpeed&&car.vy>.5&&ballistic>contact+VERTICAL.contactTolerance){car.grounded=false;car.airPitch=-Math.atan2(car.vy,Math.max(1,Math.hypot(car.vx,car.vz)));}
  if(!car.grounded){car.y=ballistic;car.vy-=VERTICAL.gravity*dt;if(car.y<=contact){car.jolt=Math.max(car.jolt,Math.min(.45,Math.abs(car.vy)*.025));car.y=contact;car.vy=0;car.grounded=true;}}
  else{car.y=contact;
    // A nearest-road fallback used to create height discontinuities and launch
    // the car skyward. Derive take-off velocity from the actual surface grade.
    const h=.35,rx=surface.support(car.x+h,car.z,near.index),lx=surface.support(car.x-h,car.z,near.index),fz=surface.support(car.x,car.z+h,near.index),bz=surface.support(car.x,car.z-h,near.index);
    car.groundSlopeX=((rx??support)-(lx??support))/(2*h);car.groundSlopeZ=((fz??support)-(bz??support))/(2*h);
    car.vy=clamp(car.groundSlopeX*car.vx+car.groundSlopeZ*car.vz,-12,12);
  }
  car.groundHeight=support;
}
export function openDoor(world, team) {
  const car=world.cars[team]; if(car.door||car.dead||car.finish>=0)return false;
  car.door=true;car.doorAngle=10;car.doorVelocity=100;world.stats.doors++;
  return true;
}
export function toggleTablet(world, slot, input) {
  const car=world.cars[Math.floor(slot/2)];if(!car||car.dead||car.finish>=0)return false;
  const held=world.tablets.find(p=>p.holder===slot);
  if(held) {
    releaseTablet(held,car);
    return true;
  }
  const eye=carAnchor(car,slot);eye.y+=.5;
  const yaw=car.yaw-(input.yaw||0)*Math.PI/180,pitch=(input.pitch||0)*Math.PI/180;
  const aim={x:Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
  const candidates=world.tablets.filter(p=>p.holder<0&&!p.mounted&&(p.carrier===car.team||canReachRivalTablet(world,slot,p,eye)))
    .map(p=>({p,dx:p.x-eye.x,dy:p.y-eye.y,dz:p.z-eye.z})).map(v=>({...v,d:Math.hypot(v.dx,v.dy,v.dz)}))
    .map(v=>({...v,alignment:(aim.x*v.dx+aim.y*v.dy+aim.z*v.dz)/Math.max(.001,v.d)}))
    .filter(v=>v.d<3 && (v.d<1.15 || v.alignment>.35)).sort((a,b)=>Number(b.alignment>.7)-Number(a.alignment>.7)||(a.alignment>.7&&b.alignment>.7?b.alignment-a.alignment:0)||a.d-b.d);
  const candidate=candidates[0]?.p;if(!candidate)return false;
  if(candidate.carrier!==car.team){world.stats.steals++;car.reach={at:world.elapsed,slot,tablet:candidate.id};}
  candidate.holder=slot;candidate.carrier=car.team;candidate.inCabin=true;return true;
}
function positionMountedTablet(p,car){
  const frame=tabletCarFrame(car),position=frame.quaternion.vmult(new Vec3(...TABLET_MOUNT.position)).vadd(frame.position);
  Object.assign(p,{x:position.x,y:position.y,z:position.z,lx:TABLET_MOUNT.position[0],ly:TABLET_MOUNT.position[1],lz:TABLET_MOUNT.position[2],qx:TABLET_MOUNT.rotation[0],qy:0,qz:0,qw:TABLET_MOUNT.rotation[3],rx:-65*Math.PI/180,ry:0,rz:0,vx:0,vy:0,vz:0,lvx:0,lvy:0,lvz:0,wx:0,wy:0,wz:0,inCabin:true,contact:false});
}
export function useTabletMount(world,slot,input){
  const intent=tabletMountIntent(world,slot,input);if(!intent)return false;
  const p=world.tablets.find(p=>p.id===intent.tablet),car=world.cars[Math.floor(slot/2)];discardTabletSimulation(p);
  p.mounted=intent.kind==='attach';p.holder=p.mounted?-1:slot;
  if(p.mounted)positionMountedTablet(p,car);else Object.assign(p,carAnchor(car,slot));
  return true;
}
export function applyActions(world,slot,input) {
  const car=world.cars[Math.floor(slot/2)];if(!car||car.dead||car.finish>=0)return;
  for(const action of input.actions||[]){if(action.kind==='grab')toggleTablet(world,slot,input);else if(action.kind==='tabletMount')useTabletMount(world,slot,input);else if(action.kind==='door'){car.door=false;car.doorAngle=0;car.doorVelocity=0;}else if(action.kind==='driverDoor'&&world.cars.length===2&&slot%2===0){car.driverDoor=!car.driverDoor;}}
}
function nearGroundHeight(car){return car.groundHeight??car.y-CAR.height;}
function resolveTrees(world,car,course) {
  if(car.dead||car.finish>=0)return;
  const grid=treeGrid(course),minX=Math.floor((Math.min(car.x,car.lastX)-3)/cellSize),maxX=Math.floor((Math.max(car.x,car.lastX)+3)/cellSize),minZ=Math.floor((Math.min(car.z,car.lastZ)-3)/cellSize),maxZ=Math.floor((Math.max(car.z,car.lastZ)+3)/cellSize);
  for(let gx=minX;gx<=maxX;gx++)for(let gz=minZ;gz<=maxZ;gz++)for(const tree of grid.get(`${gx},${gz}`)||[]) {
    const rootY=tree.y??nearGroundHeight(car),height=tree.height??[6.594,5.331,4.912,7.111,7.737,8.435][tree.variant??0]*(tree.scale??1);
    if(car.y+CAR.height<rootY-.15||car.y-CAR.height>rootY+height)continue;
    // Sweep the travelled capsule: a fast/airborne car must not step through
    // a trunk between two authoritative ticks.
    let d=Infinity,cx=car.x,cz=car.z,hitT=1;
    const count=Math.max(1,Math.ceil(Math.hypot(car.x-car.lastX,car.z-car.lastZ)/.25));
    for(let i=0;i<=count;i++){const t=i/count,x=car.lastX+(car.x-car.lastX)*t,z=car.lastZ+(car.z-car.lastZ)*t,tx=tree.x-x,tz=tree.z-z,along=clamp(tx*Math.sin(car.yaw)+tz*Math.cos(car.yaw),-CAR.halfLength,CAR.halfLength),px=x+Math.sin(car.yaw)*along,pz=z+Math.cos(car.yaw)*along,dist=Math.hypot(px-tree.x,pz-tree.z);if(dist<d){d=dist;cx=px;cz=pz;hitT=t;}}
    const radius=CAR.radius+(tree.radius||.4);
    if(d>=radius)continue;
    const speed=Math.hypot(car.vx,car.vz);
    if(speed>.8){car.x=car.lastX+(car.x-car.lastX)*hitT;car.z=car.lastZ+(car.z-car.lastZ)*hitT;car.dead=true;car.stoppedAt=world.elapsed;car.jolt=1;world.stats.treeDeaths++;}
    if(d>.001){car.x+=(cx-tree.x)/d*(radius-d+.005);car.z+=(cz-tree.z)/d*(radius-d+.005);}
    car.vx=car.vz=car.speed=0;return;
  }
}
export function resolveCarCollision(world) {
  if(world.cars.length!==2)return false;
  const [a,b]=world.cars;
  // Cars on separate elevations or flying above a rival do not collide in XZ.
  if(Math.abs(a.y-b.y)>CAR.height*2)return false;
  // Capsule proxies preserve long bodies without a coarse, oversized bounding circle.
  let deepest=0,nx=0,nz=0;
  for(const sa of [-1,0,1])for(const sb of [-1,0,1]){
    const dx=b.x+Math.sin(b.yaw)*sb*CAR.halfLength-a.x-Math.sin(a.yaw)*sa*CAR.halfLength;
    const dz=b.z+Math.cos(b.yaw)*sb*CAR.halfLength-a.z-Math.cos(a.yaw)*sa*CAR.halfLength;
    const d=Math.hypot(dx,dz),depth=CAR.radius*2-d;
    if(depth>deepest){deepest=depth;nx=d>.001?dx/d:1;nz=d>.001?dz/d:0;}
  }
  if(!deepest)return false;
  const fixedA=a.dead||a.finish>=0,fixedB=b.dead||b.finish>=0;if(fixedA&&fixedB)return false;
  const shareA=fixedA?0:fixedB?1:.5,shareB=fixedB?0:fixedA?1:.5;
  a.x-=nx*deepest*shareA;a.z-=nz*deepest*shareA;b.x+=nx*deepest*shareB;b.z+=nz*deepest*shareB;
  const relative=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
  if(relative<0){const impulse=-(1+.4)*relative/(fixedA||fixedB?1:2);a.vx-=nx*impulse*(fixedA?0:1);a.vz-=nz*impulse*(fixedA?0:1);b.vx+=nx*impulse*(fixedB?0:1);b.vz+=nz*impulse*(fixedB?0:1);}
  const jolt=clamp(Math.abs(relative)*.12,.1,1);a.jolt=b.jolt=jolt;
  if(world.elapsed-world.lastImpact>.15){world.stats.impacts++;world.lastImpact=world.elapsed;}
  return true;
}
function stepTablets(world,dt,course){
  for(const car of world.cars)observeTabletCar(car,dt);
  const surface=roadSurface(course),grid=treeGrid(course);
  const floor=(x,z)=>{const near=nearestPoint(course,x,z);return surface.support(x,z,near.index);};
  const trees=(x,z)=>{const out=[],gx=Math.floor(x/cellSize),gz=Math.floor(z/cellSize);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)out.push(...(grid.get(`${gx+dx},${gz+dz}`)||[]));return out;};
  for(const p of world.tablets){const car=world.cars[p.carrier];
    if(p.mounted){discardTabletSimulation(p);positionMountedTablet(p,car);continue;}
    if(p.holder>=0){discardTabletSimulation(p);Object.assign(p,carAnchor(car,p.holder));p.inCabin=true;p.vx=car.vx;p.vz=car.vz;p.vy=0;continue;}
    stepLooseTablet(p,car,world.cars,dt,floor,trees);
  }
}
// Native crash flow holds the car and locks input without stopping global
// physics. Let a loose tablet finish its impact while the result clock stays
// fixed. This bounded tail never advances the car, race or other hazards.
export function stepCrashedTablets(world,dt,course){
  if(world.phase!=='ended'||!(world.tabletSettleRemaining>0))return false;
  const h=Math.min(dt,world.tabletSettleRemaining);
  stepTablets(world,h,course);const left=world.tabletSettleRemaining-h;world.tabletSettleRemaining=left>1e-6?left:0;
  return true;
}
/** Advances a running authoritative world one fixed tick. */
export function stepWorld(world,inputs,dt,course){
  world.elapsed+=dt;
  for(let team=0;team<world.cars.length;team++){
    const car=world.cars[team];if(car.dead||car.finish>=0){car.jolt=Math.max(0,car.jolt-dt*2);continue;}
    const drive=inputs[team*2]||{};
    stepCar(car,drive,dt,course);
    stepDriverDoor(car,dt);
    if(inputs[team*2]?.wipe||inputs[team*2+1]?.wipe)car.mud=Math.max(0,car.mud-dt/2);
    if(Math.abs(drive.steer||0)>.45&&Math.abs(car.speed)>4.45)car.turnHold+=dt;else car.turnHold=0;
    if(world.elapsed>car.nextDoor&&car.turnHold>.4){openDoor(world,team);car.nextDoor=world.elapsed+24+(world.seed%1100)/100;}
    if(car.door){car.doorVelocity+=(Math.abs(drive.steer||0)*20+10-car.doorVelocity*2)*dt;car.doorAngle=clamp(car.doorAngle+car.doorVelocity*dt,8,90);}
    // Spectators react to the travelled segment before a later tree impact
    // clears its velocity. They never change the car or end the race.
    stepSpectators(world,dt,course,team);
    resolveTrees(world,car,course);
    const near=nearestPoint(course,car.x,car.z,car.nearest);car.nearest=near.index;car.progress=Math.max(car.progress,near.index);
    for(let i=0;i<(course.mud||[]).length;i++){const mud=course.mud[i];if(!car.mudHits.includes(i)&&Math.hypot(car.x-mud.x,car.z-mud.z)<(mud.radius||course.width*.5)){car.mudHits.push(i);car.mud=clamp(car.mud+(mud.amount||.55),0,1);world.stats.mud++;}}
    const finishIndex=course.finishIndex??course.points.length-9,p=course.finishPose?{x:course.finishPose.position[0],z:course.finishPose.position[2]}:course.points[finishIndex],f=direction(course.points,finishIndex);
    const before=(car.lastX-p.x)*f.x+(car.lastZ-p.z)*f.z,after=(car.x-p.x)*f.x+(car.z-p.z)*f.z;
    if(!car.dead&&world.elapsed>3&&car.progress>Math.max(course.startIndex??0,finishIndex-60)&&before<0&&after>=0&&Math.abs((car.x-p.x)*f.z-(car.z-p.z)*f.x)<(course.widths?.[finishIndex]??course.width)*.5){car.finish=world.elapsed;car.vx=car.vz=car.speed=0;}
  }
  if(resolveCarCollision(world))for(const car of world.cars)resolveTrees(world,car,course);
  stepTablets(world,dt,course);stepSpectatorBodies(world,dt,course);
  if(world.cars.every(c=>c.dead||c.finish>=0)){world.phase='ended';const winners=world.cars.filter(c=>c.finish>=0).sort((a,b)=>a.finish-b.finish);world.winner=winners[0]?.team??null;world.tabletSettleRemaining=world.cars.some(c=>c.dead)&&world.tablets.some(p=>p.holder<0&&!p.mounted)?3:0;}
}
export function makeWorld(course,mode,epoch,countdown=START_COUNTDOWN_SECONDS){
  generateSpectators(course);spectatorFloor(course);
  const cars=Array.from({length:MODES[mode].cars},(_,team)=>makeCar(course,team,mode));
  return {...makeSpectatorState(),epoch,seed:course.seed,seq:0,time:0,phase:'countdown',countdown,elapsed:0,cars,tablets:makeTablets(cars),winner:null,lastImpact:-1,
    stats:{impacts:0,steals:0,doors:0,treeDeaths:0,mud:0}};
}
