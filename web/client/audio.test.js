import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeEngineMix,NATIVE_AUDIO,RallyAudio,nativeTorque} from './audio.js';
const params=()=>({value:0,setValueAtTime(value){this.value=value;}});
class Context{
 constructor(){this.currentTime=0;this.destination={};this.listener={};this.state='suspended';this.voices=[];}
 createGain(){return {gain:params(),connect(){},disconnect(){}};}
 createBiquadFilter(){return {frequency:params(),Q:params(),connect(){},disconnect(){}};}
 createBufferSource(){const voice={buffer:null,playbackRate:params(),connect(target){this.target=target;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};this.voices.push(voice);return voice;}
 async decodeAudioData(bytes){return {bytes};}
 async resume(){this.state='running';}
}
function audioFixture(){const audio=new RallyAudio();audio.context=new Context();audio.master=audio.context.createGain();audio.gameBus=audio.context.createGain();audio.uiBus=audio.context.createGain();audio.musicBus=audio.context.createGain();audio.applyVolumes();audio.ready=true;for(const name of ['idle','1500RMP','2000RMP','2500RMP','3000RMP','3500RMP','4000RMP','4500RMP','5000RMP','5500RMP','6000RMP','6500RMP','7000RMP','7500RMP','8000RMP','8400RMP','limiter','tyre-skid-loop','wet-road-loop','wind sound car','menu_music','hover','click','mud','countdown-beep','countdown-go','collision-heavy'])audio.buffers.set(name,{name});audio.manifest={};return audio;}
const car=(speed=0,extra={})=>({speed,doorAngle:0,mud:0,dead:false,finish:-1,...extra});
test('native bank uses idle substitution, full RPM range and original handbrake-only scrub clips',()=>{
 const mix=new NativeEngineMix();let voices;for(let i=0;i<60;i++)voices=mix.step(car(),{},1/60);
 assert.equal(voices.find(v=>v.name==='idle').pitch,1);assert.ok(voices.find(v=>v.name==='idle').volume>0);assert.equal(voices.some(v=>v.name==='1000RMP'),false);assert.equal(voices.filter(v=>v.highpass).length,16);
 assert.equal(voices.find(v=>v.name==='wet-road-loop').volume,0);assert.equal(voices.find(v=>v.name==='wind sound car').volume,0);
 for(let i=0;i<30;i++)voices=mix.step(car(10,{doorAngle:90}),{throttle:1,handbrake:true},1/60);
 assert.equal(voices.find(v=>v.name==='wet-road-loop').pitch,.32);assert.ok(voices.find(v=>v.name==='wet-road-loop').volume>0);assert.equal(voices.find(v=>v.name==='tyre-skid-loop').pitch,.85);assert.ok(voices.find(v=>v.name==='wind sound car').volume>0);
 voices=mix.step(car(10,{doorAngle:0}),{throttle:1},1/60);assert.equal(voices.find(v=>v.name==='wind sound car').volume,0);
});
test('native RPM reaches limiter when revving at rest and shifts at original gear boundaries',()=>{
 const mix=new NativeEngineMix();for(let i=0;i<120;i++)mix.step(car(),{throttle:1},1/60);assert.equal(mix.rpm,8400);assert.ok(mix.limiter>0);
 mix.step(car(40/3.6),{throttle:1},1/60);assert.equal(mix.gear,1);assert.ok(mix.rpm>=6500&&mix.rpm<8400);assert.equal(nativeTorque(6000),1);assert.equal(NATIVE_AUDIO.gearHysteresisKmh,12);
});
test('original menu/music bypass gameplay trim, mute preserves values, gesture and scene transitions are respected',()=>{
 const audio=audioFixture();assert.equal(audio.gameBus.gain.value,.175);assert.equal(audio.musicBus.gain.value,.275);assert.equal(audio.loop('menu_music',0,'music'),null);
 audio.unlock();audio.update(null,0);const music=audio.loops.get('menu_music');assert.ok(music);audio.update(null,0);assert.equal(audio.loops.get('menu_music'),music);
 audio.play('hover',audio.getVolume('menu')*8,'ui');assert.ok(audio.context.voices.at(-1).started);assert.equal(audio.context.voices.at(-1).target.gain.value,4);audio.play('click',audio.getVolume('menu')*1.6,'ui');assert.equal(audio.context.voices.at(-1).target.gain.value,.8);
 audio.setEnabled(false);assert.equal(audio.master.gain.value,0);audio.setEnabled(true);assert.equal(audio.master.gain.value,1);assert.equal(audio.getVolume('game'),.5);
 audio.active=true;audio.update({epoch:1,phase:'running',cars:[car()],inputs:[{},{}],stats:{}},0,{});assert.equal(music.source.stopped,true);assert.equal(audio.loops.has('menu_music'),false);
 audio.active=false;audio.update(null,0);assert.notEqual(audio.loops.get('menu_music'),music);
});
test('navigator keys do not rev engine and each retry plays original countdown/go exactly once again',()=>{
 const audio=audioFixture();audio.unlock();audio.active=true;const events=[];audio.play=(name,volume=1)=>events.push({name,volume});
 const snap={epoch:1,phase:'countdown',countdown:5,cars:[car()],inputs:[{throttle:0},{}],stats:{impacts:0}};
 audio.update(snap,1,{throttle:1});audio.context.currentTime+=.1;audio.update(snap,1,{throttle:1});assert.equal(audio.engine.rpm,1000);assert.equal(events.filter(e=>e.name==='countdown-beep').length,1);
 audio.context.currentTime+=.1;audio.update({...snap,phase:'running'},1,{throttle:1});assert.equal(events.filter(e=>e.name==='countdown-go').length,1);assert.equal(audio.engine.rpm,1000);
 audio.context.currentTime+=.1;audio.update({...snap,epoch:2},1,{});assert.equal(events.filter(e=>e.name==='countdown-beep').length,2);
 audio.context.currentTime+=.1;audio.update({...snap,epoch:2,phase:'running'},1,{});assert.equal(events.filter(e=>e.name==='countdown-go').length,2);
});
test('native volume API clamps and keeps menu/music independent, failed clip decode is recorded',async()=>{
 const audio=audioFixture();audio.setVolume('game',0);assert.equal(audio.gameBus.gain.value,0);assert.equal(audio.musicBus.gain.value,.275);audio.setVolume('menu',3);assert.equal(audio.getVolume('menu'),1);audio.setVolume('music',-1);assert.equal(audio.musicBus.gain.value,0);
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;globalThis.window={AudioContext:Context};globalThis.fetch=async url=>({ok:url!=='missing',status:url==='missing'?404:200,arrayBuffer:async()=>new ArrayBuffer(4)});
 try{const load=new RallyAudio();await load.init({sounds:{idle:{url:'original'},limiter:{url:'missing'}}});assert.equal(load.buffers.has('idle'),true);assert.deepEqual(load.loadErrors,[{name:'limiter',message:'HTTP 404'}]);}finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
