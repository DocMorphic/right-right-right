import {build} from 'vite';
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(web);
const args=process.argv.slice(2),serverFlag=args.indexOf('--server');
if(serverFlag<0||!args[serverFlag+1]||args.some((arg,index)=>index!==serverFlag&&index!==serverFlag+1))throw new Error('Usage: node scripts/build-itch.mjs --server https://YOUR-MULTIPLAYER-HOST');
const server=new URL(args[serverFlag+1]);
if(!['https:','http:'].includes(server.protocol)||server.username||server.password||server.search||server.hash||server.pathname!=='/')throw new Error('--server must be an HTTP(S) origin without credentials, path, query or fragment.');
if(server.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(server.hostname))throw new Error('An itch upload requires an HTTPS multiplayer server.');
const output=path.join(repo,'local/itch-build'),archive=path.join(repo,'local/Right-Right-Right-HTML5.zip');
await stat(path.join(web,'public/assets/manifest.json')).catch(()=>{throw new Error('Export the authorized original assets to web/public/assets first.');});
await build({root:web,configFile:path.join(web,'vite.config.js'),base:'./',define:{'import.meta.env.VITE_GAME_SERVER':JSON.stringify(server.origin)},build:{outDir:output,emptyOutDir:true,sourcemap:false}});
await cp(path.join(repo,'LICENSE'),path.join(output,'LICENSE.txt'));
const temporary=server.hostname.endsWith('.trycloudflare.com');
await writeFile(path.join(output,'README-ITCH.txt'),`RIGHT RIGHT RIGHT — HTML5 browser package\n\nUpload Right-Right-Right-HTML5.zip as an HTML game on itch.io.\nChoose "This file will be played in the browser" and click-to-launch fullscreen.\nKeyboard and mouse required. Open the same uploaded game on both computers,\nhost a browser room, share its code, then both players press R when ready.\n\nMultiplayer server: ${server.origin}\n${temporary?'TEMPORARY QA TUNNEL: The host Mac must stay awake with the game server and\nCloudflare tunnel running. This URL can expire or change. This upload is not\na permanent or independently hosted multiplayer service.\n':'The multiplayer service runs separately from the HTML files hosted by itch.io.\nIts operator must keep the server available.\n'}\nBrowser rooms are separate from the downloadable Windows/Mac game rooms.\nOriginal game/assets: Stellux Interactive, under developer permission stated\nby the project owner. Original content is excluded from the source MIT license.\nKeep assets/CREDITS.txt and the original font notices with this package.\n\nThe web backend is not included in this static ZIP. If secure WebSocket access\nto the configured server is unavailable, this upload cannot host/join rooms.\n`);
async function filesAt(root,sub=''){
 const result=[];
 for(const entry of await readdir(path.join(root,sub),{withFileTypes:true})){
  const name=path.posix.join(sub,entry.name);
  if(entry.name.startsWith('.')){await rm(path.join(root,name),{recursive:true,force:true});continue;}
  if(entry.isDirectory())result.push(...await filesAt(root,name));
  else if(entry.isFile())result.push({name,size:(await stat(path.join(root,name))).size});
  else throw new Error(`Unsupported archive entry: ${name}`);
 }
 return result;
}
const files=await filesAt(output),total=files.reduce((sum,file)=>sum+file.size,0),largest=files.reduce((a,b)=>a.size>b.size?a:b);
if(files.length>1000||total>500_000_000||largest.size>200_000_000||files.some(file=>file.name.length>240))throw new Error('Build exceeds itch HTML5 extraction limits.');
if(files.some(file=>/\.(exe|dll|dylib|pdb|map)$/i.test(file.name)||/(^|\/)node_modules\//.test(file.name)))throw new Error('Unexpected native/development files in HTML5 build.');
const names=new Set(files.map(file=>file.name)),references=new Set();
function collect(value){if(typeof value==='string'&&value.startsWith('/assets/'))references.add(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
for(const file of files.filter(file=>file.name.endsWith('.json')))collect(JSON.parse(await readFile(path.join(output,file.name),'utf8')));
for(const reference of references)if(!names.has(decodeURIComponent(reference.slice(1).split(/[?#]/)[0])))throw new Error(`Missing exported asset: ${reference}`);
// Exercise actual HTTP paths under an itch-style nested mount, not just file://.
const prefix='/uploads/qa-1234/';
const http=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith(prefix))throw new Error('Outside game mount');
  const name=pathname.slice(prefix.length)||'index.html';
  if(!names.has(name))throw new Error('Missing file');
  res.end(await readFile(path.join(output,name)));
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
let checked=0;
try{
 const base=`http://127.0.0.1:${http.address().port}${prefix}`,html=await(await fetch(base+'index.html')).text();
 const resources=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>new URL(match[1],base));
 for(const file of files.filter(file=>file.name.endsWith('.css'))){const css=await readFile(path.join(output,file.name),'utf8');for(const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))if(!match[1].startsWith('data:'))resources.push(new URL(match[1],base+file.name));}
 const {assetUrl}=await import('../client/asset-url.js');
 for(const reference of references)resources.push(new URL(assetUrl(reference,base+'index.html')));
 for(const url of resources){if(!url.href.startsWith(base))throw new Error(`Asset escapes the nested game directory: ${url}`);const response=await fetch(url);if(!response.ok)throw new Error(`Nested asset HTTP ${response.status}: ${url}`);await response.arrayBuffer();checked++;}
}finally{await new Promise(resolve=>http.close(resolve));}
await mkdir(path.dirname(archive),{recursive:true});await rm(archive,{force:true});
const zip=spawnSync('/usr/bin/zip',['-q','-r','-9',archive,'.'],{cwd:output,encoding:'utf8'});if(zip.status!==0)throw new Error(zip.stderr||'ZIP failed.');
const verify=spawnSync('/usr/bin/unzip',['-t',archive],{encoding:'utf8'});if(verify.status!==0)throw new Error(verify.stdout||verify.stderr||'ZIP verification failed.');
const report={server:server.origin,temporaryTunnel:temporary,output,archive,fileCount:files.length,extractedBytes:total,archiveBytes:(await stat(archive)).size,largestFile:largest,nestedHttpChecks:checked,assetReferences:references.size,sha256:createHash('sha256').update(await readFile(archive)).digest('hex')};
await writeFile(path.join(repo,'local/itch-build-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
