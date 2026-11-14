import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {Font} from 'three/addons/loaders/FontLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { direction } from '../shared/course.js';
import {CarPresentation} from './car-presentation.js';
import {ImpactShake} from './impact-shake.js';
import {RenderBudget} from './render-budget.js';
import {loadNativeScenery,addNativeScenery} from './native-scenery.js';
import {loadNativeDetails,NativeDetails} from './native-details.js';
import {CrashSequence,CrashCamera} from './crash-presentation.js';
import {DriverHands} from './hand-rig.js';
import {NativeWipers,NATIVE_WINDSHIELD} from './windshield-wipers.js';
import {installWindshieldMud,smoothMud} from './windshield-material.js';
import {assetUrl} from './asset-url.js';
import {CockpitCluster} from './cockpit-cluster.js';
import {originalCabinProbe,prepareCabinSurfaces} from './cabin-materials.js';
import {CabinFeel,NATIVE_CABIN,roadPitchAt} from './cabin-feel.js';
import { CAR } from '../shared/physics.js';
const UP=new THREE.Vector3(0,1,0), v=new THREE.Vector3(), q=new THREE.Quaternion();
// Start the navigator looking at the native lap-held tablet; mouse look stays free.
export const initialLookPitch=slot=>slot%2===1?46.6:0;
export class RallyView {
  constructor(canvas) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b7c4ba');this.scene.fog=new THREE.Fog('#b7c4ba',45,190);
    this.camera=new THREE.PerspectiveCamera(90,innerWidth/innerHeight,.01,1000);this.camera.rotation.order='YXZ';
    this.hemi=new THREE.HemisphereLight('#eff4da','#78816b',1.7);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight('#fff2cf',3);this.sun.position.set(-50,100,30);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:200});this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.025;this.scene.add(this.sun,this.sun.target);
    this.world=new THREE.Group();this.scene.add(this.world);this.cars=[];this.tablets=[];this.snapshots=[];this.slot=0;this.active=false;this.look={pitch:0,yaw:0};this.lastMap=0;
    this.privateCanvas=document.createElement('canvas');this.privateCanvas.width=600;this.privateCanvas.height=600;this.privacyTexture=new THREE.CanvasTexture(this.privateCanvas);this.privacyTexture.colorSpace=THREE.SRGBColorSpace;this.privacyTexture.flipY=false;this.drawPrivate();
    window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();document.dispatchEvent(new CustomEvent('rallyerror',{detail:'Graphics were interrupted. Reload this page to return to the rally.'}));});
  }
  async load(progress=()=>{}) {
    const response=await fetch(assetUrl('/assets/manifest.json'));if(!response.ok)throw new Error('The original game assets could not be loaded.');this.manifest=await response.json();
    const loader=new GLTFLoader();let loaded=0;
    const entries=[['car',this.manifest.models.car],['driverRig',{url:'/assets/driver-rig.glb'}],['tablet',this.manifest.models.tablet],['start',this.manifest.models.StageStart],['finish',this.manifest.models.StageFinish],...this.manifest.models.trees.map((m,i)=>[`tree${i}`,m])];
    this.assets={};
    await Promise.all(entries.map(async([name,asset])=>{this.assets[name]=(await loader.loadAsync(assetUrl(asset.url))).scene;progress(`Loading original models… ${++loaded}/${entries.length}`);}));
    const handResponse=await fetch(assetUrl('/assets/DriverWheelHandIk.json'));if(!handResponse.ok)throw new Error('The original driver hand settings could not be loaded.');this.handConfig=await handResponse.json();
    const textures=new THREE.TextureLoader();
    const tex=async(name,linear=false)=>{const t=await textures.loadAsync(assetUrl(this.manifest.textures[name].url));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=linear?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return t;};
    const [road,roadNormal,ground]=await Promise.all([tex('dirtRoad_A'),tex('road_N_gltf_normal',true),tex('RW_Grass_MatchTrees')]);
    const atmosphere=this.manifest.atmosphere;if(atmosphere){const f=atmosphere.fog;this.scene.fog=new THREE.Fog(new THREE.Color().setRGB(...f.color,THREE.SRGBColorSpace),f.near,f.far);this.sun.color.setRGB(...atmosphere.sun.color,THREE.SRGBColorSpace);this.sun.intensity=atmosphere.sun.intensity;this.hemi.color.setRGB(...atmosphere.ambient.sky,THREE.SRGBColorSpace);this.hemi.groundColor.setRGB(...atmosphere.ambient.ground,THREE.SRGBColorSpace);const sky=atmosphere.skybox;try{const cube=await new THREE.CubeTextureLoader().loadAsync([sky.px,sky.nx,sky.py,sky.ny,sky.pz,sky.nz].map(url=>assetUrl(url)));cube.colorSpace=THREE.SRGBColorSpace;this.scene.background=cube;}catch{}}
    this.roadMaterial=new THREE.MeshStandardMaterial({map:road,normalMap:roadNormal,normalScale:new THREE.Vector2(.32,.32),roughness:.97,color:'#ffffff'});
    this.groundMaterial=new THREE.MeshStandardMaterial({map:ground,roughness:1,color:new THREE.Color().setRGB(...this.manifest.surfaces.ground.tint.slice(0,3),THREE.SRGBColorSpace),side:THREE.DoubleSide});
    const rtSize=this.manifest.ui.tablet.rtSize;this.privateCanvas.width=this.privateCanvas.height=rtSize;this.drawPrivate();
    this.timerFont=new Font(await fetch(assetUrl(this.manifest.fonts.ShareTechMono.typefaceUrl)).then(response=>{if(!response.ok)throw new Error('The original timer font could not be loaded.');return response.json();}));
    const nativeCamera=this.manifest.ui.cabinCamera;this.camera.fov=nativeCamera?.fieldOfView||90;this.camera.near=.01;this.camera.far=1000;this.camera.updateProjectionMatrix();
    const cockpitResponse=await fetch(assetUrl('/assets/cockpit.json'));if(!cockpitResponse.ok)throw new Error('The original cockpit settings could not be loaded.');this.cockpitMetadata=await cockpitResponse.json();
    const cockpitFontResponse=await fetch(assetUrl('/assets/fonts/NativeCockpit.typeface.json'));if(!cockpitFontResponse.ok)throw new Error('The original cockpit font could not be loaded.');this.cockpitFont=new Font(await cockpitFontResponse.json());
    if(this.scene.background?.isCubeTexture){this.cabinReflectionTarget=originalCabinProbe(this.renderer,this.scene.background,this.manifest.atmosphere.reflections?.resolution||128);}
    this.prepareCar();
    for(const model of [this.assets.car,this.assets.tablet,this.assets.driverRig])prepareCabinSurfaces(model,this.cabinReflectionTarget?.texture,this.manifest.atmosphere.reflections?.intensity??.95,Math.min(8,this.renderer.capabilities.getMaxAnisotropy()));
    const [scenery,details]=await Promise.all([loadNativeScenery(loader,progress),Promise.all([1,2,3].map(async scene=>[String(scene),await loadNativeDetails(scene)]))]);this.nativeScenery=scenery;this.nativeDetails=new Map(details);
    progress('Planting the original forest…');
  }
  prepareCar() {
    const glassMaterials=new Map();
    this.assets.car.traverse(node=>{
      if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;
      const materials=(Array.isArray(node.material)?node.material:[node.material]).map(material=>{
        if(material.transparent&&material.opacity<.01){node.visible=false;return material;}
        if(material.userData?.unityShader==='RollingWreck/CarGlass'||material.name==='Car_Glass'){
          node.castShadow=false;node.receiveShadow=false;
          if(!glassMaterials.has(material)){const glass=new THREE.MeshBasicMaterial({name:material.name,color:material.color.clone(),transparent:true,opacity:material.opacity,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,fog:false});glass.forceSinglePass=true;glassMaterials.set(material,glass);}
          return glassMaterials.get(material);
        }
        if(material.transparent)material.depthWrite=false;
        return material;
      });
      node.material=Array.isArray(node.material)?materials:materials[0];
    });
  }
  setQuality(value) {
    this.quality=value;this.renderBudget=new RenderBudget();
    const low=value==='low'||value==='auto'&&((navigator.hardwareConcurrency||8)<6||matchMedia('(pointer:coarse)').matches);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:value==='auto'?1.25:1.5));this.renderer.shadowMap.enabled=!low;this.scene.fog.far=low?150:this.manifest.atmosphere.fog.far;this.camera.far=low?300:1000;this.camera.updateProjectionMatrix();
  }
  disposeCourse() {
    this.details?.dispose();this.details=null;
    const courseMaterials=new Set();
    for(const car of this.cars){car.cluster?.dispose();car.hands?.dispose();car.driverRig?.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.dispose();});for(const material of car.dynamicMaterials||[])material.dispose();}for(const pad of this.tablets){pad.screen?.material.dispose();pad.mapTexture?.dispose();pad.timer?.geometry.dispose();pad.timer?.material.dispose();pad.timerWindow?.traverse(node=>{if(node.isMesh&&node!==pad.timer){node.geometry.dispose();node.material.dispose();}});}
    for(const child of [...this.world.children]) {this.world.remove(child);if(child.userData.courseMaterial)courseMaterials.add(child.userData.courseMaterial);if(child.isInstancedMesh)child.dispose();if(child.userData.disposable)child.traverse(n=>{n.geometry?.dispose();});}
    for(const material of courseMaterials){for(const texture of material.userData.ownedTextures||[])texture.dispose();material.dispose();}
    this.cars=[];this.tablets=[];this.snapshots=[];this.predicted=null;this.presentation=null;
  }
  buildCourse(course) {
    this.disposeCourse();this.course=course;
    if(course.roadMesh){
      const data=course.roadMesh,geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
      geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.indices);
      const mesh=new THREE.Mesh(geometry,this.roadMaterial);mesh.receiveShadow=true;mesh.userData.disposable=true;this.world.add(mesh);
    }else this.ribbon(course.width,this.roadMaterial,.015);
    if(course.nativeScene){addNativeScenery(this.world,course.nativeScene,this.nativeScenery,this.assets,course.roadMesh);this.details=new NativeDetails(this.world,this.nativeScenery.scenes.get(String(course.nativeScene)),this.nativeDetails.get(String(course.nativeScene)));}
    else this.ribbon(110,this.groundMaterial,-.25,true);
    for(let type=0;type<this.manifest.models.trees.length;type++) {
      const source=this.assets[`tree${type}`];source.updateMatrixWorld(true);const placements=course.trees.filter(t=>t.variant===type);
      // Chunking keeps thousands of original trees fast and culls distant forest geometry.
      const chunks=new Map();for(const tree of placements){const key=`${Math.floor(tree.x/45)},${Math.floor(tree.z/45)}`;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(tree);}
      source.traverse(mesh=>{if(!mesh.isMesh)return;for(const trees of chunks.values()) {
        const instanced=new THREE.InstancedMesh(mesh.geometry,mesh.material,trees.length);instanced.castShadow=true;instanced.receiveShadow=true;
        const matrix=new THREE.Matrix4(),placement=new THREE.Matrix4(),scale=new THREE.Vector3();
        trees.forEach((tree,i)=>{const center=this.manifest.models.trees[type].collider?.center||[0,0,0],dx=(Math.cos(tree.yaw)*center[0]+Math.sin(tree.yaw)*center[2])*tree.scale,dz=(-Math.sin(tree.yaw)*center[0]+Math.cos(tree.yaw)*center[2])*tree.scale;placement.compose(v.set(tree.x-dx,tree.y,tree.z-dz),q.setFromAxisAngle(UP,tree.yaw),scale.setScalar(tree.scale));matrix.multiplyMatrices(placement,mesh.matrixWorld);instanced.setMatrixAt(i,matrix);});
        instanced.computeBoundingSphere();this.world.add(instanced);
      }});
    }
    for(const [name,index] of [['start',course.startIndex??8],['finish',course.finishIndex??course.points.length-9]]) {
      const gate=clone(this.assets[name]),pose=course.gates?.[name],p=course.points[index],d=direction(course.points,index);
      if(pose){gate.position.fromArray(pose.position);gate.quaternion.fromArray(pose.rotation);}else{gate.position.set(p.x,p.y,p.z);gate.rotation.y=Math.atan2(d.x,d.z);gate.scale.x=course.width/7;}
      gate.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});this.world.add(gate);
    }
    // Mud uses the same original road texture with native mud color, no additional scenery.
    const mudMaterial=this.roadMaterial.clone();mudMaterial.color.setRGB(.3,.2,.11);mudMaterial.roughness=.55;
    const mudGeometry=new THREE.PlaneGeometry(course.width-.2,4);mudGeometry.rotateX(-Math.PI/2);
    for(const mud of course.mud){const m=new THREE.Mesh(mudGeometry,mudMaterial),d=direction(course.points,mud.index);m.position.set(mud.x,course.points[mud.index].y+.026,mud.z);m.rotation.y=Math.atan2(d.x,d.z);m.receiveShadow=true;this.world.add(m);}
    this.makeCars(course.mode==='race'?2:1);
  }
  ribbon(width,material,offset,ground=false) {
    const course=this.course,points=course.points,positions=[],uvs=[],indices=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],d=direction(points,i);
      for(const side of [-1,1]){const x=p.x+d.z*width*.5*side,z=p.z-d.x*width*.5*side;positions.push(x,p.y+offset,z);uvs.push(ground?x/4.5:(side+1)/2,ground?z/4.5:course.distances[i]/width);}
      if(i<points.length-1){const n=i*2;indices.push(n,n+3,n+1,n,n+2,n+3);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.userData.disposable=true;this.world.add(mesh);
  }
  makeCars(count) {
    for(let team=0;team<count;team++) {
      const model=clone(this.assets.car);this.world.add(model);
      const bakedDriver=model.getObjectByName('character_fat')||this.find(model,'character fat');if(bakedDriver)bakedDriver.visible=false;
      const driverRig=clone(this.assets.driverRig);(this.find(model,'BodyVisual')||model).add(driverRig);const driver=driverRig.getObjectByName('character_fat')||this.find(driverRig,'character fat')||driverRig;
      const nav=model.getObjectByName('character_skiny')||this.find(model,'character skiny');
      const car={model,driver,driverRig,nav,body:this.find(model,'BodyVisual'),motion:new CabinFeel(),door:this.find(model,'door_rf_ok'),wheel:this.find(model,'WheelRotationHelper'),wipers:[this.find(model,'wiper_L'),this.find(model,'wiper_R')],mudUniforms:[],heads:[],dynamicMaterials:[]};
      car.bodyRest=car.body?.quaternion.clone();
      for(const [body,key] of [[driver,'driverHead'],[nav,'navigatorHead']]) {
        const head=this.find(body,'Casual2_Head');
        if(head?.isSkinnedMesh){const bone=this.find(body,'Head');car.heads.push({mesh:head,bone,skinned:true,rest:bone?.quaternion.clone()});}
        else if(head){const pivot=new THREE.Group();pivot.position.fromArray(this.manifest.anchors[key].position);(car.body||model).add(pivot);model.updateMatrixWorld(true);pivot.attach(head);const bone=this.find(body,'Head');if(bone&&bone!==head)pivot.attach(bone);car.heads.push({mesh:head,bone,pivot});}else car.heads.push(null);
      }
      car.doorRest=car.door?.quaternion.clone();car.wheelRest=car.wheel?.quaternion.clone();car.wiperRests=car.wipers.map(w=>w?.quaternion.clone());
      car.wiperMotion=new NativeWipers();car.knob=this.find(model,'mud_knob_location');car.knobRest=car.knob?.quaternion.clone();car.knobSpin=0;
      car.cluster=new CockpitCluster(model,this.cockpitFont,this.cockpitMetadata);
      car.hands=new DriverHands(model,this.handConfig);if(!car.hands.ready)throw new Error(car.hands.reason||'The original driver rig could not be initialized.');
      model.traverse(mesh=>{if(!mesh.isMesh||!mesh.name.toLowerCase().includes('windscreen'))return;
        const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>{
          const result=installWindshieldMud(mesh,material,car.body||model,this.manifest.mud.color);
          car.dynamicMaterials.push(result.material);car.mudUniforms.push(result.uniforms);return result.material;
        });mesh.material=Array.isArray(mesh.material)?materials:materials[0];
      });
      this.cars.push(car);
      const tablet=clone(this.assets.tablet);let screen=null;tablet.traverse(n=>{if(n.isMesh&&n.name.toLowerCase().includes('screen')){screen=n;n.material=new THREE.MeshBasicMaterial({map:this.privacyTexture,side:THREE.DoubleSide,toneMapped:false,fog:false});const native=this.manifest.ui.tablet.screenRuntimeTransform;n.position.fromArray(native.position);n.rotation.set(-Math.PI/2,0,0);n.scale.fromArray(native.scale);}});this.world.add(tablet);const mapCanvas=document.createElement('canvas');mapCanvas.width=mapCanvas.height=this.manifest.ui.tablet.rtSize;const mapTexture=new THREE.CanvasTexture(mapCanvas);mapTexture.colorSpace=THREE.SRGBColorSpace;mapTexture.flipY=false;mapTexture.generateMipmaps=false;mapTexture.minFilter=THREE.LinearFilter;mapTexture.magFilter=THREE.LinearFilter;mapTexture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());const pad={model:tablet,screen,mapCanvas,mapTexture};this.makeTimer(pad);this.tablets.push(pad);
    }
    this.setSeat(this.slot);
  }
  find(parent,name) {if(!parent)return null;let found=null;parent.traverse(n=>{if(!found&&(n.name===name||n.name.startsWith(name.replaceAll(' ','_'))))found=n;});return found;}
  setSeat(slot) {this.slot=Math.max(0,slot);this.cars.forEach((car,team)=>car.heads.forEach((head,seat)=>{if(head)(head.skinned?head.mesh:head.pivot).visible=!(this.active&&team===Math.floor(this.slot/2)&&seat===this.slot%2);}));}
  setActive(active) {this.active=active;this.predicted=null;this.impactShake=new ImpactShake();this.crashSequence=new CrashSequence();this.crashCamera=null;this.camera.near=.01;this.camera.updateProjectionMatrix();this.setSeat(this.slot);}
  crashStateAt(now=performance.now()){if(!this.crashSequence)this.crashSequence=new CrashSequence();return this.crashSequence.sample(this.snapshot,this.slot,now);}
  resetPresentation(){if(!this.snapshot)return;for(const car of this.cars)car.presentation=null;this.setSnapshot(this.snapshot);}
  setSnapshot(snapshot,{latencySeconds=0}={}) {
    if(!snapshot)return;const now=performance.now();this.snapshots.push({snapshot,received:now});if(this.snapshots.length>12)this.snapshots.shift();this.snapshot=snapshot;
    this.cars.forEach((car,team)=>{
      const authority=snapshot.cars[team];if(!authority)return;const drive=snapshot.inputs?.[team*2]||{};
      if(!car.presentation)car.presentation=new CarPresentation(this.course,{remote:this.slot!==team*2});
      car.presentation.accept(authority,{phase:snapshot.phase,latencySeconds,input:drive,inputAgeSeconds:Math.max(0,(snapshot.time||0)-(drive.arrived??snapshot.time??0))});
      if(team===Math.floor(this.slot/2)){this.presentation=car.presentation;this.predicted=car.presentation.predicted;}
    });
  }
  update(dt,now,input={}) {
    if(this.active&&this.quality==='auto'){const ratio=this.renderBudget?.sample(dt);if(ratio!==null&&ratio!==undefined)this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));}
    if(!this.active){const previous=this.scene.background;this.scene.background=new THREE.Color('#24211f');this.world.visible=false;this.renderer.render(this.scene,this.camera);this.world.visible=true;this.scene.background=previous;return;}if(!this.course)return;const snapshot=this.snapshot;
    if(this.active&&snapshot) {
      const crash=this.crashStateAt(now);this.currentCrash=crash;
      this.cars.forEach((car,team)=>{
        const b=snapshot.cars[team];if(!b)return;
        const state=car.presentation?.advance(dt,input,snapshot.phase)||b;
        this.applyCar(car,state,b,now,input,dt);
      });
      this.tablets.forEach((pad,i)=>{const state=snapshot.tablets[i];if(!state)return;const carrier=this.cars[state.carrier];
        if(state.holder>=0&&carrier){const key=state.holder%2===0?'HoldAnchor_Driver':'HoldAnchor_Passenger';const anchor=carrier.model.getObjectByName(key);if(anchor){anchor.getWorldPosition(pad.model.position);anchor.getWorldQuaternion(pad.model.quaternion);}else pad.model.position.set(state.x,state.y,state.z);}
        else {pad.model.position.lerp(v.set(state.x,state.y,state.z),Math.min(1,dt*15));pad.model.rotation.set(.15*Math.sin(now*.002),snapshot.cars[state.carrier]?.yaw||0,0);}
        if(pad.screen)pad.screen.material.map=this.slot%2===1||this.practice?pad.mapTexture:this.privacyTexture;this.updateTimer(pad,snapshot,state);
      });
      const own=this.cars[Math.floor(this.slot/2)],state=snapshot.cars[Math.floor(this.slot/2)];
      if(own&&state){const seat=this.manifest.anchors[this.slot%2===0?'Main Camera':'EyeAnchor'];
        if(crash.active){if(!this.crashCamera)this.crashCamera=new CrashCamera(this.camera,own.body||own.model,this.slot);this.crashCamera.apply(this.camera,crash.elapsed);}else{
        const cabin=own.body||own.model;v.fromArray(seat.position);v.z+=own.motion?.lean||0;cabin.localToWorld(v);this.camera.position.copy(v);
        if(!this.impactShake)this.impactShake=new ImpactShake();const shake=this.impactShake.update(state,dt);
        if(snapshot.phase==='running'&&!state.dead&&state.finish<0)this.camera.position.add(v.set(shake.x,shake.y,shake.z));
        
        // Keep the original seat's entire rest orientation, including its tiny
        // authored roll. Body pitch/roll and road grade carry the eye with it.
        if(!own.seatRests)own.seatRests=new Map();
        if(!own.seatRests.has(this.slot%2)){
          const rest=new THREE.Quaternion();
          if(seat.matrix){new THREE.Matrix4().fromArray(seat.matrix).decompose(new THREE.Vector3(),rest,new THREE.Vector3());}
          else rest.setFromAxisAngle(new THREE.Vector3(1,0,0),(this.slot%2===0?11.29:8.1)*Math.PI/180);
          own.seatRests.set(this.slot%2,rest.normalize());
        }
        cabin.getWorldQuaternion(this.camera.quaternion);
        this.camera.quaternion.multiply(q.setFromEuler(new THREE.Euler(this.look.pitch*Math.PI/180,-this.look.yaw*Math.PI/180,0,'YXZ'))).multiply(own.seatRests.get(this.slot%2)).multiply(q.setFromAxisAngle(UP,Math.PI));
        const fov=own.motion?.fov||NATIVE_CABIN.idleFov;if(Math.abs(this.camera.fov-fov)>.005){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
        }
        for(const mesh of this.world.children)if(mesh.isInstancedMesh||mesh.userData.terrainChunk){const sphere=mesh.boundingSphere||mesh.geometry?.boundingSphere,center=sphere?.center;if(center){const distance=(center.x-state.x)**2+(center.z-state.z)**2,radius=sphere.radius;mesh.visible=distance<(this.scene.fog.far+radius)**2;mesh.castShadow=mesh.isInstancedMesh&&mesh.userData.castShadowAllowed!==false&&distance<(65+radius)**2;}}
        this.details?.update(state.x,state.z,now);
        this.sun.position.set(state.x-40,state.y+80,state.z+20);this.sun.target.position.set(state.x,state.y,state.z);this.sun.target.updateMatrixWorld();
      }
      if(now-this.lastMap>80){this.drawMap(snapshot);this.lastMap=now;}
    }else{
      const p=this.course.points[25],time=now*.000025;this.camera.position.set(p.x+11+Math.sin(time)*3,p.y+3.8,p.z-7);this.camera.lookAt(p.x,p.y+1,p.z+17);
      this.cars.forEach((car,i)=>{const p=this.course.points[8];car.model.position.set(p.x+(this.cars.length>1?(i===0?-2.3:2.3):0),p.y,p.z);car.model.rotation.set(0,0,0);});
    }
    this.renderer.render(this.scene,this.camera);
  }
  applyCar(car,state,authority,now,input,dt=1/60) {
    const team=this.cars.indexOf(car),ownTeam=Math.floor(this.slot/2),prediction=car.presentation;
    if(car.crashHold)return;
    if(!car.motion)car.motion=new CabinFeel();
    const controls=team===ownTeam&&this.slot%2===0?input:prediction?(prediction.hold>0?prediction.input:{}):this.snapshot.inputs?.[team*2]||{};
    const motion=car.motion.update({...authority,...state,vx:prediction?.predicted.vx??authority.vx,vz:prediction?.predicted.vz??authority.vz},controls,dt,this.snapshot.phase,roadPitchAt(this.course,prediction?.predicted.nearest??authority.nearest??authority.progress));
    car.model.position.set(state.x,state.y-CAR.height,state.z);car.model.rotation.set(motion.roadPitch,state.yaw,0,'YXZ');
    const body=car.body||this.find(car.model,'BodyVisual');if(body){if(!car.bodyRest)car.bodyRest=body.quaternion.clone();body.quaternion.copy(car.bodyRest).multiply(q.setFromEuler(new THREE.Euler(motion.pitch,0,motion.roll,'YXZ')));}
    const doorAngle=THREE.MathUtils.clamp(team===ownTeam&&this.localDoorPreview!=null?this.localDoorPreview:authority.doorAngle||0,0,90);
    if(car.door&&car.doorRest)car.door.quaternion.copy(car.doorRest).multiply(q.setFromAxisAngle(UP,doorAngle*Math.PI/180));
    // The cockpit faces +Z, so the reflected wheel's local +X is screen-left.
    // Invert driving steer once for BOTH the wheel and its hand IK targets.
    const steer=-(prediction?.predicted.steer??authority.steer??0);
    if(car.wheel&&car.wheelRest)car.wheel.quaternion.copy(car.wheelRest).multiply(q.setFromAxisAngle(new THREE.Vector3(0,0,1),-steer*NATIVE_CABIN.steeringWheelDegrees*Math.PI/180));
    const wipe=(team===ownTeam&&input.wipe)||this.snapshot.inputs?.[team*2]?.wipe||this.snapshot.inputs?.[team*2+1]?.wipe;
    car.wiperMotion??=new NativeWipers();
    const displayedMud=smoothMud(car,authority.mud||0,dt),wiper=car.wiperMotion.update(Boolean(wipe),displayedMud,dt),axis=new THREE.Vector3(...NATIVE_WINDSHIELD.axis);
    car.wipers.forEach((w,i)=>{if(w&&car.wiperRests[i])w.quaternion.copy(car.wiperRests[i]).premultiply(q.setFromAxisAngle(axis,wiper.angle));});
    if(wipe)car.knobSpin=(car.knobSpin+420*dt)%360;
    if(car.knob&&car.knobRest)car.knob.quaternion.copy(car.knobRest).multiply(q.setFromAxisAngle(new THREE.Vector3(0,0,1),-car.knobSpin*Math.PI/180));
    const sweep=t=>t*t*(3-2*t)*95*Math.PI/180;
    car.mudUniforms.forEach(u=>{u.mud.value=displayedMud;u.mudAhead.value=wiper.ahead;u.wipeFrom.value=sweep(wiper.fromT);u.wipeTo.value=-wiper.angle;u.wipeRunning.value=Number(wiper.running);});
    car.heads.forEach((head,seat)=>{const state=this.snapshot.inputs?.[car===this.cars[0]?seat:seat+2];if(head&&state){if(head.skinned&&head.bone)head.bone.quaternion.copy(head.rest).multiply(q.setFromEuler(new THREE.Euler((state.pitch||0)*Math.PI/180,-(state.yaw||0)*Math.PI/180,0,'YXZ')));else head.pivot?.rotation.set((state.pitch||0)*Math.PI/180,-(state.yaw||0)*Math.PI/180,0,'YXZ');}});
    car.hands?.update(steer,{steerDegrees:steer*NATIVE_CABIN.steeringWheelDegrees,handbrake:controls.handbrake===true,dt});
    car.cluster?.update({...authority,...state,vx:prediction?.predicted.vx??authority.vx,vz:prediction?.predicted.vz??authority.vz,elapsed:this.snapshot.elapsed},controls,dt,this.snapshot.phase);
    if(team===ownTeam&&authority.dead&&this.currentCrash?.hold)car.crashHold=true;
  }
  makeTimer(pad) {
    const native=this.manifest.ui.tablet.timer,root=pad.model.getObjectByName('Tablet')||pad.model,window=new THREE.Group();window.name='TimerWindow';window.position.fromArray(native.window.position);root.add(window);pad.timerWindow=window;
    function cube(spec,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...color.slice(0,3),THREE.SRGBColorSpace),toneMapped:false}));mesh.position.fromArray(spec.position);mesh.scale.fromArray(spec.scale);window.add(mesh);}
    cube(native.plate,native.plate.color);for(const rim of native.rim.cubes)cube(rim,native.rim.color);
    const text=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#fff',side:THREE.DoubleSide,toneMapped:false,fog:false}));text.name='TimerText';text.position.fromArray(native.text.position);text.quaternion.set(0,Math.SQRT1_2,Math.SQRT1_2,0);text.scale.fromArray(native.text.scale);window.add(text);pad.timer=text;pad.timerValue=null;
  }
  updateTimer(pad,snapshot,state) {
    const car=snapshot.cars[state.carrier];pad.timer.visible=this.slot%2===1||this.practice;if(!pad.timer.visible)return;
    const elapsed=car.finish>=0?car.finish:snapshot.elapsed;let value=snapshot.phase==='waiting'?'':snapshot.phase==='countdown'?String(Math.max(1,Math.ceil(snapshot.countdown))):car.dead?'':`${Math.floor(elapsed/60)}:${(elapsed%60).toFixed(1).padStart(4,'0')}`;
    if(value===pad.timerValue)return;pad.timerValue=value;pad.timer.geometry.dispose();
    if(!value){pad.timer.geometry=new THREE.BufferGeometry();return;}
    // Unity TextMesh glyph pixels use characterSize/10. TTFLoader uses 100/72 em units.
    const spec=this.manifest.ui.tablet.timer.text,size=spec.fontSize*spec.characterSize/10*72/100;
    const geometry=new THREE.ShapeGeometry(this.timerFont.generateShapes(value,size));geometry.computeBoundingBox();const bounds=geometry.boundingBox;geometry.translate(-(bounds.min.x+bounds.max.x)/2,-(bounds.min.y+bounds.max.y)/2,0);geometry.scale(-1,1,1);pad.timer.geometry=geometry;
  }
  drawPrivate() {
    const c=this.privateCanvas.getContext('2d');c.fillStyle='#1a1712';c.fillRect(0,0,this.privateCanvas.width,this.privateCanvas.height);this.privacyTexture.needsUpdate=true;
  }
  drawMap(snapshot) {
    this.tablets.forEach((pad,index)=>{
      const state=snapshot.tablets[index],car=snapshot.cars[state?.carrier];if(!car)return;
      const canvas=pad.mapCanvas,c=canvas.getContext('2d'),resolution=canvas.width,center=resolution/2;
      c.fillStyle='#332e1a';c.fillRect(0,0,resolution,resolution);
      // Native TabletMinimap: orthographic75m, lookAheadFrac.4, white ribbon1.35xroad.
      const spec=this.manifest.ui.tablet,scale=resolution/(spec.orthoSize*2),lookAhead=spec.orthoSize*spec.lookAheadFrac;
      c.save();c.translate(center,center+lookAhead*scale);c.rotate(car.yaw);c.lineCap='butt';c.lineJoin='round';c.beginPath();let drawing=false;
      for(const p of this.course.points){const x=-(p.x-car.x)*scale,y=-(p.z-car.z)*scale;if(Math.abs(x)>1000||Math.abs(y)>1000){drawing=false;continue;}if(!drawing){c.moveTo(x,y);drawing=true;}else c.lineTo(x,y);}
      c.strokeStyle='#fff';c.lineWidth=this.course.width*spec.roadWidthMul*scale;c.stroke();c.restore();
      c.save();c.translate(center,center+lookAhead*scale);c.fillStyle='#595959';c.strokeStyle='#000';c.lineWidth=2.35;const size=spec.markerSize*scale;c.beginPath();for(let i=0;i<spec.markerTriangleFactors.length;i++){const p=spec.markerTriangleFactors[i];c[i?'lineTo':'moveTo'](-p[0]*size,-p[2]*size);}c.closePath();c.fill();c.stroke();c.restore();
      pad.mapTexture.needsUpdate=true;
    });
  }
}
