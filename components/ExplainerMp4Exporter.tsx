"use client";
import {useRef,useState} from "react";
import {AudioBufferSource,BufferTarget,CanvasSource,Mp4OutputFormat,Output,Quality} from "mediabunny";

type Scene={image:string|null;duration:number;narration:string};
type Word={text:string;start:number;end:number};
type Caption={text:string;start:number;end:number};

export default function ExplainerMp4Exporter({scenes,words,captions,audioUrl}:{scenes:Scene[];words:Word[];captions:Caption[];audioUrl?:string|null}) {
 const [status,setStatus]=useState("idle"),[progress,setProgress]=useState(0),[url,setUrl]=useState("");
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const total=scenes.reduce((s,x)=>s+x.duration,0);
 async function exportMp4(){
  if(!scenes.length)return setStatus("No scenes available.");
  if(!window.isSecureContext)return setStatus("Export requires a secure browser context.");
  const canvas=canvasRef.current||document.createElement("canvas");canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext("2d");if(!ctx)return setStatus("Canvas is unavailable.");
  setStatus("Preparing MP4…");setProgress(0);setUrl("");
  try{
   const output=new Output({format:new Mp4OutputFormat({fastStart:"in-memory"}),target:new BufferTarget()});
   const video=new CanvasSource(canvas,{codec:"avc",bitrate:5_000_000});
   output.addVideoTrack(video,{frameRate:30});
   let audioSource:AudioBufferSource|null=null;
   let audioBuffer:AudioBuffer|null=null;
   if(audioUrl){
    const bytes=await (await fetch(audioUrl)).arrayBuffer();
    const ac=new AudioContext();
    audioBuffer=await ac.decodeAudioData(bytes.slice(0));
    audioSource=new AudioBufferSource({codec:"aac",quality:new Quality({bitrate:128000})});
    output.addAudioTrack(audioSource);
   }
   await output.start();
   let elapsed=0;
   for(let i=0;i<scenes.length;i++){
    const scene=scenes[i],img=scene.image?await loadImage(scene.image):null,frames=Math.max(1,Math.ceil(scene.duration*30));
    for(let f=0;f<frames;f++){
     const p=f/Math.max(1,frames-1),t=elapsed+p*scene.duration;
     drawFrame(ctx,img,p,scene.narration,t,words,captions);
     await video.add(t,1/30);
     setProgress(Math.min(1,t/total));
     if(f%15===0)await new Promise(requestAnimationFrame);
    }
    elapsed+=scene.duration;
   }
   if(audioSource&&audioBuffer){setStatus("Muxing narration…");await audioSource.add(audioBuffer);audioSource.close();}
   video.close();await output.finalize();
   const buffer=output.target.buffer;if(!buffer)throw new Error("MP4 encoder returned no data.");
   setUrl(URL.createObjectURL(new Blob([buffer],{type:"video/mp4"})));setProgress(1);setStatus("MP4 ready.");
  }catch(e){setStatus(e instanceof Error?e.message:"MP4 export failed.");}
 }
 return <div className="card" style={{marginTop:18}}>
  <div className="eyebrow">Final Export · Canvas + WebCodecs</div>
  <h3>Finish Topic Explainer</h3>
  <p className="muted">Renders the generated artwork, Ken Burns motion, timed captions and optional generated narration into one MP4 in the browser.</p>
  <canvas ref={canvasRef} width={720} height={1280} style={{display:"none"}}/>
  <button className="primary" onClick={exportMp4} disabled={status==="Preparing MP4…"||status==="Muxing narration…"}>{status==="Preparing MP4…"||status==="Muxing narration…"?`Exporting ${Math.round(progress*100)}%…`:"🎬 Export final MP4"}</button>
  {status==="MP4 ready."&&url&&<a className="download" href={url} download="topic-explainer.mp4">⬇️ Download Topic Explainer MP4</a>}
  {status!=="idle"&&status!=="MP4 ready."&&<p className="muted">{status}</p>}
 </div>;
}
function loadImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
function drawFrame(ctx:CanvasRenderingContext2D,img:HTMLImageElement|null,p:number,text:string,time:number,words:Word[],captions:Caption[]){
 const w=ctx.canvas.width,h=ctx.canvas.height;ctx.fillStyle="#111";ctx.fillRect(0,0,w,h);
 if(img){const scale=1.04+p*.08,cover=Math.max(w/img.width,h/img.height)*scale,iw=img.width*cover,ih=img.height*cover;ctx.drawImage(img,(w-iw)*(.35+.3*p),(h-ih)*(.35+.3*p),iw,ih);}
 const active=words.filter(x=>time>=x.start&&time<x.end).map(x=>x.text).join(" ");
 const phrase=captions.find(c=>time>=c.start&&time<c.end)?.text||active||text;
 ctx.font="700 42px Arial";const max=w*.82,lines:string[]=[];let line="";
 for(const word of phrase.split(/\s+/)){const test=line?line+" "+word:word;if(ctx.measureText(test).width>max&&line){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);
 const bh=lines.length*58+34,by=h-bh-70;ctx.fillStyle="rgba(15,15,15,.82)";ctx.beginPath();ctx.roundRect(w*.08,by,w*.84,bh,18);ctx.fill();ctx.fillStyle="#fff";lines.forEach((l,i)=>ctx.fillText(l,w*.11,by+48+i*58));
}
