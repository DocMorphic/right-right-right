// Collision-only copies of the original terrain/forest. The renderer's source
// assets and placements are never edited. Registered identically on both peers
// and the authority before a native course can run.
const scenes=new Map();
export function registerWorldCollision(id,data){scenes.set(String(id),data);}
export function worldCollision(course){return scenes.get(String(course.nativeScene));}
export function nativeTerrainHeight(course,x,z){
 const source=worldCollision(course);if(!source)return undefined;
 const s=source.terrain,m=s.matrix,r=s.resolution,u=-(x-m[12])/m[0]/s.size[0]*(r-1),v=(z-m[14])/m[10]/s.size[2]*(r-1);
 if(u<0||v<0||u>r-1||v>r-1)return null;
 const ix=Math.min(r-2,Math.floor(u)),iz=Math.min(r-2,Math.floor(v)),a=u-ix,b=v-iz,values=source.heights,
   at=(dx,dz)=>values.getUint16(((iz+dz)*r+ix+dx)*2,true)/s.heightDivisor*s.spacing[1]*m[5]+m[13],
   h00=at(0,0),h10=at(1,0),h01=at(0,1),h11=at(1,1);
 // Match the exact diagonal of terrainChunks, not a road-height fallback or
 // a lower-resolution bilinear approximation of the visible mesh.
 return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
}
export function nativeTrees(course){return worldCollision(course)?.trees||[];}
export function backgroundTreeColliders(instances,specs){return instances.map(t=>{
 const spec=specs[t.model]?.collider||{center:[0,3,0],radius:.32,height:6},p=spec.center,c=Math.cos(t.yaw),s=Math.sin(t.yaw),k=t.scale,m=t.matrix;
 const x=m?m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]:t.position[0]+(c*p[0]+s*p[2])*k,
   y=m?m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13]:t.position[1]+p[1]*k,
   z=m?m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]:t.position[2]+(-s*p[0]+c*p[2])*k;
 return{x,y:y-spec.height*k/2,z,radius:spec.radius*k,height:spec.height*k,variant:t.model,solid:true};
});}

// Low-poly rock/stump triangles use the same instance and GLB transforms as
// the renderer. Bushes and leaves remain decorative, as in the native scene.
export function buildPropSurface(templates,instances){
 const bins=new Map(),cell=8;
 for(const entry of instances){
  if(!/^(Rock|TreeStump)/.test(String(entry.model)))continue;
  const template=templates[entry.model];if(!template)continue;
  const c=Math.cos(entry.yaw),s=Math.sin(entry.yaw),scale=entry.scale,m=entry.matrix||[c*scale,0,-s*scale,0,0,scale,0,0,s*scale,0,c*scale,0,...entry.position,1],p=[];
  for(let i=0;i<template.positions.length;i+=3){const x=template.positions[i],y=template.positions[i+1],z=template.positions[i+2];p.push(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);}
  for(let i=0;i<template.indices.length;i+=3){const ids=template.indices.slice(i,i+3).map(n=>n*3),a=ids.map(n=>p.slice(n,n+3)).flat(),xs=[a[0],a[3],a[6]],zs=[a[2],a[5],a[8]];
   for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++)for(let z=Math.floor(Math.min(...zs)/cell);z<=Math.floor(Math.max(...zs)/cell);z++){const key=`${x},${z}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(a);}
  }
 }
 return{height(x,z,floor){let top=floor;for(const p of bins.get(`${Math.floor(x/cell)},${Math.floor(z/cell)}`)||[]){const d=(p[5]-p[8])*(p[0]-p[6])+(p[6]-p[3])*(p[2]-p[8]);if(Math.abs(d)<1e-8)continue;const a=((p[5]-p[8])*(x-p[6])+(p[6]-p[3])*(z-p[8]))/d,b=((p[8]-p[2])*(x-p[6])+(p[0]-p[6])*(z-p[8]))/d,c=1-a-b;if(a>=-1e-7&&b>=-1e-7&&c>=-1e-7){const y=a*p[1]+b*p[4]+c*p[7];if(top==null||y>top)top=y;}}return top;},triangles:[...new Set([...bins.values()].flat())].length};
}
export function nativeSupportHeight(course,x,z){const h=nativeTerrainHeight(course,x,z);return worldCollision(course)?.props?.height(x,z,h)??h;}
