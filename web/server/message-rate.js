// TCP can deliver several seconds of legitimate inputs together after a brief
// network/server stall. Bound the burst independently of the sustained rate.
export class MessageRate {
  constructor({now=()=>performance.now(),perSecond=100,burst=512}={}){this.now=now;this.perSecond=perSecond;this.burst=burst;this.tokens=burst;this.at=now();}
  take(){const now=this.now();this.tokens=Math.min(this.burst,this.tokens+Math.max(0,now-this.at)*this.perSecond/1000);this.at=now;if(this.tokens<1)return false;this.tokens--;return true;}
}
