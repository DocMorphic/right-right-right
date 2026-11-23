const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const median=values=>{const sorted=values.toSorted((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};

/** Fit server wall time against the client's monotonic clock. Low-RTT samples
 * avoid moving the clock estimate when a queued packet arrives in a burst. */
export class NetworkTiming{
 constructor({now=()=>performance.now()}={}){this.now=now;this.reset();}
 reset(){this.pending=new Map();this.samples=[];this.roundTripMs=undefined;this.offsetMs=null;this.offsetAt=-Infinity;}
 ping(){
  const at=this.now();for(const [sent]of this.pending)if(at-sent>5000)this.pending.delete(sent);
  if(this.pending.size>=8)this.pending.delete(this.pending.keys().next().value);
  this.pending.set(at,true);return{type:'ping',clientTime:at};
 }
 acceptPong(message){
  const at=this.now(),sent=message?.clientTime;if(!this.pending.delete(sent)||!Number.isFinite(message.serverTime))return false;
  const rtt=at-sent;if(!Number.isFinite(rtt)||rtt<0||rtt>5000)return false;
  this.roundTripMs=this.roundTripMs===undefined?rtt:this.roundTripMs*.8+rtt*.2;
  const sample={at,rtt,offset:message.serverTime*1000-(sent+at)/2};
  this.samples.push(sample);this.samples=this.samples.filter(item=>at-item.at<=30000).slice(-20);
  const minimum=Math.min(...this.samples.map(item=>item.rtt));
  // Prefer the lowest-delay path through jitter. A long-distance connection
  // can legitimately stay above 250ms: require three consistent samples there
  // instead of disabling its clock fit forever. A single delayed pong still
  // cannot establish a high-latency fit or displace an existing better sample.
  const selected=this.samples.filter(item=>item.rtt<=minimum+Math.max(5,minimum*.25)).toSorted((a,b)=>a.rtt-b.rtt).slice(0,5);
  if(minimum<=250||selected.length>=3){
   this.offsetMs=median(selected.map(item=>item.offset));this.offsetAt=Math.max(...selected.map(item=>item.at));
  }
  return true;
 }
 snapshotAgeSeconds(serverTime,{useClock=true,roundTripMs=this.roundTripMs}={}){
  const at=this.now();
  if(useClock&&Number.isFinite(serverTime)&&this.offsetMs!==null&&at-this.offsetAt<=60000)return clamp((at+this.offsetMs-serverTime*1000)/1000,0,2);
  return clamp(Number.isFinite(roundTripMs)?roundTripMs/2000:0,0,2);
 }
}
