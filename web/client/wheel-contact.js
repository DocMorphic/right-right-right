import * as THREE from 'three';
import {TyreContactShadow} from './tyre-contact-shadow.js';

/** Keep exported tyre meshes in contact with the rendered road. Each wheel is
 * a sibling of BodyVisual in the original rig, with independent suspension. */
export class WheelContact{
 constructor(model,surface){
  this.model=model;this.surface=surface;this.wheels=[];this.point=new THREE.Vector3();
  model.traverse(mesh=>{if(!mesh.isMesh||!/^Quad_Wheel(?:_?\d+)?$/.test(mesh.name))return;
   const position=mesh.geometry.getAttribute('position'),vertices=[];let min=Infinity;mesh.updateMatrix();
   for(let i=0;i<position.count;i++){this.point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrix);min=Math.min(min,this.point.y);vertices.push({local:new THREE.Vector3().fromBufferAttribute(position,i),y:this.point.y});}
   const unique=new Map();for(const vertex of vertices)if(vertex.y<=min+.04)unique.set(vertex.local.toArray().map(v=>v.toFixed(7)).join(','),vertex.local);
   this.wheels.push({mesh,rest:mesh.position.clone(),vertices:[...unique.values()],offset:0,gap:0});
  });
  this.shadows=new TyreContactShadow(model.parent);
 }
 update(state){
  for(const wheel of this.wheels){const {mesh,rest,vertices}=wheel;mesh.position.copy(rest);wheel.offset=0;
   if(state.grounded===false){mesh.updateMatrix();continue;}
   for(let pass=0;pass<3;pass++){
    mesh.updateWorldMatrix(true,false);let gap=Infinity;
    for(const local of vertices){this.point.copy(local).applyMatrix4(mesh.matrixWorld);const road=this.surface.height(this.point.x,this.point.z,state.y-.68);gap=Math.min(gap,this.point.y-road);}
    if(!Number.isFinite(gap))break;wheel.gap=gap;if(Math.abs(gap)<.0005)break;
    const up=mesh.parent.matrixWorld.elements[5]||1,next=THREE.MathUtils.clamp(wheel.offset-gap/up,-.3,.3);if(next===wheel.offset)break;wheel.offset=next;mesh.position.y=rest.y+next;
   }
   mesh.updateMatrix();
  }
  this.shadows.update(this.wheels,this.surface,state);
 }
 dispose(){this.shadows.dispose();}
}

/** Only the occupied cabin bypasses the world's depth/postprocessing pass.
 * Other cars must be occluded by the road and forest like other world objects. */
export function carRenderLayers(model,cabin){
 model.traverse(mesh=>{if(!mesh.isMesh)return;const glass=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>m.userData?.nativeGlass);mesh.layers.set(cabin&&!glass?1:0);});
}
