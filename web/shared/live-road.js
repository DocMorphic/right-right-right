import {ROAD_CALLS} from './road-call-commands.js';
export const LIVE_ROAD=Object.freeze({spacing:1.5,width:5,lead:100,behind:360,maxAhead:300,maxChunks:48,maxPoints:2048});
const round=n=>Math.round(n*1e5)/1e5;
function random(seed){let x=seed>>>0||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
export function sampleRoadChunk(chunk){
  const points=[{x:chunk.x,y:20,z:chunk.z,s:chunk.s,heading:chunk.heading}],count=Math.ceil(chunk.length/LIVE_ROAD.spacing),step=chunk.length/count,angle=chunk.angle*Math.PI/180;
  let x=chunk.x,z=chunk.z;
  for(let i=1;i<=count;i++){
    // Integrated sinusoidal curvature: no steering discontinuity at joins.
    const t=(i-.5)/count,h=chunk.heading+angle*(1-Math.cos(Math.PI*t))/2;
    x+=Math.sin(h)*step;z+=Math.cos(h)*step;
    points.push({x:round(x),y:20,z:round(z),s:round(chunk.s+step*i),heading:chunk.heading+angle*(1-Math.cos(Math.PI*i/count))/2});
  }
  return points;
}
export function initialRoadPlan(seed){return {seed,revision:0,nextId:1,chunks:[{id:0,x:0,z:0,s:0,heading:0,angle:0,length:128}],lastCall:null};}
export function roadPlanPublic(plan){return {seed:plan.seed,revision:plan.revision,nextId:plan.nextId,chunks:plan.chunks.map(c=>({...c})),lastCall:plan.lastCall?{...plan.lastCall}:null};}
export function roadCallLength(kind){const spec=ROAD_CALLS[kind];if(!spec)throw Error('Unknown road call');return round(spec.length??Math.abs(spec.angle)*Math.PI/180*spec.radius*Math.PI/2);}
export function appendRoadChunk(plan,kind='straight',length){
  const spec=ROAD_CALLS[kind];if(!spec)throw Error('Unknown road call');
  const last=plan.chunks.at(-1),tail=sampleRoadChunk(last).at(-1);
  const chunk={id:plan.nextId++,x:tail.x,z:tail.z,s:tail.s,heading:tail.heading,angle:spec.angle,length:round(length??roadCallLength(kind))};
  plan.chunks.push(chunk);plan.revision++;return chunk;
}
export function roadEndDistance(plan){const c=plan.chunks.at(-1);return c.s+c.length;}
export function pruneRoadPlan(plan,distance){let removed=0;while(plan.chunks.length>1&&plan.chunks[0].s+plan.chunks[0].length<distance-LIVE_ROAD.behind){plan.chunks.shift();removed++;}if(removed)plan.revision++;return removed;}
export function roadPlanDelta(previous,next){return {from:previous.revision,revision:next.revision,removeBefore:next.chunks[0].id,append:next.chunks.filter(c=>c.id>previous.chunks.at(-1).id).map(c=>({...c})),nextId:next.nextId,lastCall:next.lastCall};}
export function applyRoadDelta(plan,delta){
  if(!plan||delta.from!==plan.revision||delta.revision<=plan.revision)return null;
  const chunks=[...plan.chunks.filter(c=>c.id>=delta.removeBefore),...delta.append];
  if(!chunks.length||chunks.length>LIVE_ROAD.maxChunks)return null;
  return {...plan,revision:delta.revision,chunks,nextId:delta.nextId,lastCall:delta.lastCall};
}
export function materializeRoad(plan,{withTrees=true}={}){
  const points=[],distances=[];
  for(const c of plan.chunks){const values=sampleRoadChunk(c);for(let i=points.length?1:0;i<values.length;i++){points.push(values[i]);distances.push(values[i].s);}}
  if(points.length>LIVE_ROAD.maxPoints)throw Error('Live road capacity exceeded');
  const course={liveRoad:true,roadPlan:plan,seed:plan.seed,mode:'roadcall',profile:0,points,distances,width:LIVE_ROAD.width,length:distances.at(-1),startIndex:8,trees:[],mud:[],hairpins:0,hardCorners:0};
  if(!withTrees)return course;
  // A spatial road index keeps tree clearing linear in the bounded window.
  const bins=new Map(),cell=8;
  for(const p of points){const key=`${Math.floor(p.x/cell)},${Math.floor(p.z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(p);}
  const trees=[];
  const clear=(x,z)=>{const gx=Math.floor(x/cell),gz=Math.floor(z/cell);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const p of bins.get(`${gx+a},${gz+b}`)||[])if((p.x-x)**2+(p.z-z)**2<5.2**2)return false;return true;};
  for(const chunk of plan.chunks){
    const rng=random(plan.seed^Math.imul(chunk.id+1,0x45d9f3b)),samples=sampleRoadChunk(chunk);
    for(let i=0;i<samples.length-1;i+=3){const p=samples[i];for(const side of[-1,1])for(let row=0;row<3;row++){
      if(row&&i%9)continue;
      const offset=(row?12+row*9:6)+rng()*3,x=round(p.x+Math.cos(p.heading)*offset*side),z=round(p.z-Math.sin(p.heading)*offset*side);
      const yaw=rng()*Math.PI*2,scale=.83+rng()*.37,variant=Math.floor(rng()*6);
      if(clear(x,z))trees.push({x,y:19.75,z,yaw,scale,variant,radius:.32*scale,solid:true});
    }}
  }
  course.trees=trees;return course;
}
