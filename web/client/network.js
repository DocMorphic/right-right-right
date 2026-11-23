/** Same room protocol over a local WebSocket or hosted HTTP session transport. */
import {NetworkTiming} from './network-timing.js';
export class Network extends EventTarget {
  constructor({storage=typeof sessionStorage==='undefined'?null:sessionStorage,timing=new NetworkTiming(),serverOrigin=import.meta.env?.VITE_GAME_SERVER,requestTimeoutMs=10000,wakeBeforeConnect=import.meta.env?.VITE_GAME_SERVER_WAKE==='true',wakeTimeoutMs=90000,wakeRetryMs=1000}={}) { super();this.requestTimeoutMs=requestTimeoutMs;this.wakeBeforeConnect=wakeBeforeConnect;this.wakeTimeoutMs=wakeTimeoutMs;this.wakeRetryMs=wakeRetryMs;this.storage=storage;this.timing=timing;this.serverOrigin=serverOrigin?new URL(serverOrigin).origin:null;this.socket=null;this.session=null;this.connected=false;this.connecting=null;this.closed=false;this.transport='';this.pending=[];this.lastPoll=0;this.epoch=0;this.roomCode=null;this.roomRevision=-1;this.httpTail=Promise.resolve(); }
  endpoint(path){return this.serverOrigin?new URL(path,this.serverOrigin).href:path;}
  fetchRequest(path,options={}){return fetch(this.endpoint(path),{...options,signal:AbortSignal.timeout(this.requestTimeoutMs)});}
  emit(type,detail) { this.dispatchEvent(new CustomEvent(type,{detail})); }
  async connect() {
    if(this.connected) return;
    if(this.connecting) return this.connecting;
    this.closed=false;
    this.connecting=this.open().finally(()=>{this.connecting=null;});return this.connecting;
  }
  async open() {
    if(this.wakeBeforeConnect)await this.wakeServer();
    const forced=new URL(location.href).searchParams.get('transport');
    if(forced!=='http') {
      try { await this.openSocket();return; } catch { this.socket?.close();this.socket=null; }
    }
    let saved=this.savedSession();
    let response=await this.fetchRequest('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(saved||{})});
    if(response.status===401&&saved){this.saveSession(null);response=await this.fetchRequest('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}
    if(!response.ok) throw new Error('The rally server is unavailable. Please try again.');
    const data=await response.json();this.session={id:data.id,token:data.token};this.saveSession(this.session);this.transport='http';this.connected=true;
    this.deliver(data.messages||[data.welcome||{type:'welcome',id:data.id,version:1}]);this.emit('connected',{transport:this.transport});this.poll();
  }
  async wakeServer(){
    this.emit('status',{message:'Waking the game server… first launch can take about a minute.'});
    const deadline=performance.now()+this.wakeTimeoutMs;
    while(!this.closed&&performance.now()<deadline){
      try{
        // The frontend proxies this to the configured authority. Cross-site
        // health requests can be blocked independently of WebSocket gameplay.
        const response=await fetch('/health',{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.ceil(Math.min(this.requestTimeoutMs,deadline-performance.now()))))});
        if(response.ok){const health=await response.json();if(health.ok&&health.protocol===1&&health.transport==='websocket'){
          if(this.closed)throw new Error('Connection was closed');
          this.emit('status',{message:'Connecting to your crew...'});return;
        }}
      }catch(error){if(this.closed)throw new Error('Connection was closed');}
      if(performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(this.wakeRetryMs,deadline-performance.now())));
    }
    throw new Error(this.closed?'Connection was closed':'The game server is taking too long to wake. Please try again.');
  }
  savedSession() {
    try{const saved=JSON.parse(this.storage?.getItem('rrr-browser-session-v1')||'null');return typeof saved?.id==='string'&&typeof saved?.token==='string'?saved:null;}catch{return null;}
  }
  saveSession(session) {
    try{if(session)this.storage?.setItem('rrr-browser-session-v1',JSON.stringify(session));else this.storage?.removeItem('rrr-browser-session-v1');}catch{}
  }
  openSocket() {
    this.stopSocketTiming();
    return new Promise((resolve,reject)=>{
      const url=new URL('/ws',this.serverOrigin||location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      const ws=new WebSocket(url);this.socket=ws;const timer=setTimeout(()=>{ws.close();reject(new Error('Connection timed out'));},3500);let opened=false;
      ws.addEventListener('open',()=>{clearTimeout(timer);if(this.socket!==ws||this.closed){ws.close();reject(new Error('Connection was closed'));return;}opened=true;this.transport='ws';this.connected=true;this.startSocketTiming(ws);this.emit('connected',{transport:'ws'});resolve();});
      ws.addEventListener('message',event=>{if(this.socket!==ws)return;try{this.deliver([JSON.parse(event.data)]);}catch{this.emit('error',{message:'Invalid server message.'});}});
      ws.addEventListener('error',()=>{if(this.socket===ws)this.stopSocketTiming();if(!opened){clearTimeout(timer);reject(new Error('WebSocket unavailable'));}});
      ws.addEventListener('close',()=>{clearTimeout(timer);if(this.socket===ws)this.stopSocketTiming();if(!opened)reject(new Error('WebSocket unavailable'));else if(this.socket===ws){this.connected=false;if(!this.closed)this.emit('disconnected',{});}});
    });
  }
  startSocketTiming(ws){
    this.stopSocketTiming();
    const ping=()=>{if(!this.connected||this.transport!=='ws'||this.socket!==ws||ws.readyState!==WebSocket.OPEN){this.stopSocketTiming();return false;}try{ws.send(JSON.stringify(this.timing.ping()));return true;}catch{this.stopSocketTiming();return false;}};
    if(ping())this.pingTimer=setInterval(ping,1000);
  }
  stopSocketTiming(){if(this.pingTimer!==undefined){clearInterval(this.pingTimer);this.pingTimer=undefined;}this.timing.reset();this.roundTripMs=undefined;}
  snapshotAgeSeconds(snapshot){return this.timing.snapshotAgeSeconds(snapshot?.time??snapshot?.snapshot?.time,{useClock:this.transport==='ws',roundTripMs:this.roundTripMs});}
  deliver(messages) { for(const message of messages) { if(!message||typeof message.type!=='string')continue;if(message.type==='pong'&&this.transport==='ws'&&this.timing.acceptPong(message))this.roundTripMs=this.timing.roundTripMs;if(message.type==='joined'&&message.code!==this.roomCode){this.roomCode=message.code;this.roomRevision=-1;}if(message.type==='left'){this.roomCode=null;this.roomRevision=-1;}if(['lobby','race','snapshot'].includes(message.type)&&Number.isSafeInteger(message.revision)){if(message.revision<this.roomRevision)continue;this.roomRevision=message.revision;}if(message.type==='race')this.epoch=message.epoch;if(message.type==='left')this.epoch=0;this.emit('message',message);this.emit(message.type,message); } }
  send(message) {
    if(!this.connected) return false;
    if(this.transport==='ws') {if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
    // Collapse stale continuous inputs; preserve every discrete action in its latest packet.
    if(message.type==='input') { const existing=this.pending.findIndex(m=>m.type==='input');if(existing>=0){const previous=this.pending[existing];message.actions=[...new Map([...(previous.actions||[]),...(message.actions||[])].map(action=>[action.id,action])).values()].slice(0,4);this.pending.splice(existing,1);} }
    if(message.actions?.length>4)message.actions=message.actions.slice(-4);this.pending.push(message);this.flush();return true;
  }
  request(path,extra={}, {continuousInput=false}={}) {
    // Lobby commands and polls stay ordered. During a run, a continuous input
    // must not wait for an already in-flight poll to return over a slow link.
    // flush() still permits only one command at a time, and revision filtering
    // prevents the older poll from rolling back the newer input snapshot.
    const run=async()=>{
      // Choose continuous input when the previous HTTP request has actually
      // finished, rather than freezing a stale turn behind a slow poll.
      const payload=typeof extra==='function'?extra():extra;
      for(let attempt=0;;attempt++) {
        const sentAt=performance.now();
        const response=await this.fetchRequest(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.session,epoch:this.epoch,...payload})});
        const data=await response.json();const elapsed=performance.now()-sentAt;this.roundTripMs=this.roundTripMs===undefined?elapsed:this.roundTripMs*.8+elapsed*.2;
        if(response.status===409&&data.messages?.some(message=>message.code==='busy')&&attempt<4){await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)));continue;}
        if(response.status===401)throw new Error('Your session expired. Rejoin the room.');
        if(!response.ok&&response.status>=500)throw new Error(`Server connection failed (${response.status}).`);
        return data;
      }
    };
    if(continuousInput)return run();
    const request=this.httpTail.then(run,run);
    this.httpTail=request.catch(()=>{});
    return request;
  }
  async flush() {
    if(this.flushing||!this.pending.length||!this.connected)return;this.flushing=true;
    try {while(this.pending.length&&this.connected){const data=await this.request('/api/message',()=>({message:this.pending.shift()}),{continuousInput:this.pending[0]?.type==='input'});this.deliver(data.messages||[]);this.lastSend=performance.now();}}
    catch(error){this.failed(error);}finally{this.flushing=false;}
  }
  async poll() {
    while(this.connected&&this.transport==='http'&&!this.closed) {
      const start=performance.now();if(this.flushing||this.pending.length||start-(this.lastSend||0)<120){await new Promise(resolve=>setTimeout(resolve,100));continue;}
      try {const data=await this.request('/api/poll');this.deliver(data.messages||[]);this.lastPoll=performance.now();}
      catch(error){this.failed(error);break;}
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,100-(performance.now()-start))));
    }
  }
  failed(error) {this.stopSocketTiming();this.connected=false;this.emit('disconnected',{message:error.message});}
  close() {this.closed=true;this.connected=false;this.stopSocketTiming();this.socket?.close();this.pending=[];}
}
