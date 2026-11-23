import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync}from'node:zlib';
import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{collisionMesh}from'../client/collision-mesh.js';
import{backgroundTreeColliders}from'../shared/world-collision.js';
const manifest=JSON.parse(await readFile(new URL('../public/assets/manifest.json',import.meta.url),'utf8')),templates={};
globalThis.ProgressEvent??=class{constructor(type,options){Object.assign(this,{type},options);}};
async function model(url){const b=await readFile(new URL('../public'+url,import.meta.url)),n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n)),start=20+n,bin=b.subarray(start+8,start+8+b.readUInt32LE(start));delete j.images;delete j.textures;for(const m of j.materials||[]){delete m.pbrMetallicRoughness?.baseColorTexture;delete m.normalTexture;delete m.emissiveTexture;}j.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');return(await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene;}
const courses=[];for(let i=1;i<=3;i++){
 const data=JSON.parse(await readFile(new URL(`../public/assets/scenery/native-0${i}.json`,import.meta.url),'utf8')),spec=data.terrain,source=await readFile(new URL('../public'+spec.heightUrl,import.meta.url));
 for(const[name,s]of Object.entries(data.propModels))if(/^(Rock|TreeStump)/.test(name)&&!templates[name])templates[name]=collisionMesh(await model(s.url));
 courses.push({id:String(i),terrain:spec,heightsEncoding:'gzip',heights:gzipSync(source).toString('base64'),trees:backgroundTreeColliders(data.backgroundTrees,manifest.models.trees),props:data.props.filter(p=>/^(Rock|TreeStump)/.test(p.model))});
}await writeFile(new URL('../server/spectator-ground.generated.json',import.meta.url),JSON.stringify({copyright:'Original terrain: Stellux Interactive. Used under developer permission; excluded from MIT source license.',templates,courses}));console.log('Exported full-resolution terrain, existing forest trunks and rock/stump contact meshes.');
