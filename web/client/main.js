import './style.css';
import {Network} from './network.js';
import {isPhoneOrTablet} from './platform.js';
import {CourseSelection,freshCourseSeed} from './course-selection.js';
import {RallyView,initialLookPitch} from './view.js';
import {RallyAudio} from './audio.js';
import {generateCourse, STAGES} from '../shared/course.js';
const $=id=>document.getElementById(id),show=(id,value=true)=>$(id).classList.toggle('hidden',!value);
const network=new Network(),audio=new RallyAudio(),keys=new Set(),look={pitch:0,yaw:0};
let view,room=null,id='',slot=0,mode='coop',epoch=0,snapshot=null,inRace=false,menuOpen=false,busy=false,advanced=false,note="Host a game, or enter your friend's room code.",pendingCourse=null,selectedProfile=0,seq=0,actionId=0,actions=[],lastSend=0,lastFrame=0,lastReady=0,toastTimer=0;
function sizeUI(){document.documentElement.style.setProperty('--ui-scale',String(Math.min((innerWidth-16)/700,(innerHeight-16)/510)));document.documentElement.style.setProperty('--hud-scale',String(Math.min(1,(innerWidth-32)/520)));}sizeUI();window.addEventListener('resize',sizeUI);
const modeName=()=>mode==='coop'?'2 PLAYER CO-OP':'4 PLAYER RACE',host=()=>room?.hostId===id,required=()=>room?.playersRequired||(mode==='race'?4:2);
function toast(message){$('toast').textContent=message;show('toast');clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4500);}
function send(message){if(!network.send(message))toast('Connection lost. Host a new room or rejoin from the menu.');}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();}
function lockMouse(){if(inRace&&!menuOpen){$('game').requestPointerLock()?.catch?.(()=>{});}}
function input(){return{throttle:menuOpen?0:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),steer:menuOpen?0:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),handbrake:!menuOpen&&keys.has('Space'),wipe:!menuOpen&&keys.has('KeyC'),pitch:look.pitch,yaw:look.yaw};}
function action(kind){if(inRace&&!menuOpen)actions.push({id:++actionId,kind});}
function acknowledgeLobby(){if(room?.status==='lobby'&&network.connected&&room.seats[slot]&&!room.seats[slot].ready&&performance.now()-lastReady>250){lastReady=performance.now();send({type:'ready',ready:true});}}
setInterval(acknowledgeLobby,300);
function renderMenu(){
  const count=room?.seats.filter(Boolean).length||0,ready=room?.seats.filter(seat=>seat?.ready).length||0;
  const canChoose=Boolean(host()&&room.status==='lobby'&&!busy&&!pendingCourse),canStart=canChoose&&count===required()&&ready===required();
  $('native-title').textContent=room?'CREW LOBBY':'MAIN MENU';$('mode-badge').textContent=modeName();
  $('create-room').disabled=busy||Boolean(room);$('create-room').textContent=busy?'CONNECTING...':'HOST GAME';$('join-room').disabled=busy||Boolean(room);$('room-code').disabled=busy||Boolean(room);show('connection-actions',!room);
  $('room-note').textContent=room?`ROOM CODE: ${room.code}`:'One driver. One navigator. One way out.';show('copy-invite',Boolean(room));show('disconnect',Boolean(room));
  $('native-status').textContent=pendingCourse?`Confirming the stage with ${ready}/${required()} players...`:busy?'Connecting to your crew...':note;
  $('mode-coop').textContent='2 PLAYER CO-OP';$('mode-race').textContent='4 PLAYER RACE';$('mode-coop').disabled=busy||Boolean(pendingCourse)||Boolean(room&&!host())||count>2;$('mode-race').disabled=busy||Boolean(pendingCourse)||Boolean(room&&!host());
  for(const value of ['coop','race']){$(`mode-${value}`).classList.toggle('selected',mode===value);$(`mode-${value}`).setAttribute('aria-pressed',String(mode===value));}
  $('mode-description').textContent=mode==='coop'?'One car. The driver steers. The navigator calls the turns.':'Two cars. Two crews. One finish line.';
  $('crew-count').textContent=`${count} / ${required()}`;const seats=$('crew-seats');seats.replaceChildren();
  for(let index=0;index<required();index++){const occupant=room?.seats[index],seat=document.createElement('div');seat.className=`crew-seat${occupant?' occupied':''}`;const role=document.createElement('span'),status=document.createElement('b');role.textContent=`${mode==='race'?`${index<2?'A':'B'} · `:''}${index%2===0?'DRIVER':'NAVIGATOR'}`;status.textContent=occupant?(occupant.id===id?'YOU':occupant.ready?'CONNECTED':'CONNECTING'):'EMPTY SEAT';seat.append(role,status);seats.append(seat);}
  if(room&&!host())selectedProfile=room.profile;
  $('course-status').textContent=!room?'HOST A ROOM TO BEGIN':host()?'CHOOSE YOUR ROUTE':'DRIVER PICKS THE STAGE';
  document.querySelectorAll('[data-course]').forEach(button=>{button.disabled=!canChoose;const selected=Number(button.dataset.course)===selectedProfile;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  $('start-game').disabled=!canStart;$('start-game').textContent=pendingCourse?'CONFIRMING...':room&&!host()?'WAITING FOR DRIVER':'START GAME';
  $('advanced-toggle').textContent=advanced?'BACK':'CONTROLS';show('advanced-section',advanced);$('version-note').textContent='FOREST RUN';show('retry-game',host());show('menu-lobby',host());
}
async function connect(message){busy=true;note=message.type==='create'?'Creating your room...':'Joining room...';renderMenu();audio.unlock();try{await network.connect();network.send(message);}catch(error){note=error.message;toast(note);}finally{busy=false;renderMenu();}}
function disconnect(){if(network.connected)send({type:'leave'});room=null;inRace=false;epoch=0;snapshot=null;pendingCourse=null;keys.clear();view.setActive(false);audio.active=false;releaseMouse();show('menu');show('hud',false);show('browser-menu',false);note='Disconnected. Host or join a race.';const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);renderMenu();}
function onLobby(message){
  room=message;mode=room.mode;slot=Math.max(0,room.seats.findIndex(s=>s?.id===id));
  if(room.status==='lobby'){
    if(inRace){inRace=false;snapshot=null;audio.active=false;view.setActive(false);releaseMouse();show('hud',false);show('browser-menu',false);show('menu');menuOpen=false;}
    note=pendingCourse?`Waiting for all ${required()} players to confirm the course...`:host()?`Room open. Share the code with ${required()-1} friend(s).`:'Connected. Waiting for the host to choose a course.';
    // Native DirectSession acknowledges compatible peers automatically; no extra ready UI.
    acknowledgeLobby();
    if(pendingCourse?.startIfReady(room,id))send({type:'start'});
  }
  renderMenu();const url=new URL(location.href);url.searchParams.set('room',room.code);history.replaceState(null,'',url);
}
function startRace(message){
  if(inRace&&epoch===message.epoch){if(message.snapshot)onSnapshot(message.snapshot);return;}
  pendingCourse=null;epoch=message.epoch;inRace=true;snapshot=null;seq=0;actions=[];keys.clear();menuOpen=false;look.pitch=initialLookPitch(slot);look.yaw=0;view.practice=Boolean(room?.practice);
  const stage=STAGES[message.profile]||STAGES[0];view.buildCourse(generateCourse(message.seed,message.mode,stage.blocks,stage.seed));view.setActive(true);view.setSeat(slot);view.look=look;audio.active=true;
  show('menu',false);show('hud',false);show('browser-menu',false);
  if(message.snapshot)onSnapshot(message.snapshot);lockMouse();
}
function onSnapshot(message){
  if(!inRace||message.epoch!==epoch||snapshot&&message.seq<snapshot.seq)return;snapshot=message;actions=actions.filter(a=>a.id>(message.inputs?.[slot]?.actionId||0));view.setSnapshot(message,{latencySeconds:(network.roundTripMs||0)/2000});
  const own=message.cars[Math.floor(slot/2)],feedback=message.phase==='paused'?'PLAYER DISCONNECTED':own?.dead?"TREE'D":own?.finish>=0?'FINISHED':'';
  show('hud',Boolean(feedback));if($('race-status').textContent!==feedback)$('race-status').textContent=feedback;
}
function setBrowserMenu(value){menuOpen=value;keys.clear();show('browser-menu',value);if(value)releaseMouse();else lockMouse();}
network.addEventListener('welcome',event=>id=event.detail.id);network.addEventListener('joined',event=>{id=event.detail.id||id;slot=event.detail.slot;});network.addEventListener('lobby',event=>onLobby(event.detail));network.addEventListener('race',event=>startRace(event.detail));network.addEventListener('snapshot',event=>onSnapshot(event.detail));network.addEventListener('error',event=>{const error=event.detail;if(pendingCourse&&['not_ready','busy'].includes(error.code)&&pendingCourse.matches(room)){pendingCourse.retry();note=`Waiting for all ${required()} players to confirm the course...`;renderMenu();return;}note=error.message;pendingCourse=null;renderMenu();toast(note);});network.addEventListener('disconnected',()=>{keys.clear();note='Connection lost. Host a new room or rejoin from the menu.';toast(note);disconnect();});
$('create-room').onclick=()=>connect({type:'create',mode,name:'Player'});$('join-form').onsubmit=event=>{event.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(code)connect({type:'join',code,name:'Player'});};$('disconnect').onclick=disconnect;
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);}catch{toast(`ROOM CODE: ${room.code}`);}};
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;if(room)send({type:'configure',mode});else renderMenu();});
STAGES.forEach((stage,index)=>{const button=document.createElement('button');button.dataset.course=index;button.setAttribute('aria-label',stage.name);const [number,name]=stage.name.split(' / '),numberLabel=document.createElement('span'),nameLabel=document.createElement('span');numberLabel.className='stage-number';numberLabel.textContent=number;nameLabel.textContent=name;button.append(numberLabel,nameLabel);button.onclick=()=>{if(pendingCourse)return;selectedProfile=index;renderMenu();};$('courses').append(button);});
$('start-game').onclick=()=>{if(pendingCourse||!host())return;pendingCourse=new CourseSelection({mode,profile:selectedProfile,seed:freshCourseSeed(room?.seed)});note=`Waiting for all ${required()} players to confirm the course...`;renderMenu();send(pendingCourse.message());};
$('advanced-toggle').onclick=()=>{advanced=!advanced;renderMenu();};$('menu-lobby').onclick=()=>send({type:'lobby'});$('retry-game').onclick=()=>send({type:'retry'});$('exit-game').onclick=disconnect;$('resume-game').onclick=()=>setBrowserMenu(false);
$('audio-setting').checked=localStorage.getItem('rrr-audio')!=='off';$('audio-setting').onchange=()=>{audio.setEnabled($('audio-setting').checked);localStorage.setItem('rrr-audio',$('audio-setting').checked?'on':'off');};$('quality-setting').value=localStorage.getItem('rrr-quality')||'auto';$('quality-setting').onchange=()=>{view.setQuality($('quality-setting').value);localStorage.setItem('rrr-quality',$('quality-setting').value);};
window.addEventListener('keydown',event=>{if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if(inRace&&['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F8'].includes(event.code))event.preventDefault();if(event.repeat){keys.add(event.code);return;}if(event.code==='Escape'&&inRace){setBrowserMenu(!menuOpen);return;}if(event.code==='F8'&&inRace&&host()){send({type:'retry'});return;}if(event.code==='KeyE')action('grab');if(event.code==='KeyG')action('door');keys.add(event.code);});window.addEventListener('keyup',event=>keys.delete(event.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&inRace&&!menuOpen)keys.clear();});document.addEventListener('mousemove',event=>{if(document.pointerLockElement===$('game')&&inRace&&!menuOpen){look.yaw=Math.max(-150,Math.min(150,look.yaw+event.movementX*.12));look.pitch=Math.max(-65,Math.min(75,look.pitch+event.movementY*.12));}});
$('game').addEventListener('pointerdown',()=>{audio.unlock();lockMouse();});
document.addEventListener('rallyerror',event=>toast(event.detail));window.addEventListener('beforeunload',()=>network.close());
function frame(now){acknowledgeLobby();const dt=Math.min(.1,(now-lastFrame)/1000||1/60);lastFrame=now;const current=input();if(inRace&&network.connected&&now-lastSend>(network.transport==='http'?100:40)){send({type:'input',epoch,seq:++seq,...current,actions:actions.slice(0,4)});lastSend=now;}view.update(dt,now,current);audio.update(snapshot,slot,current);requestAnimationFrame(frame);}
async function boot(){if(isPhoneOrTablet(navigator)){show('loading',false);show('device-gate');return;}try{view=new RallyView($('game'));await view.load(status=>$('load-status').textContent=status);view.setQuality($('quality-setting').value);view.look=look;show('loading',false);show('menu');renderMenu();requestAnimationFrame(frame);audio.init(view.manifest).then(()=>audio.setEnabled($('audio-setting').checked)).catch(()=>{});const params=new URL(location.href).searchParams,code=params.get('room');if(code)$('room-code').value=code.toUpperCase();if(network.savedSession()){busy=true;renderMenu();try{await network.connect();}catch(error){note=error.message;}finally{busy=false;renderMenu();}}if(params.get('practice')==='1'&&!room){await connect({type:'create',mode:'coop',practice:true,name:'Player'});}}catch(error){console.error(error);$('load-status').textContent=error.message||'Could not load the game. Reload to try again.';}}
boot();
