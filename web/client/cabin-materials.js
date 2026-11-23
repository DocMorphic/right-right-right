import * as THREE from 'three';
import {installNativePaint} from './body-paint.js';
import {assetUrl} from './asset-url.js';
import {installNativeLit} from './native-lit.js';

// Native main camera uses a separate, unprocessed cabin overlay for layers 8/10.
// RenderSettings uses the original skybox for a 128px reflection probe at .95.
export async function originalCabinProbe(renderer,spec){
  if(spec?.type!=='RGBA16F'||spec.faces?.length!==6)throw new Error('The original cabin reflection is missing.');
  const loadFace=async(url,width)=>{
    const response=await fetch(assetUrl(url));if(!response.ok)throw new Error('The original cabin reflection could not be loaded.');
    const buffer=await response.arrayBuffer();if(buffer.byteLength!==width*width*8)throw new Error('The original cabin reflection is incomplete.');
    return new THREE.DataTexture(new Uint16Array(buffer),width,width,THREE.RGBAFormat,THREE.HalfFloatType);
  };
  const [faces,mips]=await Promise.all([Promise.all(spec.faces.map(url=>loadFace(url,spec.width))),Promise.all((spec.mips||[]).map(async mip=>({image:await Promise.all(mip.faces.map(url=>loadFace(url,mip.width)))})))]);
  const probe=new THREE.CubeTexture(faces);probe.type=THREE.HalfFloatType;probe.format=THREE.RGBAFormat;probe.colorSpace=THREE.LinearSRGBColorSpace;
  probe.mipmaps=mips;probe.minFilter=THREE.LinearMipmapLinearFilter;probe.generateMipmaps=false;probe.needsUpdate=true;
  return {texture:probe,dispose(){probe.dispose();for(const face of faces)face.dispose();for(const mip of mips)for(const face of mip.image)face.dispose();}};
}
export function prepareCabinSurfaces(root,environment,reflectionIntensity=.95,anisotropy=8,native={}){
  root.traverse(node=>{if(!node.isMesh)return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(material.name==='Car_Glass'||material.userData?.unityShader==='RollingWreck/CarGlass')continue;
      material.toneMapped=false;
      const flags=native.materials?.[material.userData?.unityMaterialName||material.name];
      if(environment&&(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial)){
        // The original painted body explicitly disables environment reflections.
        // Applying the sky probe to it turns the red paint into a cool grey wash.
        material.envMap=null;material.envMapIntensity=reflectionIntensity;
        if(!material.userData.nativeReflectionProbe){
          // Unity's reflection probe supplies specular lighting. Its gradient
          // ambient is already supplied by the scene's hemisphere light.
          const original=material.onBeforeCompile,originalKey=material.customProgramCacheKey();
          material.onBeforeCompile=function(shader,renderer){
            original.call(this,shader,renderer);
            if(native.ambientEquator){
              for(const [key,value]of Object.entries({nativeCabinSky:native.ambientSky,nativeCabinEquator:native.ambientEquator,nativeCabinGround:native.ambientGround}))shader.uniforms[key]={value:new THREE.Color().setRGB(...value.slice(0,3),THREE.SRGBColorSpace)};
              shader.uniforms.nativeCabinSun={value:new THREE.Vector3(...native.sunDirection)};
              // Unity URP's punctual lighting uses normalized intensity without
              // Three's Lambert /PI attenuation. Keep this correction confined
              // to native surfaces; retain Three's directional shadow lookup.
              shader.fragmentShader='uniform vec3 nativeCabinSky,nativeCabinEquator,nativeCabinGround,nativeCabinSun;\n'+shader.fragmentShader;
              shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',THREE.ShaderChunk.lights_fragment_begin
                .replaceAll('getDirectionalLightInfo( directionalLight, directLight );','directionalLight.direction = normalize( (viewMatrix * vec4(nativeCabinSun,0.)).xyz );\ngetDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= PI;')
                .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',`float nativeY = inverseTransformDirection( geometryNormal, viewMatrix ).y;
irradiance += PI * (nativeCabinEquator * (1. - abs(nativeY)) + nativeCabinSky * max(nativeY,0.) + nativeCabinGround * max(-nativeY,0.));`));
            }
            installNativeLit(shader,environment,flags);shader.uniforms.nativeProbeIntensity.value=reflectionIntensity;
            if(material.userData?.unityShader==='RollingWreck/BodyBothSides')installNativePaint(shader,material);
          };
          material.customProgramCacheKey=()=> originalKey+`-original-source-lighting-v4-${flags?.specularHighlights!==false}-${flags?.environmentReflections!==false}-${Boolean(native.ambientEquator)}-${material.userData?.unityShader}`;material.userData.nativeReflectionProbe=true;
        }
      }
      for(const texture of [material.map,material.normalMap])if(texture){texture.anisotropy=anisotropy;texture.needsUpdate=true;}
      material.needsUpdate=true;
    }
  });
}
