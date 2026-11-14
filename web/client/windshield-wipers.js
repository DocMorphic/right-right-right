const axisLength=Math.hypot(.814,.58);
export const NATIVE_WINDSHIELD=Object.freeze({innerRadiusFraction:.18,displaySmoothTime:.15,sweepDegrees:95,strokeSeconds:.45,axis:Object.freeze([0,.814/axisLength,.58/axisLength])});
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>value*value*(3-2*value);

/** Original park-to-top-to-park stroke state, independent of wall-clock time.
 * Apply AngleAxis(result.angle, axis) * restLocalRotation (premultiply). */
export class NativeWipers{
 constructor(){this.phase=0;this.running=false;this.captured=0;}
 update(held,display,dt){
  display=clamp(Number.isFinite(display)?display:0);dt=Number.isFinite(dt)?Math.max(0,dt):0;
  if(!this.running&&held){this.running=true;this.phase=0;this.captured=display;}
  if(this.running&&!held&&this.phase<1e-10){this.running=false;this.phase=0;}
  if(this.running){
   const previous=this.phase,next=previous+dt/NATIVE_WINDSHIELD.strokeSeconds;
   // Integer phase boundaries are the stroke changes. A complete cycle is two
   // strokes; retaining fractional time keeps 20fps and 60fps motion identical.
   if(Math.floor(next)>Math.floor(previous))this.captured=display;
   if(!held&&next>=2){this.phase=0;this.running=false;this.captured=display;}
   else this.phase=next%2;
  }else this.captured=display;
  const direction=this.running&&this.phase>=1?-1:1,t=this.running?(direction===1?this.phase:2-this.phase):0;
  return{angle:-NATIVE_WINDSHIELD.sweepDegrees*Math.PI/180*smooth(t),t,fromT:this.running&&direction===-1?1:0,ahead:Math.max(display,this.captured),running:this.running,direction};
 }
}
