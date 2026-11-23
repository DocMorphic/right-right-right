import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),report=JSON.parse(await readFile(path.join(desktop,'out/build-report.json'),'utf8'));
const archive=path.join(report.appPath,'Contents/Resources/app.asar'),url=file=>pathToFileURL(path.join(archive,file)).href;
const code=`
import {createGameServer} from ${JSON.stringify(url('game/web/server/index.js'))};
import {startDesktopServer} from ${JSON.stringify(url('runtime-server.mjs'))};
import {WebSocket} from ${JSON.stringify(url('node_modules/ws/wrapper.mjs'))};
import {STAGES,DEFAULT_STAGE} from ${JSON.stringify(url('game/web/shared/course.js'))};
const game=await startDesktopServer({createGameServer,clientRoot:${JSON.stringify(path.join(archive,'client'))},host:'127.0.0.1',assetPort:0});
const players=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate){for(let i=0;i<500;i++){const value=predicate();if(value)return value;await sleep(10);}throw new Error('Timed out');}
try{
 const html=await(await fetch(game.origin)).text();if(!html.includes('stage-ready'))throw new Error('Game payload missing');
 const manifest=await(await fetch(game.origin+'/assets/manifest.json')).json();
 const car=await fetch(game.origin+manifest.models.car.url);if(!car.ok||(await car.arrayBuffer()).byteLength<1000000)throw new Error('Native car missing');
 const clip=await fetch(game.origin+manifest.sounds.idle.url);if(!clip.ok||(await clip.arrayBuffer()).byteLength<1000)throw new Error('Native audio missing');
 for(let i=0;i<2;i++){const p={messages:[],ws:new WebSocket(game.origin.replace('http:','ws:')+'/ws')};p.ws.on('message',d=>p.messages.push(JSON.parse(d)));p.last=t=>p.messages.findLast(m=>m.type===t);p.send=m=>p.ws.send(JSON.stringify(m));players.push(p);await until(()=>p.last('welcome'));}
 const[a,b]=players;a.send({type:'create',mode:'coop',profile:DEFAULT_STAGE});await until(()=>a.last('lobby'));b.send({type:'join',code:a.last('lobby').code});await until(()=>a.last('lobby')?.seats[1]);
 for(const p of players)p.send({type:'ready',ready:true,catalog:STAGES.length});await until(()=>a.last('lobby')?.seats.every(s=>s?.ready));a.send({type:'start',stageReady:true});await until(()=>a.last('race')&&b.last('race'));
 const epoch=a.last('race').epoch;if(a.last('race').snapshot.phase!=='waiting')throw new Error('R gate missing');for(const p of players)p.send({type:'stageReady',epoch,ready:true});await until(()=>a.last('snapshot')?.phase==='countdown');
 console.log(JSON.stringify({packagedRuntime:true,architecture:process.arch,node:process.versions.node,stages:STAGES.length,nativeCar:true,nativeAudioBytes:true,twoPlayerSameRoom:true,bothRReady:true,phase:'countdown'}));
}finally{for(const p of players)p.ws.terminate();await game.close();}
`;
const output=execFileSync(path.join(report.appPath,'Contents/MacOS/Right Right Right'),['--input-type=module','-e',code],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8',timeout:30000});
console.log(output);await mkdir(path.join(desktop,'.qa'),{recursive:true});await writeFile(path.join(desktop,'.qa/runtime-verification.json'),output.trim()+'\n');
