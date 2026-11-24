from pathlib import Path
import subprocess,wave,json
out=Path(__file__).resolve().parents[1]/'local/voice-road/samples';out.mkdir(parents=True,exist_ok=True)
samples=[]
for voice in ['Samantha','Aman']:
 for i,(phrase,expected) in enumerate([('right','right'),('sharp right','sharpRight'),('gentle left','gentleLeft'),('U turn right','uRight'),('hairpin left','uLeft'),('straight','straight'),('the door is open',None),("don't turn right",None),('not left',None),('right door',None)]):
  stem=f'{voice.lower()}-{i}';aiff=out/(stem+'.aiff');wav=out/(stem+'.wav')
  if wav.exists():
   samples.append({'url':'/samples/'+stem+'.wav','phrase':phrase,'expected':expected,'voice':voice});continue
  subprocess.run(['say','-v',voice,'-r','150','-o',str(aiff),phrase],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(['afconvert','-f','WAVE','-d','LEI16@16000',str(aiff),str(wav)],check=True)
  with wave.open(str(wav),'rb') as f:params=f.getparams();data=f.readframes(f.getnframes())
  with wave.open(str(wav),'wb') as f:f.setparams(params);f.writeframes(b'\0'*16000+data+b'\0'*64000)
  samples.append({'url':'/samples/'+stem+'.wav','phrase':phrase,'expected':expected,'voice':voice})
(out/'samples.json').write_text(json.dumps(samples))
print('Generated',len(samples),'speech samples for offline recognition QA')
