import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {spectatorPocketPath} from '../shared/spectators.js';
const UP=new T.Vector3(0,1,0),X=new T.Vector3(1,0,0);
/** The existing tape/cone dressing follows the road shoulder at bends. Shared
 * geometry and five draws per pocket keep a longer curved row inexpensive. */
export function crowdPocket(course,people,ground,resources){
 const root=new T.Group(),cx=people.reduce((s,p)=>s+p.x,0)/people.length,cz=people.reduce((s,p)=>s+p.z,0)/people.length,cy=ground(cx,cz,people[0].y),path=spectatorPocketPath(course,people),nodes=path.map(p=>new T.Vector3(p.x-cx,ground(p.x,p.z,p.y)-cy,p.z-cz));
 root.position.set(cx,cy,cz);root.userData.center={x:cx,z:cz};root.userData.shoulderPath=path;
 function instances(geometry,material,positions,height){const mesh=new T.InstancedMesh(geometry,material,positions.length),matrix=new T.Matrix4();positions.forEach((p,i)=>{matrix.makeTranslation(p.x,p.y+height,p.z);mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=geometry===resources.postGeometry;mesh.receiveShadow=true;root.add(mesh);return mesh;}
 const posts=nodes.filter((_,i)=>i===0||i===nodes.length-1||i%5===0),cones=nodes.filter((_,i)=>i===0||i===nodes.length-1||i%3===0);
 instances(resources.postGeometry,resources.postMaterial,posts,.48);instances(resources.baseGeometry,resources.darkMaterial,posts,.025);instances(resources.coneGeometry,resources.coneMaterial,cones,.2);instances(resources.bandGeometry,resources.whiteMaterial,cones,.22);
 const parts=[];for(const h of[.56,.92])for(let i=1;i<nodes.length;i++){const a=nodes[i-1].clone().addScaledVector(UP,h),b=nodes[i].clone().addScaledVector(UP,h),delta=b.clone().sub(a),matrix=new T.Matrix4().compose(a.add(b).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(X,delta.clone().normalize()),new T.Vector3(delta.length(),1,1));parts.push(resources.tapeGeometry.clone().applyMatrix4(matrix));}
 const geometry=mergeGeometries(parts);for(const part of parts)part.dispose();const tape=new T.Mesh(geometry,resources.tapeMaterial);tape.receiveShadow=true;root.add(tape);root.userData.dispose=()=>{geometry.dispose();root.traverse(n=>{if(n.isInstancedMesh)n.dispose();});};return root;
}
