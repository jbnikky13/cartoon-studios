"use client";

import {useState} from "react";
import ExplainerMp4Exporter from "./ExplainerMp4Exporter";
type Beat={narration:string;imagePrompt:string};
type Timing={index:number;narration:string;start:number;end:number;duration:number};
type Character={id:string;name:string;role:string;appearance:string;outfit:string;palette:string;personality:string};

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

  async function research(){
    if(!topic.trim()) return;
    setError("");setLoading(true);setBeats([]);setTimings([]);
    try{
      const r=await fetch("/api/explainer/topic",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,beatCount:10})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Topic research failed.");
      setBeats(j.beats||[]);setSources(j.sources||[]);setProvider(j.provider||"");
      setCharacterLoading(true);
      try{const cr=await fetch("/api/explainer/characters",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,script:(j.beats||[]).map((b:Beat)=>b.narration)})});const cj=await cr.json();if(cr.ok)setCharacterBible(cj);}catch(e){setError(e instanceof Error?e.message:"Character planning failed.");}finally{setCharacterLoading(false);}
    }catch(e){setError(e instanceof Error?e.message:"Topic research failed.");}
    finally{setLoading(false);}
    if(!beats.length)return;
    setCharacterLoading(true);
    try{const cr=await fetch("/api/explainer/characters",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,script:beats.map(b=>b.narration)})});const cj=await cr.json();if(cr.ok)setCharacterBible(cj);}
    catch(e){setError(e instanceof Error?e.message:"Character planning failed.");}finally{setCharacterLoading(false);}
  }

  async function generateNarration(){
    if(!beats.length)return;
    setError("");setTtsLoading(true);
    try{
      const r=await fetch("/api/explainer/tts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({script:beats.map(b=>b.narration)})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Narration generation failed.");
      setTimings(j.timings||[]);setAudioUrl(j.audio||null);
      setProvider((p)=>p ? p+" · "+(j.provider||"") : (j.provider||""));
      const cr=await fetch("/api/explainer/captions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({script:beats.map(b=>b.narration),durations:(j.timings||[]).map((x:{duration:number})=>x.duration)})});
      const cj=await cr.json(); if(cr.ok){setWords(cj.words||[]);setCaptions(cj.captions||[]);}
    }catch(e){setError(e instanceof Error?e.message:"Narration generation failed.");}
    finally{setTtsLoading(false);}
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
        <button className="primary" onClick={research} disabled={loading||!topic.trim()}>{loading?"Researching…":"🔎 Research & write script"}</button>
      </div>
      <div>
        {provider&&<p className="muted">Pipeline: {provider}</p>}
        {sources.length>0&&<><h3>Sources</h3>{sources.map((s)=><div className="scene" key={s.url}><b>{s.title}</b><div className="muted">{s.domain}</div></div>)}</>}
      </div>
    </div>
    {beats.length>0&&<div style={{marginTop:20}}>
      <div className="scenehead"><h3 style={{margin:0}}>Narration beats</h3><button className="secondary" onClick={generateNarration} disabled={ttsLoading}>{ttsLoading?"Generating…":"🎙️ Generate narration timing"}</button><button className="secondary" onClick={generateImages} disabled={imageLoading}>{imageLoading?"Generating images…":"🎨 Generate scene images"}</button></div>
      {beats.map((b,i)=><div className="scene" key={i}><div className="scenehead"><b>Scene {i+1}</b>{timings[i]&&<span className="muted">{timings[i].start}s–{timings[i].end}s</span>}</div><p>{b.narration}</p><div className="muted">Visual: {b.imagePrompt}</div>{images[i]?.status==="generated"&&images[i].image&&<img src={images[i].image} alt={`Scene ${i+1}`} style={{width:"100%",marginTop:12,borderRadius:12}}/>}</div>)}
      {error&&<p className="error">{error}</p>}
    </div>}
    {error&&!beats.length&&<p className="error">{error}</p>}\n    {beats.length>0&&images.length>0&&<ExplainerMp4Exporter scenes={beats.map((b,i)=>({narration:b.narration,duration:timings[i]?.duration||2.5,image:images[i]?.image||null}))} words={words} captions={captions} audioUrl={audioUrl}/>}
  </section>;
}
