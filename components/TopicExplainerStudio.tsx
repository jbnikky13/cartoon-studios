"use client";

import {useState} from "react";
import ExplainerMp4Exporter from "./ExplainerMp4Exporter";
type Beat={narration:string;imagePrompt:string};
type Timing={index:number;narration:string;start:number;end:number;duration:number};
type Character={id:string;name:string;role:string;appearance:string;outfit:string;palette:string;personality:string};
type KokoroVoice="af_heart"|"af_bella"|"af_nicole"|"af_sarah"|"am_michael"|"am_liam"|"am_adam"|"am_puck";

export default function TopicExplainerStudio(){
  const [topic,setTopic]=useState("");
  const [researchLinks,setResearchLinks]=useState("");
  const [researchPacket,setResearchPacket]=useState<{title:string;url:string;domain:string;sourceType:string}[]>([]);
  const [beats,setBeats]=useState<Beat[]>([]);
  const [sources,setSources]=useState<{title:string;domain:string;url:string}[]>([]);
  const [timings,setTimings]=useState<Timing[]>([]);
  const [loading,setLoading]=useState(false);
  const [ttsLoading,setTtsLoading]=useState(false);
  const [error,setError]=useState("");
  const [provider,setProvider]=useState("");
  const [images,setImages]=useState<{sceneIndex:number;image:string|null;status:string}[]>([]);
  const [imageLoading,setImageLoading]=useState(false);
  const [audioUrl,setAudioUrl]=useState<string|null>(null);
  const [words,setWords]=useState<{text:string;start:number;end:number}[]>([]);
  const [captions,setCaptions]=useState<{text:string;start:number;end:number}[]>([]);
  const [characterBible,setCharacterBible]=useState<{style:string;characters:Character[];continuityRules:string[]}>({style:"gold-linework watercolor editorial illustration, muted palette, cinematic 2D composition",characters:[],continuityRules:[]});
  const [characterLoading,setCharacterLoading]=useState(false);
  const [voiceMode,setVoiceMode]=useState<"female"|"male"|"mixed">("female");
  const [femaleVoice,setFemaleVoice]=useState<KokoroVoice>("af_heart");
  const [maleVoice,setMaleVoice]=useState<KokoroVoice>("am_michael");
  const [ttsProgress,setTtsProgress]=useState(0);

  async function research(){
    if(!topic.trim()) return;
    setError("");setLoading(true);setBeats([]);setTimings([]);setImages([]);setAudioUrl(null);
    try{
      const r=await fetch("/api/explainer/topic",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,beatCount:10,urls:researchLinks.split(/\s+/).map(s=>s.trim()).filter(Boolean)})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Topic research failed.");
      setBeats(j.beats||[]);setSources(j.sources||[]);setProvider(j.provider||"");
      setCharacterLoading(true);
      try{const cr=await fetch("/api/explainer/characters",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,script:(j.beats||[]).map((b:Beat)=>b.narration)})});const cj=await cr.json();if(cr.ok)setCharacterBible(cj);}catch(e){setError(e instanceof Error?e.message:"Character planning failed.");}finally{setCharacterLoading(false);}
    }catch(e){setError(e instanceof Error?e.message:"Topic research failed.");}
    finally{setLoading(false);}
  }

  function wavBlob(samples:Float32Array,sampleRate:number){
    const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
    const write=(o:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
    write(0,"RIFF");view.setUint32(4,36+samples.length*2,true);write(8,"WAVE");write(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,s<0?s*0x8000:s*0x7fff,true);}
    return new Blob([buffer],{type:"audio/wav"});
  }
  async function generateNarration(){
    if(!beats.length||ttsLoading)return;
    setError("");setTtsLoading(true);setTtsProgress(0);
    let worker:Worker|null=null;
    try{
      // Run Kokoro in a dedicated worker. This keeps WASM/model failures from
      // taking down the React page and keeps the main thread responsive.
      if(typeof Worker==="undefined") throw new Error("Your browser does not support narration workers.");
      worker=new Worker("/kokoro-worker.js",{type:"module"});
      const selectedVoices=beats.map((b,i)=>({
        text:b.narration,
        voice:voiceMode==="female"?femaleVoice:voiceMode==="male"?maleVoice:(i%2===0?femaleVoice:maleVoice)
      }));
      const result=await new Promise<{samples:ArrayBuffer;sampleRate:number}>((resolve,reject)=>{
        if(!worker)return reject(new Error("Narration worker failed to start."));
        const timeout=window.setTimeout(()=>reject(new Error("Free narration timed out. Try again with fewer or shorter scenes.")),8*60*1000);
        worker.onmessage=(event)=>{
          const data=event.data||{};
          if(data.type==="progress") setTtsProgress(Number(data.value)||0);
          if(data.type==="done"){window.clearTimeout(timeout);resolve({samples:data.samples,sampleRate:data.sampleRate});}
          if(data.type==="error"){window.clearTimeout(timeout);reject(new Error(data.error||"Kokoro narration failed."));}
        };
        worker.onerror=()=>{window.clearTimeout(timeout);reject(new Error("Free narration worker stopped unexpectedly. Your browser may have run out of memory; try generating a shorter script."));};
        worker.postMessage({type:"generate",beats:selectedVoices});
      });
      const merged=new Float32Array(result.samples);
      const url=URL.createObjectURL(wavBlob(merged,result.sampleRate));
      setAudioUrl(previous=>{if(previous)URL.revokeObjectURL(previous);return url;});
      const newTimings:Timing[]=[];let cursor=0;
      for(let i=0;i<beats.length;i++){
        const wordCount=beats[i].narration.trim().split(/\\s+/).filter(Boolean).length;
        const duration=Math.max(2.2,wordCount/2.35);
        newTimings.push({index:i,narration:beats[i].narration,start:Number(cursor.toFixed(2)),end:Number((cursor+duration).toFixed(2)),duration:Number(duration.toFixed(2))});
        cursor+=duration;
      }
      setTimings(newTimings);
      setProvider("Kokoro local · "+voiceMode);
      try{
        const cr=await fetch("/api/explainer/captions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({script:beats.map(b=>b.narration),durations:newTimings.map(x=>x.duration)})});
        const cj=await cr.json();
        if(cr.ok){setWords(cj.words||[]);setCaptions(cj.captions||[]);}
      }catch{}
    }catch(e){
      setError(e instanceof Error?e.message:"Free narration failed. No page reload is required; try again with a shorter script.");
    }finally{
      worker?.terminate();
      setTtsLoading(false);
      setTtsProgress(0);
    }
  }
  async function generateImages(){
    if(!beats.length)return;
    setError("");setImageLoading(true);
    try{
      const r=await fetch("/api/explainer/images",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,scenes:beats.map((b,i)=>({index:i,narration:b.narration,imagePrompt:b.imagePrompt})),characterBible})});
      const j=await r.json();
      if(!r.ok)throw new Error(j.error||"Image generation failed.");
      setImages(j.scenes||[]);setProvider(j.provider||"");
    }catch(e){setError(e instanceof Error?e.message:"Image generation failed.");}
    finally{setImageLoading(false);}
  }

  return <section className="card" style={{marginTop:22}}>
    <div className="eyebrow">Topic Explainer · Research → Script → Narration</div>
    <h2>Turn a topic into a researched explainer</h2>
    <p className="muted">Researches multiple sources, writes short narration beats with matching visual prompts, then calculates narration timing.</p>
    <div className="grid">
      <div>
        <label className="label">Topic</label>
        <textarea className="input" rows={4} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. How does Bitcoin mining work?"/>
        <textarea className="input" rows={3} value={researchLinks} onChange={e=>setResearchLinks(e.target.value)} placeholder="Optional source links (one URL per line)"/><button className="primary" onClick={research} disabled={loading||!topic.trim()}>{loading?"Researching…":"🔎 Research & write script"}</button>
      </div>
      <div>
        {provider&&<p className="muted">Pipeline: {provider}</p>}
        {sources.length>0&&<><h3>Sources</h3>{sources.map((s)=><div className="scene" key={s.url}><b>{s.title}</b><div className="muted">{s.domain}</div></div>)}</>}
      </div>
    </div>
    {beats.length>0&&<div style={{marginTop:20}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <select className="input" value={voiceMode} onChange={e=>setVoiceMode(e.target.value as "female"|"male"|"mixed")}><option value="female">Female narrator</option><option value="male">Male narrator</option><option value="mixed">Mixed voices</option></select>
        <select className="input" value={femaleVoice} onChange={e=>setFemaleVoice(e.target.value as KokoroVoice)}><option value="af_heart">Female · Heart</option><option value="af_bella">Female · Bella</option><option value="af_nicole">Female · Nicole</option><option value="af_sarah">Female · Sarah</option></select>
        <select className="input" value={maleVoice} onChange={e=>setMaleVoice(e.target.value as KokoroVoice)}><option value="am_michael">Male · Michael</option><option value="am_liam">Male · Liam</option><option value="am_adam">Male · Adam</option><option value="am_puck">Male · Puck</option></select>
      </div>
      <div className="scenehead"><h3 style={{margin:0}}>Narration beats</h3><button className="secondary" onClick={generateNarration} disabled={ttsLoading}>{ttsLoading?`Generating Kokoro ${ttsProgress}%…`:"🎙️ Generate free narration"}</button><button className="secondary" onClick={generateImages} disabled={imageLoading}>{imageLoading?"Generating images…":"🎨 Generate scene images"}</button></div>
      {beats.map((b,i)=><div className="scene" key={i}><div className="scenehead"><b>Scene {i+1}</b>{timings[i]&&<span className="muted">{timings[i].start}s–{timings[i].end}s</span>}</div><p>{b.narration}</p><div className="muted">Visual: {b.imagePrompt}</div>{images[i]?.status==="generated"&&images[i].image&&<img src={images[i].image} alt={`Scene ${i+1}`} style={{width:"100%",marginTop:12,borderRadius:12}}/>}</div>)}
      {error&&<p className="error">{error}</p>}
    </div>}
    {error&&!beats.length&&<p className="error">{error}</p>}\n    {beats.length>0&&images.length>0&&<ExplainerMp4Exporter scenes={beats.map((b,i)=>({narration:b.narration,duration:timings[i]?.duration||2.5,image:images[i]?.image||null}))} words={words} captions={captions} audioUrl={audioUrl}/>}
  </section>;
}
