/** Deterministic response experiment, shared by regression tests and reports.
 * A real 50Hz authority receives delayed controls; clients render at 60Hz.
 * No GPU or claim of physical India/Germany execution. */
import {makeCar,stepCar} from '../shared/physics.js';
export function measureInputResponse(Presentation,{rtt=.36,steerAt=2,releaseAt=2.55,duration=4,control='steer'}={}){
 const course={points:Array.from({length:1000},(_,i)=>({x:0,y:20,z:i*3})),width:100,trees:[]};
 const state=makeCar(course);Object.assign(state,{speed:18,vz:18});
 const p=new Presentation(course),up=[],down=[],trace=[];let seq=0,serverInput={throttle:.06,steer:0,seq:0,arrived:0,ttl:.5},lastInput='',lastYaw=state.yaw;
 p.accept(state,{phase:'running',input:serverInput});
 const inputAt=t=>{const active=t>=steerAt&&t<releaseAt;return {throttle:control==='throttle'?(active?1:.06):control==='brake'?(active?-1:.06):.06,steer:control==='steer'?(active?1:0):control==='handbrake'?.6:0,handbrake:control==='handbrake'&&active};};
 for(let tick=0;tick<duration*300;tick++){
  const now=tick/300;
  if(tick%5===0){const input=inputAt(now),key=JSON.stringify(input);
   if(tick%15===0||key!==lastInput){seq++;p.recordInput?.(seq);up.push({at:now+rtt/2,input:{...input,seq,ttl:.5}});lastInput=key;}
  }
  while(up[0]?.at<=now+1e-9){const m=up.shift();serverInput={...m.input,arrived:now};}
  if(tick%6===0)stepCar(state,serverInput,1/50,course);
  if(tick%15===0)down.push({at:now+rtt/2,state:structuredClone(state),input:{...serverInput},captured:now});
  while(down[0]?.at<=now+1e-9){const m=down.shift();p.accept(m.state,{phase:'running',latencySeconds:now-m.captured,inputAgeSeconds:m.captured-m.input.arrived,input:m.input});}
  if(tick%5===0){const input=inputAt(now),rendered=p.advance(1/60,input,'running');if(rendered){trace.push({time:now,steer:p.predicted.steer,yaw:rendered.yaw,yawRate:(rendered.yaw-lastYaw)*60,speed:rendered.speed,handbrakeAmount:p.predicted.handbrakeAmount||0});lastYaw=rendered.yaw;}}
 }
 const before=trace.findLast(x=>x.time<steerAt),after=trace.filter(x=>x.time>=steerAt),at=t=>trace.reduce((best,x)=>Math.abs(x.time-t)<Math.abs(best.time-t)?x:best,trace[0]);
 const crossing=after.find(x=>Math.abs(x.yaw-before.yaw)>=.01);
 const firstSteer=after.find(x=>Math.abs(x.steer-before.steer)>=.02),firstBrake=after.find(x=>x.speed<before.speed-.05);
 const responseMs=row=>row?Math.max(0,(row.time-steerAt)*1000):null;
 return{firstSteerResponseMs:responseMs(firstSteer),firstBrakeResponseMs:responseMs(firstBrake),speedChange200ms:at(steerAt+.2).speed-before.speed,handbrakeAfter200ms:at(steerAt+.2).handbrakeAmount,handbrakeAfterRelease:at(releaseAt+.15).handbrakeAmount,rttMs:rtt*1000,firstVisibleTurnMs:crossing?(crossing.time-steerAt)*1000:null,steerAfter100ms:at(steerAt+.1).steer,steerAfter200ms:at(steerAt+.2).steer,yawAfter200ms:Math.abs(at(steerAt+.2).yaw-before.yaw),steer100msAfterRelease:at(releaseAt+.1).steer,trace};
}
