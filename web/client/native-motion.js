import * as THREE from 'three';

/** Native CameraOnly blur uses backwards NDC velocity, clamps it, then applies
 * intensity. It deliberately does not halve NDC into UV velocity (Unity's
 * original effect preserves this convention). */
export function cameraVelocity(uv,depth,inverseViewProjection,previousViewProjection,clamp=.05,intensity=.22){
 const world=new THREE.Vector4(uv[0]*2-1,uv[1]*2-1,depth*2-1,1).applyMatrix4(inverseViewProjection);world.multiplyScalar(1/world.w);
 const before=world.clone().applyMatrix4(previousViewProjection);if(before.w<=0)return new THREE.Vector2();
 const velocity=new THREE.Vector2(before.x/before.w-(uv[0]*2-1),before.y/before.w-(uv[1]*2-1));
 if(velocity.length()>clamp)velocity.setLength(clamp);return velocity.multiplyScalar(intensity);
}
export function blurOffsets(iterations,jitter){return Array.from({length:iterations},(_,i)=>[-(i+1-jitter)/(iterations*2),(i+jitter)/(iterations*2)]).flat();}

export const MOTION_GLSL=`
uniform sampler2D worldDepth;
uniform mat4 inverseViewProjection,previousViewProjection;
uniform float motionIntensity,motionClamp;
uniform vec2 sourceSize;
vec3 nativeWorldSample(vec2 uv){
 // Match the source point-clamp gather without changing the world target's
 // linear filter used by the stationary/fullscreen copy.
 vec2 pixel=(floor(clamp(uv,vec2(0.),vec2(1.))*sourceSize)+.5)/sourceSize;
 return texture2D(worldColor,clamp(pixel,.5/sourceSize,1.-.5/sourceSize)).rgb;
}
vec3 nativeMotionColor(vec2 uv){
 if(motionIntensity<=0.)return texture2D(worldColor,uv).rgb;
 float depth=texture2D(worldDepth,uv).r;
 vec4 world=inverseViewProjection*vec4(uv*2.-1.,depth*2.-1.,1.);world/=world.w;
 vec4 previous=previousViewProjection*world;
 if(previous.w<=0.)return texture2D(worldColor,uv).rgb;
 vec2 velocity=previous.xy/previous.w-(uv*2.-1.);
 float speed=length(velocity);velocity*=min(speed,motionClamp)/max(speed,.0000001)*motionIntensity;
 if(dot(velocity,velocity)<.000000000001)return texture2D(worldColor,uv).rgb;
 float jitter=fract(52.9829189*fract(dot(uv*sourceSize,vec2(.06711056,.00583715))));
 vec3 color=vec3(0.);
 for(int i=0;i<NATIVE_MOTION_ITERATIONS;i++){
  color+=nativeWorldSample(uv-velocity*(float(i)+1.-jitter)/float(NATIVE_MOTION_ITERATIONS*2));
  color+=nativeWorldSample(uv+velocity*(float(i)+jitter)/float(NATIVE_MOTION_ITERATIONS*2));
 }
 return color/float(NATIVE_MOTION_ITERATIONS*2);
}
`;

export class MotionHistory{
 constructor(){this.current=new THREE.Matrix4();this.previous=new THREE.Matrix4();this.inverse=new THREE.Matrix4();this.position=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.valid=false;this.lastTime=0;this.width=0;this.height=0;}
 reset(){this.valid=false;}
 prepare(camera,width,height,now){
  camera.updateMatrixWorld();this.current.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.inverse.copy(this.current).invert();
  // A resumed tab, respawn, camera cut or resized target has no valid previous
  // image. Reset rather than smearing the whole screen during that transition.
  const continuity=this.valid&&now>this.lastTime&&now-this.lastTime<150&&this.width===width&&this.height===height&&this.position.distanceTo(camera.position)<5&&this.rotation.angleTo(camera.quaternion)<Math.PI/4;
  if(!continuity)this.previous.copy(this.current);
  return continuity;
 }
 commit(camera,width,height,now){this.previous.copy(this.current);this.position.copy(camera.position);this.rotation.copy(camera.quaternion);this.width=width;this.height=height;this.lastTime=now;this.valid=true;}
}
