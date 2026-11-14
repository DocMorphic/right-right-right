import * as THREE from 'three';
import {NativeEngineMix} from './audio.js';

// DriverClusterGauges serialized values and LateUpdate/SetNeedle source.
export const NATIVE_CLUSTER=Object.freeze({startAngle:120,endAngle:-120,maxSpeedKmh:160,maxRpm:9000,needleFollow:14});
const RAD=Math.PI/180;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const normalized=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');

function named(node,name){
  const target=normalized(name);
  // GLTFLoader retains the source name in userData, but uniquifies node.name.
  return normalized(node.userData?.name||node.name)===target||normalized(node.name.replace(/_\d+$/,''))===target;
}
function find(parent,name,unityPathId){
  let found=null;
  if(unityPathId!=null)parent?.traverse(node=>{if(!found&&Number(node.userData?.unityPathId)===Number(unityPathId))found=node;});
  if(!found)parent?.traverse(node=>{if(!found&&named(node,name))found=node;});return found;
}
function atPath(root,path){
  const names=Array.isArray(path)?path:String(path||'').split('/').filter(Boolean);
  let node=root;
  for(const name of names){if(node&&named(node,name))continue;node=node?.children.find(child=>named(child,name));if(!node)return null;}
  return node;
}

// Unity Mathf.RoundToInt rounds exact half values to the nearest even integer.
export function roundClusterSpeed(value){
  const floor=Math.floor(value),fraction=value-floor;
  return fraction===.5?floor+(Math.abs(floor%2)===1?1:0):Math.round(value);
}

/** Native TextMesh outlines, in the GLB's reflected local X basis. */
export function makeClusterTextGeometry(font,text,spec){
  const value=String(text),size=spec.fontSize*spec.characterSize/10*72/100;
  const geometry=new THREE.ShapeGeometry(font.generateShapes(value,size));
  geometry.computeBoundingBox();const box=geometry.boundingBox;
  if(box&&!box.isEmpty()){
    const anchor=Number.isInteger(spec.anchor)?spec.anchor:4,column=anchor%3,row=Math.floor(anchor/3);
    const x=column===0?box.min.x:column===1?(box.min.x+box.max.x)/2:box.max.x;
    const y=row===0?box.max.y:row===1?(box.min.y+box.max.y)/2:box.min.y;
    geometry.translate(-x,-y,0);
    // All original exported meshes reflect X; newly generated glyphs must too.
    geometry.scale(-1,1,1);geometry.computeBoundingBox();
  }
  return geometry;
}

/** Restores original missing TextMesh labels and animates the existing dials.
 * Geometry/materials belonging to car.glb stay owned by its asset loader.
 * This contains no screen HUD, dial housing or substitute artwork. */
export class CockpitCluster{
  constructor(carModel,font,metadata={}){
    this.model=carModel;this.font=font;this.metadata=metadata;this.labels=[];this.materials=new Map();this.engine=new NativeEngineMix();this.displayKmh=0;this.displayRpm=0;this.time=0;this.ready=false;this.disposed=false;
    const settings=metadata.settings||metadata.serialized||metadata.cluster?.settings||{};
    this.settings={...NATIVE_CLUSTER};for(const key of Object.keys(this.settings))if(Number.isFinite(settings[key]))this.settings[key]=settings[key];
    this.root=find(carModel,metadata.clusterNode||metadata.cluster?.node||'ClusterGauges');
    if(!this.root)throw new Error('The original ClusterGauges hierarchy is missing.');
    const speed=metadata.needles?.speed||{parent:'Speedo',node:'NeedlePivot'},rpm=metadata.needles?.rpm||{parent:'Tach',node:'NeedlePivot'};
    this.speedNeedle=find(find(this.root,speed.parent),speed.node,speed.unityPathId??9068);this.rpmNeedle=find(find(this.root,rpm.parent),rpm.node,rpm.unityPathId??9386);
    if(!this.speedNeedle||!this.rpmNeedle)throw new Error('The original speedometer or tachometer needle is missing.');
    this.needleRests=[this.speedNeedle.quaternion.clone(),this.rpmNeedle.quaternion.clone()];
    const labels=metadata.textMeshes||metadata.labels||[];
    if(!labels.length)throw new Error('The original cockpit TextMesh metadata is missing.');
    const originals=labels.map(spec=>{
      const node=spec.unityPathId!=null?find(this.root,spec.name||spec.node,spec.unityPathId):null;
      const anchor=node||atPath(this.root,spec.path)||find(this.root,spec.name||spec.node);
      if(!anchor)throw new Error(`The original cockpit label ${spec.name||spec.node||spec.path} is missing.`);
      const text=String(spec.text??'');
      if(font.data?.glyphs)for(const character of new Set(text))if(character!==' '&&!font.data.glyphs[character])throw new Error(`The original cockpit font is missing the glyph ${character}.`);
      return {spec,node:anchor,text};
    });
    for(const {spec,node,text} of originals){
      const color=spec.color||metadata.settings?.tickColor||[.858824,.721569,.419608,1],key=color.join(',');
      if(!this.materials.has(key))this.materials.set(key,new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...color.slice(0,3),THREE.SRGBColorSpace),opacity:color[3]??1,transparent:(color[3]??1)<1,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,fog:false}));
      const mesh=new THREE.Mesh(makeClusterTextGeometry(font,text,spec),this.materials.get(key));mesh.name='NativeClusterText';mesh.renderOrder=2;node.add(mesh);
      const label={node,mesh,spec,value:text};this.labels.push(label);
      if(spec.dynamic===true||spec.dynamic==='speed'||named(node,'Readout'))this.readout=label;
    }
    this.ready=true;this.setNeedles();
  }
  setNeedles(rpm=this.displayRpm){
    const c=this.settings;
    // Native Euler(0,0,-angle), converted through the GLB's X reflection.
    const angle=value=>(c.startAngle+(c.endAngle-c.startAngle)*clamp(value,0,1))*RAD;
    this.speedNeedle.rotation.set(0,0,angle(this.displayKmh/c.maxSpeedKmh));
    this.rpmNeedle.rotation.set(0,0,angle(rpm/c.maxRpm));
  }
  update(state,driverInput={},dt=1/60,phase='running'){
    if(!this.ready||this.disposed||!state)return;
    dt=clamp(finite(dt),0,.1);
    this.time=Number.isFinite(state.elapsed)?state.elapsed:this.time+dt;
    const moving=phase==='running'&&!state.dead&&!(state.finish>=0);
    const driver=moving?driverInput:{throttle:0,steer:0,handbrake:false};
    this.engine.step(state,driver,dt);
    const speed=(Number.isFinite(state.vx)&&Number.isFinite(state.vz)?Math.hypot(state.vx,state.vz):Math.abs(finite(state.speed)))*3.6,rpm=this.engine.rpm;
    const follow=1-Math.exp(-this.settings.needleFollow*dt);
    this.displayKmh+=(speed-this.displayKmh)*follow;this.displayRpm+=(rpm-this.displayRpm)*follow;
    // CarAudio.OnLimiter tests _limiterVol>.05; its audio-duck threshold differs.
    const dip=this.engine.limiter>.05?250+850*clamp(Math.abs(Math.sin(this.time*21))*Math.abs(Math.sin(this.time*52)),0,1):0;
    this.setNeedles(Math.max(0,this.displayRpm-dip));
    if(this.readout){
      const value=String(roundClusterSpeed(this.displayKmh));
      if(this.readout.value!==value){const geometry=makeClusterTextGeometry(this.font,value,this.readout.spec);this.readout.mesh.geometry.dispose();this.readout.mesh.geometry=geometry;this.readout.value=value;}
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.ready=false;
    for(const label of this.labels){label.node.remove(label.mesh);label.mesh.geometry.dispose();}
    for(const material of this.materials.values())material.dispose();this.materials.clear();
    this.speedNeedle?.quaternion.copy(this.needleRests[0]);this.rpmNeedle?.quaternion.copy(this.needleRests[1]);
  }
}
