#!/usr/bin/env python3
"""Export the original navigator skin and serialized tablet-hand settings."""
import argparse,hashlib,json,struct
from pathlib import Path
from export_web_assets import Exporter,ROOT,REFLECT,local_matrix
from export_driver_rig import SkinnedGLB
from export_native_courses import rounded

def export(runtime,output):
    e=Exporter(runtime,output);nav=e.find('character skiny');builder=SkinnedGLB(e)
    root=builder.add_go(nav,root=True,preserve_root_rotation=True,preserve_root_scale=True)
    builder.document['nodes'][root]['translation']=(REFLECT@local_matrix(e.go_transform(nav))@REFLECT)[:3,3].tolist()
    builder.document['scenes']=[{'nodes':[root]}];builder.finish_skins();target=output/'navigator-rig.glb';builder.save(target)
    component=None
    for c in e.find('Car').m_Component:
        o=c.component.deref()
        if o.type.name=='MonoBehaviour' and o.read_typetree(check_read=False,wrap=True).m_Script.read().m_ClassName=='NavigatorTabletHandIk':component=o;break
    if component is None:raise ValueError('Original navigator tablet hand component is missing.')
    raw=component.get_raw_data();offset=32
    def take(fmt):
        nonlocal offset
        values=struct.unpack_from('<'+fmt,raw,offset);offset+=struct.calcsize('<'+fmt);return values
    config={}
    def pointer():
        file,path=take('iq');return {'fileId':file,'pathId':path}
    for key in ['tablet','navigatorRoot']:config[key]=pointer()
    length=take('i')[0];config['navigatorObjectName']=raw[offset:offset+length].decode();offset=(offset+length+3)&~3
    for key in ['leftShoulder','leftUpperArm','leftLowerArm','leftWrist','rightShoulder','rightUpperArm','rightLowerArm','rightWrist','leftGrip','rightGrip']:config[key]=pointer()
    for key in ['palmLocalOffset','palmLocalEulerLeft','palmLocalEulerRight']:config[key]=list(take('3f'))
    for key in ['leftExtraRollDegrees','rightExtraRollDegrees','shoulderIkWeight','maxShoulderDegrees','gripTwistWeight','forearmTwistShare','maxForearmTwistDegrees','elbowHintRestOutward']:config[key]=take('f')[0]
    if offset!=len(raw):raise ValueError(f'Navigator serialization changed: {offset}/{len(raw)}.')
    result={'source':'Original level1 character skiny skin and NavigatorTabletHandIk component','model':{'url':'/assets/navigator-rig.glb','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'skins':len(builder.document['skins'])},'serialized':config,'componentSha256':hashlib.sha256(raw).hexdigest(),'coordinates':'Native serialized settings; GLB reflected X as car.glb. Original BodyVisual local transform is included.'}
    (output/'NavigatorTabletHandIk.json').write_text(json.dumps(rounded(result),indent=2)+'\n');return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',type=Path,default=ROOT/'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime_Data');p.add_argument('--output',type=Path,default=ROOT/'web/public/assets');a=p.parse_args();print(json.dumps(export(a.runtime,a.output),indent=2))
