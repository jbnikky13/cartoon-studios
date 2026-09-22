import { NextResponse } from "next/server";

export const runtime="nodejs";
export const maxDuration=30;

function estimateBeats(beats:string[]) {
  let cursor=0;
  return beats.map((text,index)=>{
    const seconds=Math.max(2.2,Math.min(8.5,text.trim().split(/\s+/).length/2.45));
    const item={index,narration:text,start:Number(cursor.toFixed(2)),end:Number((cursor+seconds).toFixed(2)),duration:Number(seconds.toFixed(2))};
    cursor+=seconds;
    return item;
  });
}

export async function POST(req:Request) {
  try {
    const body=await req.json() as {script?:unknown;voice?:unknown};
    const script=Array.isArray(body.script)?body.script.map(String).filter(Boolean):[];
    if(!script.length) return NextResponse.json({error:"A script is required."},{status:400});
    const timings=estimateBeats(script);
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey) {
      return NextResponse.json({
        provider:"estimated-timing",
        audio:null,
        mimeType:null,
        timings,
        duration:timings.at(-1)?.end||0,
        message:"OPENAI_API_KEY is not configured; returning timing estimates so placeholder rendering can continue."
      });
    }

    const input=script.map((line,index)=>`Beat ${index+1}: ${line}`).join("\n");
    const response=await fetch("https://api.openai.com/v1/audio/speech",{
      method:"POST",
      headers:{"content-type":"application/json",authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({
        model:"gpt-4o-mini-tts",
        voice:String(body.voice||"alloy"),
        input,
        response_format:"mp3"
      })
    });
    if(!response.ok) {
      const detail=await response.text();
      return NextResponse.json({error:`TTS provider failed: ${detail.slice(0,300)}`,timings},{status:502});
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    return NextResponse.json({
      provider:"openai-tts",
      audio:`data:audio/mpeg;base64,${bytes.toString("base64")}`,
      mimeType:"audio/mpeg",
      timings,
      duration:timings.at(-1)?.end||0
    });
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"TTS generation failed."},{status:500});
  }
}