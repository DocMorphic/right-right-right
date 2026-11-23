import test from 'node:test';
import assert from 'node:assert/strict';
import {SpectatorAudio,CROWD_MIX,SPECTATOR_SOUNDS,spectatorSpatial} from './spectator-audio.js';

const param=()=>({value:0,setValueAtTime(v){this.value=v;}});
function fixture(){
  const sources=[],context={currentTime:0,
    createGain:()=>({gain:param(),connect(to){this.to=to;},disconnect(){this.disconnected=true;}}),
    createStereoPanner:()=>({pan:param(),connect(to){this.to=to;},disconnect(){this.disconnected=true;}}),
    createBufferSource(){const v={playbackRate:param(),connect(to){this.to=to;},disconnect(){this.disconnected=true;},start(when,offset){this.started=true;this.offset=offset;},stop(){this.stopped=true;}};sources.push(v);return v;}
  },audio={context,gameBus:{gain:{value:.175}},buffers:new Map(Object.keys(SPECTATOR_SOUNDS).map(name=>[name,{name,duration:name.includes('cheer')?4:.3}])),enabled:true,unlocked:true};
  const crowd=new SpectatorAudio(audio),course={spectators:[{id:0,group:20,side:1,x:3,y:0,z:20},{id:1,group:20,side:1,x:3,y:0,z:22}]};crowd.setCourse(course);
  return{audio,crowd,sources,course};
}
const snapshot=(extra={})=>({epoch:1,phase:'running',elapsed:1,cars:[{x:0,y:.68,z:18,yaw:0,speed:12,dead:false,finish:-1}],spectatorHits:[],...extra});
const hit=(id,time=1)=>({id,time,x:3,y:0,z:20,team:0,car:{vx:0,vz:14}});

test('cheering fades with approach and departure, pans with the original car orientation, and uses the game volume bus',()=>{
  const {crowd,audio,sources}=fixture(),s=snapshot();
  for(let i=0;i<60;i++)crowd.update(s,0,0,1/60);
  const v=[...crowd.voices.values()][0];assert.ok(v.level>0&&v.level<=CROWD_MIX.cheerGain);assert.ok(v.pan.pan.value<0,'source +X is left of the driver');assert.equal(v.pan.to,audio.gameBus);assert.ok(v.level*audio.gameBus.gain.value*.5<.04,'peak-limited crowd stays below the engine bus mix');
  assert.ok(spectatorSpatial({x:3,y:0,z:18},s.cars[0],0,180).pan>0,'head turn reverses stereo');
  s.cars[0].z=100;for(let i=0;i<120;i++)crowd.update(s,0,0,1/60);assert.equal(crowd.voices.size,0);assert.ok(sources.every(v=>v.stopped));
});
test('both occupants choose the same authoritative impact once across repeated and delayed snapshots; retry can hit again',()=>{
  const a=fixture(),b=fixture(),s=snapshot();for(const [slot,f] of[a,b].entries())f.crowd.update(s,slot,0,.016);
  const impacted={...s,spectatorHits:[hit(0)]};
  for(let i=0;i<60;i++){a.crowd.update(impacted,0,0,.016);if(i>11)b.crowd.update(impacted,1,0,.016);}
  const shots=f=>f.sources.filter(v=>!v.loop);assert.equal(shots(a).length,1);assert.equal(shots(b).length,1);assert.equal(shots(a)[0].buffer.name,shots(b)[0].buffer.name);assert.equal(shots(a)[0].playbackRate.value,shots(b)[0].playbackRate.value);
  for(const f of[a,b]){f.crowd.update({...s,epoch:2,phase:'countdown',elapsed:0},0,0,.016);assert.equal(f.crowd.shots.size,0);f.crowd.update({...impacted,epoch:2},0,0,.016);assert.equal(shots(f).length,2);}
});
test('simultaneous crowd hits coalesce, voice count stays bounded and old tombstones never produce catch-up thuds',()=>{
  const {crowd,sources}=fixture(),s=snapshot();crowd.update(s,0,0,.016);
  s.spectatorHits=Array.from({length:16},(_,id)=>hit(id));crowd.update(s,0,0,.016);assert.equal(crowd.shots.size,1);for(let i=0;i<120;i++)crowd.update(s,0,0,1/60);assert.equal(crowd.voices.size,0,'hit people fade out instead of continuing to cheer');
  s.elapsed=1.2;s.spectatorHits.push(hit(16,1.2));crowd.update(s,0,0,.016);assert.equal(crowd.shots.size,2);
  s.elapsed=1.4;s.spectatorHits.push(hit(17,1.4));crowd.update(s,0,0,.016);assert.ok(crowd.shots.size<=CROWD_MIX.maxImpacts);
  const before=sources.length;s.elapsed=8;s.spectatorHits.push(hit(18,2));crowd.update(s,0,0,.016);assert.equal(sources.length,before);
  crowd.update({...s,phase:'paused'},0,0,.016);assert.equal(crowd.shots.size,0);assert.ok(sources.every(v=>v.stopped));
});
test('mute, loading gestures, pause and crash suppress voices without replaying stale hits on resume',()=>{
  const {crowd,audio,sources}=fixture(),s=snapshot();audio.unlocked=false;crowd.update(s,0,0,.016);assert.equal(sources.length,0);
  audio.unlocked=true;audio.enabled=false;crowd.update({...s,spectatorHits:[hit(0)]},0,0,.016);assert.equal(sources.length,0);
  audio.enabled=true;crowd.update({...s,spectatorHits:[hit(0)]},0,0,.016);assert.equal([...crowd.shots].length,0);
  crowd.update({...s,phase:'countdown'},0,0,.016);assert.equal(crowd.voices.size,0);crowd.update({...s,cars:[{...s.cars[0],dead:true}]},0,0,.016);assert.equal(crowd.voices.size,0);
  crowd.setCourse({spectators:[]});assert.equal(crowd.groups.length,0);assert.equal(crowd.seen.size,0);
});
test('cheering is capped at two pockets and begins at a shared race-time offset for both seats',()=>{
  const a=fixture(),b=fixture(),s=snapshot(),course={spectators:Array.from({length:96},(_,id)=>({id,group:id,side:1,x:3,y:0,z:20+id*.01}))};
  for(const[slot,f]of[a,b].entries()){f.crowd.setCourse(course);for(let i=0;i<120;i++)f.crowd.update(s,slot,0,1/60);assert.ok(f.crowd.voices.size<=2);assert.ok(f.sources.filter(v=>v.loop).length<=2);}
  assert.deepEqual(a.sources.map(v=>[v.buffer.name,v.offset]),b.sources.map(v=>[v.buffer.name,v.offset]));
});
