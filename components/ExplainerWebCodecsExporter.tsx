"use client";
import {useRef,useState} from "react";
type Scene={image:string|null;duration:number;narration:string};
type Word={text:string;start:number;end:number};
type Caption={text:string;start:number;end:number};

export default function ExplainerWebCodecsExporter({scenes,words=[],captions=[]}:{scenes:Scene[];words?:Word[];captions?:Caption[]}) {
 const [status,setStatus]=useState("idle"),[progress,setProgress]=useState(0);
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const total=scenes.reduce((s,x)=>s+x.duration,0);
 async function exportVideo(){
  if(!scenes.length)return setStatus("No scenes");
  if(typeof VideoEncoder==="undefined")return setStatus("WebCodecs unavailable in this browser");
  const canvas=canvasRef.current||document.createElement("canvas");canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext("2d");if(!ctx)return setStatus("Canvas unavailable");
  setStatus("encoding");setProgress(0);
  const encoder=new VideoEncoder({output:()=>{},error:e=>setStatus(e.message||"Encoder error")});
  encoder.configure({codec:"avc1.42001f",width:720,height:1280,framerate:30,bitrate:5000000});
  let elapsed=0;
  for(let i=0;i<scenes.length;i++){
   const scene=scenes[i],img=scene.image?await loadImage(scene.image):null,frames=Math.max(1,Math.ceil(scene.duration*30));
   for(let f=0;f<frames;f++){
    const p=f/Math.max(1,frames-1),t=elapsed+p*scene.duration;
    drawFrame(ctx,img,p,scene.narration,t,words,captions);
    const frame=new VideoFrame(canvas,{timestamp:Math.round(t*1000000),duration:Math.round(1000000/30)});
    encoder.encode(frame,{keyFrame:f===0});frame.close();setProgress(Math.min(1,t/total));
   }
   elapsed+=scene.duration;
  }
  await encoder.flush();encoder.close();setProgress(1);setStatus("encoded");
 }
 return <div style={{marginTop:16}}><canvas ref={canvasRef} style={{display:"none"}}/><button className="primary" onClick={exportVideo} disabled={status==="encoding"}>{status==="encoding"?"Encoding "+Math.round(progress*100)+"%...":"Export explainer frames"}</button>{status==="encoded"&&<p className="muted">WebCodecs encoding completed. MP4 muxing is the next integration.</p>}{status!=="idle"&&status!=="encoding"&&status!=="encoded"&&<p className="error">{status}</p>}</div>;
}
function loadImage(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
function drawFrame(ctx:CanvasRenderingContext2D,img:HTMLImageElement|null,p:number,text:string,time:number,words:Word[],captions:Caption[]){
 const w=ctx.canvas.width,h=ctx.canvas.height;ctx.fillStyle="#111";ctx.fillRect(0,0,w,h);
 if(img){const scale=1.04+p*.08,cover=Math.max(w/img.width,h/img.height)*scale,iw=img.width*cover,ih=img.height*cover;ctx.drawImage(img,(w-iw)*(.35+.3*p),(h-ih)*(.35+.3*p),iw,ih);}
 const active=captions.find(c=>time>=c.start&&time<c.end)?.text||words.filter(x=>time>=x.start&&time<x.end).map(x=>x.text).join(" ")||text;
 ctx.font="700 42px Arial";const max=w*.82,lines:string[]=[];let line="";
 for(const word of active.split(/\\s+/)){const t=line?line+" "+word:word;if(ctx.measureText(t).width>max&&line){lines.push(line);line=word;}else line=t;}if(line)lines.push(line);
 const bh=lines.length*58+34,by=h-bh-70;ctx.fillStyle="rgba(15,15,15,.82)";ctx.beginPath();ctx.roundRect(w*.08,by,w*.84,bh,18);ctx.fill();ctx.fillStyle="#fff";lines.forEach((l,i)=>ctx.fillText(l,w*.11,by+48+i*58));
}
