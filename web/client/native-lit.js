import * as THREE from 'three';
import {replaceFunctionBody} from './body-paint.js';

// Metallic-workflow URP lighting equations. Preserve the original dielectric
// reflectance, mobile GGX fit and environment response instead of Three's
// multiscattering/Fresnel model. Source: Unity URP BRDF.hlsl (see parity notes).
export function installNativeLit(shader,probe,flags={}){
  Object.assign(shader.uniforms,{nativeProbeCube:{value:probe},nativeUseProbe:{value:flags.environmentReflections===false?0:1},nativeSpecular:{value:flags.specularHighlights===false?0:1},nativeProbeIntensity:{value:.95}});
  shader.fragmentShader=`uniform samplerCube nativeProbeCube;uniform float nativeUseProbe,nativeSpecular,nativeProbeIntensity;\n`+shader.fragmentShader;
  let chunk=replaceFunctionBody(THREE.ShaderChunk.lights_physical_pars_fragment,'RE_Direct_Physical',`
    float alpha=max(material.roughness*material.roughness,.0078125);
    float a2=max(alpha*alpha,.00006103515625);
    vec3 halfDirection=normalize(directLight.direction+geometryViewDir);
    float nh=saturate(dot(geometryNormal,halfDirection)),lh=saturate(dot(directLight.direction,halfDirection));
    float denominator=nh*nh*(a2-1.)+1.00001;
    float highlight=a2/(denominator*denominator*max(.1,lh*lh)*(alpha*4.+2.));
    vec3 incoming=saturate(dot(geometryNormal,directLight.direction))*directLight.color/PI;
    reflectedLight.directDiffuse+=incoming*material.diffuseColor*.96;
    reflectedLight.directSpecular+=incoming*highlight*material.specularColor*nativeSpecular;
  `);
  chunk=replaceFunctionBody(chunk,'RE_IndirectDiffuse_Physical',`reflectedLight.indirectDiffuse+=irradiance/PI*material.diffuseColor*.96;`);
  chunk=replaceFunctionBody(chunk,'RE_IndirectSpecular_Physical',`
    float alpha=max(material.roughness*material.roughness,.0078125);
    float reflectance=max(max(material.specularColor.r,material.specularColor.g),material.specularColor.b);
    float grazing=saturate(1.-material.roughness+reflectance);
    float fresnel=pow(1.-saturate(dot(geometryNormal,geometryViewDir)),4.);
    reflectedLight.indirectSpecular+=radiance*mix(material.specularColor,vec3(grazing),fresnel)/(alpha*alpha+1.);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',chunk);
  shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
    #if defined(RE_IndirectSpecular)
      if(nativeUseProbe>.5){
        vec3 worldN=inverseTransformDirection(geometryNormal,viewMatrix);
        vec3 worldV=inverseTransformDirection(geometryViewDir,viewMatrix);
        vec3 reflected=reflect(-worldV,worldN);
        float rough=material.roughness;
        float nativeLod=rough*(1.7-.7*rough)*6.;
        radiance=textureLod(nativeProbeCube,vec3(-reflected.x,reflected.yz),nativeLod).rgb*nativeProbeIntensity;
      }
    #endif
  `);
}
