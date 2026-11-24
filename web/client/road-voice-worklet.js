/** Capture only. Recognition runs in a separate WASM worker. */
class RoadVoiceCapture extends AudioWorkletProcessor {
  constructor(options){super();this.size=options.processorOptions?.size||1920;this.buffer=new Float32Array(this.size);this.offset=0;this.active=false;this.port.onmessage=event=>{this.active=event.data.active===true;this.offset=0;};}
  process(inputs){
    const data=inputs[0]?.[0];if(!this.active||!data)return true;
    for(let i=0;i<data.length;i++){this.buffer[this.offset++]=data[i];if(this.offset===this.size){this.port.postMessage(this.buffer,[this.buffer.buffer]);this.buffer=new Float32Array(this.size);this.offset=0;}}
    return true;
  }
}
registerProcessor('road-voice-capture',RoadVoiceCapture);
