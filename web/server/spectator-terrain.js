import catalog from './spectator-ground.generated.json' with {type:'json'};
import {gunzipSync}from'node:zlib';
import {registerSpectatorFloor} from '../shared/spectator-ragdoll.js';
import {registerWorldCollision,buildPropSurface}from'../shared/world-collision.js';
import {RoadSurface} from '../shared/road-surface.js';
for(const spec of catalog.courses){const bytes=gunzipSync(Buffer.from(spec.heights,'base64'));registerWorldCollision(spec.id,{terrain:spec.terrain,heights:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),trees:spec.trees,props:buildPropSurface(catalog.templates,spec.props)});}
export function spectatorCollisionFloor(course){
 let collision=course;
 if(!course.roadMesh){const positions=[],indices=[];for(let i=0;i<course.points.length;i++){const a=course.points[Math.max(0,i-1)],b=course.points[Math.min(course.points.length-1,i+1)],p=course.points[i],n=Math.hypot(b.x-a.x,b.z-a.z)||1,w=(course.widths?.[i]??course.width)/2;for(const s of[-1,1])positions.push(p.x+(b.z-a.z)/n*w*s,p.y+.015,p.z-(b.x-a.x)/n*w*s);if(i){const v=i*2;indices.push(v-2,v-1,v,v-1,v+1,v);}}collision={...course,roadMesh:{positions,indices}};}
 const road=new RoadSurface(collision);return(x,z,fallback)=>road.height(x,z,fallback-.25)??fallback-.25;
}
registerSpectatorFloor(spectatorCollisionFloor);
