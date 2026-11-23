import * as THREE from 'three';

// Crew A retains the original red/blue pair. Crew B uses gold/teal on the
// original clothing and helmets; faces, visor, decals, geometry and rigs stay intact.
export const CREW_B_COLORS=Object.freeze(['#dfb642','#38aa9a']);
export function applyCrewColors(root,team,role){
 const owned=[];if(team!==1)return owned;
 const color=new THREE.Color(CREW_B_COLORS[role%2]),cache=new Map();
 root.traverse(mesh=>{if(!mesh.isMesh)return;
  const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const materials=source.map(material=>{
   if(!material||!['LightBrown','Red_main','Blue_main','Red_inside','Blue_inside'].includes(material.name))return material;
   if(cache.has(material))return cache.get(material);
   const next=material.clone();delete next.userData.nativeReflectionProbe;
   next.userData.crewColor=color.getHexString();next.userData.crewTeam=team;
   if(material.name==='LightBrown')next.color.copy(color);
   else if(material.name.endsWith('_inside'))next.color.copy(color).multiplyScalar(.12);
   else{
    next.color.setRGB(1,1,1);const original=next.onBeforeCompile,key=next.customProgramCacheKey.bind(next);
    next.onBeforeCompile=function(shader,renderer){
     original.call(this,shader,renderer);shader.uniforms.crewHelmetColor={value:color};
     shader.fragmentShader='uniform vec3 crewHelmetColor;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float crewHigh=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
float crewLow=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
if(crewHigh-crewLow>.025)diffuseColor.rgb=crewHelmetColor*crewHigh;`);
    };
    next.customProgramCacheKey=()=>key()+'-crew-helmet-v1';
   }
   cache.set(material,next);owned.push(next);return next;
  });mesh.material=Array.isArray(mesh.material)?materials:materials[0];
 });return owned;
}
