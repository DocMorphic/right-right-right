import {nativeSupportHeight,worldCollision} from './world-collision.js';
// Sample the exported road's actual triangles, rather than a nearby spline
// point. Bins keep four tyre contact queries independent of total map length.
export class RoadSurface{
 constructor(course){this.course=course;this.bins=new Map();let m=course.roadMesh;
  if(!m&&course.points?.length>1&&Number.isFinite(course.width)){const positions=[],indices=[];for(let i=0;i<course.points.length;i++){const p=course.points[i],a=course.points[Math.max(0,i-1)],b=course.points[Math.min(course.points.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1,w=(course.widths?.[i]??course.width)/2;for(const s of[-1,1])positions.push(p.x+(b.z-a.z)/n*w*s,p.y+.015,p.z-(b.x-a.x)/n*w*s);if(i){const k=i*2;indices.push(k-2,k+1,k-1,k-2,k,k+1);}}m={positions,indices};}
  if(!m)return;this.positions=m.positions;this.indices=m.indices;
  for(let i=0;i<m.indices.length;i+=3){const ids=m.indices.slice(i,i+3).map(n=>n*3),xs=ids.map(n=>m.positions[n]),zs=ids.map(n=>m.positions[n+2]);
   for(let x=Math.floor(Math.min(...xs)/8);x<=Math.floor(Math.max(...xs)/8);x++)for(let z=Math.floor(Math.min(...zs)/8);z<=Math.floor(Math.max(...zs)/8);z++){const key=`${x},${z}`;if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(ids);}
  }
 }
 support(x,z,index=0){const points=this.course.points;let best=Infinity,fallback=points[index]?.y??points[0].y;
  for(let i=Math.max(0,index-4);i<Math.min(points.length-1,index+5);i++){const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),d=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;if(d<best){best=d;fallback=a.y+(b.y-a.y)*t;}}
  return this.height(x,z,fallback-(this.course.nativeScene?0:.25));
 }
 height(x,z,fallback){let result=null;for(const[a,b,c]of this.bins.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)||[]){const p=this.positions,ax=p[a],az=p[a+2],bx=p[b],bz=p[b+2],cx=p[c],cz=p[c+2],d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-9)continue;
   const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d,w=1-u-v;
   if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6){const y=u*p[a+1]+v*p[b+1]+w*p[c+1];if(result===null||Math.abs(y-fallback)<Math.abs(result-fallback))result=y;}
  }if(result!==null)return worldCollision(this.course)?.props?.height(x,z,result)??result;const ground=nativeSupportHeight(this.course,x,z);return ground===undefined?fallback:ground;
 }
}
