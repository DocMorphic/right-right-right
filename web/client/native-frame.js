import * as THREE from 'three';
import {MOTION_GLSL,MotionHistory} from './native-motion.js';

const curve=x=>(x*(.2*x+.24*.29)+.272*.02)/(x*(.2*x+.29)+.272*.3)-.02/.3;
const whiteScale=1/curve(5.3);
export const neutralChannel=x=>Math.min(1,Math.max(0,curve(Math.max(0,x)*whiteScale)*whiteScale));

/** Original camera stack: linear world/glass, Neutral postprocessing, then
 * unprocessed cabin. This also makes native premultiplied glass blend in linear
 * light rather than against already tone-mapped/sRGB pixels. */
export class NativeFrame{
  constructor(renderer,settings={}){
    this.renderer=renderer;this.size=new THREE.Vector2();
    this.target=new THREE.WebGLRenderTarget(1,1,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:true});
    this.target.samples=Math.min(4,renderer.capabilities.maxSamples);this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;this.target.resolveDepthBuffer=false;
    this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);this.target.resolveDepthBuffer=true;
    this.motion=new MotionHistory();this.motionSettings=settings.motionBlur||{active:false,intensity:0,clamp:.05,iterations:3};
    const vignette=settings.vignette||{color:[.05,.05,.06],intensity:.18,smoothness:.38,center:[.5,.5]};
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,defines:{NATIVE_MOTION_ITERATIONS:this.motionSettings.iterations},
      uniforms:{worldColor:{value:this.target.texture},worldDepth:{value:this.target.depthTexture},inverseViewProjection:{value:this.motion.inverse},previousViewProjection:{value:new THREE.Matrix4()},motionIntensity:{value:0},motionClamp:{value:this.motionSettings.clamp},sourceSize:{value:new THREE.Vector2(1,1)},vColor:{value:new THREE.Vector3(...vignette.color)},vCenter:{value:new THREE.Vector2(...vignette.center)},vIntensity:{value:vignette.intensity*3},vSmooth:{value:vignette.smoothness*5}},
      vertexShader:'varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:`varying vec2 screenUv;uniform sampler2D worldColor;uniform vec3 vColor;uniform vec2 vCenter;uniform float vIntensity,vSmooth;
vec3 filmCurve(vec3 x){return (x*(.2*x+.0696)+.00544)/(x*(.2*x+.29)+.0816)-.0666666666667;}
${MOTION_GLSL}
void main(){vec3 color=nativeMotionColor(screenUv);
float scale=${whiteScale.toPrecision(15)};
vec2 distance=abs(screenUv-vCenter)*vIntensity;
float shade=pow(clamp(1.-dot(distance,distance),0.,1.),vSmooth);
color*=mix(vColor,vec3(1.),shade);
color=clamp(filmCurve(max(color,vec3(0.))*scale)*scale,0.,1.);
gl_FragColor=vec4(color,1.);
#include <colorspace_fragment>
}`});
    this.scene=new THREE.Scene();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.scene.add(this.quad);this.camera=new THREE.Camera();
  }
  reset(){this.motion.reset();}
  setReduced(value){
    value=Boolean(value);if(value===Boolean(this.reduced))return;this.reduced=value;
    // Integrated GPUs avoid the 4x multisample HDR color/depth resolves and
    // camera blur. Keep the original color curve, glass and cabin layer order.
    this.target.dispose();
    this.target.samples=value?0:Math.min(4,this.renderer.capabilities.maxSamples);
    this.target.texture.type=value?THREE.UnsignedByteType:this.renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.target.depthTexture?.dispose();
    this.target.depthTexture=value?null:new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.target.resolveDepthBuffer=!value;
    this.material.uniforms.worldDepth.value=this.target.depthTexture;
    this.reset();
  }
  render(scene,camera,now=performance.now()){
    const r=this.renderer,bg=scene.background,mask=camera.layers.mask,autoClear=r.autoClear,shadowAuto=r.shadowMap.autoUpdate,target=r.getRenderTarget();
    r.getDrawingBufferSize(this.size);if(this.target.width!==this.size.x||this.target.height!==this.size.y)this.target.setSize(this.size.x,this.size.y);
    const continuity=this.motion.prepare(camera,this.size.x,this.size.y,now);
    this.material.uniforms.motionIntensity.value=!this.reduced&&continuity&&this.motionSettings.active?this.motionSettings.intensity:0;
    this.material.uniforms.previousViewProjection.value.copy(this.motion.previous);
    this.material.uniforms.sourceSize.value.copy(this.size);
    try{
      camera.layers.set(0);r.autoClear=true;r.setRenderTarget(this.target);r.render(scene,camera);
      r.setRenderTarget(target);r.render(this.scene,this.camera);
      r.autoClear=false;r.clearDepth();scene.background=null;camera.layers.set(1);r.shadowMap.autoUpdate=false;r.render(scene,camera);
      this.motion.commit(camera,this.size.x,this.size.y,now);
    }finally{scene.background=bg;camera.layers.mask=mask;r.autoClear=autoClear;r.shadowMap.autoUpdate=shadowAuto;r.setRenderTarget(target);}
  }
  dispose(){this.target.dispose();this.quad.geometry.dispose();this.material.dispose();}
}
