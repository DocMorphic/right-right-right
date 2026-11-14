// Serialized native DriverCameraFeel, DriverCabinInertia and GoofyCarController
// settings. The filter runs at render rate, independently of network packets.
export const NATIVE_CABIN=Object.freeze({idleFov:90,maxFov:104,fovFullKmh:130,throttlePunchFov:2.2,fovSmooth:8,throttleSmooth:3.5,
  forwardLeanPerDecel:.004,maxForwardLean:.035,backLeanPerAccel:.0025,maxBackLean:.02,leanSmoothTime:.22,accelSmooth:.08,deadzoneAccel:1.5,
  maxRollDeg:3.5,maxPitchDeg:1.6,rollPerLatVel:.55,pitchPerAccel:.12,tiltSmoothTime:.16,steeringWheelDegrees:110});
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const damp=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
function smooth(value,target,velocity,time,dt){
  const omega=2/time,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x),change=value-target,temp=(velocity+omega*change)*dt;
  return [target+(change+temp)*decay,(velocity-omega*temp)*decay];
}
export class CabinFeel {
  constructor(){this.fov=NATIVE_CABIN.idleFov;this.throttle=0;this.speed=null;this.acceleration=0;this.lean=0;this.leanVelocity=0;this.roll=0;this.pitch=0;this.rollVelocity=0;this.pitchVelocity=0;this.roadPitch=0;}
  update(car,input,dt,phase='running',roadPitch=0){
    const c=NATIVE_CABIN;dt=clamp(dt,0,.1);if(dt===0)return this;
    const moving=phase==='running'&&!car.dead&&car.finish<0,speed=moving?(car.speed||0):0;
    const acceleration=this.speed===null||!moving?0:clamp((speed-this.speed)/dt,-30,30);this.speed=speed;
    this.acceleration=damp(this.acceleration,acceleration,1/c.accelSmooth,dt);
    this.throttle=damp(this.throttle,moving?clamp(input?.throttle||0,0,1):0,c.throttleSmooth,dt);
    const speedT=clamp(Math.abs(speed)*3.6/c.fovFullKmh,0,1);
    const targetFov=clamp(c.idleFov+(c.maxFov-c.idleFov)*speedT+this.throttle*c.throttlePunchFov,c.idleFov,c.maxFov);
    this.fov=damp(this.fov,targetFov,c.fovSmooth,dt);
    const a=moving&&Math.abs(this.acceleration)>c.deadzoneAccel?this.acceleration:0;
    const targetLean=a<0?Math.min(c.maxForwardLean,-a*c.forwardLeanPerDecel):-Math.min(c.maxBackLean,a*c.backLeanPerAccel);
    [this.lean,this.leanVelocity]=smooth(this.lean,targetLean,this.leanVelocity,c.leanSmoothTime,dt);
    const lateral=moving?(car.vx||0)*Math.cos(car.yaw)-(car.vz||0)*Math.sin(car.yaw):0;
    const radians=Math.PI/180;
    [this.roll,this.rollVelocity]=smooth(this.roll,clamp(-lateral*c.rollPerLatVel,-c.maxRollDeg,c.maxRollDeg)*radians,this.rollVelocity,c.tiltSmoothTime,dt);
    [this.pitch,this.pitchVelocity]=smooth(this.pitch,clamp(-a*c.pitchPerAccel,-c.maxPitchDeg,c.maxPitchDeg)*radians,this.pitchVelocity,c.tiltSmoothTime,dt);
    this.roadPitch=damp(this.roadPitch,roadPitch,12,dt);
    return this;
  }
}

export function roadPitchAt(course,index){
  const a=course.points[Math.max(0,(index||0)-2)],b=course.points[Math.min(course.points.length-1,(index||0)+2)];
  return -Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z)||1);
}
