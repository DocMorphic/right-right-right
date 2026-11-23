// A delayed timer or a single late control-frame pong is not a dead player.
// Inbound game traffic also proves liveness. A stalled server grants a fresh
// challenge before timing anyone out, so its own stall cannot evict a room.
export class ConnectionHeartbeat {
  constructor({now=()=>performance.now(),intervalMs=10000,timeoutMs=30000,onTimeout=()=>{}}={}){
    this.now=now;this.intervalMs=intervalMs;this.timeoutMs=timeoutMs;this.onTimeout=onTimeout;this.peers=new Map();this.lastSweep=now();
  }
  add(ws){this.peers.set(ws,{lastInbound:this.now(),pending:false});}
  remove(ws){this.peers.delete(ws);}
  activity(ws){const peer=this.peers.get(ws);if(peer){peer.lastInbound=this.now();peer.pending=false;}}
  sweep(){
    const now=this.now(),stalled=now-this.lastSweep>this.intervalMs*2;this.lastSweep=now;
    for(const[ws,peer]of this.peers){
      if(ws.readyState!==1)continue;
      if(stalled){peer.lastInbound=now;peer.pending=false;}
      const silentMs=now-peer.lastInbound;
      if(silentMs>=this.timeoutMs){this.peers.delete(ws);this.onTimeout(ws,{silentMs});ws.terminate();continue;}
      if(!peer.pending){peer.pending=true;ws.ping();}
    }
  }
}
