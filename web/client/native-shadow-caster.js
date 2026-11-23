import * as THREE from 'three';

export function casterBias(position,normal,sun,depthBias,normalBias,worldTexel){
 const p=new THREE.Vector3(...position),n=new THREE.Vector3(...normal).normalize(),l=new THREE.Vector3(...sun).normalize();
 return p.addScaledVector(l,-depthBias*worldTexel*3.5).addScaledVector(n,-normalBias*worldTexel*3.5*(1-Math.max(0,n.dot(l))));
}

/** Bias the actual caster vertices, as the original URP ShadowCaster pass does.
 * Receiver bias cannot reproduce silhouettes or shadow-pancaked triangles. */
export class NativeShadowCaster{
 constructor(sun,settings,renderers={}){
  this.sun=sun;this.settings=settings;this.renderers=renderers;this.meshes=new WeakSet();
  this.uniforms={nativeCasterSun:{value:sun},nativeCasterBias:{value:new THREE.Vector2()}};
  this.material=new THREE.MeshDepthMaterial({depthPacking:THREE.BasicDepthPacking,polygonOffset:true,polygonOffsetFactor:2.5,polygonOffsetUnits:1});
  this.material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,this.uniforms);
   shader.vertexShader='uniform vec3 nativeCasterSun;uniform vec2 nativeCasterBias;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace(/#ifdef USE_DISPLACEMENTMAP\s+(?=#include <beginnormal_vertex>)/, '#if 1\n');
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
    #include <defaultnormal_vertex>
    vec4 casterPosition=vec4(transformed,1.);
    #ifdef USE_BATCHING
      casterPosition=batchingMatrix*casterPosition;
    #endif
    #ifdef USE_INSTANCING
      casterPosition=instanceMatrix*casterPosition;
    #endif
    vec3 casterWorld=(modelMatrix*casterPosition).xyz;
    vec3 casterNormal=normalize(inverseTransformDirection(transformedNormal,viewMatrix));
    casterWorld+=nativeCasterSun*nativeCasterBias.x+casterNormal*nativeCasterBias.y*(1.-clamp(dot(casterNormal,nativeCasterSun),0.,1.));
    vec4 mvPosition=viewMatrix*vec4(casterWorld,1.);
    gl_Position=projectionMatrix*mvPosition;
    // Unity's directional shadow pancaking, expressed in OpenGL clip space.
    gl_Position.z=max(gl_Position.z,-gl_Position.w);
   `);
  };
  this.material.customProgramCacheKey=()=> 'native-caster-bias-and-pancaking-v1';
 }
 prepare(root){root.traverse(mesh=>{
  if(!mesh.isMesh||this.meshes.has(mesh)||mesh.customDepthMaterial)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(materials.some(material=>material.userData?.nativeGlass))return;
  let source=mesh;while(source&&source.userData.unityPathId==null)source=source.parent;
  const flags=this.renderers[source?.userData.unityPathId];
  if(flags){mesh.castShadow=flags.castShadows;mesh.receiveShadow=flags.receiveShadows;}
  for(const material of materials)material.shadowSide=flags?.castingMode===2?THREE.DoubleSide:material.side;
  mesh.customDepthMaterial=this.material;const previous=mesh.onBeforeShadow;
  mesh.onBeforeShadow=(renderer,object,camera,shadowCamera,geometry,material,group)=>{
   previous.call(mesh,renderer,object,camera,shadowCamera,geometry,material,group);
   const texel=(shadowCamera.right-shadowCamera.left)/(this.settings.atlasResolution/2);
   this.uniforms.nativeCasterBias.value.set(-this.settings.depthBias*texel*3.5,-this.settings.normalBias*texel*3.5);
  };
  this.meshes.add(mesh);
 });}
 dispose(){this.material.dispose();}
}
