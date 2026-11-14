import {DEFAULT_STAGE} from '../shared/course.js';

export const RESTART_HINT='R  RESTART      ESC  MENU';
export const NAVIGATOR_RESTART_HINT='WAITING FOR THE DRIVER...';

export function createGameRequest(mode,{practice=false}={}){
  return {type:'create',mode,profile:DEFAULT_STAGE,name:'Player',...(practice?{practice:true}:{})};
}

export function readyState(snapshot,slot){
  const seats=snapshot?.stageReady||[];
  return {waiting:snapshot?.phase==='waiting',localReady:seats[slot]===true,
    readyCount:seats.filter(Boolean).length,playersRequired:seats.length};
}

export function restartHint(snapshot,slot,isHost){
  const car=snapshot?.cars?.[Math.floor(slot/2)];
  return car&&(car.dead||car.finish>=0)?isHost?RESTART_HINT:NAVIGATOR_RESTART_HINT:'';
}

/** R acknowledges only this run/seat, then becomes the host's result restart key. */
export function commandForR({snapshot,slot,isHost,menuOpen=false,repeat=false}){
  if(!snapshot||menuOpen||repeat)return null;
  const ready=readyState(snapshot,slot);
  if(ready.waiting)return ready.localReady?null:{type:'stageReady',epoch:snapshot.epoch,ready:true};
  const car=snapshot.cars?.[Math.floor(slot/2)];
  return isHost&&car&&(car.dead||car.finish>=0)?{type:'retry'}:null;
}

export const DRIVER_CONTROLS='W / S     throttle / brake\nA / D     steer\nSPACE     handbrake\nMOUSE     look around';
export const NAVIGATOR_CONTROLS='E            grab / drop tablet\nHOLD E       dash knob = wipers\n             (drop tablet first)\nLMB + look   grab open door, slam shut\nMOUSE        look around';

export function readyRoleState(snapshot){
  const seats=snapshot?.stageReady||[];
  const drivers=seats.filter((_,index)=>index%2===0),navigators=seats.filter((_,index)=>index%2===1);
  return {driverReady:drivers.length>0&&drivers.every(Boolean),navigatorReady:navigators.length>0&&navigators.every(Boolean)};
}
