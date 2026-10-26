"use client";

import {useEffect, useState} from "react";

type Task = {status?:string; content?:{url?:string}; video_url?:string; file_id?:string; base_resp?:{status_msg?:string}};

function formatTime(seconds:number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins=Math.floor(seconds/60);
  const secs=Math.floor(seconds%60);
  return mins+":"+String(secs).padStart(2,"0");
}

export default function PhotorealMicrodramaStudio() {
  const [title,setTitle]=useState("");
  const [prompt,setPrompt]=useState("");
  const [duration,setDuration]=useState("5");
  const [ratio,setRatio]=useState("9:16");
  const [resolution,setResolution]=useState("768P");
  const [referenceImage,setReferenceImage]=useState("");
  const [audioFile,setAudioFile]=useState<File|null>(null);
  const [audioUrl,setAudioUrl]=useState("");
  const [audioDuration,setAudioDuration]=useState(0);
  const [taskId,setTaskId]=useState("");
  const [task,setTask]=useState<Task|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>()=>{if(audioUrl) URL.revokeObjectURL(audioUrl);},[audioUrl]);

  function selectAudio(file?:File) {
    setError("");
    setNotice("");
    setAudioDuration(0);
    if(!file) { setAudioFile(null); setAudioUrl(""); return; }
    if(!file.type.startsWith("audio/")) { setError("Choose an audio file such as MP3, M4A, WAV or AAC."); return; }
    if(file.size>50*1024*1024) { setError("This audio file is larger than the 50 MB limit. Choose a smaller file."); return; }
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
  }

  async function createVideo() {
    setBusy(true);setError("");setNotice("");setTask(null);setTaskId("");
    try {
      if(referenceImage.trim()&&!/^https:\/\//i.test(referenceImage.trim())) throw new Error("Reference image must be a publicly accessible HTTPS URL.");
      const timingNote=audioFile&&audioDuration>0
        ? "\nMusic-video reference: the uploaded soundtrack is "+formatTime(audioDuration)+" ("+audioDuration.toFixed(2)+" seconds). This generation request creates a silent visual clip; keep the scene concept suitable for later editing against the original track. Do not invent lyrics or add text overlays."
        : "";
      const response=await fetch("/api/minimax/video",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create",prompt:[title.trim()? "Project: "+title.trim()+".":"",prompt,timingNote].filter(Boolean).join("\n"),duration:Number(duration),ratio,resolution,referenceImage:referenceImage.trim()})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"MiniMax could not start video generation.");
      setTaskId(data.taskId);setNotice("MiniMax accepted the visual clip request. The audio file stays in your browser and is not uploaded to MiniMax; use the displayed track duration when assembling clips.");
    } catch(e) { setError(e instanceof Error?e.message:"Video generation request failed."); }
    finally { setBusy(false); }
  }

  async function checkStatus() {
    if(!taskId) return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/minimax/video",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"status",taskId})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Could not retrieve task status.");
      const result:Task=data.task||{};
      setTask(result);
      const status=String(result.status||"unknown").toLowerCase();
      const url=result.content?.url||result.video_url;
      if(status==="succeeded"&&url) setNotice("Video generation succeeded. Preview or save the MP4 below.");
      else if(status==="failed"||status==="cancelled") setError("MiniMax task "+status+". Check your MiniMax account and task details.");
      else setNotice("Task status: "+status+". Check again in a little while.");
    } catch(e) { setError(e instanceof Error?e.message:"Status check failed."); }
    finally { setBusy(false); }
  }

  const videoUrl=task?.content?.url||task?.video_url||"";
  const status=String(task?.status||"").toLowerCase();
  const plannedClips=audioDuration>0?Math.ceil(audioDuration/Number(duration)):0;

  return <section className="photoreal-studio">
    <div className="photoreal-intro">
      <div className="eyebrow">MiniMax H3 · Photoreal video</div>
      <h2>Photoreal Microdrama</h2>
      <p>Generate realistic video scenes and prepare them for editing against your own soundtrack. Audio analysis and final full-track assembly are separate steps.</p>
    </div>
    <div className="card photoreal-form">
      <section className="photoreal-audio">
        <div className="eyebrow">Music-video soundtrack</div>
        <h3>1. Add your song</h3>
        <p className="muted">Choose an audio file to preview it and read its duration. The file stays on this device; it is not sent to MiniMax.</p>
        <label className="label">Upload audio (MP3, M4A, WAV, AAC; up to 50 MB)
          <input className="input" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" onChange={e=>selectAudio(e.target.files?.[0])}/>
        </label>
        {audioFile&&audioUrl&&<div className="photoreal-audio-details">
          <div><strong>{audioFile.name}</strong><p className="muted">{(audioFile.size/1024/1024).toFixed(1)} MB · {audioDuration>0?formatTime(audioDuration)+" total":"Reading duration…"}</p></div>
          <audio controls preload="metadata" src={audioUrl} onLoadedMetadata={e=>{const d=e.currentTarget.duration;if(Number.isFinite(d))setAudioDuration(d);}} onDurationChange={e=>{const d=e.currentTarget.duration;if(Number.isFinite(d))setAudioDuration(d);}}/>
          <button className="secondary" type="button" onClick={()=>selectAudio(undefined)}>Remove audio</button>
          {audioDuration>0&&<div className="photoreal-timing"><b>Rough clip plan</b><span>{plannedClips} clips at {duration}s each to cover {formatTime(audioDuration)}. The last clip may need trimming.</span><div className="photoreal-timeline">{Array.from({length:Math.min(plannedClips,40)},(_,i)=><span key={i} title={"Clip "+(i+1)}>{i+1}</span>)}</div><small>This is a duration estimate, not beat/lyric synchronization. Exact timing and final assembly are not automated yet.</small></div>}
        </div>}
      </section>
      <div className="photoreal-divider"/>
      <div className="eyebrow">Visual clip</div>
      <h3>2. Describe the scene</h3>
      <label className="label">Project / scene title<input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Ghost — Rainy Apartment"/></label>
      <label className="label">Scene description<textarea className="input" rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the setting, characters, camera movement, action, mood and any exact dialogue. Avoid copyrighted characters."/></label>
      <label className="label">Character reference image URL (optional)<input className="input" type="url" value={referenceImage} onChange={e=>setReferenceImage(e.target.value)} placeholder="https://…/character-reference.png"/></label><p className="photoreal-help">Use a publicly accessible HTTPS image URL. The provider must be able to retrieve the image.</p>
      <div className="photoreal-options">
        <label className="label">Clip duration<select className="input" value={duration} onChange={e=>setDuration(e.target.value)}>{[5,10,15].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>
        <label className="label">Aspect ratio<select className="input" value={ratio} onChange={e=>setRatio(e.target.value)}><option value="9:16">9:16 · TikTok / Reels</option><option value="16:9">16:9 · YouTube</option></select></label>
        <label className="label">Resolution<select className="input" value={resolution} onChange={e=>setResolution(e.target.value)}><option value="768P">768P</option><option value="2K">2K</option></select></label>
      </div>
      <button className="primary" disabled={busy||prompt.trim().length<8} onClick={()=>void createVideo()}>{busy?"Working…":"✦ Generate visual clip with MiniMax H3"}</button>
      {taskId&&<div className="photoreal-task"><span className="muted">Task ID</span><code>{taskId}</code><button className="secondary" disabled={busy} onClick={()=>void checkStatus()}>{busy?"Checking…":"Check generation status"}</button></div>}
      {notice&&<p className="photoreal-notice">{notice}</p>}
      {error&&<p className="error">{error}</p>}
      {task&&<div className="photoreal-result"><b>Provider status: {status||"unknown"}</b>{task.base_resp?.status_msg&&<p className="muted">{task.base_resp.status_msg}</p>}{videoUrl&&<><video controls playsInline preload="metadata" src={videoUrl}/><a className="download" href={videoUrl} target="_blank" rel="noreferrer">Open / save generated MP4 ↗</a></>}</div>}
      <p className="photoreal-footnote">Generation requires a valid MiniMax API key, model access and available account credits. Requests may incur provider charges. Check status manually to avoid repeated polling requests.</p>
    </div>
  </section>;
}
