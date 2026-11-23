// Planar port of the installed playtest's GoofyCarController (Unity 6000.3.16f1).
// Keep this shared by authority and prediction. Distances are metres, speeds m/s.
export const HANDLING = Object.freeze({maxSpeed:150/3.6,reverseSpeed:28/3.6,acceleration:14,brake:18,coast:1.8,wheelbase:2.8});
// Suspension-point offsets from the native Rigidbody centre of mass. The
// steering wheelbase is a separate tuning parameter, not the tyre spacing.
export const AXLES=Object.freeze({front:1.24,rear:-1.28});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*clamp(t);
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const weight=kmh=>smooth((kmh-14)/18);
export const steeringSpeedT=speed=>smooth((Math.abs(speed)*3.6-20)/60);
export const steeringLimit=speed=>mix(30,9,steeringSpeedT(speed))*Math.PI/180;
export const HANDLING_STATE=['steer','steerVelocity','yawRate','handbrakeAmount','handbrakeCatch','handbrakeHold'];
function smoothSteering(car,target,dt,t){
  const omega=2/t,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=car.steer-target,temp=((car.steerVelocity||0)+omega*change)*dt;
  car.steerVelocity=((car.steerVelocity||0)-omega*temp)*decay;
  car.steer=target+(change+temp)*decay;
}
export function stepHandling(car,input,dt,{gripMultiplier=1,handbrakeEngageTime=.42,handbrakeTurnMultiplier=1,steeringResponseScale=1,steeringCenterDeadzone=.12}={}){
  const throttle=clamp(input?.throttle||0,-1,1),steer=clamp(input?.steer||0,-1,1),held=!!input?.handbrake;
  for(const field of HANDLING_STATE)car[field]??=0;
  if(held){car.handbrakeHold+=dt;car.handbrakeAmount=clamp(car.handbrakeAmount+dt/handbrakeEngageTime);}
  else{
    if(car.handbrakeWasHeld&&car.handbrakeHold>=.08)car.handbrakeCatch=Math.max(car.handbrakeCatch,car.handbrakeAmount*.7);
    car.handbrakeHold=0;car.handbrakeAmount=clamp(car.handbrakeAmount-dt/.1);
  }
  car.handbrakeWasHeld=held;car.handbrakeCatch=Math.max(0,car.handbrakeCatch-dt);
  const sx=Math.sin(car.yaw),cz=Math.cos(car.yaw);
  const forward=car.vx*sx+car.vz*cz,lateral=car.vx*cz-car.vz*sx;
  const speed=Math.hypot(car.vx,car.vz),kmh=speed*3.6,forwardKmh=Math.abs(forward)*3.6;
  const speedT=steeringSpeedT(forward<-.35?Math.min(Math.abs(forward),20/3.6):forward);
  smoothSteering(car,steer,dt,mix(.07,.24,speedT)*steeringResponseScale);
  const amount=car.handbrakeAmount,shape=smooth(amount),kick=smooth((kmh-24)/22);
  const hb=amount>.05,low=kmh<16,catchT=hb?0:clamp(car.handbrakeCatch/.7);
  const counter=Math.abs(car.yawRate)>=.25&&Math.abs(car.steer)>=.15&&Math.sign(-car.steer)!==Math.sign(car.yawRate)?Math.abs(car.steer):0;
  let drive=0,planarBrake=0;
  const brake=decel=>-Math.sign(forward)*Math.min(decel,Math.abs(forward)/dt);
  if(amount>.02&&low)planarBrake=Math.min(throttle<-.01?18:16,speed/dt);
  else if(throttle<-.01&&forward>.5)drive=brake(18);
  else if(amount>.02&&!(throttle<-.01&&forward<=.5))drive=brake(Math.max(1.8,3.8*amount*(throttle>0?mix(1,.78,throttle):1)));
  else if(throttle>.01)drive=forward<-.5?brake(18):14*throttle*clamp(1-forward/HANDLING.maxSpeed);
  else if(throttle<-.01)drive=9.8*throttle*clamp(1+forward/HANDLING.reverseSpeed);
  else drive=brake(1.8);
  const direction=forward<-.5?-1:1,absForward=Math.abs(forward);
  let desired=absForward<=1.2?-1.2*car.steer*clamp(absForward/1.2): -absForward/2.8*Math.tan(car.steer*mix(30,9,speedT)*Math.PI/180);
  desired*=direction*clamp((kmh-.15)/1.5)*mix(1,mix(1.04,.92,throttle),weight(kmh));
  const bicycle=desired;
  if(hb&&low)desired=0;
  if(Math.abs(car.steer)<steeringCenterDeadzone&&!hb)desired=catchT>0?car.yawRate*.55*smooth(catchT):0;
  if(hb&&!low&&Math.abs(car.steer)>.08&&kick>.02){const drift=-car.steer*1.48*1.3*handbrakeTurnMultiplier*kick*shape*direction;desired=(Math.sign(desired)||Math.sign(drift))*Math.max(Math.abs(desired),Math.abs(drift));}
  if(catchT>0&&Math.abs(car.steer)>=steeringCenterDeadzone)desired=mix(desired,car.yawRate*.55,catchT*(.62-.5*counter));
  let maxYaw=mix(1.38,1.7,speedT);
  if(forwardKmh<=20)maxYaw=Math.max(maxYaw,1.785);
  if(hb)maxYaw=low?.25:Math.min(Math.max(maxYaw,1.48*1.3*handbrakeTurnMultiplier*Math.max(.15,kick)*(.35+.65*shape),Math.abs(bicycle)),Math.max(Math.abs(bicycle),1.48*1.3*handbrakeTurnMultiplier*1.08));
  if(catchT>0)maxYaw=Math.max(maxYaw,Math.abs(car.yawRate)*.98+.15,1.48*.55*catchT);
  desired=clamp(desired,-maxYaw,maxYaw);
  let response=5.4;
  if(forwardKmh<=20&&Math.abs(car.steer)>.08)response*=1.12;
  if(hb&&!low&&Math.abs(car.steer)>.08&&kick>.02)response=Math.max(response,5.4*(1+.2*shape));
  if(Math.abs(car.steer)<steeringCenterDeadzone&&!hb)response=Math.max(response,mix(6.5,5.4*.08,smooth(catchT)));
  let torque=clamp((desired-car.yawRate)*response,-14,14);
  if(!hb)torque-=(car.yawRate-desired)*6.5*mix(.12,.02,smooth(catchT))*(1-Math.abs(car.steer));
  if(kmh<.15||(hb&&low))torque-=car.yawRate*6.5*.85;
  let yawRate=car.yawRate;
  if(catchT<=.001&&Math.abs(yawRate)>maxYaw*1.08)yawRate=Math.sign(yawRate)*maxYaw;
  yawRate=(yawRate+torque*dt)*Math.max(0,1-.25*dt);
  // Native tyre forces sample the old angular velocity and are queued alongside
  // drive/steering forces, then PhysX integrates the complete step.
  const high=smooth((kmh-80)/60),boost=mix(1.25,1,kmh/18)*mix(1,.72,high);
  let front=.58*boost,rear=.64*boost;
  if(amount<=.02){front*=mix(1,mix(1.03,.94,throttle),weight(kmh));rear*=mix(1,mix(.98,1.02,throttle),weight(kmh));}
  if(amount>.02){rear=mix(rear,Math.min(mix(.64*.9,.1,kick),throttle<-.01?.06:Infinity),shape*(.35+.65*kick));front*=mix(1,1.04,shape*kick);}
  else if(catchT>0){const carry=smooth(catchT)*(1-.7*counter);rear=mix(rear,.1,carry);front=mix(front,front*1.04,carry*.5);}
  let lateralDelta=0;
  for(const [grip,z] of [[front,AXLES.front],[rear,AXLES.rear]]){
    const pointSide=lateral+car.yawRate*z;
    const slip=Math.abs(pointSide)/Math.max(.5,Math.hypot(forward,pointSide));
    const falloff=1/(1+(slip/.48)**1.15),floor=mix(.48,.26,high);
    const boost=1+(clamp(gripMultiplier,1,2)-1)*(1-shape);
    const kill=clamp(grip*boost*mix(floor,1,falloff)*.48,0,mix(.5,.3,high));
    lateralDelta-=pointSide*kill*.5*dt/.02;
  }
  const planarScale=speed>0?Math.max(0,1-planarBrake*dt/speed):1;
  car.vx=car.vx*planarScale+sx*drive*dt+cz*lateralDelta;
  car.vz=car.vz*planarScale+cz*drive*dt-sx*lateralDelta;
  car.yawRate=yawRate;car.yaw+=yawRate*dt;
  car.speed=car.vx*Math.sin(car.yaw)+car.vz*Math.cos(car.yaw);
}
