import * as THREE from 'three';
import {assetUrl} from './asset-url.js';

// Original terrain samples are signed-height-range values stored in uint16s.
// Keep every authored vertex; chunking only allows distant geometry to be culled.
export function terrainChunks(spec,buffer,chunkSize=32){
  const r=spec.resolution,sx=spec.size[0]/(r-1),sz=spec.size[2]/(r-1),data=new DataView(buffer),height=(x,z)=>data.getUint16((z*r+x)*2,true)/spec.heightDivisor*spec.spacing[1];
  if(buffer.byteLength!==r*r*2)throw new Error('The original terrain height data is incomplete.');
  const transform=new THREE.Matrix4().fromArray(spec.matrix),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform),point=new THREE.Vector3(),normal=new THREE.Vector3(),chunks=[];
  for(let z0=0;z0<r-1;z0+=chunkSize)for(let x0=0;x0<r-1;x0+=chunkSize){
    const nx=Math.min(chunkSize,r-1-x0),nz=Math.min(chunkSize,r-1-z0),positions=[],normals=[],uvs=[],indices=[];
    for(let z=z0;z<=z0+nz;z++)for(let x=x0;x<=x0+nx;x++){
      point.set(-x*sx,height(x,z),z*sz).applyMatrix4(transform);positions.push(...point.toArray());
      const l=Math.max(0,x-1),rr=Math.min(r-1,x+1),b=Math.max(0,z-1),f=Math.min(r-1,z+1);
      normal.set((height(rr,z)-height(l,z))/((rr-l)*sx),1,-(height(x,f)-height(x,b))/((f-b)*sz)).applyMatrix3(normalMatrix).normalize();normals.push(...normal.toArray());
      uvs.push(x/(r-1),1-z/(r-1));
    }
    for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=z*(nx+1)+x;indices.push(i,i+1,i+nx+1,i+1,i+nx+2,i+nx+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();chunks.push(geometry);
  }
  return chunks;
}

export function roadFootprint(spec,roadMesh,resolution=2048){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=resolution;const c=canvas.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,resolution,resolution);c.fillStyle='#fff';
  const inverse=new THREE.Matrix4().fromArray(spec.matrix).invert(),point=new THREE.Vector3(),projected=[];
  for(let i=0;i<roadMesh.positions.length;i+=3){point.fromArray(roadMesh.positions,i).applyMatrix4(inverse);projected.push([-point.x/spec.size[0]*resolution,point.z/spec.size[2]*resolution]);}
  c.beginPath();for(let i=0;i<roadMesh.indices.length;i+=3){const a=projected[roadMesh.indices[i]],b=projected[roadMesh.indices[i+1]],d=projected[roadMesh.indices[i+2]];c.moveTo(...a);c.lineTo(...b);c.lineTo(...d);c.closePath();}c.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;texture.flipY=true;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;return texture;
}
function terrainMaterial(spec,textures,roadMask){
  const material=new THREE.MeshStandardMaterial({roughness:1,normalMap:textures.get(spec.layers.find(layer=>layer.normal)?.normal)||null});
  const uniforms={nativeSplat:{value:textures.get(spec.splats[0].url)},nativeSize:{value:new THREE.Vector2(spec.size[0],spec.size[2])},nativeRoadMask:{value:roadMask}};
  material.userData.ownedTextures=roadMask?[roadMask]:[];
  for(let i=0;i<3;i++){
    const layer=spec.layers[i];uniforms[`nativeLayer${i}`]={value:textures.get(layer.diffuse)};uniforms[`nativeNormal${i}`]={value:layer.normal?textures.get(layer.normal):null};
    uniforms[`nativeTile${i}`]={value:new THREE.Vector2(...layer.tileSize)};uniforms[`nativeOffset${i}`]={value:new THREE.Vector2(...layer.tileOffset)};uniforms[`nativeTint${i}`]={value:new THREE.Color().setRGB(...layer.tint.slice(0,3),THREE.SRGBColorSpace)};
  }
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec2 vNativeTerrainUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvNativeTerrainUv=uv;');
    shader.fragmentShader=`varying vec2 vNativeTerrainUv;uniform sampler2D nativeSplat;uniform sampler2D nativeRoadMask;uniform vec2 nativeSize;\n${[0,1,2].map(i=>`uniform sampler2D nativeLayer${i};uniform sampler2D nativeNormal${i};uniform vec2 nativeTile${i};uniform vec2 nativeOffset${i};uniform vec3 nativeTint${i};`).join('\n')}\n`+shader.fragmentShader;
    const coords='vec2 nativeLocal=vec2(vNativeTerrainUv.x,1.-vNativeTerrainUv.y)*nativeSize;vec3 nativeWeights=texture2D(nativeSplat,vNativeTerrainUv).rgb;nativeWeights/=max(dot(nativeWeights,vec3(1.)),.00001);';
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`${roadMask?'if(texture2D(nativeRoadMask,vNativeTerrainUv).r>.5)discard;':''}${coords}\ndiffuseColor.rgb*=${[0,1,2].map(i=>`texture2D(nativeLayer${i},(nativeLocal+nativeOffset${i})/nativeTile${i}).rgb*nativeTint${i}*nativeWeights.${'rgb'[i]}`).join('+')};`);
    if(material.normalMap)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 nativeMapNormal=${[0,1,2].map(i=>`${spec.layers[i].normal?`(texture2D(nativeNormal${i},(nativeLocal+nativeOffset${i})/nativeTile${i}).xyz*2.-1.)`:'vec3(0.,0.,1.)'}*nativeWeights.${'rgb'[i]}`).join('+')};normal=normalize(tbn*normalize(nativeMapNormal));`);
  };
  material.customProgramCacheKey=()=>`native-terrain-${spec.layers.map(x=>!!x.normal).join('-')}`;
  return material;
}

export async function loadNativeScenery(loader,progress=()=>{}){
  const textures=new Map(),models=new Map(),textureLoader=new THREE.TextureLoader();
  const textureJobs=new Map(),modelJobs=new Map();
  const texture=(url,data=false)=>{if(!url)return Promise.resolve();if(!textureJobs.has(url))textureJobs.set(url,textureLoader.loadAsync(assetUrl(url)).then(t=>{t.colorSpace=data?THREE.NoColorSpace:THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(data&&url.includes('.splat-')){t.flipY=false;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;}textures.set(url,t);}));return textureJobs.get(url);};
  const model=url=>{if(!modelJobs.has(url))modelJobs.set(url,loader.loadAsync(assetUrl(url)).then(g=>models.set(url,g.scene)));return modelJobs.get(url);};
  const scenes=await Promise.all([1,2,3].map(async number=>{
    const response=await fetch(assetUrl(`/assets/scenery/native-0${number}.json`));if(!response.ok)throw new Error(`Original Stage 0${number} scenery could not be loaded.`);const data=await response.json();
    const heights=fetch(assetUrl(data.terrain.heightUrl)).then(r=>{if(!r.ok)throw new Error('Original terrain could not be loaded.');return r.arrayBuffer();});
    await Promise.all([...data.terrain.layers.flatMap(layer=>[texture(layer.diffuse),texture(layer.normal,true)]),...data.terrain.splats.map(s=>texture(s.url,true)),...Object.values(data.propModels).map(m=>model(m.url))]);
    progress(`Loading original Stage 0${number} terrain and forest…`);return {data,heights:await heights};
  }));
  return {scenes:new Map(scenes.map(s=>[String(s.data.scene),s])),textures,models};
}

export function addNativeScenery(world,sceneNumber,catalog,treeModels,roadMesh){
  const source=catalog.scenes.get(String(sceneNumber));if(!source)throw new Error('Original stage scenery is unavailable.');
  const {data,heights}=source,ground=terrainMaterial(data.terrain,catalog.textures,roadMesh?roadFootprint(data.terrain,roadMesh):null);
  for(const geometry of terrainChunks(data.terrain,heights)){const mesh=new THREE.Mesh(geometry,ground);mesh.receiveShadow=true;mesh.userData.disposable=true;mesh.userData.courseMaterial=ground;mesh.userData.terrainChunk=true;mesh.matrixAutoUpdate=false;world.add(mesh);}
  const materials=new Map(),groups=new Map(),matrix=new THREE.Matrix4(),placement=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const instances=[...data.backgroundTrees.map(entry=>({...entry,tree:true})),...data.props];
  for(const item of instances){const key=`${item.tree?'tree':'prop'}:${item.model}:${item.materialSet}:${Math.floor(item.position[0]/45)},${Math.floor(item.position[2]/45)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  for(const entries of groups.values()){
    const first=entries[0],model=first.tree?treeModels[`tree${first.model}`]:catalog.models.get(data.propModels[first.model].url);model.updateMatrixWorld(true);let primitive=0;
    model.traverse(mesh=>{if(!mesh.isMesh)return;const materialSpec=data.materialSets[first.materialSet]?.[primitive++],key=JSON.stringify(materialSpec);let material=mesh.material;
      if(materialSpec){if(!materials.has(key)){const color=new THREE.Color().setRGB(...materialSpec.color.slice(0,3),THREE.SRGBColorSpace),args={color,side:materialSpec.doubleSided?THREE.DoubleSide:THREE.FrontSide};materials.set(key,materialSpec.unlit?new THREE.MeshBasicMaterial(args):new THREE.MeshStandardMaterial({...args,roughness:materialSpec.roughness}));}material=materials.get(key);}
      const instanced=new THREE.InstancedMesh(mesh.geometry,material,entries.length);instanced.receiveShadow=!first.tree;instanced.castShadow=!first.tree;instanced.userData.castShadowAllowed=!first.tree;instanced.userData.courseMaterial=materialSpec?material:null;
      entries.forEach((entry,i)=>{if(entry.matrix)placement.fromArray(entry.matrix);else placement.compose(position.fromArray(entry.position),rotation.setFromAxisAngle(up,entry.yaw),scale.setScalar(entry.scale));matrix.multiplyMatrices(placement,mesh.matrixWorld);instanced.setMatrixAt(i,matrix);});instanced.computeBoundingSphere();instanced.matrixAutoUpdate=false;world.add(instanced);
    });
  }
}
