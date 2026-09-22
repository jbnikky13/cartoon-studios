import {NextResponse} from "next/server";

export const runtime="nodejs";

type Word={text:string;start:number;end:number};

function wordsFromBeats(script:string[],durations:number[]):Word[]{
  const out:Word[]=[];let cursor=0;
  script.forEach((line,i)=>{
    const duration=durations[i]||Math.max(2.2,line.trim().split(/\s+/).length/2.45);
    const words=line.trim().split(/\s+/).filter(Boolean);
    const step=duration/Math.max(words.length,1);
    words.forEach((text,index)=>out.push({text,start:Number((cursor+index*step).toFixed(3)),end:Number((cursor+(index+1)*step).toFixed(3))}));
    cursor+=duration;
  });
  return out;
}

export async function POST(req:Request){
  try{
    const body=await req.json() as {script?:unknown;durations?:unknown[]};
    const script=Array.isArray(body.script)?body.script.map(String).filter(Boolean):[];
    if(!script.length)return NextResponse.json({error:"A script is required."},{status:400});
    const durations=Array.isArray(body.durations)?body.durations.map(Number):[];
    const words=wordsFromBeats(script,durations);
    const captions=[];
    for(let i=0;i<script.length;i++){
      const start=words.find(w=>w.text&&w.start>=words.filter(x=>x.start>=0)[0]?.start)?.start??0;
      const sceneWords=words.slice(words.findIndex(w=>w.start>=start),words.findIndex(w=>w.start>=start)+script[i].split(/\s+/).length);
      if(sceneWords.length)captions.push({text:script[i],start:sceneWords[0].start,end:sceneWords.at(-1)?.end||sceneWords[0].end});
    }
    return NextResponse.json({provider:"caption-timing",words,captions});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Caption timing failed."},{status:500});}
}
