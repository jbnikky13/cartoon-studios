"use client";

import {useState} from "react";
type Beat={narration:string;imagePrompt:string};
type Timing={index:number;narration:string;start:number;end:number;duration:number};

export default function TopicExplainerStudio(){
  const [topic,setTopic]=useState("");
  const [beats,setBeats]=useState<Beat[]>([]);
  const [sources,setSources]=useState<{title:string;domain:string;url:string}[]>([]);
  const [timings,setTimings]=useState<Timing[]>([]);
  const [loading,setLoading]=useState(false);
  const [ttsLoading,setTtsLoading]=useState(false);
  const [error,setError]=useState("");
  const [provider,setProvider]=useState("");

  async function research(){
    if(!topic.trim()) return;
    setError("");setLoading(true);setBeats([]);setTimings([]);
    try{
      const r=await fetch("/api/explainer/topic",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic,beatCount:10})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Topic research failed.");
      setBeats(j.beats||[]);setSources(j.sources||[]);setProvider(j.provider||"");
    }catch(e){setError(e instanceof Error?e.message:"Topic research failed.");}
    finally{setLoading(false);}
  }

  async function generateNarration(){
    if(!beats.length)return;
    setError("");setTtsLoading(true);
    try{
      const r=await fetch("/api/explainer/tts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({script:beats.map(b=>b.narration)})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||"Narration generation failed.");
      setTimings(j.timings||[]);
      setProvider((p)=>p ? p+" · "+(j.provider||"") : (j.provider||""));
    }catch(e){setError(e instanceof Error?e.message:"Narration generation failed.");}
    finally{setTtsLoading(false);}
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
      <div className="scenehead"><h3 style={{margin:0}}>Narration beats</h3><button className="secondary" onClick={generateNarration} disabled={ttsLoading}>{ttsLoading?"Generating…":"🎙️ Generate narration timing"}</button></div>
      {beats.map((b,i)=><div className="scene" key={i}><div className="scenehead"><b>Scene {i+1}</b>{timings[i]&&<span className="muted">{timings[i].start}s–{timings[i].end}s</span>}</div><p>{b.narration}</p><div className="muted">Visual: {b.imagePrompt}</div></div>)}
      {error&&<p className="error">{error}</p>}
    </div>}
    {error&&!beats.length&&<p className="error">{error}</p>}
  </section>;
}
