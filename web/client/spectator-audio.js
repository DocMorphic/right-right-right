import {generateSpectators} from '../shared/spectators.js';

export const SPECTATOR_SOUNDS=Object.freeze({
  'spectator-cheer-a':{url:'/assets/sounds/spectator-cheer-a.mp3'},
  'spectator-cheer-b':{url:'/assets/sounds/spectator-cheer-b.mp3'},
  'spectator-hit-a':{url:'/assets/sounds/spectator-hit-a.wav'},
  'spectator-hit-b':{url:'/assets/sounds/spectator-hit-b.wav'},
});
export const CROWD_MIX=Object.freeze({range:34,cheerGain:.35,impactGain:.48,maxCheers:2,maxImpacts:2,hitFreshSeconds:.75,hitSpacingSeconds:.12});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};

// Car +X is the driver's left in the recovered source model. Keep the two
// listeners at their actual seats and rotate stereo with their own head look.
export function spectatorSpatial(point,car,slot,lookYaw=0){
  const eye=slot%2===0?.366:-.339,cs=Math.cos(car.yaw||0),sn=Math.sin(car.yaw||0),
    dx=point.x-(car.x+cs*eye),dz=point.z-(car.z-sn*eye),
    dy=(point.y??car.y)-(car.y??0),distance=Math.hypot(dx,dy,dz),heading=(car.yaw||0)-lookYaw*Math.PI/180;
  return {distance,pan:clamp((-Math.cos(heading)*dx+Math.sin(heading)*dz)/Math.max(4,Math.hypot(dx,dz)),-.8,.8)};
}

/** A bounded local sound renderer of existing authoritative events, never a
 * network producer. Each seat selects the same clips and race-time loop phase. */
export class SpectatorAudio{
  constructor(audio){this.audio=audio;this.groups=[];this.voices=new Map();this.shots=new Set();this.seen=new Set();this.epoch=null;this.lastHit=-Infinity;}
  setCourse(course){
    this.reset();const groups=new Map();
    for(const p of course?.spectators|| (course?generateSpectators(course):[])){
      const key=`${p.group}:${p.side}`;if(!groups.has(key))groups.set(key,{key,people:[],x:0,y:0,z:0,variant:(Math.abs(Math.round(p.group))+Number(p.side>0))%2});
      const group=groups.get(key);group.people.push(p.id);for(const k of ['x','y','z'])group[k]+=p[k];
    }
    this.groups=[...groups.values()].map(g=>({...g,x:g.x/g.people.length,y:g.y/g.people.length,z:g.z/g.people.length}));
  }
  disposeVoice(voice){
    if(voice.disposed)return;voice.disposed=true;try{voice.source.stop();}catch{}
    voice.source.disconnect();voice.gain.disconnect();voice.pan?.disconnect();
  }
  stop(){for(const v of this.voices.values())this.disposeVoice(v);this.voices.clear();for(const v of this.shots)this.disposeVoice(v);this.shots.clear();}
  reset(){this.stop();this.seen.clear();this.epoch=null;this.lastHit=-Infinity;}
  voice(name,loop,offset=0){
    const a=this.audio,buffer=a.buffers.get(name);if(!buffer||!a.context||!a.unlocked||!a.enabled)return null;
    const source=a.context.createBufferSource(),gain=a.context.createGain(),pan=a.context.createStereoPanner?.();
    source.buffer=buffer;source.loop=loop;gain.gain.value=0;source.connect(gain);
    if(pan){gain.connect(pan);pan.connect(a.gameBus);}else gain.connect(a.gameBus);
    const voice={name,source,gain,pan,level:0};
    if(!loop){this.shots.add(voice);source.onended=()=>{this.shots.delete(voice);this.disposeVoice(voice);};}
    source.start(0,loop&&buffer.duration>0?offset%buffer.duration:0);return voice;
  }
  update(snapshot,slot,lookYaw,dt){
    if(this.epoch!==snapshot?.epoch){this.reset();this.epoch=snapshot?.epoch;}
    const car=snapshot?.cars?.[Math.floor(slot/2)],running=snapshot?.phase==='running';
    // Consume tombstones even while muted/paused; never dump old hits on resume.
    const hits=snapshot?.spectatorHits||[],newHits=hits.filter(h=>!this.seen.has(h.id)).sort((a,b)=>a.time-b.time||a.id-b.id);
    for(const hit of newHits){
      this.seen.add(hit.id);
      if(!running||!car||snapshot.elapsed-hit.time>CROWD_MIX.hitFreshSeconds||hit.time-this.lastHit<CROWD_MIX.hitSpacingSeconds)continue;
      const spatial=spectatorSpatial(hit,car,slot,lookYaw),own=hit.team===Math.floor(slot/2),falloff=own?1:smooth(1-spatial.distance/CROWD_MIX.range);
      if(falloff<=0)continue;this.lastHit=hit.time;
      if(this.shots.size>=CROWD_MIX.maxImpacts||!this.audio.enabled)continue;
      const v=this.voice(`spectator-hit-${hit.id%2?'b':'a'}`,false);if(!v)continue;
      const speed=Math.hypot(hit.car?.vx??hit.vx??0,hit.car?.vz??hit.vz??0);
      v.gain.gain.setValueAtTime(CROWD_MIX.impactGain*(.55+.45*clamp(speed/14))*falloff,this.audio.context.currentTime);
      v.pan?.pan.setValueAtTime(spatial.pan,this.audio.context.currentTime);v.source.playbackRate.setValueAtTime(.97+(hit.id%5)*.015,this.audio.context.currentTime);
    }
    if(!running||!car||car.dead||car.finish>=0||!this.audio.enabled){this.stop();return;}
    const now=this.audio.context.currentTime,hitIds=this.seen,speedGain=smooth((Math.abs(car.speed||0)-.3)/2),near=this.groups.map(g=>{
      const spatial=spectatorSpatial(g,car,slot,lookYaw),remaining=g.people.filter(id=>!hitIds.has(id)).length/g.people.length;
      return{group:g,...spatial,target:CROWD_MIX.cheerGain*smooth(1-spatial.distance/CROWD_MIX.range)*speedGain*remaining};
    }).filter(g=>g.target>.0001).sort((a,b)=>a.distance-b.distance).slice(0,CROWD_MIX.maxCheers),selected=new Map(near.map(g=>[g.group.key,g]));
    // Release an old pocket before allocating another: two loops is a hard cap.
    for(const[key,v]of this.voices)if(!selected.has(key)){
      v.level*=Math.exp(-dt/.18);v.gain.gain.setValueAtTime(v.level,now);
      if(v.level<.0002||near.length>=CROWD_MIX.maxCheers){this.disposeVoice(v);this.voices.delete(key);}
    }
    for(const candidate of near){
      const {group,target,pan}=candidate;let v=this.voices.get(group.key);
      if(!v&&this.voices.size<CROWD_MIX.maxCheers){v=this.voice(`spectator-cheer-${group.variant?'b':'a'}`,true,snapshot.elapsed+Math.abs(group.x+group.z)*.13);if(v)this.voices.set(group.key,v);}
      if(!v)continue;const alpha=1-Math.exp(-dt/(target>v.level?.16:.3));v.level+=(target-v.level)*alpha;
      v.gain.gain.setValueAtTime(v.level,now);v.pan?.pan.setValueAtTime(pan,now);
    }
  }
}
