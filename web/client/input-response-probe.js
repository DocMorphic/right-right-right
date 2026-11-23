/** Development-only render-submission probe; never enabled in production.
 * This measures event -> updated game render, not physical display latency. */
export class InputResponseProbe{
 constructor(){this.pending=[];this.results=[];this.output=document.createElement('output');this.output.id='input-response-probe';this.output.style.cssText='position:fixed;top:8px;left:8px;z-index:99;background:#111d;color:#fff;padding:8px;font:14px monospace;pointer-events:none';document.body.append(this.output);this.output.textContent='Input probe ready: A/D steer, S brake';}
 press(code,car,now=performance.now()){
  if(!car||car.dead||car.finish>=0)return;const direction=code==='KeyD'||code==='ArrowRight'?1:code==='KeyA'||code==='ArrowLeft'?-1:0;
  const kind=direction?'steer':code==='KeyS'||code==='ArrowDown'?'brake':null;if(!kind)return;
  this.pending.push({kind,direction,at:now,steer:car.steer||0,speed:car.speed||0});this.pending=this.pending.slice(-8);
 }
 rendered(car,now=performance.now()){
  if(!car)return;this.pending=this.pending.filter(event=>{
   const changed=event.kind==='steer'?(car.steer-event.steer)*event.direction>.01:event.speed-car.speed>.05;
   if(changed){this.results.push(`${event.kind} render: ${(now-event.at).toFixed(1)} ms`);this.results=this.results.slice(-8);return false;}return now-event.at<2000;
  });this.output.textContent=this.results.join(' | ')||this.output.textContent;
 }
}
