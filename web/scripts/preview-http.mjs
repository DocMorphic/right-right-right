/** Local browser preview using the production Worker HTTP transport and real SQLite. */
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHttpFixture} from '../server/http-fixture.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/client');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.ttf':'font/ttf'};
const fixture=await createHttpFixture({port:Number(process.env.PORT)||8794});
fixture.env.ASSETS={async fetch(request){
  const pathname=decodeURIComponent(new URL(request.url).pathname),file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep))return new Response('Not found',{status:404});
  let target=file;try{if((await stat(target)).isDirectory())target=path.join(target,'index.html');const body=await readFile(target);return new Response(body,{headers:{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'}});}catch{return new Response('Not found. Run npm run build first.',{status:404});}
}};
console.log(`Right Right Right · real HTTP Worker preview: ${fixture.url}/?transport=http`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await fixture.close();process.exit(0);});
