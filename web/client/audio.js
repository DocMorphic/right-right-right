/** Original PCM clips and recovered native CarAudio/EngineLoopBank mix (alpha.5 runtime).
 * RVAs: UpdateRpm 0x532520, UpdateGear 0x532340, MixRpmLayers 0x531140,
 * MixLimiter 0x530E60, CabinDoor.UpdateWind 0x4E8180, GameAudioSettings.Apply 0x538120.
 * Web Audio and Unity DSP are different renderers; this ports source parameters, not a bit-exact output claim.
 */
import {assetUrl} from './asset-url.js';
const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,value));
const move=(value,target,amount)=>value+Math.sign(target-value)*Math.min(Math.abs(target-value),Math.max(0,amount));
const smooth=value=>{value=clamp(value);return value*value*(3-2*value);};
export const NATIVE_AUDIO=Object.freeze({idleRpm:1000,limiterRpm:8400,gearFloorRpm:6500,rpmStep:500,upshiftKmh:[40,80,118],topSpeedKmh:150,gearHysteresisKmh:12,gearMinHold:.35,idleMaxKmh:2.5,rpmRisePerSec:11000,rpmFallPerSec:7000,rpmBrakeFallPerSec:8000,minTorqueRate:.72,throttleShift:.12,loadAttackSeconds:.18,loadReleaseSeconds:.22,coastVolume:.85,vtecGainMin:.9,vtecGainMax:1.08,limiterDuck:.45,limiterBlendSeconds:.12,masterVolume:.82,engineAirVolumeMul:.55,fadeInSeconds:.45,volUp:10,volDown:8,layerFadeOut:8,boomRpmEnd:5500,boomFadeRpm:6500,boomGain:.78,boomBlendPerSec:2.2,roadMinKmh:12,roadFullKmh:28,roadMaxVolume:.38,roadPitchAtMin:.62,roadPitchAtFull:.85,skidMaxVolume:.16,skidPitch:.32,gameTrim:.35,musicTrim:.55,menuClickTrim:1.6,menuHoverTrim:8,mudSplashVolume:.9,windVolume:1,windFullSpeed:12,windFullAngle:12});
const RPM=[1000,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,8400];
// BuildLayers replaces the bank's 1000RMP layer with its original idle clip.
const LAYERS=RPM.map(rpm=>({rpm,name:rpm===1000?'idle':`${rpm}RMP`}));
const TORQUE=[[1000,.32,.0001066666664],[2500,.48,.00009566666267],[4500,.62,.0001390000107],[5500,.92,.0002580000146],[6000,1,.00006799996481],[7500,.78,-.0001960000081],[8400,.5,-.0003111110709]];
export function nativeTorque(rpm){
  if(rpm<=TORQUE[0][0])return TORQUE[0][1];if(rpm>=8400)return .5;
  const index=TORQUE.findIndex(key=>key[0]>rpm),a=TORQUE[index-1],b=TORQUE[index],span=b[0]-a[0],t=(rpm-a[0])/span;
  return clamp((2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*span*a[2]+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*span*b[2]);
}
export class NativeEngineMix {
  constructor(){this.reset();}
  reset(){this.rpm=1000;this.gear=0;this.gearLock=0;this.fade=0;this.load=0;this.boom=1;this.limiter=0;this.road=0;this.skid=0;this.weights=new Map();}
  wheelRpm(kmh){const c=NATIVE_AUDIO,min=this.gear?c.upshiftKmh[this.gear-1]:0,max=c.upshiftKmh[this.gear]??c.topSpeedKmh,floor=this.gear?c.gearFloorRpm:c.idleRpm;return clamp(floor+(c.limiterRpm-floor)*Math.min(1,(kmh-min)/Math.max(1,max-min)),c.idleRpm,c.limiterRpm);}
  step(car,driver,dt){
    const c=NATIVE_AUDIO,kmh=Math.abs(car.speed||0)*3.6,throttle=clamp(driver.throttle||0),standing=kmh<=c.idleMaxKmh,braking=(driver.throttle||0)<-.08&&!standing,grounded=car.grounded??1;
    this.fade=move(this.fade,1,dt/c.fadeInSeconds);this.gearLock=Math.max(0,this.gearLock-dt);
    if(standing)this.gear=0;
    else if(this.gearLock===0){
      if(this.gear>0&&kmh<c.upshiftKmh[this.gear-1]-c.gearHysteresisKmh){this.gear--;this.gearLock=c.gearMinHold;}
      else if(this.gear<c.upshiftKmh.length&&this.rpm>=c.limiterRpm-8&&throttle>=c.throttleShift&&kmh>=c.upshiftKmh[this.gear]){this.gear++;this.rpm=this.wheelRpm(kmh);this.gearLock=c.gearMinHold;}
    }
    const loadTarget=braking?0:throttle,loadSeconds=braking?Math.min(c.loadReleaseSeconds,.12):loadTarget>this.load?c.loadAttackSeconds:c.loadReleaseSeconds;
    this.load=move(this.load,loadTarget,dt/loadSeconds);
    const target=standing?c.idleRpm+(c.limiterRpm-c.idleRpm)*throttle:this.wheelRpm(kmh),torqueRate=c.minTorqueRate+(1-c.minTorqueRate)*nativeTorque(this.rpm);
    let rate=target>=this.rpm?c.rpmRisePerSec:braking?c.rpmBrakeFallPerSec:c.rpmFallPerSec;if(standing)rate=target>=this.rpm?c.rpmRisePerSec*Math.max(.18,throttle):c.rpmFallPerSec;
    this.rpm=clamp(move(this.rpm,target,rate*torqueRate*dt),c.idleRpm,c.limiterRpm);
    const torque=nativeTorque(this.rpm),master=this.fade*c.masterVolume*(c.engineAirVolumeMul+(1-c.engineAirVolumeMul)*clamp(grounded))*(c.coastVolume+(1-c.coastVolume)*clamp(this.load))*(c.vtecGainMin+(c.vtecGainMax-c.vtecGainMin)*torque);
    const limiterTarget=(standing||this.gear===3)&&throttle>.08&&this.rpm>=c.limiterRpm-12?master:0;
    this.limiter=move(this.limiter,limiterTarget,dt/c.limiterBlendSeconds);if(this.limiter<.006&&limiterTarget<.001)this.limiter=0;
    this.boom=move(this.boom,c.boomGain+(1-c.boomGain)*smooth((this.rpm-c.boomRpmEnd)/(c.boomFadeRpm-c.boomRpmEnd)),c.boomBlendPerSec*dt);
    const voices=LAYERS.map(layer=>{const distance=Math.abs(layer.rpm-this.rpm),previous=this.weights.get(layer.name)||0,weight=distance<c.rpmStep*2?c.rpmStep/(distance+c.rpmStep):move(previous,0,c.layerFadeOut*dt);this.weights.set(layer.name,weight);let volume=weight*master*this.boom;if(layer.rpm>=c.limiterRpm-1&&this.limiter>.02)volume*=1-clamp(this.limiter/Math.max(.01,master))*c.limiterDuck;return {name:layer.name,volume:volume<.008?0:clamp(volume),pitch:clamp(this.rpm/layer.rpm,.1,3),highpass:layer.rpm<=5500?180:140};});
    const scrub=clamp((kmh-c.roadMinKmh)/(c.roadFullKmh-c.roadMinKmh))*Number(Boolean(driver.handbrake))*clamp(grounded);
    this.road=move(this.road,scrub*c.roadMaxVolume,dt*(this.road-.001>scrub*c.roadMaxVolume?c.volDown:c.volUp));
    this.skid=move(this.skid,scrub*c.skidMaxVolume,dt*(this.skid-.001>scrub*c.skidMaxVolume?c.volDown:c.volUp));
    voices.push({name:'limiter',volume:this.limiter,pitch:1},{name:'tyre-skid-loop',volume:this.road*this.fade,pitch:c.roadPitchAtMin+(c.roadPitchAtFull-c.roadPitchAtMin)*clamp((kmh-12)/16)},{name:'wet-road-loop',volume:this.skid*this.fade,pitch:c.skidPitch},{name:'wind sound car',volume:c.windVolume*clamp(Math.abs(car.speed||0)/c.windFullSpeed)*clamp(Math.abs(car.doorAngle||0)/c.windFullAngle),pitch:1});
    return voices;
  }
}
export class RallyAudio {
  constructor(){this.enabled=true;this.buffers=new Map();this.loops=new Map();this.active=false;this.ready=false;this.unlocked=false;this.volumes={game:.5,menu:.5,music:.5};this.engine=new NativeEngineMix();this.oneShots=new Set();this.loadErrors=[];this.lastPhase='';this.lastCountdown=-1;this.stats={};this.lastMud=0;this.epoch=null;this.lastTime=null;}
  get active(){return this._active||false;}
  set active(value){this._active=Boolean(value);if(this._active){this.stop('menu_music');if(this.musicBus)this.musicBus.gain.value=0;}else this.applyVolumes();}
  async init(manifest){
    this.manifest=manifest;this.context=new (window.AudioContext||window.webkitAudioContext)();this.master=this.context.createGain();this.master.gain.value=this.enabled?1:0;this.master.connect(this.context.destination);
    this.gameBus=this.context.createGain();this.gameBus.connect(this.master);this.uiBus=this.context.createGain();this.uiBus.connect(this.master);this.musicBus=this.context.createGain();this.musicBus.connect(this.master);
    for(const bus of ['game','menu','music']){try{const stored=localStorage.getItem(`rw.vol.${bus}`);if(stored!==null&&Number.isFinite(Number(stored)))this.volumes[bus]=clamp(Number(stored));}catch{}}this.applyVolumes();this.bindGestures();
    await Promise.all(Object.entries(manifest.sounds||{}).map(async([name,asset])=>{try{const response=await fetch(assetUrl(asset.url));if(!response.ok)throw new Error(`HTTP ${response.status}`);this.buffers.set(name,await this.context.decodeAudioData(await response.arrayBuffer()));}catch(error){this.loadErrors.push({name,message:error.message});}}));this.ready=true;if(this.unlocked)this.unlock();
  }
  bindGestures(){if(typeof document==='undefined'||this.bound)return;this.bound=true;const gesture=()=>this.unlock();document.addEventListener('pointerdown',gesture,true);document.addEventListener('keydown',gesture,true);
    document.addEventListener('pointerover',event=>{const button=event.target?.closest?.('button');if(button&&!button.disabled&&!button.contains(event.relatedTarget))this.play('hover',this.getVolume('menu')*8,'ui');});
    document.addEventListener('click',event=>{const button=event.target?.closest?.('button');if(button&&!button.disabled&&event.detail>0&&(event.button??0)===0)this.play('click',this.getVolume('menu')*1.6,'ui');},true);
  }
  unlock(){this.unlocked=true;this.context?.resume().catch(()=>{});}
  setEnabled(value){this.enabled=Boolean(value);if(this.master)this.master.gain.value=this.enabled?1:0;}
  getVolume(bus){return this.volumes[bus]??.5;}
  setVolume(bus,value){if(!Object.hasOwn(this.volumes,bus)||!Number.isFinite(Number(value)))return;this.volumes[bus]=clamp(Number(value));try{localStorage.setItem(`rw.vol.${bus}`,String(this.volumes[bus]));}catch{}this.applyVolumes();}
  applyVolumes(){if(this.gameBus)this.gameBus.gain.value=this.volumes.game*.35;if(this.uiBus)this.uiBus.gain.value=1;if(this.musicBus)this.musicBus.gain.value=this.active?0:this.volumes.music*.55;}
  play(name,volume=1,bus='game'){if(!this.enabled||!this.unlocked||!this.context||!this.buffers.has(name))return;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffers.get(name);gain.gain.value=volume;source.connect(gain);gain.connect(bus==='ui'?this.uiBus:this.gameBus);const shot={source,gain,bus};this.oneShots.add(shot);source.onended=()=>{source.disconnect();gain.disconnect();this.oneShots.delete(shot);};source.start();}
  loop(name,highpass=0,bus='game'){if(this.loops.has(name))return this.loops.get(name);if(!this.unlocked||!this.context||!this.buffers.has(name))return null;const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.buffers.get(name);source.loop=true;gain.gain.value=0;
    let panner=null;const extra=[];
    if(name==='wind sound car'&&this.context.createPanner){panner=this.context.createPanner();panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=1;panner.maxDistance=500;panner.rolloffFactor=1;const dry=this.context.createGain(),wet=this.context.createGain();dry.gain.value=.65;wet.gain.value=.35;source.connect(dry);dry.connect(gain);source.connect(panner);panner.connect(wet);wet.connect(gain);extra.push(dry,wet,panner);}
    else if(highpass){const filter=this.context.createBiquadFilter();filter.type='highpass';filter.frequency.value=highpass;filter.Q.value=20*Math.log10(.5);source.connect(filter);filter.connect(gain);extra.push(filter);}else source.connect(gain);
    gain.connect(bus==='music'?this.musicBus:this.gameBus);source.start();const result={source,gain,panner,extra};this.loops.set(name,result);return result;
  }
  stop(name){const voice=this.loops.get(name);if(!voice)return;try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();for(const node of voice.extra||[])node.disconnect();this.loops.delete(name);}
  update(snapshot,slot,input={}){
    if(!this.ready||!this.context)return;const now=this.context.currentTime,dt=clamp(this.lastTime===null?1/60:now-this.lastTime,0,.1);this.lastTime=now;
    if(!this.active){for(const name of [...this.loops.keys()])if(name!=='menu_music')this.stop(name);const music=this.loop('menu_music',0,'music');if(music)music.gain.gain.value=1;this.epoch=null;return;}
    this.stop('menu_music');const car=snapshot?.cars[Math.floor(slot/2)];if(!snapshot||!car)return;
    if(this.epoch!==snapshot.epoch||this.slot!==slot){this.epoch=snapshot.epoch;this.slot=slot;for(const name of [...this.loops.keys()])if(name!=='menu_music')this.stop(name);for(const shot of [...this.oneShots])if(shot.bus==='game'){try{shot.source.stop();}catch{}shot.source.disconnect();shot.gain.disconnect();this.oneShots.delete(shot);}this.engine.reset();this.lastPhase='';this.lastCountdown=-1;this.stats={...snapshot.stats};this.lastMud=car.mud||0;this.lastDead=Boolean(car.dead);}
    // Both occupants hear the driver's authoritative engine, never the navigator's local WASD.
    const driver={...(snapshot.inputs?.[Math.floor(slot/2)*2]||{})};if(slot%2===0&&snapshot.phase==='running')Object.assign(driver,input);if(snapshot.phase!=='running'||car.dead||car.finish>=0)Object.assign(driver,{throttle:0,steer:0,handbrake:false});
    const voices=this.engine.step(car,driver,dt);for(const state of voices){const voice=this.loop(state.name,state.highpass);if(voice){voice.gain.gain.setValueAtTime(car.dead?0:state.name==='wind sound car'?state.volume:state.volume<.008?0:clamp(state.volume),now);voice.source.playbackRate.setValueAtTime(state.pitch,now);}}
    const wind=this.loops.get('wind sound car');if(wind?.panner){const eye=this.manifest.anchors?.[slot%2===0?'Main Camera':'EyeAnchor']?.position||[0,1.3,0];for(const [key,value] of [['positionX',-eye[0]],['positionY',-eye[1]],['positionZ',-eye[2]]])wind.panner[key]?.setValueAtTime(value,now);const yaw=-(input.yaw||0)*Math.PI/180,pitch=((input.pitch||0)+(slot%2===0?11.29:8.1))*Math.PI/180,listener=this.context.listener;for(const [key,value] of [['forwardX',Math.sin(yaw)*Math.cos(pitch)],['forwardY',-Math.sin(pitch)],['forwardZ',Math.cos(yaw)*Math.cos(pitch)],['upX',0],['upY',1],['upZ',0]])listener?.[key]?.setValueAtTime(value,now);}
    if(snapshot.phase==='countdown'){const digit=Math.ceil(snapshot.countdown);if(digit!==this.lastCountdown&&digit>0){this.play('countdown-beep');this.lastCountdown=digit;}}
    if(snapshot.phase==='running'&&this.lastPhase==='countdown')this.play('countdown-go');
    if((snapshot.stats?.impacts||0)>(this.stats.impacts||0)||car.dead&&!this.lastDead)this.play('collision-heavy');
    if((car.mud||0)>this.lastMud+.001)this.play('mud',.9);
    this.lastDead=car.dead;this.lastMud=car.mud||0;this.stats={...snapshot.stats};this.lastPhase=snapshot.phase;
  }
}
