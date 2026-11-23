import {Vector3} from 'three';
/** Recover only position/index data; preserve all original model transforms. */
export function collisionMesh(model){const positions=[],indices=[],v=new Vector3();model.updateMatrixWorld(true);model.traverse(mesh=>{
 if(!mesh.isMesh)return;const p=mesh.geometry.getAttribute('position'),base=positions.length/3;
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);positions.push(v.x,v.y,v.z);}
 const index=mesh.geometry.index;if(index)for(let i=0;i<index.count;i++)indices.push(base+index.getX(i));else for(let i=0;i<p.count;i++)indices.push(base+i);
});return{positions,indices};}
