"""Package the Windows game plus an isolated ARM64 runtime as a Mac .app.

This is a bundled compatibility build, not a native Unity export. Distribution
requires a Developer ID signature and notarization; ad-hoc builds are for QA.
"""
import argparse,hashlib,json,plistlib,re,shutil,subprocess,sys,zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def verify_archive(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if any(n.startswith('/') or '..' in Path(n.replace('\\','/')).parts for n in names):raise ValueError('Unsafe game archive path.')
        prefix='RightRightRight/player/'
        manifest=json.loads(z.read(prefix+'package-manifest.json'))
        config=json.loads(z.read(prefix+'rrr-distribution.json'))
        if manifest['Format']!=1 or not manifest['Files'] or config['State']!='direct' or config['SteamAppId'] is not None:raise ValueError('Only a complete direct multiplayer package can be embedded.')
        for name,expected in manifest['Files'].items():
            with z.open(prefix+name) as f:
                if hashlib.file_digest(f,'sha256').hexdigest()!=expected:raise ValueError('Damaged game archive: '+name)
        if z.read(prefix+'GameRuntime_Data/app.info')!=b'DocMorphic\nRightRightRight':raise ValueError('Unbranded game package.')
        return config['ContentVersion'],len(manifest['Files'])

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package',type=Path,required=True)
    p.add_argument('--engine',type=Path,required=True,help='Verified relocatable engine directory or original signed runtime .app.')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--sign-identity',help='Installed Developer ID Application certificate. Omit for local QA.')
    p.add_argument('--archive',action='store_true')
    a=p.parse_args()
    if sys.platform!='darwin':raise ValueError('The Mac bundle must be assembled and checked on macOS.')
    version,count=verify_archive(a.package)
    engine=a.engine.resolve();app=a.output.resolve()
    if app.exists():raise ValueError('Output exists; choose a fresh .app path.')
    if not str(app).endswith('.app'):raise ValueError('Output must end with .app')
    for sub in ['MacOS','Resources','SharedSupport','Frameworks']:(app/'Contents'/sub).mkdir(parents=True,exist_ok=True)
    if engine.suffix=='.app':
        if not (engine/'Contents/MacOS/wine').is_file():raise ValueError('Runtime app is missing wine.')
        subprocess.run(['/usr/bin/codesign','--verify','--strict','--deep',str(engine)],check=True)
        target=app/'Contents/Frameworks'/engine.name
        subprocess.run(['/bin/cp','-cR',str(engine),str(target)],check=True)
        enginepath='Frameworks/'+engine.name+'/Contents';winepath='MacOS/wine'
    else:
        if not (engine/'bin/wine').is_file():raise ValueError('Runtime directory is missing bin/wine.')
        target=app/'Contents/SharedSupport/Runtime'
        subprocess.run(['/bin/cp','-cR',str(engine),str(target)],check=True)
        enginepath='SharedSupport/Runtime';winepath='bin/wine'
    subprocess.run(['/bin/cp','-c',str(a.package.resolve()),str(app/'Contents/Resources/Game.zip')],check=True)
    rosetta=(engine/'Contents/lib/wine/x86_64-unix').is_dir()
    engine_version='qa'
    if engine.suffix=='.app':
        metadata=plistlib.loads((engine/'Contents/Info.plist').read_bytes())
        engine_version=re.sub(r'[^A-Za-z0-9_.-]','_',str(metadata.get('CFBundleVersion','qa')))
    flavor=('wine-x86_64-' if rosetta else 'wine-arm64-')+engine_version
    minimum='26.4' if engine.suffix=='.app' and not rosetta else '15.0'
    info=dict(CFBundleIdentifier='games.docmorphic.rightrightright',CFBundleName='Right Right Right',CFBundleDisplayName='Right Right Right',CFBundleExecutable='RightRightRight',CFBundlePackageType='APPL',CFBundleShortVersionString='0.3.0',CFBundleVersion='5.2',LSMinimumSystemVersion=minimum,LSArchitecturePriority=['arm64'],NSHighResolutionCapable=True,LSApplicationCategoryType='public.app-category.racing-games',RRRContentVersion=version,RRRPayloadSHA256=sha(a.package),RRREnginePath=enginepath,RRRWinePath=winepath,RRRRuntimeFlavor=flavor,RRRGraphicsBackend='dxvk' if rosetta else '',RRRDisableSamplerLodBias=rosetta)
    with (app/'Contents/Info.plist').open('wb') as f:plistlib.dump(info,f)
    subprocess.run(['/usr/bin/xcrun','swiftc','-O','-swift-version','5','-target','arm64-apple-macosx15.0','-framework','AppKit','-framework','CryptoKit',str(ROOT/'macos/Launcher.swift'),'-o',str(app/'Contents/MacOS/RightRightRight')],check=True)
    identity=a.sign_identity or '-'
    sign=['/usr/bin/codesign','--force','--sign',identity]
    if a.sign_identity:sign+=['--options','runtime','--timestamp']
    subprocess.run(sign+[str(app)],check=True)
    subprocess.run(['/usr/bin/codesign','--verify','--strict',str(app)],check=True)
    readiness={'App':str(app),'ContentVersion':version,'ManifestFiles':count,'NativeUnityExport':False,'BundledRuntime':True,'CrossOverRequired':False,'RosettaRequired':rosetta,'MinimumMacOS':minimum,'DistributionSigned':bool(a.sign_identity),'Notarized':False,'GatekeeperReady':False,'GameplayVerified':False}
    if a.archive:
        archive=app.parent/(app.stem+'-macOS.zip')
        if archive.exists():raise ValueError('Archive exists; choose a fresh output.')
        subprocess.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(archive)],check=True)
        readiness['Archive']=str(archive);readiness['ArchiveSha256']=sha(archive)
    report=app.parent/(app.stem+'.build.json');report.write_text(json.dumps(readiness,indent=2)+'\n')
    print('MAC_BUNDLE_ASSEMBLED',json.dumps(readiness))
    print('This artifact is not distribution-ready until runtime/gameplay checks, Developer ID signing and notarization pass.')

if __name__=='__main__':
    try:main()
    except (ValueError,OSError,subprocess.CalledProcessError) as e:
        print('MAC_BUNDLE_FAILED: '+str(e),file=sys.stderr);sys.exit(1)
