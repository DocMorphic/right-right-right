import {stepCar} from '../shared/physics.js';

/** Map acknowledged commands to the local simulation timeline. The snapshot
 * already includes inputAgeSeconds of the acknowledged command; replay only
 * the remaining locally simulated time, using every intervening key edge. */
export class LocalInputHistory{
 constructor(){this.time=0;this.frames=[];this.markers=new Map();this.phase='';}
 mark(seq){if(this.phase==='running'&&Number.isSafeInteger(seq)&&seq>0&&!this.markers.has(seq))this.markers.set(seq,this.time);}
 advance(dt,input,phase){
  if(phase!=='running'||this.phase!==phase){this.frames=[];this.markers.clear();}
  this.phase=phase;
  if(phase==='running')this.frames.push({start:this.time,end:this.time+dt,input:{throttle:input.throttle||0,steer:input.steer||0,handbrake:input.handbrake===true}});
  this.time+=dt;const cutoff=this.time-2;
  while(this.frames[0]?.end<cutoff)this.frames.shift();
  for(const[seq,time]of this.markers)if(time<cutoff)this.markers.delete(seq);
 }
 replay(authority,acknowledged,inputAgeSeconds,course){
  const sent=this.markers.get(acknowledged?.seq);if(sent===undefined||this.phase!=='running'||!this.frames.length)return null;
  const start=sent+Math.max(0,inputAgeSeconds),end=this.time;
  if(start<this.frames[0].start-1e-6||start>end+.02||end-start>1)return null;
  // An ACK can arrive between render frames, up to one physics tick ahead.
  // There is then nothing to replay; retain a usable reconciliation anchor.
  const state=structuredClone(authority);
  for(const frame of this.frames){let remaining=frame.end-Math.max(start,frame.start);if(remaining<=1e-6)continue;
   while(remaining>1e-6){const dt=Math.min(.02,remaining);stepCar(state,frame.input,dt,course);remaining-=dt;}
  }
  return state;
 }
}
