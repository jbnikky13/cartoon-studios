let ttsPromise=null;

async function getTts(){
  if(!ttsPromise){
    ttsPromise=(async()=>{
      const mod=await import("https://esm.sh/kokoro-js@1.2.0");
      return mod.KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {dtype:"q8",device:"wasm"}
      );
    })();
  }
  return ttsPromise;
}

self.onmessage=async(event)=>{
  const data=event.data||{};
  if(data.type!=="generate") return;
  try{
    const tts=await getTts();
    const beats=Array.isArray(data.beats)?data.beats:[];
    const chunks=[];
    let sampleRate=24000;

    for(let i=0;i<beats.length;i++){
      const audio=await tts.generate(beats[i].text,{voice:beats[i].voice});
      sampleRate=audio.sampling_rate;
      const samples=audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
      chunks.push(samples);
      self.postMessage({type:"progress",value:Math.round(((i+1)/beats.length)*100)});
    }

    let total=0;
    for(const c of chunks) total+=c.length;
    const merged=new Float32Array(total);
    let offset=0;
    for(const c of chunks){ merged.set(c,offset); offset+=c.length; }

    self.postMessage({type:"done",samples:merged.buffer,sampleRate},[merged.buffer]);
  }catch(error){
    self.postMessage({type:"error",error:error instanceof Error?error.message:String(error)});
  }
};
