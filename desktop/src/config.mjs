import os from 'node:os';

export function normalizeServerAddress(value){
  const text=String(value??'').trim();if(!text)return null;
  const url=new URL(text.includes('://')?text:`http://${text}`);
  if(!['http:','https:','ws:','wss:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Enter an HTTP or WebSocket host address without credentials.');
  if(!['/','/ws',''].includes(url.pathname))throw new Error('Use the host address, without an application path.');
  url.pathname='/ws';url.search='';url.hash='';
  if(url.protocol==='http:')url.protocol='ws:';if(url.protocol==='https:')url.protocol='wss:';
  return url.href;
}
export function hostLinks(port,interfaces=os.networkInterfaces()){
  return Object.entries(interfaces).sort(([a],[b])=>a==='en0'?-1:b==='en0'?1:a.localeCompare(b))
    .flatMap(([,addresses])=>addresses||[]).filter(address=>address.family==='IPv4'&&!address.internal&&!address.address.startsWith('169.254.'))
    .map(address=>`http://${address.address}:${port}`);
}
export function browserAddress(serverAddress){const url=new URL(serverAddress);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/';return url.origin;}
