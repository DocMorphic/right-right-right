import * as THREE from 'three';
import {assetUrl} from './asset-url.js';

// Native coverage and prototypes are exact. Unity's runtime scatter and grass
// shader are not serialized: positions below use deterministic per-cell scatter.
export async function loadNativeDetails(sceneNumber,textureLoader=new THREE.TextureLoader()){
 const number=Number(sceneNumber);if(![1,2,3].includes(number))throw new Error('Unknown original grass scene.');
 const response=await fetch(assetUrl(`/assets/scenery/native-0${number}.details.json`));if(!response.ok)throw new Error('Original grass metadata could not be loaded.');
 const data=await response.json(),textures=new Map(),textureJobs=new Map();
 const coverages=await Promise.all(data.layers.map(async layer=>{
  const response=await fetch(assetUrl(layer.coverageUrl));if(!response.ok)throw new Error('Original grass coverage could not be loaded.');
  const coverage=new Uint8Array(await response.arrayBuffer());if(coverage.length!==data.resolution**2)throw new Error('Original grass coverage is incomplete.');
  const key=layer.textureSha256||layer.textureUrl;
  if(!textureJobs.has(key))textureJobs.set(key,textureLoader.loadAsync(assetUrl(layer.textureUrl)).then(texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;return texture;}));
  textures.set(layer.textureUrl,await textureJobs.get(key));return coverage;
 }));
 return{data,coverages,textures};
}
const random=(x,z,layer,salt)=>{let h=Math.imul(x^0x9e3779b9,0x85ebca6b)^Math.imul(z^layer,0xc2b2ae35)^Math.imul(salt+1,0x27d4eb2d);h=Math.imul(h^(h>>>16),0x85ebca6b);return ((h^(h>>>13))>>>0)/4294967296;};
const mix=(a,b,t)=>a+(b-a)*t;
function sampleHeight(terrain,heights,u,v){
 const r=terrain.resolution,x=Math.max(0,Math.min(r-1,u*(r-1))),z=Math.max(0,Math.min(r-1,v*(r-1))),x0=Math.floor(x),z0=Math.floor(z),x1=Math.min(r-1,x0+1),z1=Math.min(r-1,z0+1);
 const at=(x,z)=>heights.getUint16((z*r+x)*2,true)/terrain.heightDivisor*terrain.spacing[1];
 return mix(mix(at(x0,z0),at(x1,z0),x-x0),mix(at(x0,z1),at(x1,z1),x-x0),z-z0);
}
export function detailPatch(source,details,patchX,patchZ){
 const terrain=source.data.terrain,spec=details.data,res=spec.resolution,span=spec.patchSamples,transform=new THREE.Matrix4().fromArray(terrain.matrix),heights=new DataView(source.heights),point=new THREE.Vector3();
 return spec.layers.map((layer,index)=>{
  const positions=[],sizes=[],colors=[],healthy=new THREE.Color().setRGB(...layer.healthyColor.slice(0,3),THREE.SRGBColorSpace),dry=new THREE.Color().setRGB(...layer.dryColor.slice(0,3),THREE.SRGBColorSpace),color=new THREE.Color(),coverage=details.coverages[index];
  for(let z=patchZ*span;z<Math.min(res,(patchZ+1)*span);z++)for(let x=patchX*span;x<Math.min(res,(patchX+1)*span);x++){
   const value=coverage[z*res+x];if(!value)continue;
   const expected=value*(layer.useDensityScaling===0?1:spec.density)*(layer.density??1),count=Math.floor(expected)+(random(x,z,index,0)<expected%1?1:0);
   for(let n=0;n<count;n++){
    const u=(x+random(x,z,index,n*5+1))/res,v=(z+random(x,z,index,n*5+2))/res;
    point.set(-u*terrain.size[0],sampleHeight(terrain,heights,u,v),v*terrain.size[2]).applyMatrix4(transform);positions.push(point.x,point.y,point.z);
    sizes.push(mix(layer.minWidth,layer.maxWidth,random(x,z,index,n*5+3)),mix(layer.minHeight,layer.maxHeight,random(x,z,index,n*5+4)));
    color.copy(healthy).lerp(dry,random(x,z,index,n*5+5));colors.push(color.r,color.g,color.b);
   }
  }
  return{positions:new Float32Array(positions),sizes:new Float32Array(sizes),colors:new Float32Array(colors),count:positions.length/3};
 });
}
function grassMaterial(texture,center,distance){
 const material=new THREE.MeshBasicMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide,depthWrite:true,fog:true});
 material.onBeforeCompile=shader=>{
  shader.uniforms.nativeGrassCenter={value:center};shader.uniforms.nativeGrassDistance={value:distance};
  shader.vertexShader='attribute vec3 nativeGrassOffset;attribute vec2 nativeGrassSize;attribute vec3 nativeGrassColor;varying vec3 vNativeGrassColor;varying vec2 vNativeGrassOffset;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 nativeFacing=cameraPosition-nativeGrassOffset;nativeFacing.y=0.;vec3 nativeRight=normalize(vec3(nativeFacing.z,0.,-nativeFacing.x)+vec3(.000001,0.,0.));vec3 transformed=nativeGrassOffset+nativeRight*position.x*nativeGrassSize.x+vec3(0.,position.y*nativeGrassSize.y,0.);vNativeGrassColor=nativeGrassColor;vNativeGrassOffset=nativeGrassOffset.xz;');
  shader.fragmentShader='uniform vec2 nativeGrassCenter;uniform float nativeGrassDistance;varying vec3 vNativeGrassColor;varying vec2 vNativeGrassOffset;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(distance(vNativeGrassOffset,nativeGrassCenter)>nativeGrassDistance)discard;diffuseColor.rgb*=vNativeGrassColor;');
 };
 material.customProgramCacheKey=()=> 'original-detail-vertical-billboard-v1';return material;
}
function geometryFor(patches,layer){
 const entries=[...patches.values()].map(patch=>patch[layer]),count=entries.reduce((sum,entry)=>sum+entry.count,0),geometry=new THREE.InstancedBufferGeometry(),plane=new THREE.PlaneGeometry(1,1);plane.translate(0,.5,0);
 geometry.index=plane.index;geometry.attributes.position=plane.attributes.position;geometry.attributes.uv=plane.attributes.uv;geometry.attributes.normal=plane.attributes.normal;
 for(const [field,name,width]of[['positions','nativeGrassOffset',3],['sizes','nativeGrassSize',2],['colors','nativeGrassColor',3]]){
  const values=new Float32Array(count*width);let at=0;for(const entry of entries){values.set(entry[field],at);at+=entry[field].length;}geometry.setAttribute(name,new THREE.InstancedBufferAttribute(values,width));
 }
 geometry.instanceCount=count;return geometry;
}
export class NativeDetails{
 constructor(world,source,details){
  this.world=world;this.source=source;this.details=details;this.patches=new Map();this.meshes=[];this.center=new THREE.Vector2();this.distance=details.data.renderDistance;
  this.inverse=new THREE.Matrix4().fromArray(source.data.terrain.matrix).invert();this.point=new THREE.Vector3();this.disposed=false;
  details.data.layers.forEach(layer=>{const mesh=new THREE.Mesh(geometryFor(this.patches,0),grassMaterial(details.textures.get(layer.textureUrl),this.center,this.distance));mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=false;mesh.name='Original native grass';mesh.userData.nativeDetails=true;this.meshes.push(mesh);world.add(mesh);});
 }
 update(x,z,now){
  if(this.disposed)return;this.center.set(x,z);const terrain=this.source.data.terrain,spec=this.details.data;
  this.point.set(x,0,z).applyMatrix4(this.inverse);const localX=-this.point.x,localZ=this.point.z,sx=terrain.size[0]/spec.patchCount,sz=terrain.size[2]/spec.patchCount,r=this.distance;
  const wanted=new Set();let changed=false;
  for(let pz=Math.max(0,Math.floor((localZ-r)/sz));pz<Math.min(spec.patchCount,Math.ceil((localZ+r)/sz));pz++)for(let px=Math.max(0,Math.floor((localX-r)/sx));px<Math.min(spec.patchCount,Math.ceil((localX+r)/sx));px++){
   const dx=Math.max(px*sx-localX,0,localX-(px+1)*sx),dz=Math.max(pz*sz-localZ,0,localZ-(pz+1)*sz);if(dx*dx+dz*dz>r*r)continue;
   const key=`${px},${pz}`;wanted.add(key);if(!this.patches.has(key)){this.patches.set(key,detailPatch(this.source,this.details,px,pz));changed=true;}
  }
  for(const key of this.patches.keys())if(!wanted.has(key)){this.patches.delete(key);changed=true;}
  if(changed)this.meshes.forEach((mesh,layer)=>{const old=mesh.geometry;mesh.geometry=geometryFor(this.patches,layer);old.dispose();});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.meshes.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();});this.meshes=[];this.patches.clear();}
}
