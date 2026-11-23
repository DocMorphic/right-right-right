import {LoadingScreen} from './loading-screen.js';
import {fitMenuLayout} from './menu-layout.js';
import {InputResponseProbe} from './input-response-probe.js';
import './style.css';
import './menu.css';
import {assetUrl} from './asset-url.js';
import {Network} from './network.js';
import {isPhoneOrTablet} from './platform.js';
import {installDrivingSettings} from './driving-settings.js';
import {CourseSelection,freshCourseSeed} from './course-selection.js';
import {createGameRequest,readyState,readyRoleState,raceResultLabel,restartHint,commandForR,DRIVER_CONTROLS,NAVIGATOR_CONTROLS} from './race-controls.js';
import {NativeInteractions} from './native-interactions.js';
import {crashedSeat} from './crash-presentation.js';
import {RallyView,initialLookPitch} from './view.js';
import {RallyAudio} from './audio.js';
import {generateCourse, STAGES,DEFAULT_STAGE} from '../shared/course.js';
import {tabletMountIntent} from '../shared/tablet-mount.js';
import {START_COUNTDOWN_SECONDS} from '../shared/protocol.js';
const $=id=>document.getElementById(id),show=(id,value=true)=>$(id).classList.toggle('hidden',!value);
const network=new Network(),audio=new RallyAudio(),keys=new Set(),look={pitch:0,yaw:0},nativeInteractions=new NativeInteractions();
const loadingScreen=new LoadingScreen($('loading')),menuLayout=fitMenuLayout($('menu'),document.querySelector('.menu-layout'));
let leftHeld=false,cabinInteraction={wipe:false,actions:[],target:null};
const drivingSettings=installDrivingSettings(document.querySelector('[data-pause-page="settings"]'),localStorage);
const inputProbe=import.meta.env.DEV&&new URL(location.href).searchParams.get('inputcheck')==='1'?new InputResponseProbe():null;
let connectionStatus='';
let view,room=null,id='',slot=0,mode='coop',epoch=0,snapshot=null,inRace=false,menuOpen=false,busy=false,connectionIntent='',advanced=false,note='',pendingCourse=null,selectedProfile=DEFAULT_STAGE,seq=0,actionId=0,actions=[],lastSend=0,lastFrame=0,lastReady=0,toastTimer=0;
function sizeUI(){document.documentElement.style.setProperty('--pause-scale',String(Math.min(Math.sqrt(innerWidth/1920*innerHeight/1080),(innerWidth-24)/980,(innerHeight-24)/620)));document.documentElement.style.setProperty('--ui-scale',String(Math.min((innerWidth-16)/700,(innerHeight-16)/510)));document.documentElement.style.setProperty('--hud-scale',String(Math.min(1,(innerWidth-32)/520)));}sizeUI();window.addEventListener('resize',sizeUI);
const host=()=>room?.hostId===id,required=()=>room?.playersRequired||(mode==='race'?4:2);
function toast(message){$('toast').textContent=message;show('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4500);}
function send(message){if(!network.send(message))toast('Connection lost. Host a new room or rejoin from the menu.');}
function sendCurrentInput(current=input(),now=performance.now()){if(!inRace||!network.connected)return;const inputSeq=++seq;view.recordLocalInput(inputSeq);send({type:'input',epoch,seq:inputSeq,...current,actions:actions.slice(0,4)});lastSend=now;}
const drivingKey=code=>['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(code);
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();}
function controlsLocked(){return menuOpen||snapshot?.phase==='waiting'||crashedSeat(snapshot,slot);}
function lockMouse(){if(inRace&&!menuOpen&&!crashedSeat(snapshot,slot)){$('game').requestPointerLock()?.catch?.(()=>{});}}
function input(){const blocked=controlsLocked();return{throttle:blocked?0:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),steer:blocked?0:Math.max(-1,Math.min(1,(Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')))*drivingSettings.steering)),handbrake:!blocked&&keys.has('Space'),wipe:!blocked&&(keys.has('KeyC')||cabinInteraction.wipe),pitch:look.pitch,yaw:look.yaw};}
function mountTarget(){return room?.dashboardTabletMounts?tabletMountIntent(snapshot,slot,look):null;}
function action(kind){if(inRace&&!controlsLocked())actions.push({id:++actionId,kind});}
function acknowledgeLobby(){if(room?.status==='lobby'&&network.connected&&room.seats[slot]&&!room.seats[slot].ready&&performance.now()-lastReady>250){lastReady=performance.now();send({type:'ready',ready:true,catalog:STAGES.length});}}
setInterval(acknowledgeLobby,300);
function renderMenu(){
  const count=room?.seats.filter(Boolean).length||0,ready=room?.seats.filter(seat=>seat?.ready).length||0;
  const canChoose=Boolean(host()&&room.status==='lobby'&&!busy&&!pendingCourse),canStart=canChoose&&count===required()&&ready===required();
  $('menu').dataset.room=room?'joined':'none';
  $('native-title').textContent=advanced?'CONTROLS':room?'LOBBY':'PLAY';
  $('create-room').disabled=busy||Boolean(room);$('create-room').textContent=busy&&connectionIntent==='create'?'HOSTING…':'HOST GAME';$('join-room').textContent=busy&&connectionIntent==='join'?'JOINING…':'JOIN GAME';$('join-room').disabled=busy||Boolean(room)||! /^[A-Z0-9]{6}$/.test($('room-code').value.trim());$('room-code').disabled=busy||Boolean(room);show('connection-actions',!room);
  $('room-note').textContent=room?room.code:'';show('copy-invite',Boolean(room));show('disconnect',Boolean(room));
  $('native-status').textContent=pendingCourse?'':busy?connectionStatus:note;
  $('mode-coop').textContent='2 PLAYER CO-OP';$('mode-race').textContent='4 PLAYER RACE';$('mode-coop').disabled=busy||Boolean(pendingCourse)||Boolean(room&&!host())||count>2;$('mode-race').disabled=busy||Boolean(pendingCourse)||Boolean(room&&!host());
  for(const value of ['coop','race']){$(`mode-${value}`).classList.toggle('selected',mode===value);$(`mode-${value}`).setAttribute('aria-pressed',String(mode===value));}
  $('crew-count').textContent=`${count} / ${required()}`;const seats=$('crew-seats');seats.replaceChildren();
  for(let index=0;index<required();index++){
    const occupant=room?.seats[index],own=occupant?.id===id,seat=document.createElement('button'),role=document.createElement('span'),status=document.createElement('b'),action=document.createElement('small');
    const roleName=`${mode==='race'?`CREW ${index<2?'A':'B'} · `:''}${index%2===0?'DRIVER':'NAVIGATOR'}`;
    seat.type='button';seat.className=`crew-seat${occupant?' occupied':''}${own?' own-seat':''}`;seat.dataset.seat=index;seat.dataset.team=Math.floor(index/2);
    const canSelect=Boolean(room?.status==='lobby'&&!busy&&!pendingCourse&&!own&&(!occupant||room.seatSwaps));
    seat.disabled=!canSelect;seat.setAttribute('aria-pressed',String(Boolean(own)));seat.setAttribute('aria-label',own?`${roleName}, your seat`:`${occupant?'Swap to':'Choose'} ${roleName}`);
    role.textContent=roleName;status.textContent=own?'YOU':occupant?occupant.id===room.hostId?'HOST':'CONNECTED':'EMPTY';
    action.textContent=canSelect?(occupant?'SWAP':'CHOOSE'):'';seat.append(role,status,action);seat.onclick=()=>send({type:'seat',slot:index,swap:Boolean(occupant)});seats.append(seat);
  }
  if(room&&!host())selectedProfile=room.profile;
  $('course-status').textContent=room&&!host()?'Host chooses stage':'';
  document.querySelectorAll('[data-course]').forEach(button=>{button.disabled=!canChoose;const selected=Number(button.dataset.course)===selectedProfile;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('start-game').disabled=!canStart;$('start-game').textContent=pendingCourse?'CONFIRMING…':room&&!host()?'WAITING FOR HOST':room&&count<required()?`WAITING FOR ${required()-count} PLAYER${required()-count===1?'':'S'}`:'START GAME';
  $('menu').dataset.controls=advanced?'open':'closed';menuLayout.refresh();$('advanced-toggle').textContent=advanced?'BACK':'CONTROLS';show('advanced-section',advanced);$('advanced-toggle').setAttribute('aria-expanded',String(advanced));show('retry-game',host());show('menu-lobby',host());show('exit-game',!host());$('pause-role').textContent=slot%2===0?'DRIVER':'NAVIGATOR';
}
network.addEventListener('status',event=>{connectionStatus=event.detail.message;if(busy)renderMenu();});
async function connect(message){busy=true;connectionIntent=message.type;connectionStatus='';note='';renderMenu();audio.unlock();try{await network.connect();if(!network.send(message))throw new Error('Connection lost. Try again.');}catch(error){busy=false;connectionIntent='';connectionStatus='';note=error.message;toast(note);renderMenu();}}
function disconnect(){busy=false;connectionIntent='';connectionStatus='';if(network.connected)send({type:'leave'});room=null;inRace=false;epoch=0;snapshot=null;pendingCourse=null;selectedProfile=DEFAULT_STAGE;leftHeld=false;keys.clear();view.setActive(false);audio.active=false;releaseMouse();show('menu');show('hud',false);show('death-warm',false);show('countdown',false);show('stage-ready',false);show('tablet-mount-prompt',false);show('race-hint',false);show('browser-menu',false);note='';const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);renderMenu();}
function onLobby(message){
  busy=false;connectionIntent='';connectionStatus='';
  const previousCode=room?.code;room=message;if(previousCode!==room.code)selectedProfile=room.profile??DEFAULT_STAGE;mode=room.mode;slot=Math.max(0,room.seats.findIndex(s=>s?.id===id));
  // HTTP snapshots include a lobby envelope. Do not rebuild the hidden menu or
  // write browser history on every driving packet, especially on the navigator.
  if(room.status!=='lobby'&&inRace)return;
  if(room.status==='lobby'){
    if(inRace){inRace=false;snapshot=null;audio.active=false;view.setActive(false);releaseMouse();show('hud',false);show('death-warm',false);show('countdown',false);show('stage-ready',false);show('tablet-mount-prompt',false);show('race-hint',false);show('browser-menu',false);show('menu');menuOpen=false;leftHeld=false;}
    note=pendingCourse?'Confirming stage…':'';
    // Native DirectSession acknowledges compatible peers automatically; no extra ready UI.
    acknowledgeLobby();
    if(pendingCourse?.startIfReady(room,id))send({type:'start',stageReady:true});
  }
  renderMenu();const url=new URL(location.href);url.searchParams.set('room',room.code);history.replaceState(null,'',url);
}
function startRace(message){
  if(inRace&&epoch===message.epoch){if(message.snapshot)onSnapshot(message.snapshot);return;}
  pendingCourse=null;epoch=message.epoch;inRace=true;snapshot=null;seq=0;actions=[];keys.clear();menuOpen=false;leftHeld=false;look.pitch=initialLookPitch(slot);look.yaw=0;view.practice=Boolean(room?.practice);view.dashboardMountsEnabled=room?.dashboardTabletMounts===true;
  const stage=STAGES[message.profile]||STAGES[DEFAULT_STAGE];view.buildCourse(generateCourse(message.seed,message.mode,stage.blocks,stage.seed));view.setActive(true);view.setSeat(slot);view.look=look;audio.setCourse(view.course);audio.active=true;
  show('menu',false);show('hud',false);show('death-warm',false);show('countdown',false);show('browser-menu',false);
  if(message.snapshot)onSnapshot(message.snapshot);lockMouse();
}
function resultTime(seconds){if(!Number.isFinite(seconds)||seconds<0)return '—';if(seconds<60)return `${seconds.toFixed(2)}s`;const minutes=Math.floor(seconds/60);return `${minutes}:${(seconds-minutes*60).toFixed(2).padStart(5,'0')}`;}
function onSnapshot(message){
  if(!inRace||message.epoch!==epoch||snapshot&&message.seq<snapshot.seq)return;snapshot=message;actions=actions.filter(a=>a.id>(message.inputs?.[slot]?.actionId||0));view.setSnapshot(message,{latencySeconds:network.snapshotAgeSeconds(message)});
  const own=message.cars[Math.floor(slot/2)],crashed=Boolean(own?.dead),finished=own?.finish>=0,stamp=crashed||finished;
  show('hud',stamp||message.phase==='paused');$('hud').classList.toggle('result',stamp);$('race-status').classList.toggle('crashed',crashed);$('race-status').classList.toggle('finished',finished&&!crashed);
  $('result-title').textContent=crashed?"TREE'D":finished?'FINISHED':message.phase==='paused'?'PLAYER DISCONNECTED':'';
  $('result-time').textContent=stamp?resultTime(crashed?own.stoppedAt:own.finish):'';$('result-subtitle').textContent=raceResultLabel(message,slot);renderRacePrompts();renderRunEffects(performance.now());
}
function renderRacePrompts(){$('ready-theft').textContent='DRIVERS: G — OPEN / CLOSE DOOR · E — GRAB / DROP'+(room?.dashboardTabletMounts?'\nAIM AT DASH MOUNT + E — ATTACH STOLEN TABLET':'');show('ready-theft',mode==='race'&&room?.driverDoors===true);const ready=readyState(snapshot,slot),roles=readyRoleState(snapshot);show('stage-ready',inRace&&!menuOpen&&ready.waiting);$('ready-status').dataset.ready=`${Number(roles.driverReady)}${Number(roles.navigatorReady)}`;$('ready-status').textContent=`DRIVER  ${roles.driverReady?'READY':'—'}      NAVIGATOR  ${roles.navigatorReady?'READY':'—'}`;const four=snapshot?.stageReady?.length===4;show('ready-status',!four);show('ready-crews',four);if(four){$('ready-crews').replaceChildren(...snapshot.stageReady.map((value,index)=>{const status=document.createElement('span');status.textContent=`${index<2?'A':'B'} / ${index%2===0?'DRIVER':'NAVIGATOR'} · ${value?'READY':'WAITING'}${index===slot?' · YOU':''}`;status.classList.toggle('is-ready',value);status.classList.toggle('is-local',index===slot);return status;}));}const hint=restartHint(snapshot,slot,host());show('race-hint',inRace&&!menuOpen&&Boolean(hint)&&(!crashedSeat(snapshot,slot)||view.crashStateAt().stamp));$('race-hint-text').textContent=hint;}
function renderRunEffects(now){
  const crash=view.crashStateAt(now);show('death-warm',inRace&&crash.active&&crash.stamp);$('death-warm').style.opacity=String(crash.tintAlpha);$('hud').style.setProperty('--crash-scale',String(crash.active?crash.scale:1));
  if(inRace&&crash.active){keys.clear();leftHeld=false;actions=[];show('hud',crash.stamp);const hint=restartHint(snapshot,slot,host());show('race-hint',!menuOpen&&crash.stamp&&Boolean(hint));}
  const counting=inRace&&!menuOpen&&snapshot?.phase==='countdown';show('countdown',counting);
  if(counting){const digit=String(Math.max(1,Math.min(START_COUNTDOWN_SECONDS,Math.ceil(snapshot.countdown))));if($('countdown').dataset.digit!==digit){$('countdown').dataset.digit=digit;$('countdown').textContent=digit;$('countdown').style.setProperty('--countdown-mask',`url('${assetUrl(`/assets/ui/Countdown${digit}.png`)}')`);}}
}
function setPausePage(page){document.querySelectorAll('[data-pause-page]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.pausePage!==page));}
function syncPauseVolumes(){for(const bus of ['game','menu','music']){const value=audio.getVolume?.(bus)??Number(localStorage.getItem(`rw.vol.${bus}`)??.5);$(`volume-${bus}`).value=value;$(`volume-${bus}-percent`).textContent=`${Math.round(value*100)}%`;$(`volume-${bus}`).style.setProperty('--volume',`${value*100}%`);}}
function setBrowserMenu(value){$('browser-menu').setAttribute('aria-label',inRace?'Pause menu':'Settings');document.querySelector('.pause-timer').textContent=inRace?'PAUSED':'SETTINGS';menuOpen=value;leftHeld=false;keys.clear();show('browser-menu',value);renderRacePrompts();if(value){setPausePage('home');syncPauseVolumes();releaseMouse();$('resume-game').focus({preventScroll:true});}else if(inRace)lockMouse();else $('menu-audio').focus({preventScroll:true});}
network.addEventListener('welcome',event=>id=event.detail.id);network.addEventListener('joined',event=>{id=event.detail.id||id;slot=event.detail.slot;});network.addEventListener('lobby',event=>onLobby(event.detail));network.addEventListener('race',event=>startRace(event.detail));network.addEventListener('snapshot',event=>onSnapshot(event.detail));network.addEventListener('error',event=>{const error=event.detail;if(pendingCourse&&['not_ready','busy'].includes(error.code)&&pendingCourse.matches(room)){pendingCourse.retry();note=`Waiting for all ${required()} players to confirm the course...`;renderMenu();return;}busy=false;connectionIntent='';connectionStatus='';note=error.message;pendingCourse=null;renderMenu();toast(note);});network.addEventListener('disconnected',()=>{keys.clear();note='Connection lost. Host a new room or rejoin from the menu.';toast(note);disconnect();});
$('create-room').onclick=()=>connect(createGameRequest(mode));$('room-code').oninput=()=>{if(!busy&&!room)note='';$('room-code').value=$('room-code').value.replace(/[^a-z0-9]/gi,'').toUpperCase();renderMenu();};$('join-form').onsubmit=event=>{event.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(code)connect({type:'join',code,name:'Player'});};$('disconnect').onclick=disconnect;
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);$('copy-invite').textContent='COPIED';setTimeout(()=>{$('copy-invite').textContent='COPY CODE';},1800);}catch{toast(`ROOM CODE: ${room.code}`);}};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;if(room)send({type:'configure',mode});else renderMenu();});
$('courses').classList.toggle('nine-stages',STAGES.length>6);STAGES.map((stage,index)=>({stage,index})).sort((a,b)=>parseInt(a.stage.name)-parseInt(b.stage.name)).forEach(({stage,index})=>{const button=document.createElement('button');button.dataset.course=index;button.setAttribute('aria-label',stage.name);const [number,name]=stage.name.split(' / '),numberLabel=document.createElement('span'),nameLabel=document.createElement('span');numberLabel.className='stage-number';numberLabel.textContent=number;nameLabel.textContent=name;button.append(numberLabel,nameLabel);button.onclick=()=>{if(pendingCourse)return;selectedProfile=index;renderMenu();};$('courses').append(button);});
$('start-game').onclick=()=>{if(pendingCourse||!host())return;pendingCourse=new CourseSelection({mode,profile:selectedProfile,seed:freshCourseSeed(room?.seed)});note=`Waiting for all ${required()} players to confirm the course...`;renderMenu();send(pendingCourse.message());};
$('advanced-toggle').onclick=()=>{advanced=!advanced;renderMenu();};$('menu-lobby').onclick=()=>send({type:'lobby'});$('retry-game').onclick=()=>send({type:'retry'});$('exit-game').onclick=disconnect;$('resume-game').onclick=()=>setBrowserMenu(false);
function openVolume(){if(!menuOpen)setBrowserMenu(true);syncPauseVolumes();setPausePage('volume');$('volume-music').focus({preventScroll:true});}
$('menu-audio').onclick=()=>{setBrowserMenu(true);setPausePage('settings');$('quality-setting').focus({preventScroll:true});};$('pause-audio').onclick=openVolume;
$('pause-settings').onclick=()=>setPausePage('settings');$('pause-volume').onclick=()=>{syncPauseVolumes();setPausePage('volume');};$('pause-settings-back').onclick=()=>{if(inRace)setPausePage('home');else setBrowserMenu(false);};$('pause-volume-back').onclick=()=>setPausePage(inRace?'home':'settings');
for(const bus of ['game','menu','music'])$(`volume-${bus}`).oninput=event=>{const value=Number(event.target.value);audio.setEnabled(true);localStorage.setItem('rrr-audio','on');audio.setVolume?.(bus,value);localStorage.setItem(`rw.vol.${bus}`,String(value));syncPauseVolumes();};$('quality-setting').value=localStorage.getItem('rrr-quality')||'auto';$('quality-setting').onchange=()=>{view.setQuality($('quality-setting').value);localStorage.setItem('rrr-quality',$('quality-setting').value);};
window.addEventListener('keydown',event=>{if(event.code==='Escape'&&(inRace||menuOpen)){setBrowserMenu(!menuOpen);return;}if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if(inRace&&!menuOpen&&['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F8'].includes(event.code))event.preventDefault();if(event.repeat){keys.add(event.code);return;}if(event.code==='KeyR'&&inRace){const command=commandForR({snapshot,slot,isHost:host(),menuOpen});if(command)send(command);return;}if(event.code==='F8'&&inRace&&host()){send({type:'retry'});return;}if(event.code==='KeyE'&&!((cabinInteraction.target==='knob'||cabinInteraction.wipe||cabinInteraction.holdingDoor)&&!snapshot?.tablets?.some(tablet=>tablet.holder===slot)))action(mountTarget()?'tabletMount':'grab');if(event.code==='KeyG')action(mode==='race'&&slot%2===0&&room?.driverDoors?'driverDoor':'door');keys.add(event.code);if(slot%2===0&&drivingKey(event.code)){if(inRace&&!controlsLocked())inputProbe?.press(event.code,view.presentation?.predicted);sendCurrentInput();}});window.addEventListener('keyup',event=>{keys.delete(event.code);if(slot%2===0&&drivingKey(event.code))sendCurrentInput();});window.addEventListener('blur',()=>{keys.clear();leftHeld=false;if(slot%2===0)sendCurrentInput();});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&inRace&&!menuOpen)keys.clear();});document.addEventListener('mousemove',event=>{if(document.pointerLockElement===$('game')&&inRace&&!controlsLocked()){look.yaw=Math.max(-150,Math.min(150,look.yaw+event.movementX*drivingSettings.mouse));look.pitch=Math.max(-65,Math.min(75,look.pitch+event.movementY*drivingSettings.mouse));}});
$('game').addEventListener('pointerdown',event=>{if(event.button===0&&inRace&&!controlsLocked())leftHeld=true;audio.unlock();lockMouse();});window.addEventListener('pointerup',event=>{if(event.button===0)leftHeld=false;});
document.addEventListener('visibilitychange',()=>{keys.clear();leftHeld=false;lastFrame=performance.now();if(document.hidden)audio.context?.suspend().catch(()=>{});else{if(audio.unlocked)audio.context?.resume().catch(()=>{});view?.resetPresentation?.();}});
document.addEventListener('rallyerror',event=>toast(event.detail));window.addEventListener('beforeunload',()=>network.close());
function frame(now){acknowledgeLobby();const dt=Math.min(.1,(now-lastFrame)/1000||1/60);lastFrame=now;if(document.hidden){requestAnimationFrame(frame);return;}cabinInteraction=nativeInteractions.update({camera:view.camera,carRoot:view.cars?.[Math.floor(slot/2)]?.model,car:snapshot?.cars?.[Math.floor(slot/2)],snapshot,slot,eHeld:keys.has('KeyE'),leftHeld,look,dt,enabled:inRace&&!controlsLocked(),practice:Boolean(room?.practice)});for(const actionEvent of cabinInteraction.actions)action(actionEvent.kind);const current=input();current.doorAngle=cabinInteraction.doorAngle;view.localDoorPreview=cabinInteraction.doorAngle;if(inRace&&network.connected&&now-lastSend>(network.transport==='http'?100:40)){sendCurrentInput(current,now);}const target=inRace&&!controlsLocked()?mountTarget():null;view.mountHighlight=Boolean(target);show('tablet-mount-prompt',Boolean(target));$('tablet-mount-label').textContent=target?.kind==='take'?'TAKE TABLET':'ATTACH TABLET';view.update(dt,now,current);if(inRace&&!controlsLocked())inputProbe?.rendered(view.presentation?.predicted);renderRunEffects(now);audio.update(snapshot,slot,current,view.presentation?.predicted);requestAnimationFrame(frame);}
async function boot(){if(isPhoneOrTablet(navigator)){show('loading',false);show('device-gate');return;}try{view=new RallyView($('game'));await view.load((status,detail)=>loadingScreen.update(status,detail));loadingScreen.complete();view.setQuality($('quality-setting').value);view.look=look;show('loading',false);show('menu');renderMenu();requestAnimationFrame(frame);audio.init(view.manifest).then(()=>audio.setEnabled(localStorage.getItem('rrr-audio')!=='off')).catch(()=>{});const params=new URL(location.href).searchParams,code=params.get('room');if(code){$('room-code').value=code.toUpperCase();renderMenu();}if(network.savedSession()){busy=true;renderMenu();try{await network.connect();}catch(error){note=error.message;}finally{busy=false;renderMenu();}}if(params.get('practice')==='1'&&!room){await connect(createGameRequest('coop',{practice:true}));}}catch(error){console.error(error);loadingScreen.fail(error.message);}}
$('ready-driver-controls').textContent=DRIVER_CONTROLS;$('ready-navigator-controls').textContent=NAVIGATOR_CONTROLS;
boot();
