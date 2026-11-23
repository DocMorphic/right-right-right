import * as THREE from 'three';
import {TABLET_MOUNT} from '../shared/tablet-mount.js';

/** Small, plain bracket on the existing dashboard; original tablet stays intact. */
export function makeDashboardTabletMount(){
 const group=new THREE.Group();group.name='DashboardTabletMount';
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({name:'DashboardMountRubber',color:'#252625',roughness:.86,metalness:.12});
 const part=(parent,position,size)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(position);mesh.scale.fromArray(size);mesh.castShadow=mesh.receiveShadow=true;mesh.layers.set(1);parent.add(mesh);};
 const anchor=new THREE.Object3D();anchor.name='StolenTabletDock';anchor.position.fromArray(TABLET_MOUNT.position);anchor.quaternion.fromArray(TABLET_MOUNT.rotation);group.add(anchor);
 part(group,[0,1.045,.48],[.11,.022,.10]);part(group,[0,1.13,.48],[.026,.17,.026]);
 part(anchor,[0,-.038,0],[.285,.018,.22]);
 for(const side of[-1,1])part(anchor,[side*.115,-.004,-.154],[.045,.055,.018]);
 return {group,anchor,update(enabled,aimed){group.visible=Boolean(enabled);material.emissive.setHex(aimed?0x4a2c08:0);},dispose(){geometry.dispose();material.dispose();}};
}
export function placeMountedTablet(tablet,mount){
 mount.anchor.updateWorldMatrix(true,false);mount.anchor.getWorldPosition(tablet.position);mount.anchor.getWorldQuaternion(tablet.quaternion);
}
