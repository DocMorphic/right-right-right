import {assetUrl} from './asset-url.js';
import {ROAD_PHRASES,parseRoadCall} from '../shared/road-call-commands.js';

export function disposeVoiceModel(model){
  if(!model)return;
  // Pinned vosk-browser 0.0.8's graceful terminate dereferences an unloaded
  // model. Kill its Worker directly so cancelling a download also frees WASM.
  if(typeof model.worker?.terminate==='function')model.worker.terminate();else model.terminate();
}

export class RoadVoice {
  constructor({onCall=()=>{},onStatus=()=>{},onPartial=()=>{}}={}){this.onCall=onCall;this.onStatus=onStatus;this.onPartial=onPartial;this.token=0;this.active=false;this.enabled=false;this.starting=false;this.pending=0;}
  setActive(value){const before=this.active;this.active=Boolean(value);const capture=this.active&&this.enabled;if(this.node&&capture!==this.captureActive){this.captureActive=capture;this.node.port.postMessage({active:capture});}if(before&&!this.active&&this.enabled)this.recognizer?.retrieveFinalResult();}
  async start(){
    if(this.enabled||this.starting)return;const token=++this.token;this.starting=true;this.onStatus('loading','Preparing microphone…');
    try{
      if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Microphone needs HTTPS or localhost. Arrow keys still work.');
      this.context=new AudioContext({sampleRate:16000});await this.context.resume();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},video:false});
      if(token!==this.token){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.onStatus('loading','Loading voice · 39 MB on first use…');
      const library=await import('vosk-browser'),Vosk=library.default||library;if(token!==this.token)return;
      // createModel does not reject worker errors, so explicitly bound loading.
      const model=this.model=new Vosk.Model(new URL(assetUrl('/assets/voice/road-english-0.15.tar.gz'),location.href).href,-1);
      let loadTimer;await Promise.race([new Promise((resolve,reject)=>{model.on('load',event=>event.result?resolve():reject(Error('Voice model could not load. Use arrow keys; V retries.')));model.on('error',()=>reject(Error('Voice model unavailable. Use arrow keys; V retries.')));}),new Promise((_,reject)=>loadTimer=setTimeout(()=>reject(Error('Voice download timed out. Use arrow keys; V retries.')),90000))]).finally(()=>clearTimeout(loadTimer));
      if(token!==this.token){disposeVoiceModel(model);return;}
      const recognizer=this.recognizer=new model.KaldiRecognizer(this.context.sampleRate,JSON.stringify(ROAD_PHRASES));
      let warmed;const warm=new Promise(resolve=>warmed=resolve);
      recognizer.on('partialresult',event=>{if(token!==this.token)return;this.pending=Math.max(0,this.pending-1);warmed();if(this.enabled&&this.active)this.onPartial(event.result.partial||'');});
      recognizer.on('result',event=>{if(token!==this.token)return;this.pending=Math.max(0,this.pending-1);warmed();if(!this.enabled||!this.active)return;const text=event.result.text||'',call=parseRoadCall(text);if(call)this.onCall(call,text);else if(text)this.onPartial('Try a clear turn call');});
      model.on('error',()=>{if(token===this.token){this.stop();this.onStatus('error','Voice unavailable. Use arrow keys; V retries.');}});
      recognizer.acceptWaveformFloat(new Float32Array(this.context.sampleRate/4),this.context.sampleRate);
      let timer;await Promise.race([warm,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Voice warm-up timed out. Use arrow keys; V retries.')),15000))]).finally(()=>clearTimeout(timer));
      if(token!==this.token)return;
      await this.context.audioWorklet.addModule(new URL('./road-voice-worklet.js',import.meta.url));
      if(token!==this.token)return;
      const node=this.node=new AudioWorkletNode(this.context,'road-voice-capture',{processorOptions:{size:Math.round(this.context.sampleRate*.12)}}),source=this.source=this.context.createMediaStreamSource(stream),silent=this.silent=this.context.createGain();silent.gain.value=0;
      node.port.onmessage=event=>{if(token!==this.token||!this.active||!this.enabled)return;if(this.pending>16){this.stop();this.onStatus('error','Voice paused. Use arrow keys; V retries.');return;}this.pending++;recognizer.acceptWaveformFloat(event.data,this.context.sampleRate);};
      source.connect(node);node.connect(silent);silent.connect(this.context.destination);this.enabled=true;this.starting=false;this.setActive(this.active);this.onStatus('ready','MIC ON · V');
    }catch(error){if(token!==this.token)return;this.stop();this.onStatus('error',error.name==='NotAllowedError'?'Microphone blocked. Allow it in your browser, or use arrow keys.':error.message);}
  }
  stop(){++this.token;this.starting=false;this.enabled=false;this.pending=0;this.captureActive=false;this.node?.disconnect();this.source?.disconnect();this.silent?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());this.context?.close().catch(()=>{});disposeVoiceModel(this.model);this.node=this.source=this.silent=this.context=this.model=this.recognizer=this.stream=null;this.onStatus('off','MIC OFF · V');}
  toggle(){if(this.enabled||this.starting)this.stop();else this.start();}
}
