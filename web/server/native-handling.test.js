import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stepHandling} from '../shared/native-handling.js';
const traces=JSON.parse(readFileSync(new URL('./fixtures/native-handling-traces.json',import.meta.url)));
for(const scenario of new Set(traces.map(v=>v.scenario)))test(`native measured handling: ${scenario}`,()=>{
  const car={vx:0,vz:['accelerate','reverse'].includes(scenario)?0:20,yaw:0};let frame=0;
  for(const expected of traces.filter(v=>v.scenario===scenario)){
    while(frame*.02<expected.t-.001){
      const t=frame*.02,turn=['steer','spaceTap','spaceHold','spaceBrake','countersteer'].includes(scenario);
      const throttle=['accelerate','steer','spaceTap','spaceHold','countersteer'].includes(scenario)?1:['reverse','footBrake','spaceBrake'].includes(scenario)?-1:0;
      const handbrake=scenario==='spaceTap'?t<.16:scenario==='spaceHold'||scenario==='spaceBrake'?t<1:scenario==='countersteer'?t<.6:false;
      stepHandling(car,{throttle,steer:turn?(scenario==='countersteer'&&t>.6?-1:1):0,handbrake},.02);frame++;
    }
    const straight=['accelerate','reverse','coast','footBrake'].includes(scenario);
    const label=`${scenario} at ${expected.t}s`;
    assert.ok(Math.abs(car.speed-expected.forward)<(straight?.03:1.8),`${label}: forward ${car.speed} vs ${expected.forward}`);
    const lateral=car.vx*Math.cos(car.yaw)-car.vz*Math.sin(car.yaw);
    assert.ok(Math.abs(lateral-expected.lateral)<.65,`${label}: lateral ${lateral} vs ${expected.lateral}`);
    // The stop-to-reverse transition also includes native contact friction.
    const yawTolerance=scenario==='spaceBrake'&&expected.t<1.1?.22:.16;
    assert.ok(Math.abs(car.yawRate-expected.yawRate)<yawTolerance,`${label}: yaw ${car.yawRate} vs ${expected.yawRate}`);
    assert.ok(Math.abs(car.handbrakeAmount-expected.hb)<.001,`${label}: handbrake engagement`);
    // C# float and JS double may place the .6s release on adjacent fixed ticks.
    assert.ok(Math.abs(car.handbrakeCatch-Math.max(0,expected.catchTime))<.021,`${label}: release carry`);
  }
});
