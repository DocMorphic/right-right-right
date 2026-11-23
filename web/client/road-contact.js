import {CAR} from '../shared/physics.js';
import {direction} from '../shared/course.js';
import {RoadSurface} from '../shared/road-surface.js';
function renderedRoad(course){
 if(course.roadMesh||(course.points?.length??0)<2)return course;
 const positions=[],indices=[];for(let i=0;i<course.points.length;i++){const p=course.points[i],d=direction(course.points,i);for(const side of[-1,1])positions.push(p.x+d.z*course.width*.5*side,p.y+.015,p.z-d.x*course.width*.5*side);if(i<course.points.length-1){const n=i*2;indices.push(n,n+3,n+1,n,n+2,n+3);}}
 return{...course,roadMesh:{positions,indices}};
}
export class RoadContact extends RoadSurface{
 constructor(course){super(renderedRoad(course));}
 pose(state,fallbackPitch=0){
  if(state.grounded===false)return{y:state.y-CAR.height+.012412283,pitch:state.airPitch||0,roll:0};
  const base=state.y-CAR.height,cs=Math.cos(state.yaw),sn=Math.sin(state.yaw),samples=[];
  for(const x of [-.703,.703])for(const z of [-1.257,1.263]){const fallback=base-Math.sin(fallbackPitch)*z;samples.push(this.height(state.x+cs*x+sn*z,state.z-sn*x+cs*z,fallback));}
  const front=(samples[1]+samples[3])/2,rear=(samples[0]+samples[2])/2,left=(samples[0]+samples[1])/2,right=(samples[2]+samples[3])/2;
  return{y:(front+rear)/2+.012412283,pitch:-Math.atan2(front-rear,2.52),roll:Math.atan2(right-left,1.406)};
 }
}
