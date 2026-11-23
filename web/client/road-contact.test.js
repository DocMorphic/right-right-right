import test from'node:test';import assert from'node:assert/strict';
import{RoadContact}from'./road-contact.js';import{generateCourse}from'../shared/course.js';
const surface=(height)=>({roadMesh:{positions:[-10,height(-10,-10),-10,10,height(10,-10),-10,10,height(10,10),10,-10,height(-10,10),10],indices:[0,1,2,0,2,3]}});
test('tyre contact follows the road triangle grade and bank rather than a stale spline height',()=>{
 const contact=new RoadContact(surface((x,z)=>20+x*.1+z*.2)),p=contact.pose({x:0,z:0,y:25.68,yaw:0});
 assert.ok(Math.abs(p.y-(20+.0006+.012412283))<1e-5);assert.ok(Math.abs(p.pitch+Math.atan(.2))<1e-8);assert.ok(Math.abs(p.roll-Math.atan(.1))<1e-8);
 assert.equal(contact.height(50,50,25),25,'off-road remains on its fallback ground instead of snapping sideways to the road');
});
test('actual first three authored roads have support at their spawn tyre positions',()=>{
 for(const profile of[1001,1002,1003]){const course=generateCourse(1,'coop',0,profile),contact=new RoadContact(course),[x,y,z]=course.startPose.position;
  const sampled=contact.height(x,z,NaN);assert.ok(Number.isFinite(sampled),`stage ${profile} has a real road triangle at spawn`);
  const p=contact.pose({x,z,y:y+.68,yaw:0});assert.ok(Number.isFinite(p.y)&&Math.abs(p.y-sampled)<.25);
 }
});
