import * as THREE from 'three';
import {NATIVE_MUD_GLSL} from './native-mud-mask.js';

// Original BodyVisual-space pivots, projected blade directions and reach (+.02m).
export const WIPER_GLASS=Object.freeze({axis:[0,.814408936,.580291379],pivots:[[.428722322,.949999988,.960249186],[-.0080000004,.976000011,.981999993]],rests:[[-.998290335,-.033918052,.047602231],[-.997446208,.041445405,-.058166483]],reach:[.757945306,.709085078]});
export function smoothMud(car,target,dt){
  car.mudDisplay??=0;car.mudVelocity??=0;
  const omega=2/.15,x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x),change=car.mudDisplay-target,temp=(car.mudVelocity+omega*change)*dt;
  car.mudVelocity=(car.mudVelocity-omega*temp)*decay;car.mudDisplay=target+(change+temp)*decay;
  return car.mudDisplay;
}
export function installWindshieldMud(mesh,material,body,color=[.3,.2,.11]){
  const m=material.clone();mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox,size=bounds.getSize(new THREE.Vector3()),heightAxis='y';
  body.updateWorldMatrix(true,true);const localToBody=new THREE.Matrix4().copy(body.matrixWorld).invert().multiply(mesh.matrixWorld);
  const uniforms={mud:{value:0},mudAhead:{value:0},wipeFrom:{value:0},wipeTo:{value:0},wipeRunning:{value:0},mudColor:{value:new THREE.Color().setRGB(...color,THREE.SRGBColorSpace)},mudBoundsMin:{value:bounds.min.clone()},mudBoundsSize:{value:size},mudLocalToBody:{value:localToBody}};
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec2 vMudUv;varying vec3 vMudPoint;uniform vec3 mudBoundsMin;uniform vec3 mudBoundsSize;uniform mat4 mudLocalToBody;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvMudUv=vec2((position.x-mudBoundsMin.x)/max(.0001,mudBoundsSize.x),(position.${heightAxis}-mudBoundsMin.${heightAxis})/max(.0001,mudBoundsSize.${heightAxis}));vMudPoint=(mudLocalToBody*vec4(position,1.)).xyz;`);
    shader.fragmentShader=`varying vec2 vMudUv;varying vec3 vMudPoint;uniform float mud;uniform float mudAhead;uniform float wipeFrom;uniform float wipeTo;uniform float wipeRunning;uniform vec3 mudColor;
${NATIVE_MUD_GLSL}
float bladeSector(vec3 pivot,vec3 rest,float reach,float fromAngle,float toAngle){vec3 axis=vec3(0.,.814408936,.580291379),d=vMudPoint-pivot;d-=axis*dot(d,axis);float r=length(d);float a=-atan(dot(axis,cross(rest,d)),dot(rest,d));float lo=min(fromAngle,toAngle),hi=max(fromAngle,toAngle);return step(reach*.18,r)*step(r,reach)*step(lo-.015,a)*step(a,hi+.015);}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
float passed=max(bladeSector(vec3(.428722322,.949999988,.960249186),vec3(-.998290335,-.033918052,.047602231),.757945306,wipeFrom,wipeTo),bladeSector(vec3(-.008,.976000011,.981999993),vec3(-.997446208,.041445405,-.058166483),.709085078,wipeFrom,wipeTo));
float fullSweep=max(bladeSector(vec3(.428722322,.949999988,.960249186),vec3(-.998290335,-.033918052,.047602231),.757945306,0.,1.658062789),bladeSector(vec3(-.008,.976000011,.981999993),vec3(-.997446208,.041445405,-.058166483),.709085078,0.,1.658062789));
float amount=mix(mud,mix(max(mud,mudAhead),mud,passed),fullSweep*wipeRunning);
float mudMask=nativeMudMask(vec2(1.-vMudUv.x,vMudUv.y),vec2(0.),vec2(1.),amount,3.5);
diffuseColor.rgb=mix(diffuseColor.rgb,mudColor,mudMask);diffuseColor.a=mix(diffuseColor.a,1.,mudMask);`);
  };
  // Coverage is recovered from the original compiled Unity fragment program.
  m.customProgramCacheKey=()=> 'native-glass-swept-mud-v3';
  return {material:m,uniforms};
}
