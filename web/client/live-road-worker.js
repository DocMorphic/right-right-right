import {compileLiveRoad} from './live-road-buffers.js';
self.onmessage=event=>{try{const result=compileLiveRoad(event.data);self.postMessage(result,[result.positions.buffer,result.uvs.buffer,...result.forest.map(a=>a.buffer)]);}catch(error){self.postMessage({revision:event.data.revision,error:error.message});}};
