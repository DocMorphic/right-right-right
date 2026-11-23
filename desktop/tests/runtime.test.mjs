import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {createGameServer} from '../../web/server/index.js';
import {startDesktopServer} from '../src/runtime-server.mjs';
import {normalizeServerAddress,hostLinks} from '../src/config.mjs';
import {STAGES,DEFAULT_STAGE} from '../../web/shared/course.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){const value=predicate();if(value)return value;await delay(10);}throw new Error(`Timed out: ${label}`);}
async function client(origin){const ws=new WebSocket(origin.replace('http:','ws:')+'/ws'),state={ws,messages:[]};ws.on('message',bytes=>state.messages.push(JSON.parse(bytes)));await until(()=>state.messages.find(m=>m.type==='welcome'),'welcome');state.send=m=>ws.send(JSON.stringify(m));state.last=type=>state.messages.findLast(m=>m.type===type);return state;}

test('host address settings accept LAN and TLS WebSocket addresses without storing credentials',()=>{
 assert.equal(normalizeServerAddress('192.168.1.20:54321'),'ws://192.168.1.20:54321/ws');
 assert.equal(normalizeServerAddress('https://game.example/ws'),'wss://game.example/ws');
 assert.equal(normalizeServerAddress(''),null);
 for(const value of ['file:///tmp/game','https://name:secret@game.example','https://game.example/admin'])assert.throws(()=>normalizeServerAddress(value));
 assert.deepEqual(hostLinks(99,{en0:[{family:'IPv4',internal:false,address:'192.168.1.5'}],lo0:[{family:'IPv4',internal:true,address:'127.0.0.1'}]}),['http://192.168.1.5:99']);
});

test('local packaged host serves unchanged bytes and two real clients use the original R-ready protocol',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rrr-desktop-test-'));await writeFile(path.join(root,'index.html'),'<h1>original payload</h1>');await writeFile(path.join(root,'clip.wav'),Buffer.from([0,1,2,3]));
 const game=await startDesktopServer({createGameServer,clientRoot:root,host:'127.0.0.1'}),clients=[];
 t.after(async()=>{for(const c of clients)c.ws.terminate();await game.close();await rm(root,{recursive:true,force:true});});
 assert.equal(await (await fetch(game.origin)).text(),'<h1>original payload</h1>');assert.deepEqual(Buffer.from(await (await fetch(game.origin+'/clip.wav')).arrayBuffer()),Buffer.from([0,1,2,3]));
 const a=await client(game.origin),b=await client(game.origin);clients.push(a,b);
 a.send({type:'create',mode:'coop',profile:DEFAULT_STAGE});await until(()=>a.last('lobby'),'create');b.send({type:'join',code:a.last('lobby').code});await until(()=>a.last('lobby')?.seats[1],'join');
 for(const c of clients)c.send({type:'ready',ready:true,catalog:STAGES.length});await until(()=>a.last('lobby')?.seats.every(s=>s?.ready),'compatible clients');a.send({type:'start',stageReady:true});
 await until(()=>a.last('race')&&b.last('race'),'same race');const epoch=a.last('race').epoch;assert.equal(a.last('race').snapshot.phase,'waiting');
 a.send({type:'stageReady',epoch,ready:true});await until(()=>b.last('snapshot')?.stageReady?.[0],'driver ready');assert.equal(b.last('snapshot').phase,'waiting');
 b.send({type:'stageReady',epoch,ready:true});await until(()=>a.last('snapshot')?.phase==='countdown','both ready');assert.equal(a.last('snapshot').epoch,b.last('snapshot').epoch);
});

test('a second packaged instance proxies /ws to the SAME host while keeping all assets local',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rrr-desktop-proxy-'));await writeFile(path.join(root,'index.html'),'local game bytes');
 const host=await startDesktopServer({createGameServer,clientRoot:root,host:'127.0.0.1'}),guest=await startDesktopServer({createGameServer,clientRoot:root,remoteUrl:host.origin}),clients=[];
 t.after(async()=>{for(const c of clients)c.ws.terminate();await guest.close();await host.close();await rm(root,{recursive:true,force:true});});
 assert.equal(await(await fetch(guest.origin)).text(),'local game bytes');
 const a=await client(host.origin),b=await client(guest.origin);clients.push(a,b);a.send({type:'create',mode:'coop'});await until(()=>a.last('lobby'),'host room');b.send({type:'join',code:a.last('lobby').code});
 await until(()=>a.last('lobby')?.seats[1]&&b.last('lobby'),'proxy joins host room');assert.equal(a.last('lobby').code,b.last('lobby').code);
 assert.equal((await fetch(guest.origin+'/api/session',{method:'POST'})).status,405,'failed WS never silently creates a different HTTP room');
 assert.equal((await fetch(guest.origin+'/%2e%2e%2fpackage.json')).status,404,'no parent-file access');
});

test('a stable loopback asset origin preserves browser preference scope across app host restarts',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rrr-desktop-origin-'));await writeFile(path.join(root,'index.html'),'unchanged preferences origin');
 let first,second;
 try{
  first=await startDesktopServer({createGameServer,clientRoot:root,host:'127.0.0.1',assetPort:0});
  const origin=first.origin,assetPort=Number(new URL(origin).port);assert.notEqual(assetPort,first.port,'LAN authority has a separate available port');
  assert.equal(await(await fetch(origin)).text(),'unchanged preferences origin');await first.close();first=null;
  second=await startDesktopServer({createGameServer,clientRoot:root,host:'127.0.0.1',assetPort});
  assert.equal(second.origin,origin);assert.equal(await(await fetch(second.origin)).text(),'unchanged preferences origin');
 }finally{await first?.close();await second?.close();await rm(root,{recursive:true,force:true});}
});

test('unavailable upstream never produces a misleading successful WebSocket connection',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rrr-desktop-unavailable-'));await writeFile(path.join(root,'index.html'),'local assets still available');
 const authority=await startDesktopServer({createGameServer,clientRoot:root,host:'127.0.0.1'}),address=authority.origin;await authority.close();
 const proxy=await startDesktopServer({createGameServer,clientRoot:root,remoteUrl:address});let opened=false,failed=false;
 const ws=new WebSocket(proxy.origin.replace('http:','ws:')+'/ws');ws.on('open',()=>opened=true);ws.on('error',()=>failed=true);
 t.after(async()=>{ws.terminate();await proxy.close();await rm(root,{recursive:true,force:true});});
 await until(()=>failed,'authority connection failure');assert.equal(opened,false);assert.equal(await(await fetch(proxy.origin)).text(),'local assets still available');
});
