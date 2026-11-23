import * as THREE from 'three';

/** A small terrain-conforming contact shadow fills the sub-texel gap left by
 * soft cascaded sun shadows. It exists only while the tyre actually touches. */
export class TyreContactShadow{
 constructor(parent){
  this.root=new THREE.Group();this.root.name='TyreContactShadows';parent?.add(this.root);this.patches=[];
  for(let i=0;i<5;i++){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,2,1,1,2,3]);
   const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false,uniforms:{contactStrength:{value:i===4?.32:.6},contactShape:{value:i===4?4:2}},vertexShader:'varying vec2 patchUv;varying float patchDepth;void main(){patchUv=uv;vec4 viewPosition=modelViewMatrix*vec4(position,1.);patchDepth=-viewPosition.z;gl_Position=projectionMatrix*viewPosition;}',fragmentShader:'varying vec2 patchUv;varying float patchDepth;uniform float contactStrength,contactShape;void main(){vec2 p=abs(patchUv*2.-1.);float field=pow(p.x,contactShape)+pow(p.y,contactShape);float shadow=1.-smoothstep(.05,1.,field);gl_FragColor=vec4(0.,0.,0.,shadow*contactStrength*(1.-smoothstep(30.,60.,patchDepth)));}'});
   const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;this.root.add(mesh);this.patches.push(mesh);
  }
  this.point=new THREE.Vector3();
 }
 update(wheels,surface,state){
  this.root.visible=state.grounded!==false;if(!this.root.visible)return;const cs=Math.cos(state.yaw),sn=Math.sin(state.yaw);
  for(let i=0;i<wheels.length;i++){const wheel=wheels[i],patch=this.patches[i];if(!patch)continue;patch.visible=Math.abs(wheel.gap)<.08;patch.material.uniforms.contactStrength.value=.6*Math.exp(-Math.abs(wheel.gap)*30);wheel.mesh.getWorldPosition(this.point);const x=this.point.x,z=this.point.z,positions=patch.geometry.attributes.position;
   for(const[index,[sx,sz]]of[[-1,-1],[1,-1],[-1,1],[1,1]].entries()){const px=x+cs*sx*.18+sn*sz*.2,pz=z-sn*sx*.18+cs*sz*.2;positions.setXYZ(index,px,surface.height(px,pz,state.y-.68)+.002,pz);}positions.needsUpdate=true;
  }
  const body=this.patches[4],centre=this.point.set(state.x,state.y-.68,state.z),positions=body.geometry.attributes.position;
  for(const[index,[sx,sz]]of[[-1,-1],[1,-1],[-1,1],[1,1]].entries()){const px=centre.x+cs*sx*.72+sn*sz*1.62,pz=centre.z-sn*sx*.72+cs*sz*1.62;positions.setXYZ(index,px,surface.height(px,pz,state.y-.68)+.003,pz);}positions.needsUpdate=true;
 }
 dispose(){this.root.removeFromParent();for(const patch of this.patches){patch.geometry.dispose();patch.material.dispose();}}
}
