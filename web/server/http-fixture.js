/** Local integration fixture for the actual hosted HTTP Worker and SQLite storage. */
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from './worker.js';

export function createD1Adapter(sqlite){
  return {
    prepare(sql){return {values:[],bind(...values){this.values=values;return this;},async first(){return sqlite.prepare(sql).get(...this.values)||null;},async run(){const result=sqlite.prepare(sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)}};}};},
    async batch(queries){return Promise.all(queries.map(query=>query.run()));}
  };
}
export async function createHttpFixture({port=0,host='127.0.0.1',beforeRequest,afterResponse}={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile(new URL('../drizzle/0000_browser_rooms.sql',import.meta.url),'utf8'));
  const env={DB:createD1Adapter(sqlite),ASSETS:{fetch:()=>new Response('Fixture assets are not enabled.',{status:404})}},background=new Set();
  const server=http.createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks),url=`http://${req.headers.host}${req.url}`;
      let parsed;try{parsed=body.length?JSON.parse(body):null;}catch{}
      await beforeRequest?.({url,body:parsed,request:req});
      const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}: {})});
      const response=await worker.fetch(request,env,{waitUntil(promise){background.add(promise);promise.finally(()=>background.delete(promise));}});
      const bytes=await response.arrayBuffer();
      await afterResponse?.({url,body:parsed,response,bytes});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(bytes));
    }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({fixtureError:error.message}));}
  });
  await new Promise(resolve=>server.listen(port,host,resolve));
  return {server,sqlite,env,url:`http://${host}:${server.address().port}`,async close(){await new Promise(resolve=>server.close(resolve));await Promise.allSettled(background);sqlite.close();}};
}
