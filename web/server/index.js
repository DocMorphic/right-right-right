import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {GameService} from './service.js';
import {MAX_MESSAGE_BYTES,PHYSICS_HZ,SNAPSHOT_HZ} from '../shared/protocol.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.ogg':'audio/ogg','.wav':'audio/wav','.svg':'image/svg+xml','.woff2':'font/woff2'};
export function createGameServer({port=Number(process.env.PORT)||8787,host=process.env.HOST||'0.0.0.0',staticRoot=existsSync(path.join(root,'dist/client/index.html'))?path.join(root,'dist/client'):path.join(root,'dist'),allowedOrigin=process.env.ALLOWED_ORIGIN}={}){
  const connections=new Map();
  const service=new GameService({send(id,message){const ws=connections.get(id);if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>256*1024){ws.close(1013,'Connection is too slow');return;}ws.send(JSON.stringify(message));}}});
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.url?.split('?')[0]==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,protocol:1,transport:'websocket',rooms:service.rooms.size,players:connections.size}));return;}
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
    const id=crypto.randomUUID();connections.set(id,ws);service.connect(id);ws.alive=true;let count=0,windowAt=Date.now();
    ws.on('pong',()=>ws.alive=true);
    ws.on('message',(data,binary)=>{
      if(Date.now()-windowAt>1000){windowAt=Date.now();count=0;}
      if(++count>100){ws.close(1008,'Message rate exceeded');return;}
      if(binary){ws.close(1003,'Use JSON text');return;}
      try{service.receive(id,JSON.parse(data.toString()));}catch{ws.send(JSON.stringify({type:'error',code:'json',message:'Invalid JSON.'}));}
    });
    ws.on('close',()=>{connections.delete(id);service.disconnect(id);});ws.on('error',()=>{});
  });
  const tick=setInterval(()=>service.tick(),1000/PHYSICS_HZ),snapshots=setInterval(()=>service.snapshots(),1000/SNAPSHOT_HZ);
  const heartbeat=setInterval(()=>{for(const ws of connections.values()){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},10000);
  server.on('close',()=>{clearInterval(tick);clearInterval(snapshots);clearInterval(heartbeat);for(const ws of connections.values())ws.terminate();wss.close();});
  return {server,service,listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{for(const ws of connections.values())ws.terminate();server.close(resolve);})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const game=createGameServer();const address=await game.listen();console.log(`RIGHT RIGHT RIGHT browser multiplayer: http://localhost:${address.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await game.close();process.exit(0);});
}
