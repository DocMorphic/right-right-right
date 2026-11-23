import {stepCar} from '../shared/physics.js';
import {HANDLING_STATE} from '../shared/native-handling.js';
import {LocalInputHistory} from './local-input-history.js';
const mix=(a,b,t)=>a+(b-a)*t;
const turn=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const pose=car=>({x:car.x,y:car.y,z:car.z,yaw:car.yaw,speed:car.speed,grounded:car.grounded,airPitch:car.airPitch});

/** Keep network reconciliation out of the camera's instantaneous transform. */
export class CarPresentation {
  constructor(course,{remote=false}={}){this.course=course;this.remote=remote;this.predicted=null;this.target=null;this.rendered=null;this.input={};this.hold=0;this.history=remote?null:new LocalInputHistory();this.replayActive=false;this.renderOffset={x:0,y:0,z:0,yaw:0};}
  recordInput(seq){this.history?.mark(seq);}
  accept(authority,{phase='running',latencySeconds=0,inputAgeSeconds=0,input={}}={}){
    if(!this.remote&&phase==='running'&&!authority.dead&&authority.finish<0){
      const replayed=this.history.replay(authority,input,inputAgeSeconds,this.course);
      if(replayed&&this.predicted){
        this.input=input;this.target=replayed;Object.assign(this.predicted,replayed);this.replayActive=true;
        for(const field of ['x','y','z'])this.renderOffset[field]=this.rendered[field]-replayed[field];
        this.renderOffset.yaw=Math.atan2(Math.sin(this.rendered.yaw-replayed.yaw),Math.cos(this.rendered.yaw-replayed.yaw));
        return;
      }
    }
    this.replayActive=false;
    const target=structuredClone(authority);
    this.input=input;this.hold=Math.max(0,(input.ttl??.5)-inputAgeSeconds-latencySeconds);
    // Forecast the received state to the present, rather than pulling the car
    // backwards to a pose captured before the HTTP response crossed the network.
    if(phase==='running'&&!target.dead&&target.finish<0){
      let remaining=Math.max(0,Math.min(.75,latencySeconds,Math.max(0,(input.ttl??Infinity)-inputAgeSeconds)));
      while(remaining>1e-6){const dt=Math.min(.02,remaining);stepCar(target,input,dt,this.course);remaining-=dt;}
    }
    this.target=target;
    if(!this.predicted){this.predicted=structuredClone(target);this.rendered=pose(target);return;}
    this.predicted.dead=authority.dead;this.predicted.finish=authority.finish;
    if(authority.dead||authority.finish>=0){this.predicted.vx=0;this.predicted.vz=0;this.predicted.speed=0;}
    // Position, height, rotation and velocity are corrected during advance(),
    // never at the moment a 10 Hz packet arrives.
  }
  advance(dt,input,phase){
    if(!this.predicted||!this.target)return null;
    const p=this.predicted,t=this.target;
    // Both seats follow the driver's controls. A slow navigator connection must
    // not freeze the cabin until the next packet, or let navigator keys drive it.
    let remaining=Math.min(.1,Math.max(0,dt));this.history?.advance(remaining,input,phase);
    while(remaining>1e-6){const step=Math.min(.02,remaining);remaining-=step;
      const controls=this.remote?(this.hold>0?this.input:{}):input;
      if(phase==='running'){stepCar(p,controls,step,this.course);stepCar(t,controls,step,this.course);}
      this.hold=Math.max(0,this.hold-step);
    }
    if(!this.remote&&!this.replayActive&&phase==='running'&&!p.dead&&p.finish<0){
      // A missing/history-expired ACK still anchors the car. Never blend a
      // newly pressed/released control back toward different server controls.
      const correction=1-Math.exp(-dt*6);
      for(const field of ['x','y','z'])p[field]=mix(p[field],t[field],correction);
      const sameControls=Math.abs((input.throttle||0)-(this.input.throttle||0))<1e-4&&Math.abs((input.steer||0)-(this.input.steer||0))<1e-4&&Boolean(input.handbrake)===Boolean(this.input.handbrake);
      if(sameControls){for(const field of ['vx','vz','vy','speed'])p[field]=mix(p[field]||0,t[field]||0,correction);p.yaw=turn(p.yaw,t.yaw,correction);}
    }
    if(!this.remote&&phase==='running'&&!p.dead&&p.finish<0){
      // Predict immediately, including the first frames before any usable ACK.
      // Authority still owns crashes/finish; a usable ACK reconciles in accept().
      // Ordinary local movement is immediate. Only reconciliation error is
      // smoothed, instead of filtering all steering/throttle motion behind it.
      const decay=Math.exp(-dt*12),r=this.rendered;
      for(const field of ['x','y','z']){this.renderOffset[field]*=decay;r[field]=p[field]+this.renderOffset[field];}
      this.renderOffset.yaw*=decay;r.yaw=p.yaw+this.renderOffset.yaw;r.speed=p.speed;r.grounded=p.grounded;r.airPitch=p.airPitch;return r;
    }
    const correction=1-Math.exp(-dt*(p.dead||p.finish>=0?14:6));
    // Local button edges own the engagement/release timers. Blending an older
    // server's hold into them can repeatedly re-engage Space after key-up.
    const handling=this.remote?HANDLING_STATE:['steer','steerVelocity','yawRate'];
    for(const field of ['x','y','z','vx','vz','vy','speed',...handling])p[field]=mix(p[field]||0,t[field]||0,correction);
    if(this.remote)p.handbrakeWasHeld=t.handbrakeWasHeld;
    p.yaw=turn(p.yaw,t.yaw,correction);
    const visual=1-Math.exp(-dt*20),r=this.rendered;
    for(const field of ['x','y','z','speed'])r[field]=mix(r[field],p[field],visual);
    r.yaw=turn(r.yaw,p.yaw,visual);r.grounded=p.grounded;r.airPitch=p.airPitch;
    return r;
  }
}
