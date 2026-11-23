import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {packager} from '@electron/packager';
import {extractNativeIcon} from './native-icon.mjs';

const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(desktop),stage=path.join(desktop,'.stage/app'),out=path.join(desktop,'out');
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const client=path.resolve(option('--client')||path.join(repo,'web/dist/client'));
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('This build targets Apple Silicon macOS only.');
await stat(path.join(client,'index.html'));await stat(path.join(client,'assets/manifest.json'));
let icon,iconSource;const iconExe=option('--icon-exe')||path.join(repo,'local/builds/RightRightRight-0.3.0-alpha.5/player/GameRuntime.exe');
const packageInfo=JSON.parse(await readFile(path.join(desktop,'package.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(directory,prefix=''){
 const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const relative=path.join(prefix,entry.name);if(entry.isDirectory())result.push(...await files(path.join(directory,entry.name),relative));else if(entry.isFile())result.push(relative);}return result.sort();
}
await rm(path.dirname(stage),{recursive:true,force:true});await mkdir(stage,{recursive:true});
for(const filename of ['main.cjs','runtime-entry.mjs','runtime-server.mjs','config.mjs','config-preload.cjs','settings.html','settings.js'])await cp(path.join(desktop,'src',filename),path.join(stage,filename));
await cp(client,path.join(stage,'client'),{recursive:true});
try{await stat(iconExe);icon=path.join(desktop,'.stage/native-icon.icns');iconSource=await extractNativeIcon(iconExe,icon);}catch(error){if(option('--icon-exe'))throw error;icon=undefined;iconSource={available:false,note:'Original runtime icon is unavailable; framework placeholder is used for this QA build.'};}
// Discover the unchanged backend's actual dependency graph; do not bundle its CLI
// entrypoint, whose import.meta.url standalone guard must retain normal semantics.
const graph=await build({absWorkingDir:repo,entryPoints:['web/server/index.js'],bundle:true,write:false,platform:'node',format:'esm',packages:'external',metafile:true,logLevel:'silent'});
const sourceFiles={};
for(const filename of Object.keys(graph.metafile.inputs)){
 if(!filename.startsWith('web/server/')&&!filename.startsWith('web/shared/'))throw new Error(`Unexpected server dependency: ${filename}`);
 const bytes=await readFile(path.join(repo,filename));sourceFiles[filename]=sha(bytes);
 await mkdir(path.dirname(path.join(stage,'game',filename)),{recursive:true});await writeFile(path.join(stage,'game',filename),bytes);
}
await writeFile(path.join(stage,'package.json'),JSON.stringify({name:packageInfo.name,productName:packageInfo.productName,version:packageInfo.version,main:'main.cjs',type:'module',license:'MIT',dependencies:packageInfo.dependencies},null,2));
await cp(path.join(desktop,'node_modules/ws'),path.join(stage,'node_modules/ws'),{recursive:true});
await cp(path.join(repo,'LICENSE'),path.join(stage,'LICENSE'));
const clientFiles={};for(const filename of await files(client)){
 const original=await readFile(path.join(client,filename)),copy=await readFile(path.join(stage,'client',filename));
 if(filename.endsWith('.js')&&original.includes(Buffer.from('.trycloudflare.com')))throw new Error('The prepared client embeds a temporary tunnel endpoint; use a same-origin client build.');
 if(!original.equals(copy))throw new Error(`Payload changed: ${filename}`);clientFiles[filename.split(path.sep).join('/')]=sha(original);
}
const manifest={product:'Right Right Right',architecture:'arm64',runtime:'Electron',electron:packageInfo.devDependencies.electron,
 iconSource,builtAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),clientSourceCommit:option('--client-ref')||null,sourceFiles,clientFiles,
 clientByteIdentical:true,windowsGameBinariesIncluded:false,developerIdSigned:false,notarized:false,gatekeeperReady:false,
 networking:'Local built-in WebSocket host; same-host room codes; optional configured WebSocket proxy. No hardcoded public host.',
 parity:'Uses current browser adaptation; does not establish original Unity suspension or hand-animation parity.'};
await writeFile(path.join(stage,'build-manifest.json'),JSON.stringify(manifest,null,2));
if(args.includes('--stage-only')){console.log(`Staged unchanged game payload: ${stage}`);process.exit(0);}
await mkdir(out,{recursive:true});
const appPaths=await packager({dir:stage,out,platform:'darwin',arch:'arm64',name:'Right Right Right',appBundleId:'dev.docmorphic.rightrightright.desktop',appVersion:'0.3.0',buildVersion:'0.3.0',electronVersion:packageInfo.devDependencies.electron,asar:true,prune:true,overwrite:true,
 icon,darwinDarkModeSupport:true,extendInfo:{LSMinimumSystemVersion:'13.0',NSHighResolutionCapable:true,NSLocalNetworkUsageDescription:'Host and join Right Right Right rooms on your local network.'}});
const appPath=appPaths[0]+'/Right Right Right.app';
const notices=path.join(appPath,'Contents/Resources/licenses');await mkdir(notices,{recursive:true});
for(const name of ['LICENSE','LICENSES.chromium.html'])await cp(path.join(appPaths[0],name),path.join(notices,name==='LICENSE'?'Electron-LICENSE.txt':name));
await cp(path.join(repo,'LICENSE'),path.join(notices,'Game-code-LICENSE.txt'));await cp(path.join(client,'assets/CREDITS.txt'),path.join(notices,'Original-assets-CREDITS.txt'));
// This is a local QA signature, not a Developer ID distribution signature.
execFileSync('/usr/bin/codesign',['--force','--deep','--sign','-',appPath],{stdio:'inherit'});
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',appPath],{stdio:'inherit'});
const imageRoot=path.join(out,'dmg-root');await rm(imageRoot,{recursive:true,force:true});await mkdir(imageRoot,{recursive:true});
await cp(appPath,path.join(imageRoot,'Right Right Right.app'),{recursive:true});
execFileSync('/bin/ln',['-s','/Applications',path.join(imageRoot,'Applications')]);
await writeFile(path.join(imageRoot,'READ ME.txt'),'Right Right Right · Apple Silicon QA build\n\nDrag the app to Applications. No Node, Steam, CrossOver or CLI is required.\n\nThis build is ad-hoc signed, not Developer ID signed or notarized. It is not yet a public release. Downloaded builds may be blocked by Gatekeeper.\n\nBoth Macs must select the SAME host using Network → Connection Settings, then share the normal game room code. Hosting uses this Mac and an available port; copy its link from Network → Copy Host Link. Network isolation and internet connectivity still apply.\n');
const dmg=path.join(out,`RightRightRight-AppleSilicon-QA-${packageInfo.version}.dmg`);await rm(dmg,{force:true});
execFileSync('/usr/bin/hdiutil',['create','-volname','Right Right Right','-srcfolder',imageRoot,'-format','UDZO',dmg],{stdio:'inherit'});
await writeFile(path.join(out,'build-report.json'),JSON.stringify({...manifest,appPath,dmg,dmgSha256:sha(await readFile(dmg))},null,2));
console.log(JSON.stringify({appPath,dmg,report:path.join(out,'build-report.json')},null,2));
