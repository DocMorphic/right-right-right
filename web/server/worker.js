/** Cloudflare Worker adapter. D1 CAS is the authority; no isolate-local room state. */
import {PROTOCOL_VERSION, MAX_MESSAGE_BYTES, safeName, normalizedCode} from '../shared/protocol.js';
import {newRoom,joinRoom,commandRoom,removePlayer,roomMessages,seatOf,ProtocolError,clockSeconds} from './rooms.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const token=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
const errorMessage=error=>({type:'error',code:error.code||'server',message:error instanceof ProtocolError?error.message:'The multiplayer server is busy. Please try again.'});
// Production uses wall time; integration fixtures inject a clock without exposing a request override.
export function createWorker({clock=clockSeconds}={}){
const now=clock;
async function loadSession(db,body){
  if(typeof body.id!=='string'||typeof body.token!=='string'||body.id.length>64||body.token.length!==64)throw new ProtocolError('auth','Session expired. Reconnect to the server.');
  const session=await db.prepare('SELECT id, token, code, name FROM sessions WHERE id = ? AND token = ?').bind(body.id,body.token).first();
  if(!session)throw new ProtocolError('auth','Session expired. Reconnect to the server.');return session;
}
async function mutateRoom(db,code,mutator){
  for(let attempt=0;attempt<12;attempt++){
    const record=await db.prepare('SELECT revision, data FROM rooms WHERE code = ?').bind(code).first();
    if(!record)throw new ProtocolError('not_found','Room not found. Ask the host to create a room.');
    const room=JSON.parse(record.data);room.revision=record.revision+1;const result=mutator(room);
    const write=await db.prepare('UPDATE rooms SET revision = revision + 1, data = ?, updated_at = ? WHERE code = ? AND revision = ?').bind(JSON.stringify(room),now(),code,record.revision).run();
    if(write.meta.changes===1)return {room,result,revision:record.revision+1};
  }
  throw new ProtocolError('busy','The room is busy. Your next input will retry.');
}
async function createSession(db,body){
  if(body.id&&body.token){
    const session=await loadSession(db,body);let messages=[];
    if(session.code){try{const state=await mutateRoom(db,session.code,room=>commandRoom(room,session,{type:'poll'},now()));messages=[{type:'joined',id:session.id,code:session.code,slot:seatOf(state.room,session.id)},...roomMessages(state.room,now(),true)];}catch(error){if(error.code!=='not_found'&&error.code!=='membership')throw error;await db.prepare('UPDATE sessions SET code = NULL WHERE id = ?').bind(session.id).run();}}
    return json({id:session.id,token:session.token,messages:[{type:'welcome',id:session.id,version:PROTOCOL_VERSION,transport:'http'},...messages],retryAfterMs:100});
  }
  const session={id:crypto.randomUUID(),token:token(),name:'Player'};
  await db.prepare('INSERT INTO sessions (id, token, name, updated_at) VALUES (?, ?, ?, ?)').bind(session.id,session.token,session.name,now()).run();
  return json({...session,messages:[{type:'welcome',id:session.id,version:PROTOCOL_VERSION,transport:'http'}],retryAfterMs:100});
}
async function receive(db,session,message,seenEpoch=0){
  const at=now();
  if(!message||typeof message!=='object'||Array.isArray(message))throw new ProtocolError('message','Expected a JSON object.');
  if(message.type==='ping')return [{type:'pong',clientTime:message.clientTime,serverTime:at}];
  if(message.type==='create'){
    if(session.code)throw new ProtocolError('membership','Leave the current room first.');
    session.name=safeName(message.name);let room;
    for(let attempt=0;attempt<8;attempt++){
      const bytes=crypto.getRandomValues(new Uint8Array(4)),code=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').slice(0,6).toUpperCase();
      room=newRoom(code,session,message,at);
      const insert=await db.prepare('INSERT OR IGNORE INTO rooms (code, revision, data, updated_at) VALUES (?, 0, ?, ?)').bind(code,JSON.stringify(room),at).run();
      if(insert.meta.changes===1)break;room=null;
    }
    if(!room)throw new ProtocolError('busy','Could not create a room. Try again.');
    await db.prepare('UPDATE sessions SET code = ?, name = ?, updated_at = ? WHERE id = ?').bind(room.code,session.name,at,session.id).run();session.code=room.code;
    return [{type:'joined',id:session.id,code:room.code,slot:0},...roomMessages(room,at,true)];
  }
  if(message.type==='join'){
    if(session.code)throw new ProtocolError('membership','Leave the current room first.');
    const code=normalizedCode(message.code);if(!/^[A-F0-9]{6}$/.test(code))throw new ProtocolError('not_found','Room not found. Check the six-character code.');
    session.name=safeName(message.name);
    const {room}=await mutateRoom(db,code,room=>joinRoom(room,session,message,at));
    await db.prepare('UPDATE sessions SET code = ?, name = ?, updated_at = ? WHERE id = ?').bind(code,session.name,at,session.id).run();session.code=code;
    return [{type:'joined',id:session.id,code,slot:seatOf(room,session.id)},...roomMessages(room,at,true)];
  }
  if(!session.code){if(message.type==='poll')return [];throw new ProtocolError('membership','Create or join a room first.');}
  if(message.type==='leave'){
    try{const removed=await mutateRoom(db,session.code,room=>removePlayer(room,session.id,at));if(!removed.room.seats.some(Boolean))await db.prepare('DELETE FROM rooms WHERE code = ? AND revision = ?').bind(session.code,removed.revision).run();}catch(error){if(error.code!=='not_found')throw error;}
    await db.prepare('UPDATE sessions SET code = NULL, updated_at = ? WHERE id = ?').bind(at,session.id).run();session.code=null;return [{type:'left'}];
  }
  const batch=message.type==='batch'?message.messages:[message];
  if(!Array.isArray(batch)||!batch.length||batch.length>8||batch.some(m=>!['input','poll','ready','seat','configure','start','retry','lobby'].includes(m?.type)))throw new ProtocolError('message','Invalid message batch.');
  const {room,result}=await mutateRoom(db,session.code,room=>{let race=false;for(const command of batch){const result=commandRoom(room,session,command,at);race||=result.race===true;}return {race};});
  return roomMessages(room,at,result.race||Boolean(room.world&&seenEpoch!==room.epoch));
}
return {
  async fetch(request,env,context){
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      if(!env.DB)return json({ok:false,error:'Database is not configured.'},503);
      try{await env.DB.prepare('SELECT 1 FROM rooms LIMIT 1').first();return json({ok:true,protocol:1,transport:'http',authority:'d1-cas'});}catch{return json({ok:false,error:'Multiplayer database migrations are missing.'},503);}
    }
    if(!url.pathname.startsWith('/api/')){
      if(url.pathname==='/ws')return json({error:'Use the HTTP multiplayer transport on this host.'},426);
      return env.ASSETS.fetch(request);
    }
    if(!['/api/session','/api/message','/api/poll'].includes(url.pathname))return json({messages:[{type:'error',code:'not_found',message:'Unknown endpoint.'}]},404);
    if(request.method!=='POST')return json({messages:[{type:'error',code:'method',message:'Use POST with JSON.'}]},405);
    const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({messages:[{type:'error',code:'origin',message:'Open the game on its own website.'}]},403);
    if(!env.DB)return json({messages:[{type:'error',code:'unavailable',message:'The multiplayer database is not configured.'}]},503);
    try{
      if(Number(request.headers.get('Content-Length')||0)>MAX_MESSAGE_BYTES)return json({messages:[{type:'error',code:'size',message:'Message too large.'}]},413);
      const raw=await request.text();if(raw.length>MAX_MESSAGE_BYTES)return json({messages:[{type:'error',code:'size',message:'Message too large.'}]},413);
      let body;try{body=JSON.parse(raw);}catch{throw new ProtocolError('json','Invalid JSON.');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new ProtocolError('json','Expected a JSON object.');
      if(url.pathname==='/api/session')return await createSession(env.DB,body);
      const session=await loadSession(env.DB,body),messages=await receive(env.DB,session,url.pathname==='/api/poll'?{type:'poll'}:body.message,body.epoch??0);
      // Cleanup uses D1, never in-memory timers, and does not affect active rooms.
      if(Math.random()<.002&&context?.waitUntil)context.waitUntil(env.DB.batch([
        env.DB.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(now()-7200),
        env.DB.prepare('DELETE FROM sessions WHERE updated_at < ? AND (code IS NULL OR NOT EXISTS (SELECT 1 FROM rooms WHERE rooms.code = sessions.code))').bind(now()-86400)
      ]));
      return json({messages,retryAfterMs:100});
    }catch(error){if(!(error instanceof ProtocolError))console.error('multiplayer request failed',error);return json({messages:[errorMessage(error)],retryAfterMs:200},error.code==='auth'?401:error.code==='busy'?409:400);}
  }
};
}
export default createWorker();
