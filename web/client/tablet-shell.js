import * as THREE from 'three';

/** TabletShell.Awake constructs these parts after the serialized scene loads.
 * The GLB only contains the underlying cube, screen and grip anchors. Keep the
 * native cube dimensions and local transforms, including the worn rear corner.
 */
export function restoreTabletShell(tablet,spec){
  const root=tablet.getObjectByName('Tablet');
  if(!root||!spec?.parts?.length)throw new Error('Original tablet shell settings are missing.');
  if(root.getObjectByName('Otterbox'))throw new Error('Original tablet shell was already restored.');
  root.scale.fromArray(spec.rootScale);
  const shell=new THREE.Group();shell.name='Otterbox';root.add(shell);
  const materials=new Map(),geometries=new Map();
  const materialFor=spec=>{
    const key=JSON.stringify(spec);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({
      name:'NativeTabletShell',color:new THREE.Color().setRGB(...spec.color.slice(0,3),THREE.SRGBColorSpace),
      roughness:1-spec.smoothness,metalness:0,toneMapped:false
    }));return materials.get(key);
  };
  // Awake replaces the cube's scene material with its rubber material too.
  const rubber=spec.parts.find(part=>part.name==='BumperFL').material;
  root.material=materialFor(rubber);
  for(const part of spec.parts){
    if(!geometries.has(part.primitive)){
      if(part.primitive===3)geometries.set(3,new THREE.BoxGeometry(1,1,1));
      else if(part.primitive===2)geometries.set(2,new THREE.CylinderGeometry(.5,.5,2,20));
      else throw new Error(`Unsupported original tablet primitive ${part.primitive}.`);
    }
    const mesh=new THREE.Mesh(geometries.get(part.primitive),materialFor(part.material));mesh.name=part.name;
    mesh.position.fromArray(part.position);mesh.position.x*=-1;
    const [x,y,z,w]=part.rotation;mesh.quaternion.set(x,-y,-z,w);mesh.scale.fromArray(part.scale);
    mesh.castShadow=true;mesh.receiveShadow=true;shell.add(mesh);
  }
  const screen=root.getObjectByName('Screen');if(screen)screen.position.fromArray(spec.screenPosition);
  return {root,shell,dispose(){for(const geometry of geometries.values())geometry.dispose();for(const material of materials.values())material.dispose();}};
}
