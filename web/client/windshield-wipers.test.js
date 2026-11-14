import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeWipers,NATIVE_WINDSHIELD} from './windshield-wipers.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} differs from ${b}`);
test('native wiper constants and eased negative 95-degree sweep use the glass axis',()=>{
 const c=NATIVE_WINDSHIELD;assert.equal(c.innerRadiusFraction,.18);assert.equal(c.displaySmoothTime,.15);assert.equal(c.strokeSeconds,.45);close(Math.hypot(...c.axis),1);
 const wiper=new NativeWipers();let s=wiper.update(true,1,0);assert.equal(s.t,0);assert.equal(s.running,true);
 s=wiper.update(true,1,.1125);close(s.t,.25);close(s.angle,-95*Math.PI/180*.15625);assert.equal(s.fromT,0);
 s=wiper.update(true,1,.1125);close(s.t,.5);close(s.angle,-47.5*Math.PI/180);
 s=wiper.update(true,1,.225);close(s.t,1);close(s.angle,-95*Math.PI/180);assert.equal(s.direction,-1);assert.equal(s.fromT,1);
});
test('release finishes the outward stroke and full return, then stays parked without snapping',()=>{
 const wiper=new NativeWipers();let s=wiper.update(true,.8,.2);const angle=s.angle;
 s=wiper.update(false,.6,.1);assert.equal(s.running,true);assert.ok(s.angle<angle,'releasing during an outward pass continues toward the top');
 s=wiper.update(false,.4,.15);close(s.t,1);s=wiper.update(false,.2,.225);close(s.t,.5);assert.equal(s.fromT,1);
 s=wiper.update(false,.1,.225);close(s.t,0);close(s.angle,0);assert.equal(s.running,false);
 for(let i=0;i<60;i++){s=wiper.update(false,.1,1/60);assert.equal(s.running,false);close(s.angle,0);}
});
test('held wiping repeats complete cycles and preserves leftover frame time at stroke changes',()=>{
 const wiper=new NativeWipers();let s=wiper.update(true,1,.5);close(s.t,1-.05/.45);assert.equal(s.direction,-1);
 s=wiper.update(true,.5,.4);close(s.t,0);assert.equal(s.running,true);assert.equal(s.fromT,0);
 s=wiper.update(true,.5,.9);close(s.t,0);assert.equal(s.running,true);s=wiper.update(false,.5,0);assert.equal(s.running,false,'release at the parked endpoint requires no extra cycle');
});
test('ahead mud retains the stroke-start capture and refreshes at the turnaround',()=>{
 const wiper=new NativeWipers();let s=wiper.update(true,.9,.1);close(s.ahead,.9);
 s=wiper.update(true,.3,.1);close(s.ahead,.9);s=wiper.update(true,1,.05);close(s.ahead,1,'a new splash remains visible ahead of the blade');
 s=wiper.update(true,.2,.2);close(s.t,1);close(s.ahead,.2);s=wiper.update(false,.1,.1);close(s.ahead,.2);
});
test('stroke timing is frame-rate independent and ignores invalid elapsed time',()=>{
 const run=fps=>{const w=new NativeWipers();let s;for(let i=0;i<fps;i++)s=w.update(i<fps/2,.6,1/fps);return s;};
 const a=run(20),b=run(60);close(a.t,b.t);close(a.angle,b.angle);assert.equal(a.running,b.running);
 const wiper=new NativeWipers(),initial=wiper.update(true,.5,.2);close(wiper.update(true,.5,-1).t,initial.t);close(wiper.update(true,.5,Infinity).t,initial.t);
});
