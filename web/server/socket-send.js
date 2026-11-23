// Snapshots supersede each other. A temporary TCP backlog should drop obsolete
// snapshots, not evict a player or keep accumulating seconds of old poses.
export function sendSocketMessage(ws,message,diagnostic=()=>{}){
  if(ws?.readyState!==1)return;
  if(message.type==='snapshot'&&ws.bufferedAmount>256*1024){ws.skippedSnapshots=(ws.skippedSnapshots||0)+1;return;}
  if(ws.bufferedAmount>1024*1024){ws.disconnectCause='backpressure';diagnostic({event:'backpressure_close',bufferedBytes:ws.bufferedAmount});ws.close(1013,'Connection is too slow');return;}
  if(ws.skippedSnapshots){diagnostic({event:'snapshots_coalesced',count:ws.skippedSnapshots});ws.skippedSnapshots=0;}
  ws.send(JSON.stringify(message));
}
