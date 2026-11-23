import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,commandRoom,advanceRoom,snapshotMessage} from './rooms.js';

test('a snapshot timestamps the last simulated physics state, not the later broadcast callback',()=>{
 const session={id:'clock-driver',name:'Driver'},room=newRoom('ABC123',session,{mode:'coop',practice:true,profile:6,seed:12345},1000);
 commandRoom(room,session,{type:'ready',ready:true,catalog:9},1000);
 commandRoom(room,session,{type:'start'},1000);
 for(let t=1000;t<1004;t+=.02)advanceRoom(room,t);
 commandRoom(room,session,{type:'input',epoch:room.epoch,seq:1,throttle:1,steer:0,pitch:0,yaw:0},1004);
 advanceRoom(room,1004.02);const position=room.world.cars[0].z;
 const snapshot=snapshotMessage(room,1004.039);
 assert.equal(snapshot.cars[0].z,position);
 assert.equal(snapshot.time,1004.02,'broadcast scheduling delay must be visible to the client predictor');
 assert.equal(room.lastAt,1004.02,'taking a snapshot does not step or mutate the authority');
});
