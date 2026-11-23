import {Vector3,Quaternion as ThreeQuaternion,Euler} from 'three';
// Return-value helpers avoid mutating stored car frames during interpolation.
export class Vec3 extends Vector3 {
 vadd(v){return new Vec3(this.x+v.x,this.y+v.y,this.z+v.z);}
 vsub(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z);}
 scale(s){return new Vec3(this.x*s,this.y*s,this.z*s);}
 cross(v){return new Vec3().crossVectors(this,v);}
 lerp(v,t,out){out.copy(this);Vector3.prototype.lerp.call(out,v,t);return out;}
}
export class Quaternion extends ThreeQuaternion {
 setFromEuler(x,y,z,order='XYZ'){return super.setFromEuler(new Euler(x,y,z,order));}
 mult(q){return new Quaternion().multiplyQuaternions(this,q);}
 conjugate(){return new Quaternion(-this.x,-this.y,-this.z,this.w);}
 vmult(v){return new Vec3(v.x,v.y,v.z).applyQuaternion(this);}
 slerp(q,t,out=new Quaternion()){out.copy(this);ThreeQuaternion.prototype.slerp.call(out,q,t);return out;}
}
