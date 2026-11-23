import * as THREE from 'three';
const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);

/** Projection reconstructed from original-runtime matrix/sphere captures at
 * multiple FOVs, aspect ratios and world positions. Inputs are world-space
 * culling spheres; XY guard band, depth expansion and texel flooring are native. */
export function projectShadowSphere(sphere,sun,resolution=1024,near=.2,camera=new THREE.OrthographicCamera()){
 const center=new THREE.Vector3(sphere.x,sphere.y,sphere.z),radius=sphere.w;
 const right=new THREE.Vector3(0,1,0).cross(sun).normalize(),up=sun.clone().cross(right).normalize();
 const projectionRadius=radius*(1+10/resolution),texel=2*projectionRadius/resolution;
 const x=Math.floor(center.dot(right)/texel)*texel,y=Math.floor(center.dot(up)/texel)*texel;
 const depthSpan=2.2*radius+2,eyeZ=center.dot(sun)+1+depthSpan/2+near;
 camera.position.copy(right).multiplyScalar(x).addScaledVector(up,y).addScaledVector(sun,eyeZ);
 camera.up.copy(up);camera.lookAt(camera.position.clone().sub(sun));
 Object.assign(camera,{left:-projectionRadius,right:projectionRadius,top:projectionRadius,bottom:-projectionRadius,near,far:near+depthSpan});
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 return new THREE.Matrix4().multiplyMatrices(bias,camera.projectionMatrix).multiply(camera.matrixWorldInverse);
}

export function fitCascadeSpheres(camera,settings,spheres){
 const e=camera.projectionMatrix.elements,f=Math.fround;
 // Unity's culling frustum is reconstructed with float32 inverse-projection
 // coefficients. At the original .01/1000 clip range the far corner differs
 // measurably from camera.far; native-runtime captures confirm this depth scale.
 const invZ=f(1/f(e[14])),invW=f(f(e[10])/f(e[14]));
 const reconstructedFar=1/f(invZ+invW),near=camera.near,far=Math.min(camera.far,settings.distance)*reconstructedFar/camera.far;
 const diagonalSquared=1/(e[0]*e[0])+1/(e[5]*e[5]);
 const forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
 for(let i=0;i<settings.cascadeCount;i++){
  const start=i===0?near:near+settings.cascadeSplits[i-1]*(far-near),end=near+(settings.cascadeSplits[i]??1)*(far-near);
  const distance=Math.min(end,(start+end)*(1+diagonalSquared)/2);
  const radius=Math.sqrt(diagonalSquared*end*end+(end-distance)**2);
  const center=camera.position.clone().addScaledVector(forward,distance);spheres[i].set(center.x,center.y,center.z,radius);
 }
 return spheres;
}

export function sphereCascade(point,spheres){return spheres.findIndex(s=>point.distanceToSquared(new THREE.Vector3(s.x,s.y,s.z))<s.w*s.w);}

export function installSphereSelection(shader,spheres){
 shader.uniforms.nativeShadowSpheres={value:spheres};
 shader.vertexShader='varying vec3 nativeShadowPosition;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
 vec4 nativeShadowObject=vec4(transformed,1.);
 #ifdef USE_BATCHING
 nativeShadowObject=batchingMatrix*nativeShadowObject;
 #endif
 #ifdef USE_INSTANCING
 nativeShadowObject=instanceMatrix*nativeShadowObject;
 #endif
 nativeShadowPosition=(modelMatrix*nativeShadowObject).xyz;
 `);
 shader.fragmentShader='varying vec3 nativeShadowPosition;uniform vec4 nativeShadowSpheres[4];\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);',`
 int nativeCascadeIndex=4;
 for(int sphere=3;sphere>=0;sphere--){vec3 delta=nativeShadowPosition-nativeShadowSpheres[sphere].xyz;if(dot(delta,delta)<nativeShadowSpheres[sphere].w*nativeShadowSpheres[sphere].w)nativeCascadeIndex=sphere;}
 `);
 shader.fragmentShader=shader.fragmentShader.replace('linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y','nativeCascadeIndex == UNROLLED_LOOP_INDEX');
 shader.fragmentShader=shader.fragmentShader.replace('linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && (linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)','nativeCascadeIndex == UNROLLED_LOOP_INDEX || (nativeCascadeIndex == 4 && UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)');
}
