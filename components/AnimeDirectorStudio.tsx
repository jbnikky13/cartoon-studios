"use client";

import {useState} from "react";

type Action={character:string;action:string;emotion?:string;gesture?:string};
type Scene={number:number;title:string;start:number;end:number;summary:string;emotion:string;setting:string;camera:string;actions:Action[];imagePrompt:string;image?:string};
type Story={story_title:string;mode:string;logline:string;theme:string;emotional_arc:string[];characters:{role:string;description:string}[];scenes:Scene[]};
type Props={onStoryReady:(story:Story)=>void};

export default function AnimeDirectorStudio({onStoryReady}:Props){
  const[title,setTitle]=useState("");
  const[artist,setArtist]=useState("KØDA");
  const[character,setCharacter]=useState("The Wanderer");
  const[direction,setDirection]=useState("cinematic dark anime, lonely city, cosmic dreamscape, emotional transformation, midnight blue and violet lighting");
  const[duration,setDuration]=useState("90");
  const[style,setStyle]=useState("cinematic 2D anime");
  const[story,setStory]=useState<Story|null>(null);
  const[provider,setProvider]=useState("");
  const[notice,setNotice]=useState("");
  const[error,setError]=useState("");
  const[planning,setPlanning]=useState(false);
  const[generating,setGenerating]=useState<number|null>(null);
  const[generatingAll,setGeneratingAll]=useState(false);

  async function createPlan(){
    setError("");setNotice("");setPlanning(true);
    try{
      const response=await fetch("/api/anime/plan",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,artist,character,direction,duration:Number(duration)})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Storyboard generation failed.");
      setStory(data.plan);setProvider(data.provider||"");setNotice(data.notice||"");
    }catch(e){setError(e instanceof Error?e.message:"Storyboard generation failed.");}
    finally{setPlanning(false);}
  }

  async function generateArt(sceneNumber:number,referenceImage?:string){
    if(!story)return;
    const scene=story.scenes.find(s=>s.number===sceneNumber);
    if(!scene)return;
    setError("");setGenerating(sceneNumber);
    try{
      const response=await fetch("/api/anime/image",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:scene.imagePrompt,style,referenceImage})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Scene image generation failed.");
      const updated={...story,scenes:story.scenes.map(s=>s.number===sceneNumber?{...s,image:data.image}:s)};
      setStory(updated);onStoryReady(updated);
    }catch(e){setError(e instanceof Error?e.message:"Scene image generation failed.");}
    finally{setGenerating(null);}
  }

  async function generateAll(){
    if(!story)return;
    setGeneratingAll(true);setError("");
    let working={...story,scenes:[...story.scenes]};
    try{
      for(const scene of working.scenes){
        if(scene.image)continue;
        setGenerating(scene.number);
        const firstImage=working.scenes.find(s=>s.image)?.image;
        const response=await fetch("/api/anime/image",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:scene.imagePrompt,style,referenceImage:firstImage})});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||`Could not generate artwork for scene ${scene.number}.`);
        working={...working,scenes:working.scenes.map(s=>s.number===scene.number?{...s,image:data.image}:s)};
        setStory(working);onStoryReady(working);
      }
    }catch(e){setError(e instanceof Error?e.message:"Scene image generation failed.");}
    finally{setGenerating(null);setGeneratingAll(false);}
  }

  function downloadImage(scene:Scene){
    if(!scene.image)return;
    const a=document.createElement("a");a.href=scene.image;a.download=`scene-${String(scene.number).padStart(2,"0")}.png`;a.click();
  }

  function openTimeline(){
    if(story)onStoryReady(story);
  }

  return <section className="anime-studio">
    <div className="anime-intro">
      <div className="eyebrow">Original anime production</div>
      <h2>Direct your music video.</h2>
      <p>Build a visual story, generate original scene artwork, keep a consistent lead character, then send the scenes into the animation timeline.</p>
    </div>
    <div className="anime-form card">
      <div className="anime-form-grid">
        <label className="label">Song / project title<input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. ELSEWHERE" /></label>
        <label className="label">Artist<input className="input" value={artist} onChange={e=>setArtist(e.target.value)} placeholder="Artist name" /></label>
        <label className="label">Lead character<input className="input" value={character} onChange={e=>setCharacter(e.target.value)} placeholder="Character name" /></label>
        <label className="label">Target duration (seconds)<input className="input" type="number" min="15" max="300" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
      </div>
      <label className="label">Visual direction<textarea className="input anime-direction" value={direction} onChange={e=>setDirection(e.target.value)} rows={3}/></label>
      <label className="label">Artwork style<select className="input" value={style} onChange={e=>setStyle(e.target.value)}><option>cinematic 2D anime</option><option>hand-painted anime film</option><option>dark cyberpunk anime</option><option>soft watercolor anime</option><option>high-contrast manga-inspired color</option></select></label>
      <button className="primary" disabled={planning||!title.trim()} onClick={createPlan}>{planning?"Planning scenes…":"✦ Generate 6-scene storyboard"}</button>
      {provider&&<p className="anime-provider">Planner: {provider}</p>}
      {notice&&<p className="anime-notice">{notice}</p>}
    </div>
    {error&&<p className="error anime-error">{error}</p>}
    {story&&<>
      <div className="anime-story-head">
        <div><div className="eyebrow">{story.theme}</div><h2>{story.story_title}</h2><p>{story.logline}</p></div>
        <button className="secondary" onClick={openTimeline}>Open animation timeline ↓</button>
      </div>
      <div className="anime-toolbar">
        <div><b>{story.scenes.filter(s=>s.image).length}/{story.scenes.length}</b><span> scenes illustrated</span></div>
        <button className="primary anime-generate-all" onClick={generateAll} disabled={generatingAll||story.scenes.every(s=>!!s.image)}>{generatingAll?"Generating scene "+(generating??"")+"…":"✦ Generate missing artwork"}</button>
      </div>
      <div className="anime-scenes">
        {story.scenes.map(scene=><article className="anime-scene" key={scene.number}>
          <div className="anime-art">
            {scene.image?<img src={scene.image} alt={scene.title+" anime scene"} />:<div className="anime-art-placeholder"><span>SCENE {String(scene.number).padStart(2,"0")}</span><p>{scene.setting}</p></div>}
            <span className="anime-time">{scene.start}s — {scene.end}s</span>
          </div>
          <div className="anime-scene-content">
            <div className="anime-scene-title"><span>{String(scene.number).padStart(2,"0")}</span><h3>{scene.title}</h3></div>
            <p>{scene.summary}</p>
            <div className="anime-tags"><span>{scene.emotion}</span><span>{scene.camera}</span></div>
            <details><summary>Scene prompt</summary><p>{scene.imagePrompt}</p></details>
            <div className="anime-scene-actions">
              <button className="secondary" disabled={generating!==null||generatingAll} onClick={()=>generateArt(scene.number,story.scenes.find(s=>s.image)?.image)}>{generating===scene.number?"Generating…":scene.image?"Regenerate art":"Generate art"}</button>
              {scene.image&&<button className="secondary" onClick={()=>downloadImage(scene)}>Save image</button>}
            </div>
          </div>
        </article>)}
      </div>
      <div className="anime-next-step"><div><b>Next: animate and export</b><p>Open the timeline to preview character motion, add your own song audio, and export the video. Generated scene artwork is used as the animated background.</p></div><button className="primary" onClick={openTimeline}>Open animation timeline</button></div>
    </>}
  </section>;
}
