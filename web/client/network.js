/** Same room protocol over a local WebSocket or hosted HTTP session transport. */
export class Network extends EventTarget {
  constructor({storage=typeof sessionStorage==='undefined'?null:sessionStorage}={}) { super();this.storage=storage;this.socket=null;this.session=null;this.connected=false;this.connecting=null;this.closed=false;this.transport='';this.pending=[];this.lastPoll=0;this.epoch=0;this.roomCode=null;this.roomRevision=-1;this.httpTail=Promise.resolve(); }
  emit(type,detail) { this.dispatchEvent(new CustomEvent(type,{detail})); }
  async connect() {
    if(this.connected) return;
    if(this.connecting) return this.connecting;
    this.closed=false;
    this.connecting=this.open().finally(()=>{this.connecting=null;});return this.connecting;
  }
  async open() {
    const forced=new URL(location.href).searchParams.get('transport');
    if(forced!=='http') {
      try { await this.openSocket();return; } catch { this.socket?.close();this.socket=null; }
    }
    let saved=this.savedSession();
    let response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(saved||{})});
    if(response.status===401&&saved){this.saveSession(null);response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}
    if(!response.ok) throw new Error('The rally server is unavailable. Please try again.');
    const data=await response.json();this.session={id:data.id,token:data.token};this.saveSession(this.session);this.transport='http';this.connected=true;
    this.deliver(data.messages||[data.welcome||{type:'welcome',id:data.id,version:1}]);this.emit('connected',{transport:this.transport});this.poll();
  }
  savedSession() {
    try{const saved=JSON.parse(this.storage?.getItem('rrr-browser-session-v1')||'null');return typeof saved?.id==='string'&&typeof saved?.token==='string'?saved:null;}catch{return null;}
  }
  saveSession(session) {
    try{if(session)this.storage?.setItem('rrr-browser-session-v1',JSON.stringify(session));else this.storage?.removeItem('rrr-browser-session-v1');}catch{}
  }
  openSocket() {
    return new Promise((resolve,reject)=>{
      const base=import.meta.env?.VITE_GAME_SERVER||location.origin;const url=new URL('/ws',base);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      const ws=new WebSocket(url);this.socket=ws;const timer=setTimeout(()=>{ws.close();reject(new Error('Connection timed out'));},3500);let opened=false;
      ws.addEventListener('open',()=>{clearTimeout(timer);opened=true;this.transport='ws';this.connected=true;this.emit('connected',{transport:'ws'});resolve();});
      ws.addEventListener('message',event=>{try{this.deliver([JSON.parse(event.data)]);}catch{this.emit('error',{message:'Invalid server message.'});}});
      ws.addEventListener('error',()=>{if(!opened){clearTimeout(timer);reject(new Error('WebSocket unavailable'));}});
      ws.addEventListener('close',()=>{clearTimeout(timer);if(!opened)reject(new Error('WebSocket unavailable'));else{this.connected=false;if(!this.closed)this.emit('disconnected',{});}});
    });
  }
  deliver(messages) { for(const message of messages) { if(!message||typeof message.type!=='string')continue;if(message.type==='joined'&&message.code!==this.roomCode){this.roomCode=message.code;this.roomRevision=-1;}if(message.type==='left'){this.roomCode=null;this.roomRevision=-1;}if(['lobby','race','snapshot'].includes(message.type)&&Number.isSafeInteger(message.revision)){if(message.revision<this.roomRevision)continue;this.roomRevision=message.revision;}if(message.type==='race')this.epoch=message.epoch;if(message.type==='left')this.epoch=0;this.emit('message',message);this.emit(message.type,message); } }
  send(message) {
    if(!this.connected) return false;
    if(this.transport==='ws') {if(this.socket?.readyState===WebSocket.OPEN){this.socket.send(JSON.stringify(message));return true;}return false;}
    // Collapse stale continuous inputs; preserve every discrete action in its latest packet.
    if(message.type==='input') { const existing=this.pending.findIndex(m=>m.type==='input');if(existing>=0){const previous=this.pending[existing];message.actions=[...new Map([...(previous.actions||[]),...(message.actions||[])].map(action=>[action.id,action])).values()].slice(0,4);this.pending.splice(existing,1);} }
    if(message.actions?.length>4)message.actions=message.actions.slice(-4);this.pending.push(message);this.flush();return true;
  }
  request(path,extra={}) {
    // Polls and commands share a queue: an older poll cannot overtake a course change.
    const run=async()=>{
      // Choose continuous input when the previous HTTP request has actually
      // finished, rather than freezing a stale turn behind a slow poll.
      const payload=typeof extra==='function'?extra():extra;
      for(let attempt=0;;attempt++) {
        const sentAt=performance.now();
        const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...this.session,epoch:this.epoch,...payload})});
        const data=await response.json();const elapsed=performance.now()-sentAt;this.roundTripMs=this.roundTripMs===undefined?elapsed:this.roundTripMs*.8+elapsed*.2;
        if(response.status===409&&data.messages?.some(message=>message.code==='busy')&&attempt<4){await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)));continue;}
        if(response.status===401)throw new Error('Your session expired. Rejoin the room.');
        if(!response.ok&&response.status>=500)throw new Error(`Server connection failed (${response.status}).`);
        return data;
      }
    };
    const request=this.httpTail.then(run,run);
    this.httpTail=request.catch(()=>{});
    return request;
  }
  async flush() {
    if(this.flushing||!this.pending.length||!this.connected)return;this.flushing=true;
    try {while(this.pending.length&&this.connected){const data=await this.request('/api/message',()=>({message:this.pending.shift()}));this.deliver(data.messages||[]);this.lastSend=performance.now();}}
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
  failed(error) {this.connected=false;this.emit('disconnected',{message:error.message});}
  close() {this.closed=true;this.connected=false;this.socket?.close();this.pending=[];}
}
