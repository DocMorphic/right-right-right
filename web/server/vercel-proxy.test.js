import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxy} from './vercel-proxy.js';
const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}});
test('Vercel forwards room requests to the fixed authority with matching origin and no caching',async()=>{
 let call;const handler=createProxy(async(url,options)=>{call={url,options};return new Response('{"messages":[]}',{status:200});}),res=response();
 await handler({url:'/api/message',method:'POST',body:{id:'seat',message:{type:'input'}}},res);
 assert.equal(call.url,'https://right-right-right-play.andustry-0633.chatgpt.site/api/message');assert.equal(call.options.headers.Origin,'https://right-right-right-play.andustry-0633.chatgpt.site');assert.equal(JSON.parse(call.options.body).id,'seat');assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('Vercel proxy rejects unknown routes, wrong methods and oversized game packets',async()=>{
 const handler=createProxy(()=>{throw Error('Unexpected upstream request');});
 for(const [url,method,body,status] of [['/api/elsewhere','POST',{},404],['/api/message','GET',{},405],['/api/message','POST','x'.repeat(16385),413],['/api/ws','GET',undefined,426]]){const res=response();await handler({url,method,body},res);assert.equal(res.statusCode,status);}
});
