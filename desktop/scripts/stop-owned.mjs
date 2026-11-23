import path from 'node:path';
import os from 'node:os';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let record;try{record=JSON.parse(await readFile(path.join(os.homedir(),'Library/Application Support/RightRightRight Desktop/desktop.pid.json'),'utf8'));}catch{process.exit(0);}
if(!Number.isInteger(record.pid)||record.pid<2)process.exit(0);
if(![path.join(desktop,'out')+path.sep,path.join(desktop,'node_modules/electron')+path.sep].some(prefix=>record.execPath?.startsWith(prefix)))throw new Error('An installed copy is running. Close it before launching a development build.');
let command;try{command=execFileSync('/bin/ps',['-p',String(record.pid),'-ww','-o','command='],{encoding:'utf8'}).trim();}catch{process.exit(0);}
if(!command.startsWith(record.execPath))process.exit(0);
process.kill(record.pid,'SIGTERM');
for(let attempt=0;attempt<50;attempt++){try{process.kill(record.pid,0);}catch{process.exit(0);}await new Promise(resolve=>setTimeout(resolve,100));}
throw new Error('The previous development app did not exit.');
