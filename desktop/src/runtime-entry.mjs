import {createGameServer} from './game/web/server/index.js';
import {startDesktopServer} from './runtime-server.mjs';
const config=JSON.parse(process.argv[2]);
let game;
try{game=await startDesktopServer({...config,createGameServer});process.parentPort.postMessage({type:'ready',mode:game.mode,port:game.port,origin:game.origin,remote:game.remote});}
catch(error){process.parentPort.postMessage({type:'error',message:error.message});process.exit(1);}
process.parentPort.on('message',async event=>{if(event.data?.type==='stop'){await game.close();process.exit(0);}});
