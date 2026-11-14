/** Playback uses exported native clips; audio starts only after a player gesture. */
export class RallyAudio {
  constructor(){this.enabled=true;this.buffers=new Map();this.loops=new Map();this.active=false;this.lastPhase='';this.lastCountdown=-1;this.stats={};}
  async init(manifest) {
    this.manifest=manifest;this.context=new (window.AudioContext||window.webkitAudioContext)();this.master=this.context.createGain();this.master.gain.value=.65;this.master.connect(this.context.destination);
    const keys=['idle','3000RMP','5500RMP','tyre-skid-loop','wind sound car','countdown-go','countdown-beep','collision-heavy','mud','click'];
    await Promise.allSettled(keys.map(async key=>{const asset=manifest.sounds[key];if(!asset)return;const r=await fetch(asset.url);this.buffers.set(key,await this.context.decodeAudioData(await r.arrayBuffer()));}));
  }
  unlock(){this.context?.resume().catch(()=>{});}
  setEnabled(value){this.enabled=value;if(this.master)this.master.gain.value=value?.65:0;}
  play(name,volume=.5){if(!this.enabled||!this.context||!this.buffers.has(name))return;const s=this.context.createBufferSource(),g=this.context.createGain();s.buffer=this.buffers.get(name);g.gain.value=volume;s.connect(g);g.connect(this.master);s.start();}
  loop(name){if(this.loops.has(name))return this.loops.get(name);if(!this.context||!this.buffers.has(name))return null;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffers.get(name);source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(this.master);source.start();const result={source,gain};this.loops.set(name,result);return result;}
  update(snapshot,slot,input={}){
    const car=snapshot?.cars[Math.floor(slot/2)],running=snapshot?.phase==='running';
    for(const name of ['idle','3000RMP','5500RMP','tyre-skid-loop','wind sound car']){const loop=this.loop(name);if(!loop)continue;let volume=0;if(this.active&&car&&!car.dead&&car.finish<0){const speed=Math.abs(car.speed||0);if(name==='idle')volume=.16*Math.max(0,1-speed/10);if(name==='3000RMP')volume=.19*Math.min(1,speed/9);if(name==='5500RMP')volume=.11*Math.max(0,(speed-9)/15);if(name==='tyre-skid-loop')volume=running&&speed>5?(input.handbrake?.3:Math.abs(car.steer||0)*Math.max(0,speed-10)*.01):0;if(name==='wind sound car')volume=Math.min(.12,speed*.005);loop.source.playbackRate.setTargetAtTime(name.includes('RMP')?.65+speed*.045:1,this.context.currentTime,.12);}loop.gain.gain.setTargetAtTime(volume,this.context.currentTime,.12);}
    if(!snapshot||!this.active)return;
    if(snapshot.phase==='countdown'){const digit=Math.ceil(snapshot.countdown);if(digit!==this.lastCountdown&&digit>0){this.play('countdown-beep',.4);this.lastCountdown=digit;}}
    if(snapshot.phase==='running'&&this.lastPhase==='countdown')this.play('countdown-go',.55);
    if((snapshot.stats?.impacts||0)>(this.stats.impacts||0)||(snapshot.stats?.treeDeaths||0)>(this.stats.treeDeaths||0))this.play('collision-heavy',.55);
    if(car&&(car.mud||0)>(this.lastMud||0)+.1)this.play('mud',.35);
    this.lastMud=car?.mud||0;this.stats={...snapshot.stats};this.lastPhase=snapshot.phase;
  }
}
