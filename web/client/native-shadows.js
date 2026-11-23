import * as THREE from 'three';
import {CSM} from 'three/addons/csm/CSM.js';
import {NativeShadowCaster} from './native-shadow-caster.js';
import {fitCascadeSpheres,projectShadowSphere,installSphereSelection} from './native-shadow-projection.js';

// Integrate a 45-degree tent over the texel instead of sampling a rotating
// disk. Pairing adjacent texels gives the native high-quality 16-fetch PCF.
const primitive=x=>x<0?.5*Math.max(0,x+3.5)**2:12.25-.5*Math.max(0,3.5-x)**2;
export function tentWeights(offset){return Array.from({length:8},(_,i)=>(primitive(i-3-offset)-primitive(i-4-offset))*.081632);}
export function tentPairs(offset){const w=tentWeights(offset);return Array.from({length:4},(_,i)=>({weight:w[2*i]+w[2*i+1],offset:-3.5+2*i+w[2*i+1]/(w[2*i]+w[2*i+1])}));}

const tentGLSL=`
float nativeTentIntegral(float x){return x<0.? .5*pow(max(0.,x+3.5),2.):12.25-.5*pow(max(0.,3.5-x),2.);}
void nativeTentPairs(float offset,out vec4 weights,out vec4 taps){
 for(int i=0;i<4;i++){
  float edge=float(i*2)-4.-offset;
  float a=(nativeTentIntegral(edge+1.)-nativeTentIntegral(edge))*.081632;
  float b=(nativeTentIntegral(edge+2.)-nativeTentIntegral(edge+1.))*.081632;
  weights[i]=a+b;taps[i]=float(i*2)-3.5+b/(a+b);
 }
}
`;
function replaceShadowFunction(chunk,body){
 const start=chunk.indexOf('float getShadow( sampler2DShadow'),open=chunk.indexOf('{',start);
 if(start<0)throw new Error('Native shadow filter is incompatible with this renderer.');
 let depth=1,end=open+1;for(;end<chunk.length&&depth;end++){if(chunk[end]==='{')depth++;if(chunk[end]==='}')depth--;}
 return chunk.slice(0,open+1)+body+chunk.slice(end-1);
}
export function installNativeShadowFilter(shader,settings){
 shader.uniforms.nativeShadowFade={value:new THREE.Vector2(settings.distance*(1-settings.cascadeBorder),settings.distance)};
 shader.fragmentShader='uniform vec2 nativeShadowFade;\n'+shader.fragmentShader;
 const chunk=replaceShadowFunction(THREE.ShaderChunk.shadowmap_pars_fragment,`
 shadowCoord.xyz/=shadowCoord.w;
 #ifdef USE_REVERSED_DEPTH_BUFFER
 shadowCoord.z-=shadowBias;
 #else
 shadowCoord.z+=shadowBias;
 #endif
 float visibility=1.;
 if(all(greaterThanEqual(shadowCoord.xyz,vec3(0.)))&&all(lessThanEqual(shadowCoord.xyz,vec3(1.)))){
  vec2 p=shadowCoord.xy*shadowMapSize,origin=floor(p+.5),fraction=p-origin;
  vec4 wx,wy,tx,ty;nativeTentPairs(fraction.x,wx,tx);nativeTentPairs(fraction.y,wy,ty);
  visibility=0.;
  for(int y=0;y<4;y++)for(int x=0;x<4;x++)visibility+=wx[x]*wy[y]*texture(shadowMap,vec3((origin+vec2(tx[x],ty[y]))/shadowMapSize,shadowCoord.z));
 }
 float fade=clamp((dot(vViewPosition,vViewPosition)-nativeShadowFade.x*nativeShadowFade.x)/(nativeShadowFade.y*nativeShadowFade.y-nativeShadowFade.x*nativeShadowFade.x),0.,1.);
 return mix(1.,visibility,shadowIntensity*(1.-fade));
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',tentGLSL+chunk);
}

/** Four native spherical cascades and atlas-equivalent 1024px tiles. CSM
 * supplies renderer bindings; native projection and selection replace its
 * ordinary depth-slice frustums. */
export class NativeShadows{
 constructor(scene,camera,sourceLight,native){
  this.settings=native.shadows;this.sunDirection=new THREE.Vector3(...native.sunDirection).normalize();this.materials=new WeakSet();this.lastProjection='';
  this.caster=new NativeShadowCaster(this.sunDirection,this.settings,native.renderers);
  this.spheres=Array.from({length:4},()=>new THREE.Vector4());
  const s=this.settings;
  this.csm=new CSM({parent:scene,camera,cascades:s.cascadeCount,maxFar:s.distance,mode:'custom',shadowMapSize:s.atlasResolution/2,
   lightDirection:this.sunDirection.clone().negate(),lightIntensity:sourceLight.intensity,lightNear:s.nearPlane,lightFar:s.distance*3,lightMargin:s.distance,
   customSplitsCallback:(count,near,far,breaks)=>breaks.push(...s.cascadeSplits,1)});
  for(const light of this.csm.lights){light.color.copy(sourceLight.color);light.layers.enable(1);light.shadow.camera.layers.enable(1);light.shadow.intensity=s.strength;}
  scene.remove(sourceLight,sourceLight.target);
 }
 prepare(root){this.caster.prepare(root);root.traverse(mesh=>{if(!mesh.isMesh)return;for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
  if(!(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial)||this.materials.has(material))continue;
  const original=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);this.csm.setupMaterial(material);const csmCompile=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{original.call(material,shader,renderer);csmCompile(shader,renderer);installNativeShadowFilter(shader,this.settings);installSphereSelection(shader,this.spheres);};
  material.customProgramCacheKey=()=>key()+'-native-sphere-projection-caster-v2';material.needsUpdate=true;this.materials.add(material);
  material.addEventListener('dispose',()=>this.csm.shaders.delete(material));
 }});}
 update(){
  const camera=this.csm.camera,projection=camera.projectionMatrix.elements.join(',');
  if(projection!==this.lastProjection){this.csm.updateFrustums();this.lastProjection=projection;}
  camera.updateMatrixWorld();fitCascadeSpheres(camera,this.settings,this.spheres);
  for(const [i,light]of this.csm.lights.entries()){
   projectShadowSphere(this.spheres[i],this.sunDirection,light.shadow.mapSize.x,this.settings.nearPlane,light.shadow.camera);
   light.position.copy(light.shadow.camera.position);light.target.position.copy(light.position).sub(this.sunDirection);
   light.shadow.normalBias=0;light.shadow.bias=0;
  }
 }
 dispose(){this.caster.dispose();this.csm.remove();this.csm.dispose();}
}
