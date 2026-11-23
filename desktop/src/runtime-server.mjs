import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {WebSocket,WebSocketServer} from 'ws';
import {normalizeServerAddress} from './config.mjs';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.ogg':'audio/ogg','.ttf':'font/ttf','.woff2':'font/woff2','.svg':'image/svg+xml'};
/** The application never rewrites the game payload. Only /ws selects its authority. */
export async function startDesktopServer({createGameServer,clientRoot,remoteUrl=null,port=0,host='0.0.0.0',assetPort}={}){
  const remote=normalizeServerAddress(remoteUrl);
  if(!remote){
    const game=createGameServer({port,host,staticRoot:clientRoot});const address=await game.listen();
    if(assetPort!==undefined){
      let gateway;try{gateway=await startDesktopServer({clientRoot,remoteUrl:`http://127.0.0.1:${address.port}`,port:assetPort});}
      catch(error){if(error.code!=='EADDRINUSE'){await game.close();throw error;}gateway=await startDesktopServer({clientRoot,remoteUrl:`http://127.0.0.1:${address.port}`,port:0});}
      return {mode:'host',port:address.port,assetPort:gateway.port,origin:gateway.origin,remote:null,close:async()=>{await gateway.close();await game.close();}};
    }
    return {mode:'host',port:address.port,assetPort:address.port,origin:`http://127.0.0.1:${address.port}`,remote:null,close:()=>game.close()};
  }
  if(assetPort!==undefined){try{return await startDesktopServer({clientRoot,remoteUrl:remote,port:assetPort});}catch(error){if(error.code!=='EADDRINUSE')throw error;return startDesktopServer({clientRoot,remoteUrl:remote,port:0});}}
  const pairs=new Set(),root=path.resolve(clientRoot);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    if(req.url?.split('?')[0]==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,transport:'websocket',mode:'proxy',connections:pairs.size}));return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end('The desktop game uses WebSockets.');return;}
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);
      if(file!==root&&!file.startsWith(root+path.sep))throw new Error('path');
      let target=file;if((await stat(target)).isDirectory())target=path.join(target,'index.html');
      const body=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(404);res.end('Not found.');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  server.on('upgrade',(request,socket,head)=>{
    if(new URL(request.url,'http://localhost').pathname!=='/ws'){socket.destroy();return;}
    const upstream=new WebSocket(remote,{handshakeTimeout:3000,perMessageDeflate:false,maxPayload:1024*1024});
    const pair={local:null,upstream,socket};pairs.add(pair);let stopped=false,early=[],earlyBytes=0;
    const stop=()=>{if(stopped)return;stopped=true;pairs.delete(pair);if(!pair.local)socket.destroy();for(const ws of [pair.local,upstream]){if(ws?.readyState===WebSocket.OPEN)ws.close();else if(ws?.readyState===WebSocket.CONNECTING)ws.terminate();}};
    socket.on('error',stop);socket.on('close',stop);
    // Preserve the browser's connection semantics: no successful local handshake
    // is reported until the selected authority has actually accepted WebSocket.
    upstream.on('open',()=>{
      if(stopped||socket.destroyed){stop();return;}
      wss.handleUpgrade(request,socket,head,local=>{
        pair.local=local;
        local.on('message',(data,binary)=>{if(binary||data.length>8192){local.close(1008,'Invalid game message');return;}if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:false});else local.close(1013,'Host unavailable');});
        local.on('close',stop);local.on('error',stop);
        for(const {data,binary}of early)local.send(data,{binary});early=[];earlyBytes=0;
      });
    });
    upstream.on('message',(data,binary)=>{
      if(pair.local?.readyState===WebSocket.OPEN){if(pair.local.bufferedAmount>256*1024){pair.local.close(1013,'Connection is too slow');return;}pair.local.send(data,{binary});}
      else if(earlyBytes+data.length<=65536){early.push({data,binary});earlyBytes+=data.length;}
      else stop();
    });
    upstream.on('close',stop);upstream.on('error',()=>{if(!pair.local&&!socket.destroyed)socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');stop();});
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {mode:'remote',port:server.address().port,origin:`http://127.0.0.1:${server.address().port}`,remote,
    close:async()=>{for(const {local,upstream,socket}of pairs){local?.terminate();upstream.terminate();socket.destroy();}await new Promise(resolve=>server.close(resolve));wss.close();}};
}
