import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=path.join(os.homedir(),'Library/Application Support/RightRightRight Desktop'),since=Number(process.argv[2])||Date.now()-10000;
for(let attempt=0;attempt<100;attempt++){
 try{
  const pid=JSON.parse(await readFile(path.join(root,'desktop.pid.json'),'utf8'));process.kill(pid.pid,0);
  const records=(await readFile(path.join(root,'desktop.log'),'utf8')).trim().split('\n').map(line=>JSON.parse(line)).filter(record=>Date.parse(record.at)>=since);
  const failure=records.find(record=>['startup-error','renderer-gone','load-failed'].includes(record.event));if(failure)throw new Error(JSON.stringify(failure));
  if(records.some(record=>record.event==='game-page-loaded')){console.log(JSON.stringify({pid:pid.pid,launchServicesPageLoaded:true,visualGameplayVerified:false}));process.exit(0);}
 }catch(error){if(error.message?.includes('startup-error')||error.message?.includes('renderer-gone')||error.message?.includes('load-failed'))throw error;}
 await new Promise(resolve=>setTimeout(resolve,100));
}
throw new Error('App process/page startup was not observed. Inspect desktop.log.');
