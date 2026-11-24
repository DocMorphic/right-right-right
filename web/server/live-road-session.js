import {initialRoadPlan,materializeRoad,appendRoadChunk,roadCallLength,roadEndDistance,pruneRoadPlan,LIVE_ROAD} from '../shared/live-road.js';
import {ROAD_CALLS} from '../shared/road-call-commands.js';
import {nearestPoint} from '../shared/course.js';
const cache=new WeakMap();
export function resetLiveRoad(room){room.roadPlan=initialRoadPlan(room.seed);room.roadCallIds={};cache.delete(room);}
export function liveCourseFor(room){if(!room.roadPlan)resetLiveRoad(room);let c=cache.get(room);if(!c||c.roadPlan.revision!==room.roadPlan.revision){
  // Cache against a revision copy: the serializable authority plan mutates.
  c=materializeRoad({...room.roadPlan,chunks:room.roadPlan.chunks.slice()});cache.set(room,c);
}return c;}
export function liveRoadDistance(room){const c=liveCourseFor(room),car=room.world?.cars[0];if(!car)return 0;const near=nearestPoint(c,car.x,car.z);return c.distances[near.index]+(c.distances[near.index+1]-c.distances[near.index])*near.t;}
export function refreshLiveRoad(room){
  if(room.mode!=='roadcall'||!room.world)return;
  const distance=liveRoadDistance(room),plan=room.roadPlan;
  if(room.world.phase==='running'&&!room.world.cars[0].dead)for(let i=0;i<4&&roadEndDistance(plan)-distance<LIVE_ROAD.lead;i++)appendRoadChunk(plan,'straight',32);
  const removed=pruneRoadPlan(plan,distance),course=liveCourseFor(room);
  if(removed)for(const car of room.world.cars){const near=nearestPoint(course,car.x,car.z);car.nearest=near.index;car.progress=near.index;}
  room.world.roadRevision=plan.revision;room.world.roadDistance=distance;
}
export function acceptRoadCall(room,slot,message,now){
  if(room.mode!=='roadcall')throw Object.assign(Error('Voice roads are only available in Voice Roads mode.'),{code:'mode'});
  if(slot!==1)throw Object.assign(Error('Only the navigator can build the road.'),{code:'role'});
  if(!room.world||message.epoch!==room.epoch)throw Object.assign(Error('This road call belongs to another run.'),{code:'epoch'});
  if(!['running','countdown'].includes(room.world.phase)||room.world.cars[0].dead)throw Object.assign(Error('Start the run before calling a road.'),{code:'phase'});
  if(!Number.isSafeInteger(message.id)||message.id<1||message.id>0xffffffff||!Object.hasOwn(ROAD_CALLS,message.call))throw Object.assign(Error('Choose a supported road call.'),{code:'road_call'});
  const previous=room.roadCallIds?.[slot]||{id:0,at:-Infinity};
  if(message.id<=previous.id)return {id:message.id,accepted:true,duplicate:true,revision:room.roadPlan.revision};
  if(now-previous.at<.35)throw Object.assign(Error('Let the current call settle.'),{code:'road_busy'});
  const distance=liveRoadDistance(room),plan=room.roadPlan;
  const safeLead=Math.max(60,Math.abs(room.world.cars[0].speed)*3.5),gap=roadEndDistance(plan)-distance;
  if(Math.max(gap,safeLead)+roadCallLength(message.call)>LIVE_ROAD.maxAhead)throw Object.assign(Error('The next turns are already built. Wait until you get closer.'),{code:'road_full'});
  if(gap<safeLead)appendRoadChunk(plan,'straight',safeLead-gap);
  const piece=appendRoadChunk(plan,message.call);
  plan.lastCall={id:message.id,call:message.call,atDistance:piece.s};room.roadCallIds[slot]={id:message.id,at:now};
  refreshLiveRoad(room);return {id:message.id,accepted:true,revision:plan.revision,atDistance:piece.s};
}
