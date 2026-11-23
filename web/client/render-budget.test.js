import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderBudget,renderScale} from './render-budget.js';

test('Low bounds pixel work even on Retina and 4K desktop displays',()=>{
 for(const [w,h,dpr] of [[1366,768,1],[1920,1080,2],[3840,2160,2],[1280,800,1]]){
  const ratio=renderScale('low',w,h,dpr);
  assert.ok(w*h*ratio*ratio<=960*540+1);
  assert.ok(ratio<=dpr&&ratio<=.85);
 }
 assert.equal(renderScale('high',1920,1080,2),1.5);
});
test('Auto reduces effects on sustained slow frames and recovers resolution without shader churn',()=>{
 const budget=new RenderBudget();for(let i=0;i<240;i++)budget.sample(1/25);
 assert.equal(budget.reduced,true);assert.ok(budget.scale<1);
 for(let i=0;i<600;i++)budget.sample(1/60);
 assert.equal(budget.reduced,true,'avoid cycling shadow shaders on/off in the same session');
 assert.ok(budget.scale<=1.25);
 const next=new RenderBudget();for(let i=0;i<300;i++)next.sample(1/60);
 assert.equal(next.reduced,false,'fast devices keep original effects');
 assert.ok(1920*1080*renderScale('auto',1920,1080,2,budget.scale,true)**2<=1280*720+1);
});
test('Auto ignores tab suspension and invalid frame samples',()=>{
 const budget=new RenderBudget();for(const dt of [0,-1,NaN,Infinity,4])budget.sample(dt);
 assert.equal(budget.reduced,false);assert.equal(budget.frames,0);
});
