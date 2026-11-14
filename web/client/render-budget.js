/** Auto quality scales resolution after sustained slow frames, without removing trees. */
export class RenderBudget {
  constructor(){this.seconds=0;this.frames=0;this.scale=1.25;this.warmup=3;}
  sample(dt){
    if(dt<=0||dt>.15)return null;
    if(this.warmup>0){this.warmup-=dt;return null;}
    this.seconds+=dt;this.frames++;
    if(this.seconds<2)return null;
    const fps=this.frames/this.seconds;this.seconds=0;this.frames=0;
    const next=fps<42?Math.max(.75,this.scale-.15):fps>57?Math.min(1.25,this.scale+.05):this.scale;
    if(Math.abs(next-this.scale)<.001)return null;this.scale=next;return next;
  }
}
