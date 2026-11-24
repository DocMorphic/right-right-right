import {randomBytes} from 'node:crypto';
import {PROTOCOL_VERSION, normalizedCode, safeName} from '../shared/protocol.js';
import {clockSeconds, newRoom, joinRoom, removePlayer, commandRoom, advanceRoom, roomMessages, snapshotMessage, seatOf, ProtocolError} from './rooms.js';
import {roadPlanPublic,roadPlanDelta} from '../shared/live-road.js';

export class GameService {
  constructor({send=()=>{},now=clockSeconds,scheduledPhysics=false}={}){this.rooms=new Map();this.sessions=new Map();this.send=send;this.now=now;this.scheduledPhysics=scheduledPhysics;this.roadSent=new WeakMap();}
  connect(id=randomBytes(12).toString('base64url')){const session={id,name:'Player',code:null,lastSeen:this.now()};this.sessions.set(id,session);this.send(id,{type:'welcome',version:PROTOCOL_VERSION,id,transport:'websocket'});return session;}
  broadcast(room,race=false){room.revision=(room.revision||0)+1;for(const seat of room.seats)if(seat)for(const message of roomMessages(room,this.now(),race))this.send(seat.id,message);if(race&&room.mode==='roadcall'&&room.roadPlan)this.roadSent.set(room,roadPlanPublic(room.roadPlan));}
  sendRoad(room){if(room.mode!=='roadcall'||!room.world)return;const before=this.roadSent.get(room),next=roadPlanPublic(room.roadPlan);if(before?.revision===next.revision)return;const message={type:'roadUpdate',epoch:room.epoch,...(before?{delta:roadPlanDelta(before,next)}:{roadPlan:next})};for(const seat of room.seats)if(seat)this.send(seat.id,message);this.roadSent.set(room,next);}
  receive(id,message){
    const session=this.sessions.get(id);if(!session)return;
    try{
      if(!message||typeof message!=='object'||Array.isArray(message))throw new ProtocolError('message','Expected a JSON object.');
      session.lastSeen=this.now();
      if(message.type==='ping'){this.send(id,{type:'pong',clientTime:message.clientTime,serverTime:this.now()});return;}
      if(message.type==='create'||message.type==='join'){
        if(session.code)throw new ProtocolError('membership','Leave the current room first.');
        session.name=safeName(message.name);
        let room;
        if(message.type==='create'){
          let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(this.rooms.has(code));
          room=newRoom(code,session,message,this.now());this.rooms.set(code,room);
        }else{
          room=this.rooms.get(normalizedCode(message.code));if(!room)throw new ProtocolError('not_found','Room not found. Check the code.');joinRoom(room,session,message,this.now());
        }
        session.code=room.code;this.send(id,{type:'joined',id,code:room.code,slot:seatOf(room,id)});this.broadcast(room,true);return;
      }
      const room=this.rooms.get(session.code);if(!room)throw new ProtocolError('membership','Create or join a room first.');
      if(message.type==='leave'){this.leave(session);this.send(id,{type:'left'});return;}
      const result=commandRoom(room,session,message,this.now(),{advance:!this.scheduledPhysics});if(result.broadcast)this.broadcast(room,result.race);
      if(result.roadAck){this.sendRoad(room);this.send(id,{type:'roadAck',epoch:room.epoch,...result.roadAck});}
      if(result.roadSync)this.send(id,{type:'roadUpdate',epoch:room.epoch,roadPlan:roadPlanPublic(room.roadPlan)});
    }catch(error){this.send(id,{type:'error',code:error.code||'server',message:error instanceof ProtocolError?error.message:'The server could not handle this message.'});if(!(error instanceof ProtocolError))console.error(error);}
  }
  leave(session){const room=this.rooms.get(session.code);session.code=null;if(!room)return;removePlayer(room,session.id,this.now());if(room.seats.some(Boolean))this.broadcast(room);else this.rooms.delete(room.code);}
  disconnect(id){const session=this.sessions.get(id);if(session)this.leave(session);this.sessions.delete(id);}
  tick(){for(const room of this.rooms.values()){const now=this.now();for(const seat of room.seats)if(seat&&this.sessions.has(seat.id))seat.lastSeen=now;advanceRoom(room,now,this.scheduledPhysics?{fixedStep:true,maxCatchup:.1}:undefined);this.sendRoad(room);}}
  snapshots(){for(const room of this.rooms.values())if(room.world){const message=snapshotMessage(room,this.now());for(const seat of room.seats)if(seat)this.send(seat.id,message);}}
}
