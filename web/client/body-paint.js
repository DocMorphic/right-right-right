import * as THREE from 'three';

export function replaceFunctionBody(source,name,body){
  const start=source.indexOf(`void ${name}(`),open=source.indexOf('{',start);
  if(start<0||open<0)throw new Error(`Native paint shader hook ${name} is unavailable.`);
  let depth=1,end=open+1;for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
  if(depth)throw new Error('Native paint shader hook is incomplete.');
  return source.slice(0,open+1)+'\n'+body+'\n'+source.slice(end-1);
}

/** RollingWreck/BodyBothSides compiled fragment program, not generic glTF PBR.
 * Native paint warms/desaturates ambient 45%, adds Lambert sun and a simple
 * half-vector highlight: exponent exp2(smoothness*8+1), strength .1+.4*metallic.
 * Three's shadowed light has already been converted to native intensity.
 */
export function installNativePaint(shader,material){
  shader.uniforms.nativePaintSmoothness={value:1-material.roughness};
  shader.uniforms.nativePaintMetallic={value:material.metalness};
  shader.fragmentShader='uniform float nativePaintSmoothness,nativePaintMetallic;\n'+shader.fragmentShader;
  const include='#include <lights_physical_pars_fragment>',expanded=!shader.fragmentShader.includes(include);
  let lighting=replaceFunctionBody(expanded?shader.fragmentShader:THREE.ShaderChunk.lights_physical_pars_fragment,'RE_Direct_Physical',`
    vec3 lightColor = directLight.color / PI;
    reflectedLight.directDiffuse += material.diffuseColor * saturate(dot(geometryNormal,directLight.direction)) * lightColor;
    vec3 halfVector = normalize(directLight.direction + geometryViewDir);
    float shine = pow(saturate(dot(geometryNormal,halfVector)),exp2(nativePaintSmoothness*8.+1.));
    reflectedLight.directSpecular += shine * (.1 + .4*nativePaintMetallic) * lightColor;
  `);
  lighting=replaceFunctionBody(lighting,'RE_IndirectDiffuse_Physical',`
    vec3 ambient = irradiance / PI;
    float luminance = dot(ambient,vec3(.299,.587,.114));
    ambient = mix(ambient,luminance*vec3(1.04,.96,.92),.45);
    reflectedLight.indirectDiffuse += material.diffuseColor * ambient;
  `);
  shader.fragmentShader=expanded?lighting:shader.fragmentShader.replace(include,lighting);
}
