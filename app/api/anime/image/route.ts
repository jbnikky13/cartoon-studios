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
    if(!key) return NextResponse.json({error:"AI image generation is not configured. Add GEMINI_API_KEY to the Vercel Production environment, then redeploy. Storyboards can still be edited without it."},{status:503});

    const parts:Array<Record<string,unknown>>=[{text:`Create one polished original music-video frame in ${style} style. ${prompt}. Cinematic composition, expressive character acting, detailed background art, deliberate lighting and atmospheric depth. Keep recurring character design consistent with the reference image when supplied. Wide 16:9 composition. No text, letters, captions, logos, watermarks or borders.`}];
    if(reference.startsWith("data:")){
      const match=reference.match(/^data:([^;]+);base64,(.+)$/);
      if(match) parts.push({inlineData:{mimeType:match[1],data:match[2]}});
    }

    // Use the stable Gemini 3.1 Flash Image model, not the retired preview model.
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent",{
      method:"POST",
      headers:{"content-type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({
        contents:[{parts}],
        generationConfig:{
          responseModalities:["TEXT","IMAGE"],
          imageConfig:{aspectRatio:"16:9"}
        }
      })
    });

    if(!response.ok){
      let providerMessage="";
      try {
        const errorData=await response.json();
        providerMessage=String(errorData?.error?.message||"");
      } catch {}
      // Return a useful provider error, but never echo the API key or request URL.
      const safeMessage=providerMessage.replace(/AIza[0-9A-Za-z_-]{20,}/g,"[redacted API key]").slice(0,500);
      return NextResponse.json({
        error:safeMessage
          ? `Gemini image generation failed (HTTP ${response.status}): ${safeMessage}`
          : `Gemini image generation failed with HTTP ${response.status}. Check API access, billing, and model availability for gemini-3.1-flash-image.`
      },{status:502});
    }

    const data=await response.json();
    for(const part of data?.candidates?.[0]?.content?.parts||[]){
      const inline=part?.inlineData||part?.inline_data;
      if(inline?.data&&inline?.mimeType){
        return NextResponse.json({image:`data:${inline.mimeType};base64,${inline.data}`,provider:"Gemini 3.1 Flash Image"});
      }
    }
    const finishReason=String(data?.candidates?.[0]?.finishReason||"");
    return NextResponse.json({
      error:finishReason
        ? `Gemini returned no image (finish reason: ${finishReason}). Try simplifying the prompt or changing the reference image.`
        : "Gemini returned no image data. Check model access and try a simpler scene prompt."
    },{status:502});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Image generation failed."},{status:500});
  }
}
