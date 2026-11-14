import {stepCar} from '../shared/physics.js';
const mix=(a,b,t)=>a+(b-a)*t;
const turn=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const pose=car=>({x:car.x,y:car.y,z:car.z,yaw:car.yaw,speed:car.speed});

/** Keep network reconciliation out of the camera's instantaneous transform. */
export class CarPresentation {
  constructor(course){this.course=course;this.predicted=null;this.target=null;this.rendered=null;}
  accept(authority,{phase='running',latencySeconds=0,inputAgeSeconds=0,input={}}={}){
    const target=structuredClone(authority);
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
    if(phase==='running'){stepCar(p,input,dt,this.course);stepCar(t,input,dt,this.course);}
    const correction=1-Math.exp(-dt*(p.dead||p.finish>=0?14:6));
    for(const field of ['x','y','z','vx','vz','speed','steer'])p[field]=mix(p[field]||0,t[field]||0,correction);
    p.yaw=turn(p.yaw,t.yaw,correction);
    const visual=1-Math.exp(-dt*20),r=this.rendered;
    for(const field of ['x','y','z','speed'])r[field]=mix(r[field],p[field],visual);
    r.yaw=turn(r.yaw,p.yaw,visual);
    return r;
  }
}
