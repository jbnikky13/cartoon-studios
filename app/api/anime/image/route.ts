import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req:Request) {
  try {
    const body=await req.json();
    const prompt=String(body.prompt||"").trim().slice(0,5000);
    const style=String(body.style||"cinematic 2D anime").trim().slice(0,200);
    const reference=typeof body.referenceImage==="string"?body.referenceImage:"";
    if(!prompt) return NextResponse.json({error:"A scene prompt is required."},{status:400});
    const key=process.env.GEMINI_API_KEY;
    if(!key) return NextResponse.json({error:"AI image generation is not configured. Add GEMINI_API_KEY to the deployment environment, then redeploy. You can still build and edit storyboards without it."},{status:503});
    const parts:Array<Record<string,unknown>>=[{text:`Create one polished original music-video frame in ${style} style. ${prompt}. Cinematic composition, expressive character acting, detailed background art, deliberate lighting and atmospheric depth. Keep recurring character design consistent with the reference image when supplied. Wide 16:9 composition. No text, letters, captions, logos, watermarks or borders.`}];
    if(reference.startsWith("data:")){
      const match=reference.match(/^data:([^;]+);base64,(.+)$/);
      if(match) parts.push({inlineData:{mimeType:match[1],data:match[2]}});
    }
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${encodeURIComponent(key)}`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:["IMAGE","TEXT"]}})
    });
    if(!response.ok) return NextResponse.json({error:"The image provider rejected this request. Check GEMINI_API_KEY and the model's availability."},{status:502});
    const data=await response.json();
    for(const part of data?.candidates?.[0]?.content?.parts||[]){
      const inline=part?.inlineData;
      if(inline?.data&&inline?.mimeType){
        return NextResponse.json({image:`data:${inline.mimeType};base64,${inline.data}`,provider:"Gemini image generation"});
      }
    }
    return NextResponse.json({error:"The image provider returned no image. Try simplifying the prompt."},{status:502});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed."},{status:500});
  }
}
