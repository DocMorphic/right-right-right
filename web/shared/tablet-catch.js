// Passenger footwell tray, in reflected car-model coordinates (metres).
// Its outer lip is deliberately low: an open door must still let the tablet slide out.
// Native dash inner face is z=.55. The former z=.57 tray was inside the dash.
export const TABLET_CATCH=Object.freeze({x:-.43,y:.327,z:.385,width:.52,depth:.30,lip:.045,exitLip:.025,tabletY:.365});
export function looseTabletLocal(tablet,car){
 const dx=tablet.x-car.x,dz=tablet.z-car.z;
 return{x:tablet.lx??dx*Math.cos(car.yaw)-dz*Math.sin(car.yaw),y:tablet.ly??TABLET_CATCH.tabletY,z:tablet.lz??TABLET_CATCH.z};
}
