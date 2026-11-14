"""Join a developer's existing room with the real native Windows player."""
import argparse,json,os,re,subprocess,sys,time
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--player',type=Path,required=True)
p.add_argument('--report',type=Path,required=True)
p.add_argument('--flow',action='store_true')
p.add_argument('--timeout',type=int,default=300)
a=p.parse_args()
if sys.platform!='win32':raise SystemExit('This peer check must run on native Windows.')
code=os.environ.get('RRR_TEST_ROOM','').strip().upper()
if not re.fullmatch('[A-Z0-9]{6,12}',code):raise SystemExit('Missing valid RRR_TEST_ROOM environment value.')
root=a.player.resolve();out=a.report.resolve();out.parent.mkdir(parents=True,exist_ok=True)
filename='direct-flow.json' if a.flow else 'race-verification.json'
flags=['-batchmode','-nographics','--melonloader.hideconsole','--melonloader.disablestartscreen','--melonloader.agfoffline','--rrr-relay-verify','--rrr-room='+code,'-logFile',str(out.parent/'native-unity.log')]
flags+=['--rrr-direct-flow','--rrr-mode-switch-verify'] if a.flow else ['--rrr-race-verify']
with (out.parent/'native-stdout.log').open('wb') as log:
 proc=subprocess.Popen([str(root/'GameRuntime.exe'),*flags],cwd=root,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
 try:
  status=proc.wait(timeout=a.timeout)
  result=json.loads((root/'UserData/RightRightRight'/filename).read_text())
  loader=(root/'MelonLoader/Latest.log').read_text(errors='replace')
  success=status==0 and result.get('Pass') and 'RELAY_CONNECTED host=False secure=True' in loader
  report=dict(Pass=bool(success),PeerOS='native Windows',LiveUnityRelay=True,Dtls='RELAY_CONNECTED host=False secure=True' in loader,Game=result,ExitCode=status)
  out.write_text(json.dumps(report,indent=2)+'\n')
  print('NATIVE_WINDOWS_PEER_'+('PASS' if success else 'FAILED'))
  if not success:raise SystemExit(1)
 except Exception as error:
  out.write_text(json.dumps(dict(Pass=False,PeerOS='native Windows',Error=str(error)))+'\n')
  raise
 finally:
  if proc.poll() is None:proc.terminate();proc.wait(timeout=10)
