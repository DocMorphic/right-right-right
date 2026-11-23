import * as THREE from 'three';

const saturate=x=>Math.max(0,Math.min(1,x));
/** CPU reference for the native clean-glass DXBC interval28..299. Used against
 * independently executed original bytecode fixtures, not screenshot guesses. */
export function shadeNativeGlass(normal,view,light,{base,highlight,specular,smoothness,rim,front=true}){
  const n=new THREE.Vector3(...normal).normalize().multiplyScalar(front?1:-1),v=new THREE.Vector3(...view).normalize(),l=new THREE.Vector3(...light).normalize();
  const edge=(1-saturate(n.dot(v)))**8*rim;
  const shine=saturate(n.dot(v.clone().add(l).normalize()))**(2**(smoothness*10.5+1))*specular;
  return [...highlight.slice(0,3).map((c,i)=>Math.min([.72,.76,.8][i],base[i]*base[3]+c*(shine+edge))),saturate(base[3]+shine*.35+edge*.15)];
}

export function makeNativeGlass(material,native,atmosphere){
  if(!native?.glass?.floats||!native.glass.colors)throw new Error('The original windshield settings are incomplete. Reload the game to update its assets.');
  const spec=native.glass,settings=spec.floats;
  const glass=new THREE.MeshBasicMaterial({name:material.name,color:material.color.clone(),opacity:material.opacity,
    transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,fog:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor});
  glass.forceSinglePass=true;glass.userData.nativeGlass=true;
  const uniforms={nativeGlassSun:{value:new THREE.Vector3(...native.sunDirection).normalize()},
    nativeGlassLight:{value:new THREE.Color().setRGB(...atmosphere.sun.color,THREE.SRGBColorSpace).multiplyScalar(atmosphere.sun.intensity)},
    nativeGlassHighlight:{value:new THREE.Color().setRGB(...spec.colors._HighlightColor.slice(0,3),THREE.SRGBColorSpace)},
    nativeGlassSpecular:{value:settings._SpecStrength},nativeGlassSmoothness:{value:settings._Smoothness},nativeGlassRim:{value:settings._Rim}};
  glass.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 nativeGlassNormalWorld,nativeGlassPositionWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
nativeGlassPositionWorld=(modelMatrix*vec4(transformed,1.)).xyz;
nativeGlassNormalWorld=inverseTransformDirection(normalize(normalMatrix*normal),viewMatrix);`);
    shader.fragmentShader=`varying vec3 nativeGlassNormalWorld,nativeGlassPositionWorld;uniform vec3 nativeGlassSun,nativeGlassLight,nativeGlassHighlight;uniform float nativeGlassSpecular,nativeGlassSmoothness,nativeGlassRim;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec3 nativeGlassN=normalize(nativeGlassNormalWorld)*(gl_FrontFacing?1.:-1.);
vec3 nativeGlassV=normalize(cameraPosition-nativeGlassPositionWorld);
float nativeGlassEdge=pow(1.-clamp(dot(nativeGlassN,nativeGlassV),0.,1.),8.)*nativeGlassRim;
vec3 nativeGlassH=normalize(nativeGlassV+nativeGlassSun);
float nativeGlassShine=pow(clamp(dot(nativeGlassN,nativeGlassH),0.,1.),exp2(nativeGlassSmoothness*10.5+1.))*nativeGlassSpecular;
diffuseColor.rgb=min(diffuseColor.rgb*diffuseColor.a+nativeGlassHighlight*(nativeGlassShine+nativeGlassEdge),vec3(.72,.76,.8));
diffuseColor.a=clamp(diffuseColor.a+nativeGlassShine*.35+nativeGlassEdge*.15,0.,1.);
// NATIVE_GLASS_END`);
  };
  glass.customProgramCacheKey=()=> 'native-glass-premultiplied-v1';return glass;
}
