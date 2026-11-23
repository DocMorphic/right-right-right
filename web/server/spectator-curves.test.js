import'./spectator-terrain.js';import test from'node:test';import assert from'node:assert/strict';
import{generateCourse,STAGES}from'../shared/course.js';import{generateSpectators,spectatorPocketPath}from'../shared/spectators.js';
const distance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
test('original first three maps have deterministic bend crowds and curved shoulder tape without altering forest or roads',()=>{
 for(let profile=6;profile<9;profile++){const stage=STAGES[profile],c=generateCourse(12345,'coop',stage.blocks,stage.seed),before=JSON.stringify([c.points,c.trees,c.roadMesh,c.mud]),people=generateSpectators(c),groups=new Map();for(const p of people){if(!groups.has(p.group))groups.set(p.group,[]);groups.get(p.group).push(p);}const bends=[...groups.values()].filter(g=>g[0].pocket==='bend');assert.ok(bends.length>=4);assert.ok(people.length<=96);assert.deepEqual(generateSpectators({...c}),people);assert.equal(JSON.stringify([c.points,c.trees,c.roadMesh,c.mud]),before);
  let curved=0;for(const group of bends){const path=spectatorPocketPath(c,group);let total=0,previous;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],angle=Math.atan2(b.x-a.x,b.z-a.z);if(previous!==undefined)total+=Math.abs(Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous)));previous=angle;}if(total>.08)curved++;
   for(const p of path){let margin=Infinity;for(let i=1;i<c.points.length;i++)margin=Math.min(margin,distance(p,c.points[i-1],c.points[i])-Math.max(c.widths?.[i-1]??c.width,c.widths?.[i]??c.width)/2);assert.ok(margin>0,`map ${profile}, tape margin ${margin}`);}
  }assert.ok(curved>=3,`map ${profile} needs rows following the curve`);assert.equal(new Set(people.map(p=>p.motion)).size,6);
 }
});
