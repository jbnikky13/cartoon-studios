import {NextResponse} from "next/server";
export const runtime="nodejs";
export async function POST(req:Request){
 try{
  const body=await req.json() as {topic?:string;script?:string[]};
  const topic=String(body.topic||"").trim(),script=Array.isArray(body.script)?body.script.map(String):[];
  if(!topic)return NextResponse.json({error:"A topic is required."},{status:400});
  const fallback={style:"gold-linework watercolor editorial illustration, muted palette, cinematic 2D composition, hand-painted texture",characters:[],continuityRules:["Use original topic-specific characters only.","Preserve face, hair, outfit, accessories, proportions and palette across scenes."]};
  const key=process.env.GEMINI_API_KEY;if(!key)return NextResponse.json({...fallback,provider:"native-no-key",characterAssets:"topic-specific-only"});
  const prompt=`For a short factual explainer about "${topic}", decide whether recurring illustrated characters materially help. If not, return zero characters. If yes, create at most 3 ORIGINAL characters. Do not use existing Cartoon Studios characters. Return JSON only with style, characters (id,name,role,appearance,outfit,palette,personality), and continuityRules. Make designs visually specific and identical across scenes. Script: ${script.join(" | ")}`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.2}})});
  if(!r.ok)throw new Error("Character director failed.");
  const d=await r.json(),raw=d?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||"").join("")||"";
  const parsed=JSON.parse(raw);
  return NextResponse.json({...fallback,...parsed,provider:"gemini-character-director",characterAssets:"topic-specific-only"});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Character director failed."},{status:500});}
}