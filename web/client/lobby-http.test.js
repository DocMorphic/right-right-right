import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createHttpFixture} from '../server/http-fixture.js';
import {Network} from './network.js';
import {CourseSelection,freshCourseSeed} from './course-selection.js';

async function until(predicate,label,timeout=5000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const result=predicate();if(result)return result;await delay(10);}
  throw new Error(`Timed out: ${label}`);
}

function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
async function connectPlayer(storage=memoryStorage()){
  const network=new Network({storage}),player={network,storage,id:null,lobby:null,race:null,selection:null,errors:[]};
  network.addEventListener('welcome',event=>player.id=event.detail.id);
  network.addEventListener('lobby',event=>{
    player.lobby=event.detail;
    const seat=player.lobby.seats.find(seat=>seat?.id===player.id);
    if(player.lobby.status==='lobby'&&seat&&!seat.ready)network.send({type:'ready',ready:true});
    if(player.selection?.startIfReady(player.lobby,player.id))network.send({type:'start'});
  });
  network.addEventListener('race',event=>{player.race=event.detail;player.selection=null;});
  network.addEventListener('error',event=>player.errors.push(event.detail));
  await network.connect();
  assert.equal(network.transport,'http');
  return player;
}

function select(player,profile,seed){
  player.race=null;
  player.selection=new CourseSelection({mode:player.lobby.mode,profile,seed});
  player.network.send(player.selection.message());
}

// A native course can be selected again with a fresh random seed. A profile alone
// cannot identify which configuration the server's readiness flags acknowledge.
test('same-profile stale readiness cannot launch a newly selected seed',()=>{
  const old={status:'lobby',hostId:'host',mode:'coop',profile:0,seed:100,playersRequired:2,seats:[{id:'host',ready:true},{id:'friend',ready:true}]};
  assert.equal(freshCourseSeed(1,()=>0),2);
  const selection=new CourseSelection({mode:'coop',profile:0,seed:101});
  assert.equal(selection.startIfReady(old,'host'),false);
  assert.equal(selection.startIfReady({...old,seed:101,seats:[{ready:true},{ready:false}]},'host'),false);
  assert.equal(selection.startIfReady({...old,seed:101},'friend'),false);
  assert.equal(selection.startIfReady({...old,seed:101},'host'),true);
  assert.equal(selection.startIfReady({...old,seed:101},'host'),false);
});

test('Network drops older room revisions while retaining lobby and race at the same revision',()=>{
  const network=new Network(),received=[];network.addEventListener('message',event=>received.push(event.detail.type));
  network.deliver([{type:'joined',code:'AAAAAA'},{type:'lobby',revision:8},{type:'lobby',revision:7},{type:'race',revision:8,epoch:1},{type:'snapshot',revision:8}]);
  assert.deepEqual(received,['joined','lobby','race','snapshot']);
  network.deliver([{type:'joined',code:'BBBBBB'},{type:'lobby',revision:0}]);
  assert.equal(network.roomRevision,0);
});

test('two real HTTP clients survive an in-flight old poll and repeated same-profile course starts',async t=>{
  const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
  let hostId,holdPoll=false,releasePoll,pollCaptured,active=0,maximum=0;
  const captured=new Promise(resolve=>pollCaptured=resolve);
  const commands=[];
  const fixture=await createHttpFixture({
    beforeRequest({url,body}){if(url.endsWith('/api/message'))commands.push({id:body.id,message:body.message});},
    async afterResponse({url,body,bytes}){
      if(holdPoll&&url.endsWith('/api/poll')&&body.id===hostId){
        const data=JSON.parse(Buffer.from(bytes).toString()),lobby=data.messages.find(message=>message.type==='lobby');
        if(lobby?.seats.every(seat=>seat?.ready)){holdPoll=false;pollCaptured(lobby);await new Promise(resolve=>releasePoll=resolve);}
      }
    }
  });
  globalThis.location=new URL(`${fixture.url}/?transport=http`);
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options?.body||'{}'),isHost=body.id===hostId;
    if(isHost){active++;maximum=Math.max(maximum,active);}
    try{return await originalFetch(new URL(url,fixture.url),options);}finally{if(isHost)active--;}
  };
  const players=[];
  t.after(async()=>{releasePoll?.();for(const p of players)p.network.close();await Promise.all(players.map(p=>p.network.httpTail));await fixture.close();globalThis.fetch=originalFetch;globalThis.location=originalLocation;});
  const host=await connectPlayer();players.push(host);hostId=host.id;
  host.network.send({type:'create',mode:'coop',name:'HTTP host'});
  await until(()=>host.lobby,'host creates room');
  const friend=await connectPlayer();players.push(friend);
  friend.network.send({type:'join',code:host.lobby.code,name:'HTTP navigator'});
  await until(()=>host.lobby?.seats.length===2&&host.lobby.seats.every(seat=>seat?.ready),'both clients automatically ready');
  holdPoll=true;
  const old=await Promise.race([captured,delay(5000).then(()=>{throw new Error('Old poll was not captured');})]);
  const nextSeed=old.seed===2147483647?1:old.seed+1;
  select(host,old.profile,nextSeed);
  await delay(30);
  assert.equal(commands.at(-1)?.message.type!=='start',true);
  releasePoll();
  await until(()=>host.race?.seed===nextSeed&&friend.race?.seed===nextSeed,'both HTTP clients enter new course');
  assert.equal(maximum,1,'a client never overlaps a poll with a command request');
  assert.deepEqual(host.errors,[]);assert.deepEqual(friend.errors,[]);
  for(let round=0;round<3;round++){
    host.network.send({type:'lobby'});
    await until(()=>host.lobby.status==='lobby'&&friend.lobby.status==='lobby'&&host.lobby.seats.every(seat=>seat?.ready),'return to lobby and acknowledge');
    select(host,0,nextSeed+round+1);
    await until(()=>host.race?.seed===nextSeed+round+1&&friend.race?.seed===nextSeed+round+1,'repeat native first-course selection');
  }
  assert.deepEqual(host.errors,[]);assert.deepEqual(friend.errors,[]);
  const starts=commands.filter(command=>command.message.type==='start');
  assert.equal(starts.length,4,'one start request per selected course');
  friend.network.close();
  const resumed=await connectPlayer(friend.storage);players.push(resumed);
  await until(()=>resumed.race?.epoch===host.race.epoch,'reloaded HTTP tab resumes its current run');
  assert.equal(resumed.id,friend.id,'reload keeps the existing seat instead of creating a ghost player');
  assert.equal(resumed.lobby.seats.filter(Boolean).length,2);
  assert.deepEqual(resumed.errors,[]);
});
