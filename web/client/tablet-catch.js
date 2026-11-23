import * as THREE from 'three';
import {TABLET_CATCH as T} from '../shared/tablet-catch.js';
export function makeTabletCatch(){
 const group=new THREE.Group();group.name='PassengerTabletCatch';
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({color:'#292925',roughness:.96});
 const part=(x,y,z,w,h,d)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.layers.set(1);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);};
 part(T.x,T.y,T.z,T.width,.024,T.depth);
 for(const side of [-1,1])part(T.x,T.y+T.lip/2,T.z+side*T.depth/2,T.width,T.lip,.018);
 part(T.x+T.width/2,T.y+T.lip/2,T.z,.018,T.lip,T.depth);
 // Door-side edge has a low threshold, rather than an invisible retaining wall.
 part(T.x-T.width/2,T.y+T.exitLip/2,T.z,.018,T.exitLip,T.depth);
 group.userData.dispose=()=>{geometry.dispose();material.dispose();};return group;
}
