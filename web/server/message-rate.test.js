import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageRate} from './message-rate.js';
test('queued normal inputs survive a recovered event loop',()=>{let now=0;const rate=new MessageRate({now:()=>now});assert.ok(rate.take());now=12000;for(let i=0;i<312;i++)assert.equal(rate.take(),true,'12 seconds at 25 inputs plus a ping each second');});
test('packet bursts and sustained flooding are still bounded',()=>{let now=0;const rate=new MessageRate({now:()=>now});for(let i=0;i<512;i++)assert.ok(rate.take());assert.equal(rate.take(),false);now=1000;for(let i=0;i<100;i++)assert.ok(rate.take());assert.equal(rate.take(),false);now=100000;for(let i=0;i<512;i++)assert.ok(rate.take());assert.equal(rate.take(),false,'an idle connection never accumulates unlimited tokens');});
