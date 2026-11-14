import {MODES} from './protocol.js';

export const CAR = Object.freeze({wheelbase: 2.8, radius: .85, halfLength: .95, height: .68, maxSpeed: 24, reverseSpeed: 7});
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// Serialized GoofyCarController settings in the original playtest's level1:
// 30° below 20 km/h, 9° at 80 km/h, SmoothDamp .07–.24 s, yaw response 5.4.
export function steeringLimit(speed) {
  const t=clamp((Math.abs(speed)*3.6-20)/60,0,1);
  return (30+(9-30)*t)*Math.PI/180;
}
function smoothSteering(car,target,dt,smoothTime) {
  const omega=2/smoothTime,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=car.steer-target,velocity=car.steerVelocity||0,temp=(velocity+omega*change)*dt;
  car.steerVelocity=(velocity-omega*temp)*decay;
  car.steer=target+(change+temp)*decay;
}
const treeGrids = new WeakMap();
const cellSize = 8;
const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
function treeGrid(course) {
  let grid = treeGrids.get(course);
  if (grid) return grid;
  grid = new Map();
  for (const tree of course.trees || []) {
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
  const index = Math.min(8, course.points.length-1), p = course.points[index], f = direction(course.points,index);
  const offset = mode === 'race' ? (team===0 ? -2.3 : 2.3) : 0;
  return {team,x:p.x+f.z*offset,y:p.y+CAR.height,z:p.z-f.x*offset,yaw:Math.atan2(f.x,f.z),
    vx:0,vz:0,speed:0,steer:0,door:false,doorAngle:0,doorVelocity:0,nextDoor:14+team*3,turnHold:0,
    mud:0,dead:false,finish:-1,stoppedAt:-1,progress:index,nearest:index,jolt:0,mudHits:[],lastX:p.x+f.z*offset,lastZ:p.z-f.x*offset};
}
export function carAnchor(car, slot) {
  const side = slot % 2 === 0 ? .369 : -.333;
  return {x:car.x+Math.cos(car.yaw)*side+Math.sin(car.yaw)*.28,y:car.y+.07,z:car.z-Math.sin(car.yaw)*side+Math.cos(car.yaw)*.28};
}
export function makeTablets(cars) {
  return cars.map((car, index) => ({id:index,holder:index*2+1,carrier:index,inCabin:true,...carAnchor(car,index*2+1),vx:0,vy:0,vz:0}));
}
/** Shared deterministic local driving step; only server decides hazards, ownership and finish. */
export function stepCar(car, input, dt, course) {
  car.jolt=Math.max(0,car.jolt-dt*2);
  if(car.dead || car.finish >= 0) return;
  const near=nearestPoint(course,car.x,car.z,car.nearest); car.nearest=near.index;
  const offroad = near.distance > course.width*.5;
  const throttle=clamp(input?.throttle||0,-1,1), steer=clamp(input?.steer||0,-1,1);
  const forwardX=Math.sin(car.yaw), forwardZ=Math.cos(car.yaw);
  let forward=car.vx*forwardX+car.vz*forwardZ;
  const speedT=clamp((Math.abs(forward)*3.6-20)/60,0,1);
  smoothSteering(car,steer,dt,.07+(.24-.07)*speedT);
  let lateral=car.vx*forwardZ-car.vz*forwardX;
  let acceleration=throttle*(forward*throttle < -1 ? 16 : 8.5);
  const drag=(.38+Math.abs(forward)*.018)*(offroad?4:1);
  forward += (acceleration-forward*drag)*dt;
  if(input?.handbrake) forward*=Math.max(0,1-dt*2.1);
  forward=clamp(forward,-CAR.reverseSpeed,CAR.maxSpeed);
  if(Math.abs(forward)<.03 && throttle===0)forward=0;
  const steeringAngle=car.steer*steeringLimit(forward);
  const weight=clamp((Math.abs(forward)*3.6-14)/18,0,1);
  const yawBias=1+((Math.abs(throttle)>.1?.92:1.04)-1)*weight;
  const desiredYaw=clamp(-forward/CAR.wheelbase*Math.tan(steeringAngle)*yawBias,-1.7,1.7);
  car.yawRate=(car.yawRate||0)+(desiredYaw-(car.yawRate||0))*(1-Math.exp(-5.4*dt));
  car.yaw+=car.yawRate*dt;
  const grip=input?.handbrake?2.5:offroad?5:11;
  lateral*=Math.exp(-grip*dt);
  car.vx=Math.sin(car.yaw)*forward+Math.cos(car.yaw)*lateral;
  car.vz=Math.cos(car.yaw)*forward-Math.sin(car.yaw)*lateral;
  car.lastX=car.x;car.lastZ=car.z;
  car.x+=car.vx*dt;car.z+=car.vz*dt;car.speed=forward;
  car.y += (near.point.y+CAR.height-car.y)*Math.min(1,dt*12);
}
export function openDoor(world, team) {
  const car=world.cars[team]; if(car.door||car.dead||car.finish>=0)return false;
  car.door=true;car.doorAngle=10;car.doorVelocity=100;world.stats.doors++;
  for(const tablet of world.tablets)if(tablet.carrier===team&&tablet.holder<0) {tablet.vx=car.vx-Math.cos(car.yaw)*2.5;tablet.vy=3.5;tablet.vz=car.vz+Math.sin(car.yaw)*2.5;}
  return true;
}
export function toggleTablet(world, slot, input) {
  const car=world.cars[Math.floor(slot/2)];if(!car||car.dead||car.finish>=0)return false;
  const held=world.tablets.find(p=>p.holder===slot);
  if(held) {
    held.holder=-1;held.vx=car.vx;held.vz=car.vz;held.vy=.5;
    if(car.door){held.vx-=Math.cos(car.yaw)*2.5;held.vz+=Math.sin(car.yaw)*2.5;held.vy=3.5;}
    return true;
  }
  const eye=carAnchor(car,slot);eye.y+=.5;
  const yaw=car.yaw-(input.yaw||0)*Math.PI/180,pitch=(input.pitch||0)*Math.PI/180;
  const aim={x:Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
  const candidates=world.tablets.filter(p=>p.holder<0&&(p.carrier===car.team||!p.inCabin||world.cars[p.carrier].door&&world.cars[p.carrier].doorAngle>30))
    .map(p=>({p,dx:p.x-eye.x,dy:p.y-eye.y,dz:p.z-eye.z})).map(v=>({...v,d:Math.hypot(v.dx,v.dy,v.dz)}))
    .filter(v=>v.d<3 && (v.d<1.15 || (aim.x*v.dx+aim.y*v.dy+aim.z*v.dz)/v.d>.35)).sort((a,b)=>a.d-b.d);
  const candidate=candidates[0]?.p;if(!candidate)return false;
  if(candidate.carrier!==car.team)world.stats.steals++;
  candidate.holder=slot;candidate.carrier=car.team;candidate.inCabin=true;return true;
}
export function applyActions(world,slot,input) {
  const car=world.cars[Math.floor(slot/2)];if(!car||car.dead||car.finish>=0)return;
  for(const action of input.actions||[]){if(action.kind==='grab')toggleTablet(world,slot,input);else if(action.kind==='door'){car.door=false;car.doorAngle=0;car.doorVelocity=0;}}
}
function resolveTrees(world,car,course) {
  if(car.dead||car.finish>=0)return;
  const grid=treeGrid(course),gx=Math.floor(car.x/cellSize),gz=Math.floor(car.z/cellSize);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const tree of grid.get(`${gx+dx},${gz+dz}`)||[]) {
    const tx=tree.x-car.x,tz=tree.z-car.z;
    const along=clamp(tx*Math.sin(car.yaw)+tz*Math.cos(car.yaw),-CAR.halfLength,CAR.halfLength);
    const cx=car.x+Math.sin(car.yaw)*along,cz=car.z+Math.cos(car.yaw)*along;
    const d=Math.hypot(cx-tree.x,cz-tree.z),radius=CAR.radius+(tree.radius||.4);
    if(d>=radius)continue;
    const speed=Math.hypot(car.vx,car.vz);
    if(speed>.8){car.dead=true;car.stoppedAt=world.elapsed;car.jolt=1;world.stats.treeDeaths++;}
    if(d>.001){car.x+=(cx-tree.x)/d*(radius-d+.005);car.z+=(cz-tree.z)/d*(radius-d+.005);}
    car.vx=car.vz=car.speed=0;return;
  }
}
export function resolveCarCollision(world) {
  if(world.cars.length!==2)return false;
  const [a,b]=world.cars;
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
  for(const p of world.tablets){
    const car=world.cars[p.carrier];
    if(p.holder>=0){Object.assign(p,carAnchor(car,p.holder));p.inCabin=true;p.vx=car.vx;p.vz=car.vz;p.vy=0;continue;}
    if(p.inCabin){
      const dx=p.x-car.lastX,dz=p.z-car.lastZ;
      let lx=dx*Math.cos(car.yaw)-dz*Math.sin(car.yaw),lz=dx*Math.sin(car.yaw)+dz*Math.cos(car.yaw);
      if(car.door&&car.doorAngle>30){lx-=dt*2.8;if(lx<-.95)p.inCabin=false;}
      else lx=clamp(lx,-.61,.61);
      lz=clamp(lz,-.8,.8);
      p.x=car.x+Math.cos(car.yaw)*lx+Math.sin(car.yaw)*lz;p.z=car.z-Math.sin(car.yaw)*lx+Math.cos(car.yaw)*lz;
      p.y=car.y+.18;p.vx=car.vx-Math.cos(car.yaw)*2.8;p.vz=car.vz+Math.sin(car.yaw)*2.8;p.vy=1;
    }else{
      p.vy-=9.81*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;
      const near=nearestPoint(course,p.x,p.z);if(p.y<near.point.y+.12){p.y=near.point.y+.12;p.vy=Math.abs(p.vy)*.2;p.vx*=Math.exp(-dt*3);p.vz*=Math.exp(-dt*3);}
    }
  }
}
/** Advances a running authoritative world one fixed tick. */
export function stepWorld(world,inputs,dt,course){
  world.elapsed+=dt;
  for(let team=0;team<world.cars.length;team++){
    const car=world.cars[team];if(car.dead||car.finish>=0){car.jolt=Math.max(0,car.jolt-dt*2);continue;}
    const drive=inputs[team*2]||{};
    stepCar(car,drive,dt,course);
    if(inputs[team*2]?.wipe||inputs[team*2+1]?.wipe)car.mud=Math.max(0,car.mud-dt/2.2);
    if(Math.abs(drive.steer||0)>.45&&Math.abs(car.speed)>4.45)car.turnHold+=dt;else car.turnHold=0;
    if(world.elapsed>car.nextDoor&&car.turnHold>.4){openDoor(world,team);car.nextDoor=world.elapsed+24+(world.seed%1100)/100;}
    if(car.door){car.doorVelocity+=(Math.abs(drive.steer||0)*20+10-car.doorVelocity*2)*dt;car.doorAngle=clamp(car.doorAngle+car.doorVelocity*dt,8,90);}
    resolveTrees(world,car,course);
    const near=nearestPoint(course,car.x,car.z,car.nearest);car.nearest=near.index;car.progress=Math.max(car.progress,near.index);
    for(let i=0;i<(course.mud||[]).length;i++){const mud=course.mud[i];if(!car.mudHits.includes(i)&&Math.hypot(car.x-mud.x,car.z-mud.z)<(mud.radius||course.width*.5)){car.mudHits.push(i);car.mud=clamp(car.mud+(mud.amount||.55),0,1);world.stats.mud++;}}
    const finishIndex=course.points.length-9,p=course.points[finishIndex],f=direction(course.points,finishIndex);
    const before=(car.lastX-p.x)*f.x+(car.lastZ-p.z)*f.z,after=(car.x-p.x)*f.x+(car.z-p.z)*f.z;
    if(!car.dead&&world.elapsed>3&&car.progress>course.points.length-60&&before<0&&after>=0&&Math.abs((car.x-p.x)*f.z-(car.z-p.z)*f.x)<course.width*.5){car.finish=world.elapsed;car.vx=car.vz=car.speed=0;}
  }
  resolveCarCollision(world);stepTablets(world,dt,course);
  if(world.cars.every(c=>c.dead||c.finish>=0)){world.phase='ended';const winners=world.cars.filter(c=>c.finish>=0).sort((a,b)=>a.finish-b.finish);world.winner=winners[0]?.team??null;}
}
export function makeWorld(course,mode,epoch,countdown=5){
  const cars=Array.from({length:MODES[mode].cars},(_,team)=>makeCar(course,team,mode));
  return {epoch,seed:course.seed,seq:0,time:0,phase:'countdown',countdown,elapsed:0,cars,tablets:makeTablets(cars),winner:null,lastImpact:-1,
    stats:{impacts:0,steals:0,doors:0,treeDeaths:0,mud:0}};
}
