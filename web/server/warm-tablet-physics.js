import {nativeRelease,stepCabinTablet,discardTabletSimulation} from '../shared/tablet-rigidbody.js';
import {setImmediate as yieldIO} from 'node:timers/promises';

let warming;
/** Exercise the actual WASM/contact path before accepting the first room.
 * Rapier initialization alone does not compile its first simulation workload.
 * Warm-up pays that cold CPU/memory spike while the frontend is waking us. */
export function warmTabletPhysics(){
  return warming??=(async()=>{
    const cars=[0,1].map(team=>({x:team*4,y:.68,z:0,yaw:0,vx:0,vy:0,vz:0,door:false,doorAngle:0,driverDoorAngle:0}));
    const tablets=cars.map((car,i)=>({holder:i*2+1}));
    try{
      for(let i=0;i<360;i++){
        for(let team=0;team<2;team++){
          const car=cars[team],p=tablets[team];
          if(i%90===0){p.holder=team*2+(i%180===0?1:0);nativeRelease(p,car);}
          car.door=true;car.doorAngle=(i%90)*1;car.driverDoorAngle=Math.min(80,i%90);
          stepCabinTablet(p,car,.02);
        }
        if(i%8===7)await yieldIO();
      }
    }finally{for(const p of tablets)discardTabletSimulation(p);}
  })();
}
