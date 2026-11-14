import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STAGE,STAGES} from '../shared/course.js';
import {createGameRequest,readyState,readyRoleState,restartHint,commandForR,RESTART_HINT,NAVIGATOR_RESTART_HINT} from './race-controls.js';

const waiting={phase:'waiting',epoch:42,stageReady:[false,false],cars:[{dead:false,finish:-1}]};
test('host and practice requests select the first original stage',()=>{
  assert.equal(STAGES[DEFAULT_STAGE].nativeScene,'1');
  assert.equal(createGameRequest('coop').profile,DEFAULT_STAGE);
  assert.equal(createGameRequest('coop',{practice:true}).practice,true);
});

test('each unready seat uses R to acknowledge the current run once',()=>{
  for(const slot of [0,1])assert.deepEqual(commandForR({snapshot:waiting,slot,isHost:slot===0}),{type:'stageReady',epoch:42,ready:true});
  const oneReady={...waiting,stageReady:[true,false]};
  assert.equal(commandForR({snapshot:oneReady,slot:0,isHost:true}),null);
  assert.deepEqual(readyState(oneReady,1),{waiting:true,localReady:false,readyCount:1,playersRequired:2});
  assert.equal(commandForR({snapshot:waiting,slot:0,isHost:true,repeat:true}),null);
  assert.equal(commandForR({snapshot:waiting,slot:0,isHost:true,menuOpen:true}),null);
});

test('R during active driving does not retry, and result prompts follow host authority',()=>{
  assert.equal(commandForR({snapshot:{...waiting,phase:'running'},slot:0,isHost:true}),null);
  for(const car of [{dead:true,finish:-1},{dead:false,finish:92.4}]){
    const result={...waiting,phase:'ended',cars:[car]};
    assert.equal(restartHint(result,0,true),RESTART_HINT);
    assert.equal(restartHint(result,1,false),NAVIGATOR_RESTART_HINT);
    assert.deepEqual(commandForR({snapshot:result,slot:0,isHost:true}),{type:'retry'});
    assert.equal(commandForR({snapshot:result,slot:1,isHost:false}),null);
  }
  const retry={...waiting,epoch:43};
  assert.equal(commandForR({snapshot:retry,slot:1,isHost:false}).epoch,43);
});


test('four-player ready display waits for every driver and navigator role',()=>{
  assert.deepEqual(readyRoleState({stageReady:[true,true,false,false]}),{driverReady:false,navigatorReady:false});
  assert.deepEqual(readyRoleState({stageReady:[true,false,true,false]}),{driverReady:true,navigatorReady:false});
  assert.deepEqual(readyRoleState({stageReady:[true,true,true,true]}),{driverReady:true,navigatorReady:true});
});
