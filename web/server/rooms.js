import {generateCourse, STAGES} from '../shared/course.js';
import {PROTOCOL_VERSION, MODES, validMode, playerCount, safeName, validSeed, validInput, newer} from '../shared/protocol.js';
import {makeWorld, stepWorld, applyActions} from '../shared/physics.js';

const courses = new Map();
export const clockSeconds = () => Date.now()/1000;
export function randomSeed(){return 1+Math.floor(Math.random()*2147483646);}
export function courseFor(room){
  const key=`${room.seed}/${room.mode}/${room.profile}`;
  if(!courses.has(key)){const stage=STAGES[room.profile]||STAGES[0];courses.set(key,generateCourse(room.seed,room.mode,stage.blocks,stage.seed));if(courses.size>4)courses.delete(courses.keys().next().value);}
  return courses.get(key);
}
export function courseHash(course){
  let h=2166136261;for(const p of course.points){h=Math.imul(h^Math.round(p.x*1000),16777619);h=Math.imul(h^Math.round(p.z*1000),16777619);}
  return `${(h>>>0).toString(16)}-${course.points.length}-${course.trees.length}`;
}
export class ProtocolError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new ProtocolError(code,message);};
export function newRoom(code,session,message,now=clockSeconds()){
  const mode=message.mode??'coop';if(!validMode(mode))fail('mode','Choose co-op or race.');
  if(message.seed!==undefined&&!validSeed(message.seed))fail('seed','Seed must be an integer from 1 to 2147483647.');
  const practice=message.practice===true;if(practice&&mode!=='coop')fail('practice','Practice uses one co-op car.');
  return {code,revision:0,hostId:session.id,mode,seed:message.seed??randomSeed(),profile:0,practice,status:'lobby',epoch:0,seats:[{id:session.id,name:safeName(message.name||session.name),ready:false,lastSeen:now}],world:null,inputs:[],lastAt:now,createdAt:now};
}
export function lobbyMessage(room){
  return {type:'lobby',version:PROTOCOL_VERSION,revision:room.revision??0,code:room.code,hostId:room.hostId,mode:room.mode,seed:room.seed,profile:room.profile,practice:room.practice,status:room.status,epoch:room.epoch,
    playersRequired:playerCount(room),seats:Array.from({length:room.practice?1:MODES[room.mode].players},(_,i)=>room.seats[i]?{id:room.seats[i].id,name:room.seats[i].name,ready:room.seats[i].ready}:null)};
}
export function snapshotMessage(room,now=clockSeconds()){
  const world=room.world;if(!world)return null;
  return {type:'snapshot',...world,revision:room.revision??0,time:Math.max(now,room.lastAt),serverTick:Math.round(world.elapsed*50),inputs:room.inputs.map(i=>i?{seq:i.seq,actionId:i.actionId,arrived:i.arrived,ttl:i.ttl??.5,pitch:i.pitch,yaw:i.yaw,throttle:i.throttle,steer:i.steer,handbrake:i.handbrake,wipe:i.wipe}:null)};
}
export function raceMessage(room,now=clockSeconds()){
  return {type:'race',revision:room.revision??0,epoch:room.epoch,mode:room.mode,seed:room.seed,profile:room.profile,practice:room.practice,courseHash:courseHash(courseFor(room)),snapshot:snapshotMessage(room,now)};
}
export function roomMessages(room,now=clockSeconds(),includeRace=false){
  return [lobbyMessage(room),...(room.world?[includeRace?raceMessage(room,now):snapshotMessage(room,now)]:[])];
}
export function joinRoom(room,session,message,now=clockSeconds()){
  if(room.status!=='lobby')fail('started','This room has already started. Ask the host to return to the lobby.');
  if(room.practice)fail('practice','This is a solo practice room. Create a multiplayer room to play together.');
  if(room.seats.some(s=>s?.id===session.id))return;
  const slot=Array.from({length:playerCount(room)},(_,i)=>i).find(i=>!room.seats[i]);
  if(slot===undefined)fail('full','This room is full.');
  room.seats[slot]={id:session.id,name:safeName(message.name||session.name),ready:false,lastSeen:now};
  if(!room.hostId)room.hostId=session.id;
  resetReady(room);
}
function resetReady(room){for(const seat of room.seats)if(seat)seat.ready=false;}
export function seatOf(room,id){return room.seats.findIndex(s=>s?.id===id);}
export function removePlayer(room,id,now=clockSeconds()){
  const slot=seatOf(room,id);if(slot<0)return;
  room.seats[slot]=null;room.inputs[slot]=null;
  if(room.hostId===id)room.hostId=room.seats.find(Boolean)?.id??null;
  if(room.world&&room.world.phase!=='ended'){room.world.resumePhase=room.world.phase==='paused'?room.world.resumePhase:room.world.phase;room.world.phase='paused';}
  resetReady(room);room.lastAt=now;
}
export function advanceRoom(room,now=clockSeconds()){
  if(!room.world){room.lastAt=now;return;}
  const world=room.world;
  const missing=room.seats.filter(Boolean).length!==playerCount(room)||room.seats.some(s=>s&&now-s.lastSeen>10);
  if(missing&&world.phase!=='ended'&&world.phase!=='paused'){world.resumePhase=world.phase;world.phase='paused';}
  if(!missing&&world.phase==='paused'){world.phase=world.resumePhase||'running';delete world.resumePhase;}
  const simulationStart=room.lastAt;let progressed=0;
  let remaining=Math.max(0,Math.min(2,now-room.lastAt));room.lastAt=Math.max(room.lastAt,now);
  if(world.phase==='paused'||world.phase==='ended')return;
  const course=courseFor(room);
  while(remaining>1e-6){
    const dt=Math.min(.02,remaining);remaining-=dt;progressed+=dt;const stepAt=simulationStart+progressed-dt*.5;
    if(world.phase==='countdown'){world.countdown=Math.max(0,world.countdown-dt);if(world.countdown<=.00001){world.countdown=0;world.phase='running';}}
    else if(world.phase==='running'){
      const active=room.inputs.map(input=>input&&stepAt-input.arrived<(input.ttl??.5)?input:{});stepWorld(world,active,dt,course);
    }
  }
  world.seq++;
}
function startRoom(room,now){
  if(room.seats.filter(Boolean).length!==playerCount(room)||room.seats.slice(0,playerCount(room)).some(s=>!s?.ready))fail('not_ready',`All ${playerCount(room)} players must occupy a seat and be ready.`);
  if(STAGES[room.profile]?.nativeScene&&room.seats.some(seat=>(seat?.catalog??6)<STAGES.length))fail('content','An older game page is connected. Everyone refresh the page to play all nine stages.');
  room.epoch=(room.epoch+1)>>>0||1;room.status='race';room.inputs=[];room.lastAt=now;
  room.world=makeWorld(courseFor(room),room.mode,room.epoch);room.world.seed=room.seed;
  if(room.practice)room.world.tablets[0].holder=0;
}
/** All room mutations are transport independent and JSON serializable for the D1 adapter. */
export function commandRoom(room,session,message,now=clockSeconds(),{inputTtl=.5}={}){
  // HTTP tabs have no reliable disconnect event. Expired peers release their seats;
  // the oldest remaining crew member becomes host through removePlayer.
  for(const seat of [...room.seats])if(seat&&seat.id!==session.id&&now-seat.lastSeen>30)removePlayer(room,seat.id,now);
  const slot=seatOf(room,session.id);if(slot<0)fail('membership','Join a room first.');
  room.seats[slot].lastSeen=Math.max(room.seats[slot].lastSeen,now);
  advanceRoom(room,now);
  const host=room.hostId===session.id;
  switch(message.type){
    case 'poll':return {broadcast:false};
    case 'ready':
      if(room.status!=='lobby')fail('started','Ready can only change in the lobby.');
      room.seats[slot].ready=message.ready===true;room.seats[slot].catalog=Number.isInteger(message.catalog)&&message.catalog>=0&&message.catalog<=100?message.catalog:6;return {broadcast:true};
    case 'seat':{
      if(room.status!=='lobby')fail('started','Seats can only change in the lobby.');
      if(!Number.isInteger(message.slot)||message.slot<0||message.slot>=playerCount(room))fail('seat','Choose an available seat.');
      if(room.seats[message.slot]&&message.slot!==slot)fail('occupied','That seat is occupied.');
      room.seats[message.slot]=room.seats[slot];if(message.slot!==slot)room.seats[slot]=null;resetReady(room);return {broadcast:true};
    }
    case 'configure':{
      if(!host)fail('host','Only the host can configure the room.');if(room.status!=='lobby')fail('started','Return to the lobby first.');
      const mode=message.mode??room.mode;if(!validMode(mode))fail('mode','Choose co-op or race.');
      if(room.practice&&mode!=='coop')fail('practice','Practice uses one co-op car.');
      if(room.seats.filter(Boolean).length>MODES[mode].players)fail('too_many','Four players cannot fit in two-player co-op.');
      if(message.seed!==undefined&&!validSeed(message.seed))fail('seed','Seed must be an integer from 1 to 2147483647.');
      if(message.profile!==undefined&&(!Number.isInteger(message.profile)||message.profile<0||message.profile>=STAGES.length))fail('profile','Invalid course profile.');
      room.mode=mode;room.seed=message.seed??room.seed;room.profile=message.profile??room.profile;
      if(room.seats.length>playerCount(room))room.seats=room.seats.filter(Boolean);resetReady(room);return {broadcast:true};
    }
    case 'start':if(!host)fail('host','Only the host can start.');if(room.status!=='lobby')fail('started','The run has already started.');startRoom(room,now);return {broadcast:true,race:true};
    case 'retry':
      if(!host)fail('host','Only the host can retry.');if(!room.world)fail('lobby','Start a run first.');
      if(message.newSeed===true)room.seed=randomSeed();for(const s of room.seats)if(s)s.ready=true;startRoom(room,now);return {broadcast:true,race:true};
    case 'lobby':
      if(!host)fail('host','Only the host can return everyone to the lobby.');room.status='lobby';room.world=null;room.inputs=[];resetReady(room);return {broadcast:true};
    case 'input':{
      if(!room.world||message.epoch!==room.epoch)fail('epoch','Input belongs to a different run.');
      if(!validInput(message))fail('input','Invalid input values.');
      const previous=room.inputs[slot];if(previous&&!newer(message.seq,previous.seq))return {broadcast:false};
      let actionId=previous?.actionId??0;
      const actions=(message.actions||[]).filter(action=>{if(!newer(action.id,actionId))return false;actionId=action.id;return true;});
      // The sender's connection determines their seat. Client-supplied slot/team is ignored.
      room.inputs[slot]={seq:message.seq,actionId,throttle:slot%2===0?message.throttle:0,steer:slot%2===0?message.steer:0,pitch:message.pitch,yaw:message.yaw,handbrake:slot%2===0&&message.handbrake===true,wipe:message.wipe===true,arrived:Math.max(now,room.lastAt),ttl:inputTtl};
      if(room.world.phase!=='ended'&&room.world.phase!=='paused')applyActions(room.world,slot,{...room.inputs[slot],actions});
      return {broadcast:false};
    }
    default:fail('message','Unknown room message.');
  }
}
