// A small mount on the centre dashboard, in the original reflected car frame.
// Its tablet faces back toward the seats; the native tablet mesh is unchanged.
const tilt=65*Math.PI/180;
export const TABLET_MOUNT=Object.freeze({position:Object.freeze([0,1.23,.43]),rotation:Object.freeze([-Math.sin(tilt/2),0,0,Math.cos(tilt/2)]),width:.32,height:.38,reach:1.1});
const eyes=[{position:[.366089,1.324106,-.059291],pitch:11.29},{position:[-.338540,1.281674,-.096291],pitch:8.1}];
export function aimsAtTabletMount(slot,input={}){
 if(!Number.isInteger(slot)||slot<0||slot>3||!Number.isFinite(input.yaw??0)||!Number.isFinite(input.pitch??0))return false;
 const eye=eyes[slot%2],yaw=(input.yaw||0)*Math.PI/180,pitch=((input.pitch||0)+eye.pitch)*Math.PI/180;
 const direction=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],normal=[0,Math.cos(tilt),-Math.sin(tilt)];
 const delta=TABLET_MOUNT.position.map((n,i)=>n-eye.position[i]),denominator=direction.reduce((n,v,i)=>n+v*normal[i],0);
 if(denominator>=-1e-6)return false;
 const distance=delta.reduce((n,v,i)=>n+v*normal[i],0)/denominator;
 if(distance<=0||distance>TABLET_MOUNT.reach)return false;
 const hit=eye.position.map((n,i)=>n+direction[i]*distance-TABLET_MOUNT.position[i]);
 return Math.abs(hit[0])<TABLET_MOUNT.width/2&&Math.abs(hit[1]*Math.sin(tilt)+hit[2]*Math.cos(tilt))<TABLET_MOUNT.height/2;
}
/** One shared target rule for the prompt, input binding and authority. */
export function tabletMountIntent(world,slot,input){
 if(!Number.isInteger(slot))return null;
 const team=Math.floor(slot/2),car=world?.cars?.[team];
 if(world?.cars?.length!==2||!car||car.dead||car.finish>=0||!['running','countdown'].includes(world.phase)||!aimsAtTabletMount(slot,input))return null;
 const held=world.tablets.find(p=>p.holder===slot),mounted=world.tablets.find(p=>p.mounted&&p.carrier===team);
 if(held)return slot%2===0&&held.id!==team&&held.carrier===team&&!mounted?{kind:'attach',tablet:held.id}:null;
 return mounted?{kind:'take',tablet:mounted.id}:null;
}
