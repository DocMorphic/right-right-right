// Original Stellux Interactive CarGlass coverage, recovered from authorized
// sharedassets1 Shader198 D3D11 pixel bytecode. Original-content license applies.
// This ports coverage, not the native glass lighting or swept-wiper selection.
// nativeUv is Unity object XY normalized by the full windscreen mesh bounds.
// With reflected browser geometry: nativeUv = vec2(1.0-browserU, browserV).
export const NATIVE_MUD_GLSL = /* glsl */ `
float nativeMudHash(vec2 p) {
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float nativeMudNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(nativeMudHash(i),nativeMudHash(i+vec2(1,0)),f.x),
             mix(nativeMudHash(i+vec2(0,1)),nativeMudHash(i+vec2(1,1)),f.x),f.y);
}
float nativeMudBlob(vec2 q,vec2 p,vec2 centre,float radius,float warpA,float warpB,float boundarySeed) {
  vec2 warp=(vec2(nativeMudNoise(p*.5+warpA),nativeMudNoise(p*.5+warpB))-.5)*.16;
  float d=length((q-centre+warp)*vec2(.7,.48));
  float irregularRadius=radius+(nativeMudNoise(p+boundarySeed)-.5)*.3;
  return 1.0-smoothstep(irregularRadius,irregularRadius+.035,d);
}
float nativeMudMask(vec2 nativeUv,float effectiveMud,float noiseScale) {
  if(effectiveMud<=.001)return 0.0;
  vec2 q=(clamp(nativeUv,0.,1.)-vec2(.23,.29))/vec2(.67,.62);
  vec2 p=q*max(noiseScale,.5);
  float a=nativeMudBlob(q,p,vec2(.48,.44),effectiveMud*.78,1.4,6.6,2.38);
  float b=nativeMudBlob(q,p,vec2(.30,.30),effectiveMud*.3276,5.1,10.3,8.67);
  float c=nativeMudBlob(q,p,vec2(.68,.42),effectiveMud*.3276,9.6,14.8,16.32);
  return max(a,max(b,c));
}
float nativeMudMask(vec2 objectXY,vec2 boundsMinXY,vec2 boundsMaxXY,float effectiveMud,float noiseScale) {
  vec2 uv=(objectXY-boundsMinXY)/max(boundsMaxXY-boundsMinXY,vec2(.00001));
  return nativeMudMask(uv,effectiveMud,noiseScale);
}
`;

const fract=x=>x-Math.floor(x),clamp=x=>Math.min(1,Math.max(0,x));
function hash(x,y){x=fract(x*123.34);y=fract(y*456.21);const d=x*(x+45.32)+y*(y+45.32);return fract((x+d)*(y+d));}
function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y);x=fract(x);y=fract(y);x=x*x*(3-2*x);y=y*y*(3-2*y);const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return (a+(b-a)*x)*(1-y)+(c+(d-c)*x)*y;}
function blob(qx,qy,px,py,cx,cy,radius,warpA,warpB,seed){const wx=(noise(px*.5+warpA,py*.5+warpA)-.5)*.16,wy=(noise(px*.5+warpB,py*.5+warpB)-.5)*.16,d=Math.hypot((qx-cx+wx)*.7,(qy-cy+wy)*.48),r=radius+(noise(px+seed,py+seed)-.5)*.3,t=clamp((d-r)/.035);return 1-t*t*(3-2*t);}

/** CPU reference for native shader coverage; UVs use original Unity object XY. */
export function nativeMudMask(nativeUv,effectiveMud,noiseScale=3.5){
  if(effectiveMud<=.001)return 0;
  const qx=(clamp(nativeUv[0])-.23)/.67,qy=(clamp(nativeUv[1])-.29)/.62,scale=Math.max(noiseScale,.5),px=qx*scale,py=qy*scale;
  return Math.max(blob(qx,qy,px,py,.48,.44,effectiveMud*.78,1.4,6.6,2.38),blob(qx,qy,px,py,.30,.30,effectiveMud*.3276,5.1,10.3,8.67),blob(qx,qy,px,py,.68,.42,effectiveMud*.3276,9.6,14.8,16.32));
}
