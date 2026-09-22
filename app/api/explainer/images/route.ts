import {NextResponse} from "next/server";
import {characterPrompt} from "../../../../lib/explainer/characterBible";

export const runtime="nodejs";
export const maxDuration=60;

const STYLE="gold-linework watercolor editorial illustration, muted palette, cinematic 2D composition, hand-painted texture, consistent character design";

type Scene={index:number;imagePrompt:string;narration?:string};

function dataUrl(bytes:Uint8Array,mime:string){return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;}

async function generateWithGemini(prompt:string,reference?:string){
  const key=process.env.GEMINI_API_KEY;
  if(!key) return null;
  const parts:Array<Record<string,unknown>>=[{text:prompt}];
  if(reference?.startsWith("data:")){
    const match=reference.match(/^data:([^;]+);base64,(.+)$/);
    if(match) parts.push({inlineData:{mimeType:match[1],data:match[2]}});
  }
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${encodeURIComponent(key)}`,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:["IMAGE","TEXT"]}})
  });
  if(!response.ok) return null;
  const data=await response.json();
  for(const part of data?.candidates?.[0]?.content?.parts||[]){
    const inline=part?.inlineData;
    if(inline?.data&&inline?.mimeType) return dataUrl(Buffer.from(inline.data,"base64"),inline.mimeType);
  }
  return null;
}

function placeholder(scene:Scene,reference?:string){
  return {sceneIndex:scene.index,narration:scene.narration||"",imagePrompt:scene.imagePrompt,referenceUsed:Boolean(reference),image:null,status:"awaiting-image-provider"};
}

export async function POST(req:Request){
  try{
    const body=await req.json() as {topic?:unknown;scenes?:unknown;characterBible?:unknown;referenceImage?:unknown};
    const topic=String(body.topic||"").trim();
    const scenes=Array.isArray(body.scenes)?body.scenes as Scene[]:[];
    if(!topic||!scenes.length) return NextResponse.json({error:"Topic and scenes are required."},{status:400});
    const bible=(body.characterBible&&typeof body.characterBible==="object")?body.characterBible as Parameters<typeof characterPrompt>[0]:{style:STYLE,characters:[],continuityRules:[]};
    const prefix=characterPrompt(bible);
    const reference=typeof body.referenceImage==="string"?body.referenceImage:undefined;
    const results=[];
    for(const scene of scenes.slice(0,12)){
      const prompt=`${STYLE}. ${prefix}. Create scene ${scene.index+1} for the explainer about "${topic}". Scene direction: ${scene.imagePrompt}. Preserve every recurring character's exact face, hair, outfit, accessories, proportions and palette from the reference image. Do not introduce a new character design. No text, subtitles, logos or watermarks.`;
      const image=await generateWithGemini(prompt,reference);
      results.push(image?{...scene,image,referenceUsed:Boolean(reference),status:"generated"}:placeholder(scene,reference));
    }
    return NextResponse.json({topic,style:STYLE,characterAssets:"topic-specific-only",referenceUsed:Boolean(reference),provider:process.env.GEMINI_API_KEY?"gemini-image":"placeholder",scenes:results});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed."},{status:500});
  }
}
