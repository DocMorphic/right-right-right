import test from'node:test';import assert from'node:assert/strict';
import './spectator-terrain.js';
import{generateCourse}from'../shared/course.js';import{makeWorld,stepWorld}from'../shared/physics.js';import{routeInput}from'./route-driver.js';
for(const profile of[1001,1002,1003])test(`authored stage ${profile-1000}: driving through the opening bends and slopes never counts as a tree hit`,()=>{
 const course=generateCourse(1,'coop',0,profile),world=makeWorld(course,'coop',1);world.phase='running';
 for(let i=0;i<2500;i++){stepWorld(world,[routeInput(course,world,0,{maxSpeed:18,responseSeconds:.1})],.02,course);assert.equal(world.cars[0].dead,false,`fatal terrain impact at tick ${i}`);}
 assert.ok(world.cars[0].progress>120,'test must actually pass the opening bends');assert.equal(world.stats.treeDeaths,0);
});
