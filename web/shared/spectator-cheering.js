/** Pose reconstruction from Dfpiq9oIxxa, 7.6–9.4s. Original animation clips
 * are absent from the supplied runtime; these are observed pose/cadence curves. */
export const CHEER_STYLES=Object.freeze(['overhead-clap','face-clap-pause','wide-v','raised-pumps','leaning-clap','chest-clap']);
const TAU=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a+(b-a)*t;
// Wrist targets in metres, in the same standing character frame as the native
// skin. Arms are solved to their measured lengths; fingers/skin remain native.
const clips=[
 {seconds:.8,keys:[[0,.032,1.8,.13],[.14,.032,1.8,.13],[.44,.34,1.77,.08],[.70,.34,1.77,.08],[.94,.032,1.8,.13],[1,.032,1.8,.13]]},
 {seconds:2.4,keys:[[0,.24,1.12,.05],[.10,.032,1.59,.23],[.19,.3,1.54,.22],[.28,.032,1.59,.23],[.38,.3,1.54,.22],[.47,.032,1.59,.23],[.57,.3,1.54,.22],[.66,.032,1.59,.23],[.79,.24,1.12,.05],[1,.24,1.12,.05]]},
 null,null,
 {seconds:1.45,keys:[[0,.035,1.56,.27],[.14,.035,1.56,.27],[.36,.24,1.53,.23],[.58,.035,1.56,.27],[.79,.24,1.53,.23],[1,.035,1.56,.27]]},
 {seconds:1.3,keys:[[0,.028,1.4,.3],[.14,.028,1.4,.3],[.32,.3,1.36,.22],[.48,.028,1.4,.3],[.67,.3,1.36,.22],[.80,.028,1.4,.3],[.94,.24,1.12,.06],[1,.028,1.4,.3]]}
];
function target(clip,u){let i=1;while(i<clip.keys.length-1&&u>clip.keys[i][0])i++;const a=clip.keys[i-1],b=clip.keys[i],t=clamp((u-a[0])/(b[0]-a[0]),0,1),s=t*t*(3-2*t);return[a[1],a[2],a[3]].map((v,j)=>mix(v,b[j+1],s));}
function arm(sign,wrist){
 const shoulder=[sign*.153,1.435,0],v=wrist.map((x,i)=>x-shoulder[i]),distance=Math.hypot(...v),d=clamp(distance,.055,.416),axis=v.map(x=>x/(distance||1)),upper=.183,lower=.235,along=(upper*upper-lower*lower+d*d)/(2*d),height=Math.sqrt(Math.max(0,upper*upper-along*along)),hint=[sign,-.35,-.12],dot=hint.reduce((n,x,i)=>n+x*axis[i],0),plane=hint.map((x,i)=>x-axis[i]*dot),length=Math.hypot(...plane)||1,elbow=shoulder.map((x,i)=>x+axis[i]*along+plane[i]/length*height),hand=shoulder.map((x,i)=>x+axis[i]*d);
 return{shoulder,elbow,wrist:hand,upper:elbow.map((x,i)=>(x-shoulder[i])/upper),lower:hand.map((x,i)=>(x-elbow[i])/lower)};
}
export function sampleCheer(time,phase=0,motion=0,tempo=1){
 const style=((motion|0)%CHEER_STYLES.length+CHEER_STYLES.length)%CHEER_STYLES.length,t=Math.max(0,time)*clamp(tempo,.85,1.15),beat=t*TAU+phase,clip=clips[style],u=clip?((t/clip.seconds+phase/TAU)%1+1)%1:0,hand=clip?target(clip,u):null,arms={};
 for(const[side,sign]of[['L',1],['R',-1]]){
  let wrist;if(style===2)wrist=[sign*(.34+.025*Math.sin(beat*.8+sign)),1.79+.025*Math.sin(beat*1.35),.025];
  else if(style===3)wrist=[sign*(.25+.025*Math.sin(beat*.9+sign)),1.80+.045*Math.sin(beat*.95+sign*.8),.08+.025*Math.cos(beat*.95+sign)];
  else wrist=[sign*hand[0]+(style===4?.105:0),hand[1],hand[2]];
  arms[side]=arm(sign,wrist);
 }
 return{style,name:CHEER_STYLES[style],arms,lift:style===2?Math.max(0,Math.sin(beat*1.35))*.015:0,lean:(style===4?.075:0)+Math.sin(beat*.45)*(style===2?.025:.012),headYaw:Math.sin(beat*.4)*.065,headNod:style===1||style===4||style===5?Math.sin(beat*.9)*.035:0};
}
/** Shared unscaled joint frame also seeds the server's ragdoll at hit time. */
export function cheeringJoints(person,time=0){
 const s=sampleCheer(time,person.phase||0,person.motion??person.variant??0,person.tempo??1),p=new Float64Array(48),put=(i,v)=>p.set(v,i*3);
 put(0,[0,.9,0]);put(1,[0,1.384,0]);put(2,[0,1.517,0]);put(3,[0,1.594,.003]);
 for(const[side,sign,shoulder,hip]of[['L',1,4,10],['R',-1,7,13]]){const a=s.arms[side];put(shoulder,a.shoulder);put(shoulder+1,a.elbow);put(shoulder+2,a.wrist);put(hip,[sign*.12,.97,-.015]);put(hip+1,[sign*.146,.539,.006]);put(hip+2,[sign*.154,.028,-.002]);}
 const cs=Math.cos(s.lean),sn=Math.sin(s.lean);for(let i=0;i<48;i+=3){const x=p[i],y=p[i+1];p[i]=cs*x-sn*y;p[i+1]=sn*x+cs*y+s.lift;}return p;
}
