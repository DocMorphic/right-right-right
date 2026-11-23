/** Bound the actual pixel workload, including large/Retina laptop screens. */
export function renderScale(quality,width,height,dpr=1,scale=1.25,reduced=false){
  const maxPixels=quality==='low'?960*540:quality==='auto'?(reduced?1280*720:1600*900):Infinity;
  const ratio=quality==='low'?.85:quality==='high'?1.5:scale;
  return Math.min(dpr,ratio,Math.sqrt(maxPixels/Math.max(1,width*height)));
}

/** Auto reduces expensive effects after sustained slow frames. Keep that
 * decision until the user changes quality, avoiding repeated shader rebuilds. */
export class RenderBudget {
  constructor({reduced=false}={}){this.seconds=0;this.frames=0;this.scale=1.25;this.warmup=1.5;this.reduced=reduced;}
  sample(dt){
    if(!Number.isFinite(dt)||dt<=0||dt>.15)return null;
    if(this.warmup>0){this.warmup-=dt;return null;}
    this.seconds+=dt;this.frames++;
    if(this.seconds<1.5)return null;
    const fps=this.frames/this.seconds;this.seconds=0;this.frames=0;
    const wasReduced=this.reduced;if(fps<42)this.reduced=true;
    const next=fps<42?Math.max(.5,this.scale-.15):fps>57?Math.min(1.25,this.scale+.05):this.scale;
    if(Math.abs(next-this.scale)<.001&&wasReduced===this.reduced)return null;this.scale=next;return next;
  }
}
