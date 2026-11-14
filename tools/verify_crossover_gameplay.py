"""Run scripted native gameplay checks through live Unity Relay on CrossOver.

Uses isolated copies of a verified Windows package. This is a same-Mac,
headless integration test; it does not test manual controls or separate PCs.
"""
import argparse,json,re,subprocess,time
from pathlib import Path

repo=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser()
p.add_argument('--players',type=int,choices=[2,4],default=2)
p.add_argument('--flow',action='store_true')
p.add_argument('--base-player',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--bottle',default='RightRightRight')
a=p.parse_args()
root=a.output.resolve();root.mkdir(parents=True,exist_ok=False)
base=a.base_player.resolve()
wine='/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
config=json.loads((base/'rrr-distribution.json').read_text())
assert config['State']=='direct'
from verify_portable import verify
verify(base)
bottle=Path.home()/'Library/Application Support/CrossOver/Bottles'/a.bottle
drives=[(d.name[0].upper()+':',d.resolve()) for d in (bottle/'dosdevices').iterdir() if re.fullmatch('[A-Za-z]:',d.name) and d.is_symlink()]
drives.sort(key=lambda pair:len(pair[1].parts),reverse=True)
runs=[]
codefile=root/'room-code.txt'
def win(path):
    path=Path(path).resolve()
    for letter,target in drives:
        if path.is_relative_to(target):
            return letter+'\\'+str(path.relative_to(target)).replace('/','\\')
    raise ValueError('No bottle drive maps this path: '+str(path))
def launch(name,code=None):
    folder=root/name
    subprocess.run(['/bin/cp','-cR',str(base),str(folder)],check=True)
    flags=['-batchmode','-nographics','--melonloader.hideconsole','--melonloader.disablestartscreen','--melonloader.agfoffline','-logFile',win(root/(name+'-unity.log')),'--rrr-relay-verify']
    flags+=['--rrr-direct-flow'] if a.flow else ['--rrr-race-verify']
    if a.flow and a.players==2:flags+=['--rrr-mode-switch-verify']
    if name=='host':flags+=['--rrr-direct-host','--rrr-players='+str(a.players),'--rrr-relay-code-file='+win(codefile)]
    else:flags+=['--rrr-room='+code]
    log=(root/(name+'-wine.log')).open('wb')
    proc=subprocess.Popen([wine,'--bottle',a.bottle,'--debugmsg','-all','--dll','version=n,b','--workdir',str(folder),'--wait-children',str(folder/'GameRuntime.exe'),*flags],stdout=log,stderr=subprocess.STDOUT)
    runs.append((name,folder,proc,log))
    print('STARTED',name,'pid',proc.pid,flush=True)
try:
    launch('host')
    deadline=time.monotonic()+100
    while not codefile.exists():
        if runs[0][2].poll() is not None:raise RuntimeError('Host exited before creating a room')
        loader=runs[0][1]/'MelonLoader/Latest.log'
        if loader.exists() and 'RELAY_CONNECT_FAILED' in loader.read_text(errors='replace'):raise RuntimeError('Host could not connect to Relay')
        if time.monotonic()>deadline:raise RuntimeError('Timed out creating Relay room')
        time.sleep(.25)
    code=codefile.read_text().strip()
    assert re.fullmatch('[A-Z0-9]{6,12}',code)
    print('ROOM_READY, launching guests',flush=True)
    for i in range(1,a.players):launch('client'+str(i),code)
    deadline=time.monotonic()+230
    while any(proc.poll() is None for _,_,proc,_ in runs):
        if time.monotonic()>deadline:raise RuntimeError('Timed out waiting for gameplay verification')
        if any(proc.poll() not in [None,0] for _,_,proc,_ in runs):raise RuntimeError('A game process failed')
        time.sleep(.5)
    results=[]
    filename='direct-flow.json' if a.flow else 'race-verification.json'
    for name,folder,proc,_ in runs:
        assert proc.returncode==0,(name,proc.returncode)
        loader=(folder/'MelonLoader/Latest.log').read_text(errors='replace')
        result=json.loads((folder/'UserData/RightRightRight'/filename).read_text())
        assert result['Pass'],(name,result)
        assert ('DIRECT_FLOW_PASS' if a.flow else 'RACE_VERIFY_PASS client=') in loader
        assert 'RELAY_CONNECTED' in loader
        assert re.search('RELAY_CONNECTED host=(True|False) secure=True',loader)
        results.append(dict(Process=name,**result))
    report=dict(Pass=True,Version=config['ContentVersion'],Players=a.players,Flow=a.flow,Host='Apple Silicon macOS with CrossOver',LiveUnityRelay=True,Dtls=True,SeparateComputers=False,ScriptedTest=True,Results=results)
    (root/'results.json').write_text(json.dumps(report,indent=2)+'\n')
    print('CROSSOVER_GAMEPLAY_PASS',json.dumps(report),flush=True)
except Exception as ex:
    print('CROSSOVER_GAMEPLAY_FAILED',str(ex),flush=True)
    (root/'failure.json').write_text(json.dumps(dict(Pass=False,Error=str(ex)))+'\n')
    raise
finally:
    for name,folder,proc,log in runs:
        # Only terminate the exact native game executable inside this test copy.
        listing=subprocess.check_output(['ps','-Ao','pid,command'],text=True)
        expected=win(folder/'GameRuntime.exe').rstrip('\\')
        for line in listing.splitlines():
            parts=line.strip().split(maxsplit=1)
            if len(parts)==2 and parts[1].startswith(expected+' '):
                subprocess.run(['kill','-TERM',parts[0]],check=False)
        if proc.poll() is None:
            proc.terminate()
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:proc.kill()
        log.close()
