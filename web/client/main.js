import './style.css';
import {Network} from './network.js';
import {RallyView} from './view.js';
import {RallyAudio} from './audio.js';
import {generateCourse, STAGES} from '../shared/course.js';
const $=id=>document.getElementById(id),show=(id,value=true)=>$(id).classList.toggle('hidden',!value);
const network=new Network(),audio=new RallyAudio(),keys=new Set(),look={pitch:0,yaw:0};
let view,room=null,id='',slot=0,mode='coop',epoch=0,snapshot=null,inRace=false,menuOpen=false,mapOpen=false,busy=false,advanced=false,note="Host a game, or enter your friend's room code.",pendingCourse=null,seq=0,actionId=0,actions=[],lastSend=0,lastFrame=0,lastReady=0,toastTimer=0,drag=null;
function sizeUI(){document.documentElement.style.setProperty('--ui-scale',String(Math.min((innerWidth-16)/700,(innerHeight-16)/510)));document.documentElement.style.setProperty('--hud-scale',String(Math.min(1,(innerWidth-32)/520)));}sizeUI();window.addEventListener('resize',sizeUI);
const modeName=()=>mode==='coop'?'2 PLAYER CO-OP':'4 PLAYER RACE',host=()=>room?.hostId===id,required=()=>room?.playersRequired||(mode==='race'?4:2);
function toast(message){$('toast').textContent=message;show('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4500);}
function send(message){if(!network.send(message))toast('Connection lost. Host a new room or rejoin from the menu.');}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();}
function lockMouse(){if(inRace&&!menuOpen&&!mapOpen&&!matchMedia('(pointer:coarse)').matches){$('game').requestPointerLock()?.catch?.(()=>{});}}
function input(){return{throttle:menuOpen?0:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),steer:menuOpen?0:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),handbrake:!menuOpen&&keys.has('Space'),wipe:!menuOpen&&keys.has('KeyC'),pitch:look.pitch,yaw:look.yaw};}
function action(kind){if(inRace&&!menuOpen)actions.push({id:++actionId,kind});}
function acknowledgeLobby(){if(room?.status==='lobby'&&network.connected&&room.seats[slot]&&!room.seats[slot].ready&&performance.now()-lastReady>250){lastReady=performance.now();send({type:'ready',ready:true});}}
setInterval(acknowledgeLobby,300);
function renderMenu(){
  const count=room?.seats.filter(Boolean).length||0,canChoose=Boolean(host()&&count===required()&&room.seats.every(s=>s?.ready)&&!busy);
  $('native-title').textContent=`RIGHT RIGHT RIGHT / ${modeName()}`;$('create-room').disabled=busy||Boolean(room);$('join-room').disabled=busy||Boolean(room);$('room-code').disabled=busy||Boolean(room);
  $('room-note').textContent=room?`ROOM CODE: ${room.code}`:'No accounts or extra apps needed. Everyone opens the same game version.';show('copy-invite',Boolean(room));
  $('native-status').textContent=`${count}/${required()} players — ${note}`;
  $('mode-coop').textContent=mode==='coop'?'[ 2 PLAYER CO-OP ]':'2 PLAYER CO-OP';$('mode-race').textContent=mode==='race'?'[ 4 PLAYER RACE ]':'4 PLAYER RACE';$('mode-coop').disabled=busy||Boolean(room&&!host())||count>2;$('mode-race').disabled=busy||Boolean(room&&!host());
  $('mode-description').textContent=mode==='coop'?'One car: host drives, friend navigates. Host can change mode in the lobby.':'Two cars. Join order: A driver, A navigator, B driver, B navigator.';
  $('course-status').textContent=canChoose?'Everyone connected. Host: choose a course.':`The host can choose a course when all ${required()} matching players are connected.`;
  document.querySelectorAll('[data-course]').forEach(button=>button.disabled=!canChoose);
  $('advanced-toggle').textContent=advanced?'BACK TO ROOM CODES':'LAN / ADVANCED';show('room-section',!advanced);show('advanced-section',advanced);
  $('version-note').textContent=advanced?'Browser rooms use HOST GAME / JOIN CODE.':'Everyone needs the same game version.';
}
async function connect(message){busy=true;note=message.type==='create'?'Creating your room...':'Joining room...';renderMenu();audio.unlock();try{await network.connect();network.send(message);}catch(error){note=error.message;toast(note);}finally{busy=false;renderMenu();}}
function disconnect(){if(network.connected)send({type:'leave'});room=null;inRace=false;epoch=0;snapshot=null;pendingCourse=null;keys.clear();view.setActive(false);audio.active=false;releaseMouse();show('menu');show('hud',false);show('touch-controls',false);show('map-panel',false);show('browser-menu',false);note='Disconnected. Host or join a race.';const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);renderMenu();}
function onLobby(message){
  room=message;mode=room.mode;slot=Math.max(0,room.seats.findIndex(s=>s?.id===id));
  if(room.status==='lobby'){
    if(inRace){inRace=false;snapshot=null;audio.active=false;view.setActive(false);releaseMouse();show('hud',false);show('touch-controls',false);show('map-panel',false);show('browser-menu',false);show('menu');menuOpen=false;mapOpen=false;}
    note=host()?`Room open. Share the code with ${required()-1} friend(s).`:'Connected. Waiting for the host to choose a course.';
    // Native DirectSession acknowledges compatible peers automatically; no extra ready UI.
    acknowledgeLobby();
    if(pendingCourse!==null&&host()&&room.profile===pendingCourse&&room.seats.filter(Boolean).length===required()&&room.seats.every(s=>s?.ready)){pendingCourse=null;send({type:'start'});}
  }
  renderMenu();const url=new URL(location.href);url.searchParams.set('room',room.code);history.replaceState(null,'',url);
}
function startRace(message){
  if(inRace&&epoch===message.epoch){if(message.snapshot)onSnapshot(message.snapshot);return;}
  epoch=message.epoch;inRace=true;snapshot=null;seq=0;actions=[];keys.clear();menuOpen=false;mapOpen=false;look.pitch=0;look.yaw=0;view.practice=Boolean(room?.practice);
  const stage=STAGES[message.profile]||STAGES[0];view.buildCourse(generateCourse(message.seed,message.mode,stage.blocks,stage.seed));view.setActive(true);view.setSeat(slot);view.look=look;audio.active=true;
  show('menu',false);show('hud');show('touch-controls');show('map-panel',false);show('browser-menu',false);show('back-lobby',host());
  if(message.snapshot)onSnapshot(message.snapshot);lockMouse();
}
function onSnapshot(message){
  if(!inRace||message.epoch!==epoch||snapshot&&message.seq<snapshot.seq)return;snapshot=message;actions=actions.filter(a=>a.id>(message.inputs?.[slot]?.actionId||0));view.setSnapshot(message);
  const cars=message.cars,finished=cars.map((c,i)=>({c,i})).filter(v=>v.c.finish>=0).sort((a,b)=>a.c.finish-b.c.finish);
  const result=cars.length===1?(cars[0].dead?'RUN FAILED / TREE':`CO-OP FINISHED ${cars[0].finish.toFixed(2)}s`):finished.length?`WINNER: CREW ${finished[0].i===0?'A':'B'}`:'BOTH CREWS DNF';
  const status=message.phase==='paused'?'PLAYER DISCONNECTED / RETURN TO LOBBY':message.phase==='countdown'?`START IN ${Math.ceil(message.countdown)}`:message.phase==='ended'?result:`${cars.length===1?'CO-OP':'RACE'} ${message.elapsed.toFixed(1)}s`;
  const lines=cars.map((c,i)=>`CREW ${i===0?'A':'B'}: `+(c.dead?'DNF / TREE':c.finish>=0?`FINISHED ${c.finish.toFixed(2)}s`:`${Math.min(100,Math.trunc(c.progress*100/view.course.points.length))}%`));
  $('race-status').textContent=`${status}\n${lines.join('     ')}\nYOU: crew ${slot<2?'A':'B'} ${slot%2===0?'DRIVER':'NAVIGATOR'}\nE grab/drop tablet | G close door | hold C wipe | F8 host retry`;
}
function setBrowserMenu(value){menuOpen=value;keys.clear();show('browser-menu',value);if(value){releaseMouse();setMap(false);}else lockMouse();}
function setMap(value){if(!inRace||!(slot%2===1||room?.practice))return;mapOpen=value;show('map-panel',value);if(value)releaseMouse();else if(!menuOpen)lockMouse();}
network.addEventListener('welcome',event=>id=event.detail.id);network.addEventListener('joined',event=>{id=event.detail.id||id;slot=event.detail.slot;});network.addEventListener('lobby',event=>onLobby(event.detail));network.addEventListener('race',event=>startRace(event.detail));network.addEventListener('snapshot',event=>onSnapshot(event.detail));network.addEventListener('error',event=>{note=event.detail.message;pendingCourse=null;renderMenu();toast(note);});network.addEventListener('disconnected',()=>{keys.clear();note='Connection lost. Host a new room or rejoin from the menu.';toast(note);disconnect();});
$('create-room').onclick=()=>connect({type:'create',mode,name:'Player'});$('join-form').onsubmit=event=>{event.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(code)connect({type:'join',code,name:'Player'});};$('disconnect').onclick=disconnect;
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);}catch{toast(`ROOM CODE: ${room.code}`);}};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;if(room)send({type:'configure',mode});else renderMenu();});
STAGES.forEach((stage,index)=>{const button=document.createElement('button');button.textContent=stage.name;button.dataset.course=index;Object.assign(button.style,{left:`${20+index%2*335}px`,top:`${332+Math.floor(index/2)*40}px`,width:'320px',height:'34px'});button.onclick=()=>{pendingCourse=index;note=`Waiting for all ${required()} players to confirm the course...`;send({type:'configure',mode,profile:index,seed:Math.floor(Math.random()*2147483646)+1});};$('courses').append(button);});
$('advanced-toggle').onclick=()=>{advanced=!advanced;renderMenu();};$('back-lobby').onclick=()=>send({type:'lobby'});$('menu-lobby').onclick=()=>send({type:'lobby'});$('retry-game').onclick=()=>send({type:'retry'});$('exit-game').onclick=disconnect;$('resume-game').onclick=()=>setBrowserMenu(false);$('touch-menu').onclick=()=>setBrowserMenu(!menuOpen);$('map-close').onclick=()=>setMap(false);
$('audio-setting').checked=localStorage.getItem('rrr-audio')!=='off';$('audio-setting').onchange=()=>{audio.setEnabled($('audio-setting').checked);localStorage.setItem('rrr-audio',$('audio-setting').checked?'on':'off');};$('quality-setting').value=localStorage.getItem('rrr-quality')||'auto';$('quality-setting').onchange=()=>{view.setQuality($('quality-setting').value);localStorage.setItem('rrr-quality',$('quality-setting').value);};
window.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if(inRace&&['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F8'].includes(event.code))event.preventDefault();if(event.repeat){keys.add(event.code);return;}if(event.code==='Escape'&&inRace){if(mapOpen)setMap(false);else setBrowserMenu(!menuOpen);return;}if(event.code==='Tab'&&inRace){setMap(!mapOpen);return;}if(event.code==='F8'&&inRace&&host()){send({type:'retry'});return;}if(event.code==='KeyE')action('grab');if(event.code==='KeyG')action('door');keys.add(event.code);});window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&inRace&&!menuOpen&&!mapOpen)keys.clear();});document.addEventListener('mousemove',event=>{if(document.pointerLockElement===$('game')&&inRace&&!menuOpen){look.yaw=Math.max(-150,Math.min(150,look.yaw+event.movementX*.12));look.pitch=Math.max(-65,Math.min(75,look.pitch+event.movementY*.12));}});
$('game').addEventListener('pointerdown',event=>{audio.unlock();if(event.pointerType==='mouse')lockMouse();else if(inRace&&!menuOpen){drag={x:event.clientX,y:event.clientY,id:event.pointerId};$('game').setPointerCapture(event.pointerId);}});$('game').addEventListener('pointermove',event=>{if(drag&&event.pointerId===drag.id){look.yaw=Math.max(-150,Math.min(150,look.yaw+(event.clientX-drag.x)*.23));look.pitch=Math.max(-65,Math.min(75,look.pitch+(event.clientY-drag.y)*.23));drag.x=event.clientX;drag.y=event.clientY;}});$('game').addEventListener('pointerup',()=>drag=null);
document.querySelectorAll('[data-key]').forEach(button=>{const key=button.dataset.key;button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(key);if(key==='KeyE')action('grab');if(key==='KeyG')action('door');};for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(key));});
document.addEventListener('rallyerror',event=>toast(event.detail));window.addEventListener('beforeunload',()=>network.close());
function frame(now){acknowledgeLobby();const dt=Math.min(.1,(now-lastFrame)/1000||1/60);lastFrame=now;const current=input();if(inRace&&network.connected&&now-lastSend>(network.transport==='http'?100:40)){send({type:'input',epoch,seq:++seq,...current,actions:actions.slice(0,4)});lastSend=now;}view.update(dt,now,current);audio.update(snapshot,slot,current);requestAnimationFrame(frame);}
async function boot(){try{view=new RallyView($('game'));await view.load(status=>$('load-status').textContent=status);view.setQuality($('quality-setting').value);view.look=look;show('loading',false);show('menu');renderMenu();requestAnimationFrame(frame);audio.init(view.manifest).then(()=>audio.setEnabled($('audio-setting').checked)).catch(()=>{});const params=new URL(location.href).searchParams,code=params.get('room');if(code)$('room-code').value=code.toUpperCase();if(params.get('practice')==='1'){await connect({type:'create',mode:'coop',practice:true,name:'Player'});}}catch(error){console.error(error);$('load-status').textContent=error.message||'Could not load the game. Reload to try again.';}}
boot();
