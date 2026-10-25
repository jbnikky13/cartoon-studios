"use client";

import {useState} from "react";

type Task = {status?:string; content?:{url?:string}; video_url?:string; file_id?:string; base_resp?:{status_msg?:string}};

export default function PhotorealMicrodramaStudio() {
  const [title,setTitle]=useState("");
  const [prompt,setPrompt]=useState("");
  const [duration,setDuration]=useState("6");
  const [ratio,setRatio]=useState("9:16");
  const [resolution,setResolution]=useState("768P");
  const [referenceImage,setReferenceImage]=useState("");
  const [taskId,setTaskId]=useState("");
  const [task,setTask]=useState<Task|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  async function createVideo() {
    setBusy(true);setError("");setNotice("");setTask(null);setTaskId("");
    try {
      if(referenceImage.trim()&&!/^https:\/\//i.test(referenceImage.trim())) throw new Error("Reference image must be a publicly accessible HTTPS URL.");
      const response=await fetch("/api/minimax/video",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create",prompt:[title.trim()? "Project: "+title.trim()+".":"",prompt].filter(Boolean).join("\n"),duration:Number(duration),ratio,resolution,referenceImage:referenceImage.trim()})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"MiniMax could not start video generation.");
      setTaskId(data.taskId);setNotice("MiniMax accepted the request. Generation runs asynchronously; check the task status below.");
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

  return <section className="photoreal-studio">
    <div className="photoreal-intro">
      <div className="eyebrow">MiniMax H3 · Photoreal video</div>
      <h2>Photoreal Microdrama</h2>
      <p>Generate a realistic video scene from a prompt and optional character reference image. This is a separate workflow from Anime Director and browser-based animation.</p>
    </div>
    <div className="card photoreal-form">
      <label className="label">Project / scene title<input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. The Last Message"/></label>
      <label className="label">Scene description<textarea className="input" rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the setting, characters, camera movement, action, mood and any exact dialogue. Avoid copyrighted characters."/></label>
      <label className="label">Character reference image URL (optional)<input className="input" type="url" value={referenceImage} onChange={e=>setReferenceImage(e.target.value)} placeholder="https://…/character-reference.png"/></label><p className="photoreal-help">Use a publicly accessible HTTPS image URL. The provider must be able to retrieve the image.</p>
      <div className="photoreal-options">
        <label className="label">Duration<select className="input" value={duration} onChange={e=>setDuration(e.target.value)}>{[4,5,6,8,10,12,15].map(n=><option key={n} value={n}>{n} seconds</option>)}</select></label>
        <label className="label">Aspect ratio<select className="input" value={ratio} onChange={e=>setRatio(e.target.value)}><option value="9:16">9:16 · TikTok / Reels</option><option value="16:9">16:9 · YouTube</option></select></label>
        <label className="label">Resolution<select className="input" value={resolution} onChange={e=>setResolution(e.target.value)}><option value="768P">768P</option><option value="2K">2K</option></select></label>
      </div>
      <button className="primary" disabled={busy||prompt.trim().length<8} onClick={()=>void createVideo()}>{busy?"Working…":"✦ Generate with MiniMax H3"}</button>
      {taskId&&<div className="photoreal-task"><span className="muted">Task ID</span><code>{taskId}</code><button className="secondary" disabled={busy} onClick={()=>void checkStatus()}>{busy?"Checking…":"Check generation status"}</button></div>}
      {notice&&<p className="photoreal-notice">{notice}</p>}
      {error&&<p className="error">{error}</p>}
      {task&&<div className="photoreal-result"><b>Provider status: {status||"unknown"}</b>{task.base_resp?.status_msg&&<p className="muted">{task.base_resp.status_msg}</p>}{videoUrl&&<><video controls playsInline preload="metadata" src={videoUrl}/><a className="download" href={videoUrl} target="_blank" rel="noreferrer">Open / save generated MP4 ↗</a></>}</div>}
      <p className="photoreal-footnote">Generation requires a valid MiniMax API key, model access and available account credits. Requests may incur provider charges. Check status manually to avoid repeated polling requests.</p>
    </div>
  </section>;
}
