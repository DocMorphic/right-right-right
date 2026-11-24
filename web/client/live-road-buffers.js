import {materializeRoad} from '../shared/live-road.js';
export function roadBuffers(course){
  const positions=new Float32Array(course.points.length*6),uvs=new Float32Array(course.points.length*4);
  for(let i=0;i<course.points.length;i++){
    const p=course.points[i],cs=Math.cos(p.heading),sn=Math.sin(p.heading);
    for(let side=0;side<2;side++){const sign=side?1:-1,j=i*6+side*3;positions[j]=p.x+cs*course.width/2*sign;positions[j+1]=p.y+.015;positions[j+2]=p.z-sn*course.width/2*sign;uvs[i*4+side*2]=side;uvs[i*4+side*2+1]=p.s/course.width;}
  }
  return {positions,uvs,count:course.points.length};
}
export function compileLiveRoad(plan){
  const course=materializeRoad(plan),buffers=roadBuffers(course),forest=Array.from({length:6},()=>[]);
  for(const tree of course.trees)forest[tree.variant].push(tree.x,tree.y,tree.z,tree.yaw,tree.scale);
  return {...buffers,trees:course.trees,forest:forest.map(a=>new Float32Array(a)),revision:plan.revision};
}
