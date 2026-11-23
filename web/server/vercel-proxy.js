// Keep one authoritative room service when the frontend runs on Vercel.
// Function instances cannot safely share an in-memory multiplayer room map.
const legacyOrigin='https://right-right-right-play.andustry-0633.chatgpt.site';
const paths=new Set(['session','message','poll','health']);
export function createProxy(fetcher=fetch,{origin=process.env.GAME_SERVER_ORIGIN||legacyOrigin}={}){return async function proxy(req,res){
  const path=(req.url||'').split('?')[0].split('/').filter(Boolean).at(-1);
  res.setHeader('Cache-Control','no-store');
  if(path==='ws'){res.statusCode=426;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({transport:'http'}));return;}
  if(!paths.has(path)){res.statusCode=404;res.end('Not found');return;}
  const method=path==='health'?'GET':'POST';
  if(req.method!==method){res.statusCode=405;res.setHeader('Allow',method);res.end('Method not allowed');return;}
  try{
    let body;
    if(method==='POST'){
      if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      else {const parts=[];for await(const part of req)parts.push(part);body=Buffer.concat(parts).toString('utf8');}
      if(Buffer.byteLength(body)>16384){res.statusCode=413;res.end('Request too large');return;}
    }
    const response=await fetcher(origin+(path==='health'?'/health':`/api/${path}`),{method,headers:{'Content-Type':'application/json',Origin:origin},body,signal:AbortSignal.timeout(12000)});
    res.statusCode=response.status;res.setHeader('Content-Type','application/json');res.end(await response.text());
  }catch{res.statusCode=502;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'The multiplayer server could not be reached.'}));}
};}
