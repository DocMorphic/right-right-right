/** Package the exact local authority plus generated native courses for a Node
 * host. Native course data is intentionally absent from the Git checkout. */
import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(root,process.argv[2]||'../local/cloud-server');
await import('./export-spectator-ground.mjs');
const result=await build({absWorkingDir:root,entryPoints:['server/index.js'],bundle:true,platform:'node',format:'esm',target:'node22',external:['ws'],write:false,legalComments:'none'});
const bytes=result.outputFiles[0].contents,sha256=createHash('sha256').update(bytes).digest('hex'),filename=`rrr-server-${sha256.slice(0,16)}.mjs`;
await mkdir(output,{recursive:true});await writeFile(path.join(output,filename),bytes);
const licenses=await Promise.all(['@dimforge/rapier3d-compat','three'].map(async name=>name+'\n'+await readFile(path.join(root,'node_modules',name,'LICENSE'),'utf8')));
await writeFile(path.join(output,'THIRD-PARTY-NOTICES.txt'),licenses.join('\n\n'));

const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
await writeFile(path.join(output,'package.json'),JSON.stringify({name:'right-right-right-authority',private:true,type:'module',engines:{node:'>=22.13.0 <25'},scripts:{start:`node ${filename}`},dependencies:{ws:pkg.dependencies.ws}},null,2)+'\n');
const manifest={filename,sha256,bytes:bytes.length,source:'local server + generated native course data',transport:'websocket',health:'/health',frontendAssetsIncluded:false};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
