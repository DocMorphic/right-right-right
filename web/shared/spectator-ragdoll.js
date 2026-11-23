import {cheeringJoints} from './spectator-cheering.js';
/** Bounded authoritative particle ragdolls. No rigid-body engine or client physics. */
export const RAGDOLL=Object.freeze({hz:50,iterations:5,maxActive:8,maxVisible:16,lifetime:9,quantum:.005,joints:16});
export const JOINT=Object.freeze({pelvis:0,chest:1,neck:2,head:3,shoulderL:4,elbowL:5,wristL:6,shoulderR:7,elbowR:8,wristR:9,hipL:10,kneeL:11,ankleL:12,hipR:13,kneeR:14,ankleR:15});
const states=new WeakMap(),floors=new WeakMap();let floorProvider=null;
export function registerSpectatorFloor(provider){floorProvider=provider;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const radii=[.14,.18,.1,.15,.09,.065,.055,.09,.065,.055,.11,.085,.075,.11,.085,.075];
const inverseMass=[.4,.32,1,.75,1,1.4,2,1,1.4,2,.7,1,1.5,.7,1,1.5];
export function initialRagdollPose(person,time=0){
 const p=cheeringJoints(person,time);
 const yaw=person.yaw||0,cs=Math.cos(yaw),sn=Math.sin(yaw),scale=person.scale||1;
 for(let i=0;i<48;i+=3){const x=p[i]*scale,z=p[i+2]*scale;p[i]=person.x+cs*x+sn*z;p[i+1]=person.y+p[i+1]*scale;p[i+2]=person.z-sn*x+cs*z;}return p;
}
const bones=[[0,1],[1,2],[2,3],[1,4],[4,5],[5,6],[1,7],[7,8],[8,9],[0,10],[10,11],[11,12],[0,13],[13,14],[14,15],[4,7],[10,13],[4,10],[7,13],[4,13],[7,10],[1,10],[1,13],[0,2],[2,4],[2,7]];
function separation(p,a,b){return Math.hypot(p[b*3]-p[a*3],p[b*3+1]-p[a*3+1],p[b*3+2]-p[a*3+2]);}
export function createRagdoll(hit,person){
 const points=initialRagdollPose({...person,y:hit.y},hit.time),velocity=new Float64Array(48),speed=Math.hypot(hit.car.vx,hit.car.vz),fx=Math.sin(hit.car.yaw),fz=Math.cos(hit.car.yaw);
 for(let i=0;i<16;i++){const height=points[i*3+1]-hit.y,leg=i>=10,gain=leg?.84:.34,side=(points[i*3]-hit.x)*fz-(points[i*3+2]-hit.z)*fx,twist=Math.sin((hit.id+1)*13.7+i*.9)*.35;
  velocity[i*3]=hit.car.vx*gain+fz*(side*1.2+twist);velocity[i*3+1]=Math.min(5.8,1+speed*.08)+(1.1-height)*Math.min(1.6,speed*.1);velocity[i*3+2]=hit.car.vz*gain-fx*(side*1.2+twist);
 }
 const scale=hit.scale||1,bends=[[4,6,.12,.417],[7,9,.12,.417],[10,12,.23,.943],[13,15,.23,.943],[0,3,.58,.81]].map(([a,b,min,max])=>[a,b,min*scale,max*scale]);
 return{id:hit.id,hit,points,ground:new Float64Array(16),bends,previous:points.slice(),velocity,links:bones.map(([a,b])=>[a,b,separation(points,a,b)]),age:0,quiet:0,settled:false,contacts:0,team:hit.team};
}
function constrain(body,a,b,min,max=min){
 const p=body.points,dx=p[b*3]-p[a*3],dy=p[b*3+1]-p[a*3+1],dz=p[b*3+2]-p[a*3+2],length=Math.hypot(dx,dy,dz)||1e-8,target=clamp(length,min,max),error=(length-target)/length,wa=inverseMass[a],wb=inverseMass[b],s=1/(wa+wb);
 p[a*3]+=dx*error*wa*s;p[a*3+1]+=dy*error*wa*s;p[a*3+2]+=dz*error*wa*s;p[b*3]-=dx*error*wb*s;p[b*3+1]-=dy*error*wb*s;p[b*3+2]-=dz*error*wb*s;
}
// Measured original GLB envelope: bonnet z .655..1.859, y .749..988;
// windscreen z .208..881, y .991..1.456; roof y 1.697.
export function carSurface(z){if(z>.88)return{height:.99-(z-.88)*.15,slope:-.15,mask:1};if(z>.20)return{height:1.456-(z-.208)*.691,slope:-.691,mask:2};if(z> -1.3)return{height:1.64,slope:0,mask:4};return{height:1.02,slope:0,mask:4};}
function carContact(body,i,proxy){
 const{car,cs,sn,base}=proxy;const p=body.points,k=i*3,dx=p[k]-car.x,dz=p[k+2]-car.z,lx=dx*cs-dz*sn,lz=dx*sn+dz*cs,r=radii[i]*(body.hit.scale||1),ly=p[k+1]-base;
 if(Math.abs(lx)>.85+r||lz>1.98+r||lz< -1.98-r||ly<.15-r)return;
 const surface=carSurface(clamp(lz,-1.98,1.98)),top=surface.height+r;
 if(ly>=top)return;
 if((ly<.54||ly<.85&&lz>1.2)&&Math.min(.85+r-Math.abs(lx),1.98+r-Math.abs(lz))<top-ly){
  const side=.85+r-Math.abs(lx),end=1.98+r-Math.abs(lz);if(side<end){const d=(Math.sign(lx)||1)*side;p[k]+=cs*d;p[k+2]-=sn*d;}else{const d=(Math.sign(lz)||1)*end;p[k]+=sn*d;p[k+2]+=cs*d;}body.contacts|=16;return;
 }
 // One-way car collision: transfer the moving surface's velocity to the body,
 // never feed pedestrian impulses into the predicted driving simulation.
 const correction=top-ly;p[k+1]+=correction;const velocity=body.velocity;
 velocity[k]+=(car.vx-velocity[k])*.08;velocity[k+2]+=(car.vz-velocity[k+2])*.08;
 body.contacts|=surface.mask;body.lastCarAt=body.age;body.lastCarMask=surface.mask;body.contactTeam=car.team??body.team;
}
export function stepRagdoll(body,dt,cars,floor){
 if(body.settled)return;const steps=Math.max(1,Math.ceil(dt*(body.age<.12?100:RAGDOLL.hz))),h=dt/steps,proxies=cars.map(car=>({car,cs:Math.cos(car.yaw),sn:Math.sin(car.yaw),base:car.y-.68}));
 for(let step=0;step<steps;step++){
  const p=body.points,v=body.velocity;body.previous.set(p);body.contacts=0;
  for(let k=0;k<48;k+=3){v[k]*=.998;v[k+1]=v[k+1]*.998-9.81*h;v[k+2]*=.998;p[k]+=v[k]*h;p[k+1]+=v[k+1]*h;p[k+2]+=v[k+2]*h;}
  for(let i=0;i<16;i++)body.ground[i]=floor(p[i*3],p[i*3+2],body.hit.y)+radii[i]*(body.hit.scale||1);
  for(let iteration=0;iteration<RAGDOLL.iterations;iteration++){
   for(const[a,b,length]of body.links)constrain(body,a,b,length);
   // Ball-joint bend limits retain elbows/knees without locking a falling pose.
   for(const[a,b,min,max]of body.bends)constrain(body,a,b,min,max);
   for(let i=0;i<16;i++){const k=i*3,ground=body.ground[i];if(p[k+1]<ground){p[k+1]=ground;body.contacts|=8;}for(const proxy of proxies)carContact(body,i,proxy);}
  }
  let energy=0;for(let k=0;k<48;k+=3){const ground=floor(p[k],p[k+2],body.hit.y)+radii[k/3]*(body.hit.scale||1);if(p[k+1]<ground){p[k+1]=ground;body.contacts|=8;}v[k]=(p[k]-body.previous[k])/h;v[k+1]=(p[k+1]-body.previous[k+1])/h;v[k+2]=(p[k+2]-body.previous[k+2])/h;
   if(p[k+1]<=ground+.004){v[k]*=.72;v[k+2]*=.72;v[k+1]=Math.max(0,v[k+1])*.08;}
   // Prevent a deep moving-surface correction from becoming an explosive impulse.
   const speed=Math.hypot(v[k],v[k+1],v[k+2]),limit=32;if(speed>limit){const gain=limit/speed;v[k]*=gain;v[k+1]*=gain;v[k+2]*=gain;}v[k+1]=clamp(v[k+1],-22,5.5);energy+=v[k]**2+v[k+1]**2+v[k+2]**2;
  }
  body.everContacts=(body.everContacts||0)|body.contacts;body.age+=h;if(energy/16<.08&&body.contacts&8)body.quiet+=h;else body.quiet=0;if(body.quiet>.35){body.settled=true;body.velocity.fill(0);break;}
 }
}
export function encodeRagdoll(points,origin){const bytes=new Uint8Array(96),view=new DataView(bytes.buffer);for(let i=0;i<48;i++)view.setInt16(i*2,clamp(Math.round((points[i]-origin[i%3])/RAGDOLL.quantum),-32768,32767),true);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
export function decodeRagdoll(data,origin){if(typeof data!=='string'||data.length!==128)return null;const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));if(bytes.length!==96)return null;const view=new DataView(bytes.buffer),p=new Float64Array(48);for(let i=0;i<48;i++)p[i]=origin[i%3]+view.getInt16(i*2,true)*RAGDOLL.quantum;return p;}
export function spectatorFloor(course){let floor=floors.get(course);if(!floor){floor=floorProvider?.(course)||((x,z,fallback)=>fallback-.25);floors.set(course,floor);}return floor;}
export function beginSpectatorRagdoll(world,hit,person){
 let state=states.get(world);if(!state){state=new Map();states.set(world,state);}const active=[...state.values()].filter(b=>!b.settled);if(active.length>=RAGDOLL.maxActive)state.delete(active[0].id);state.set(hit.id,createRagdoll(hit,person));
}
export function stepSpectatorBodies(world,dt,course){
 const state=states.get(world);world.spectatorBodies??=[];if(!state)return;
 const floor=spectatorFloor(course);
 for(const[id,body]of state){if(world.elapsed-body.hit.time>RAGDOLL.lifetime)state.delete(id);else stepRagdoll(body,dt,world.cars,floor);}
 const visible=[...state.values()].sort((a,b)=>Number(a.settled)-Number(b.settled)||b.hit.time-a.hit.time).slice(0,RAGDOLL.maxVisible);
 world.spectatorBodies=visible.map(b=>({id:b.id,t:Math.round(world.elapsed*1000)/1000,o:[b.hit.x,b.hit.y,b.hit.z],p:encodeRagdoll(b.points,[b.hit.x,b.hit.y,b.hit.z]),a:!b.settled,c:b.contacts|(b.age-(b.lastCarAt??-10)<.10?b.lastCarMask:0),team:b.age-(b.lastCarAt??-10)<.10?b.contactTeam:b.team}));
 // Reliable snapshots retain an inexpensive hit tombstone after bodies fade.
 for(let i=0;i<world.spectatorHits.length;i++){const hit=world.spectatorHits[i];if(world.elapsed-hit.time>RAGDOLL.lifetime&&hit.car)world.spectatorHits[i]={id:hit.id,time:hit.time,team:hit.team};}
}
