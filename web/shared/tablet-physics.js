import {nativeRelease,stepCabinTablet} from './tablet-rigidbody.js';
export const TABLET_BODY=Object.freeze({mass:.4,half:[.13,.026,.16],gravity:9.81,angularDamping:.4,staticFriction:.7,friction:.55,bounciness:.08});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function tabletExtents(p){
 const [a,b,c]=TABLET_BODY.half,sx=Math.sin(p.rx||0),cx=Math.cos(p.rx||0),sy=Math.sin(p.ry||0),cy=Math.cos(p.ry||0),sz=Math.sin(p.rz||0),cz=Math.cos(p.rz||0);
 return[ Math.abs(cy*cz)*a+Math.abs(cy*sz)*b+Math.abs(sy)*c,
 Math.abs(cx*sz+sx*sy*cz)*a+Math.abs(cx*cz-sx*sy*sz)*b+Math.abs(sx*cy)*c,
 Math.abs(sx*sz-cx*sy*cz)*a+Math.abs(sx*cz+cx*sy*sz)*b+Math.abs(cx*cy)*c ];
}
export function tabletCorners(p){const [a,b,c]=TABLET_BODY.half,sx=Math.sin(p.rx||0),cx=Math.cos(p.rx||0),sy=Math.sin(p.ry||0),cy=Math.cos(p.ry||0),sz=Math.sin(p.rz||0),cz=Math.cos(p.rz||0),out=[];
 for(const x of[-a,a])for(const y of[-b,b])for(const z of[-c,c])out.push([cy*cz*x-cy*sz*y+sy*z,(cx*sz+sx*sy*cz)*x+(cx*cz-sx*sy*sz)*y-sx*cy*z,(sx*sz-cx*sy*cz)*x+(sx*cz+cx*sy*sz)*y+cx*cy*z]);return out;
}
function restOnSlope(p,floor,h){const a=floor(p.x-.1,p.z),b=floor(p.x+.1,p.z),c=floor(p.x,p.z-.1),d=floor(p.x,p.z+.1);if([a,b,c,d].some(v=>v===null))return;
 const nx=-(b-a)/.2,nz=-(d-c)/.2,n=Math.hypot(nx,1,nz),up=[nx/n,1/n,nz/n],heading=p.groundHeading??p.ry??0,f=[Math.sin(heading),0,Math.cos(heading)],dot=f[0]*up[0]+f[2]*up[2];for(let i=0;i<3;i++)f[i]-=up[i]*dot;const length=Math.hypot(...f);for(let i=0;i<3;i++)f[i]/=length||1;
 const right=[up[1]*f[2]-up[2]*f[1],up[2]*f[0]-up[0]*f[2],up[0]*f[1]-up[1]*f[0]];
 p.ry=Math.asin(clamp(f[0],-1,1));if(Math.abs(f[0])<.9999999){p.rx=Math.atan2(-f[1],f[2]);p.rz=Math.atan2(-up[0],right[0]);}else{p.rx=Math.atan2(up[2],up[1]);p.rz=0;}
 p.groundHeading=heading+(p.wy||0)*h;
}
export function releaseTablet(p,car){nativeRelease(p,car);}
function rotate(p,dt,grounded){for(const[k,w]of[['rx','wx'],['ry','wy'],['rz','wz']]){p[w]=(p[w]||0)*Math.exp(-dt*(TABLET_BODY.angularDamping+(grounded?5:0)));p[k]=(p[k]||0)+p[w]*dt;}}
export function stepLooseTablet(p,car,cars,dt,floor,trees){
 if(p.inCabin){if(p.physics!==2)releaseTablet(p,car);stepCabinTablet(p,car,dt);return;}
 const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
 for(let n=0;n<steps;n++){
  p.vy-=9.81*h;p.x+=p.vx*h;p.y+=p.vy*h;p.z+=p.vz*h;rotate(p,h,false);let correction=-Infinity;
  for(const[x,y,z]of tabletCorners(p)){const support=floor(p.x+x,p.z+z);if(support!==null)correction=Math.max(correction,support+.002-p.y-y);}
  if(correction>0){p.y+=correction;p.vy=Math.abs(p.vy)>.35?Math.abs(p.vy)*TABLET_BODY.bounciness:0;const speed=Math.hypot(p.vx,p.vz),friction=Math.max(0,1-((TABLET_BODY.friction+.6)/2)*9.81*h/(speed||1));p.vx*=friction;p.vz*=friction;for(const k of['wx','wy','wz'])p[k]*=Math.exp(-h*7);if(p.vy<.5){restOnSlope(p,floor,h);let fit=-Infinity;for(const[x,y,z]of tabletCorners(p)){const height=floor(p.x+x,p.z+z);if(height!==null)fit=Math.max(fit,height+.002-p.y-y);}if(Number.isFinite(fit))p.y+=fit;}}
  const e=tabletExtents(p);
  for(const tree of trees(p.x,p.z)){if(p.y+e[1]<tree.y||p.y-e[1]>tree.y+(tree.height||6))continue;const dx=p.x-tree.x,dz=p.z-tree.z,d=Math.hypot(dx,dz),r=(tree.radius||.32)+Math.max(e[0],e[2]);if(d>=r||d<1e-8)continue;const nx=dx/d,nz=dz/d;p.x=tree.x+nx*(r+.002);p.z=tree.z+nz*(r+.002);const vn=p.vx*nx+p.vz*nz;if(vn<0){p.vx-=1.15*vn*nx;p.vz-=1.15*vn*nz;}}
  for(const c of cars){const cs=Math.cos(c.yaw),sn=Math.sin(c.yaw),dx=p.x-c.x,dz=p.z-c.z,x=dx*cs-dz*sn,z=dx*sn+dz*cs,base=c.y-.68;
   // The open passenger doorway is a hole in the chassis envelope, not a
   // solid side panel that can erase the ejection momentum after it leaves.
   if((c.door&&c.doorAngle>45&&x<-.7||c.driverDoorAngle>45&&x>.7)&&z>-.36&&z<.55&&p.y-e[1]>base+.32&&p.y+e[1]<base+1.44)continue;
   if(Math.abs(x)>.85+e[0]||Math.abs(z)>1.98+e[2]||p.y+e[1]<base+.25||p.y-e[1]>base+1.70)continue;
   // Outside objects collide with the measured bonnet/roof hull, not a flat
   // road-height plane. Car momentum carries a struck tablet away naturally.
   const top=z>.88?.99-(z-.88)*.15:z>.2?1.456-(z-.208)*.691:1.64;
   if(p.y+e[1]>base+top-.15){p.y=base+top+e[1]+.002;p.vy=Math.max(.1,p.vy)*.15;p.vx+=(c.vx-p.vx)*.2;p.vz+=(c.vz-p.vz)*.2;}
   else{const depth=.85+e[0]-Math.abs(x),sign=Math.sign(x)||-1;p.x+=cs*sign*(depth+.002);p.z-=sn*sign*(depth+.002);p.vx=c.vx+cs*sign*.5;p.vz=c.vz-sn*sign*.5;}
  }
 }
}
