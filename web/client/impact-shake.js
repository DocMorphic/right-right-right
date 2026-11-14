/** A bounded local animation; repeated terminal snapshots cannot restart it. */
export class ImpactShake {
  constructor(){this.age=1;this.amplitude=0;this.previousJolt=0;this.dead=false;}
  update(car,dt){
    const jolt=car.jolt||0;
    if((car.dead&&!this.dead)||jolt>this.previousJolt+.05){this.age=0;this.amplitude=Math.min(1,jolt);}
    this.previousJolt=jolt;this.dead=Boolean(car.dead);this.age+=Math.max(0,dt);
    const envelope=this.amplitude*Math.max(0,1-this.age/.45)**2*.025;
    if(envelope===0)return {x:0,y:0,z:0};
    return {x:Math.sin(this.age*47)*envelope,y:Math.sin(this.age*39)*envelope,z:-Math.abs(Math.sin(this.age*29))*envelope};
  }
}
