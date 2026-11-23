// Race-only reach rules. Coordinates use the original car's +X driver side.
export const DRIVER_DOOR = Object.freeze({openAngle:80,openSpeed:160,closeSpeed:240,minReachAngle:45,reachDuration:.8});
function local(car,p){const x=p.x-car.x,z=p.z-car.z,c=Math.cos(car.yaw),s=Math.sin(car.yaw);return{x:x*c-z*s,y:p.y-(car.y-.68),z:x*s+z*c};}
function crossesOpening(car,from,to,side){
 const a=local(car,from),b=local(car,to),plane=side*.725,dx=b.x-a.x;
 if(side*dx<=0)return false;
 const t=(plane-a.x)/dx;if(t<0||t>1)return false;
 const y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
 return y>.32&&y<1.44&&z>-.36&&z<.55;
}
export function canReachRivalTablet(world,slot,p,eye){
 const own=world.cars[Math.floor(slot/2)],rival=world.cars[p.carrier];
 if(world.cars.length!==2||slot%2!==0||!own.driverDoor||own.driverDoorAngle<DRIVER_DOOR.minReachAngle)return false;
 if(!crossesOpening(own,eye,p,1))return false;
 return !p.inCabin||Boolean(rival?.door&&rival.doorAngle>DRIVER_DOOR.minReachAngle&&crossesOpening(rival,p,eye,-1));
}
export function stepDriverDoor(car,dt){
 const target=car.driverDoor?DRIVER_DOOR.openAngle:0,angle=car.driverDoorAngle||0,step=(car.driverDoor?DRIVER_DOOR.openSpeed:DRIVER_DOOR.closeSpeed)*dt;
 car.driverDoorAngle=angle+Math.sign(target-angle)*Math.min(Math.abs(target-angle),step);
}
export function reachProgress(event,elapsed){return event?Math.max(0,Math.min(1,(elapsed-event.at)/DRIVER_DOOR.reachDuration)):0;}
