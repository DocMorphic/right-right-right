import * as THREE from 'three';

// Native main camera uses a separate, unprocessed cabin overlay for layers 8/10.
// RenderSettings uses the original skybox for a 128px reflection probe at .95.
export function originalCabinProbe(renderer,cube,resolution=128){
  const faces=cube.images.map(source=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;canvas.getContext('2d').drawImage(source,0,0,resolution,resolution);return canvas;});
  const probe=new THREE.CubeTexture(faces);probe.colorSpace=THREE.SRGBColorSpace;probe.needsUpdate=true;
  const generator=new THREE.PMREMGenerator(renderer),target=generator.fromCubemap(probe);generator.dispose();probe.dispose();return target;
}
export function prepareCabinSurfaces(root,environment,reflectionIntensity=.95,anisotropy=8){
  root.traverse(node=>{if(!node.isMesh)return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(material.name==='Car_Glass'||material.userData?.unityShader==='RollingWreck/CarGlass')continue;
      material.toneMapped=false;
      if(environment&&(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial)){
        material.envMap=environment;material.envMapIntensity=reflectionIntensity;
        if(!material.userData.nativeReflectionProbe){
          // Unity's reflection probe supplies specular lighting. Its gradient
          // ambient is already supplied by the scene's hemisphere light.
          const original=material.onBeforeCompile;
          material.onBeforeCompile=function(shader,renderer){original.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );',''));};
          material.customProgramCacheKey=()=> 'original-cabin-specular-probe-v1';material.userData.nativeReflectionProbe=true;
        }
      }
      for(const texture of [material.map,material.normalMap])if(texture){texture.anisotropy=anisotropy;texture.needsUpdate=true;}
      material.needsUpdate=true;
    }
  });
}
