import './spectator-terrain.js';
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {GameService} from './service.js';
import {ConnectionHeartbeat} from './connection-heartbeat.js';
import {MessageRate} from './message-rate.js';
import {sendSocketMessage} from './socket-send.js';
import {warmTabletPhysics} from './warm-tablet-physics.js';
import {MAX_MESSAGE_BYTES,PHYSICS_HZ,SNAPSHOT_HZ} from '../shared/protocol.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.wav':'audio/wav','.svg':'image/svg+xml','.woff2':'font/woff2'};
export function createGameServer({port=Number(process.env.PORT)||8787,host=process.env.HOST||'0.0.0.0',staticRoot=existsSync(path.join(root,'dist/client/index.html'))?path.join(root,'dist/client'):path.join(root,'dist'),allowedOrigin=process.env.ALLOWED_ORIGIN,diagnostic=event=>console.warn(JSON.stringify(event)),heartbeatOptions={}}={}){
  const connections=new Map();
  const heartbeats=new ConnectionHeartbeat({...heartbeatOptions,onTimeout(ws,detail){ws.disconnectCause='heartbeat_timeout';diagnostic({event:'heartbeat_timeout',...detail,bufferedBytes:ws.bufferedAmount});}});
  const service=new GameService({scheduledPhysics:true,send(id,message){sendSocketMessage(connections.get(id),message,diagnostic);}});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.url?.split('?')[0]==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':allowedOrigin||'*'});res.end(JSON.stringify({ok:true,protocol:1,transport:'websocket',reliability:2,physicsHz:PHYSICS_HZ,connectionTimeoutMs:heartbeats.timeoutMs,rooms:service.rooms.size,players:connections.size}));return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    try{
      const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname),file=path.resolve(staticRoot,'.'+relative);
      if(!file.startsWith(path.resolve(staticRoot)+path.sep)&&file!==path.resolve(staticRoot))throw new Error('path');
      let target=file;try{if((await stat(target)).isDirectory())target=path.join(target,'index.html');}catch{target=path.join(staticRoot,'index.html');}
      const body=await readFile(target);res.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':target.endsWith('index.html')?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Build the browser client with npm run build, then npm start.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE_BYTES,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname!=='/ws'||allowedOrigin&&request.headers.origin!==allowedOrigin){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  });
  wss.on('connection',ws=>{
    // Install the connection before welcome is sent.
    const id=crypto.randomUUID(),rate=new MessageRate();connections.set(id,ws);service.connect(id);heartbeats.add(ws);
    ws.on('pong',()=>heartbeats.activity(ws));
    ws.on('message',(data,binary)=>{
      if(!rate.take()){ws.disconnectCause='message_rate';diagnostic({event:'message_rate_close'});ws.close(1008,'Message rate exceeded');return;}
      if(binary){ws.close(1003,'Use JSON text');return;}
      heartbeats.activity(ws);
      try{service.receive(id,JSON.parse(data.toString()));}catch{ws.send(JSON.stringify({type:'error',code:'json',message:'Invalid JSON.'}));}
    });
    ws.on('close',code=>{heartbeats.remove(ws);if(code===1006)diagnostic({event:'abnormal_close',cause:ws.disconnectCause||'transport',bufferedBytes:ws.bufferedAmount});connections.delete(id);service.disconnect(id);});ws.on('error',error=>diagnostic({event:'socket_error',code:error.code||'unknown'}));
  });
  const tick=setInterval(()=>service.tick(),1000/PHYSICS_HZ),snapshots=setInterval(()=>service.snapshots(),1000/SNAPSHOT_HZ);
  const heartbeat=setInterval(()=>heartbeats.sweep(),heartbeats.intervalMs);
  server.on('close',()=>{clearInterval(tick);clearInterval(snapshots);clearInterval(heartbeat);for(const ws of connections.values())ws.terminate();wss.close();});
  return {server,service,listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{for(const ws of connections.values())ws.terminate();server.close(resolve);})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const warmAt=performance.now();await warmTabletPhysics();console.log(JSON.stringify({event:'tablet_physics_warmed',durationMs:Math.round(performance.now()-warmAt)}));
  const game=createGameServer();const address=await game.listen();console.log(`RIGHT RIGHT RIGHT browser multiplayer: http://localhost:${address.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await game.close();process.exit(0);});
}
