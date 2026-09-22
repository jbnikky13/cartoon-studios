"use client";

import {useEffect,useRef,useState} from "react";

type Scene={image:string|null;duration:number;narration:string};
type Word={text:string;start:number;end:number};

type Caption={text:string;start:number;end:number};

function drawKenBurns(ctx:CanvasRenderingContext2D,img:HTMLImageElement,t:number){
  const scale=1.04+t*0.08;
  const cw=ctx.canvas.width,ch=ctx.canvas.height;
  const cover=Math.max(cw/img.width,ch/img.height)*scale;
  const w=img.width*cover,h=img.height*cover;
  const x=(cw-w)*(0.35+0.3*t),y=(ch-h)*(0.35+0.3*t);
  ctx.drawImage(img,x,y,w,h);
}

export default function ExplainerCanvasRenderer({scenes,words=[],captions=[]}:{scenes:Scene[];words?:Word[];captions?:Caption[]}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const raf=useRef<number|null>(null);
  const started=useRef<number|null>(null);

  const total=scenes.reduce((sum,s)=>sum+s.duration,0);

  useEffect(()=>{
    if(!playing)return;
    if(started.current===null)started.current=performance.now()-time*1000;
    const tick=(now:number)=>{
      const elapsed=(now-(started.current||now))/1000;
      if(elapsed>=total){setTime(total);setPlaying(false);started.current=null;return;}
      setTime(elapsed);raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>{if(raf.current)cancelAnimationFrame(raf.current);};
  },[playing,total,time]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    const dpr=window.devicePixelRatio||1;
    const width=canvas.clientWidth||720,height=canvas.clientHeight||1280;
    canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle="#111";ctx.fillRect(0,0,width,height);

    let cursor=0;
    let sceneIndex=0;
    for(let i=0;i<scenes.length;i++){if(time>=cursor)sceneIndex=i;cursor+=scenes[i].duration;}
    const scene=scenes[Math.min(sceneIndex,scenes.length-1)];
    if(!scene)return;
    const sceneStart=scenes.slice(0,sceneIndex).reduce((s,x)=>s+x.duration,0);
    const progress=Math.max(0,Math.min(1,(time-sceneStart)/scene.duration));

    if(scene.image){
      const img=new Image();
      img.onload=()=>{drawKenBurns(ctx,img,progress);drawCaption(ctx,scene.narration,words.filter(w=>w.start>=sceneStart&&w.end<=time),captions);};
      img.src=scene.image;
    }else drawCaption(ctx,scene.narration,[],captions);

    function drawCaption(ctx:CanvasRenderingContext2D,text:string,current:Word[],captionTrack:Caption[]){
      const activeCaption=captionTrack.find(c=>time>=c.start&&time<c.end);
      const activeWords=current.length?current.map(w=>w.text).join(" "):"";
      const phrase=activeCaption?.text||activeWords||text;
      ctx.font="700 42px Arial";
      const max=width*0.82;
      const wordsArr=phrase.split(/\s+/);
      const lines:string[]=[];let line="";
      for(const word of wordsArr){const test=line?line+" "+word:word;if(ctx.measureText(test).width>max&&line){lines.push(line);line=word;}else line=test;}
      if(line)lines.push(line);
      const boxH=lines.length*58+34,boxY=height-boxH-70;
      ctx.fillStyle="rgba(15,15,15,.82)";
      ctx.beginPath();ctx.roundRect(width*.08,boxY,width*.84,boxH,18);ctx.fill();
      ctx.fillStyle="#fff";lines.forEach((line,i)=>ctx.fillText(line,width*.11,boxY+48+i*58));
      if(activeCaption){ctx.strokeStyle="rgba(255,214,70,.9)";ctx.lineWidth=4;ctx.strokeRect(width*.08,boxY,width*.84,boxH);}
    }
  },[time,scenes,words]);

  return <div>
    <canvas ref={canvasRef} style={{width:"100%",aspectRatio:"9/16",display:"block",borderRadius:16}}/>
    <div style={{display:"flex",gap:8,marginTop:10}}>
      <button className="primary" onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Preview"}</button>
      <span className="muted">{time.toFixed(1)}s / {total.toFixed(1)}s</span>
    </div>
  </div>;
}
