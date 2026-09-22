import {NextResponse} from "next/server";
import {buildCharacterBible, characterPrompt, ExplainerCharacter} from "../../../../lib/explainer/characterBible";

export const runtime="nodejs";

export async function POST(req:Request){
  try{
    const body=await req.json() as {topic?:unknown;characters?:unknown};
    const topic=String(body.topic||"").trim();
    if(!topic) return NextResponse.json({error:"A topic is required."},{status:400});
    const supplied=Array.isArray(body.characters) ? body.characters as ExplainerCharacter[] : [];
    const bible=buildCharacterBible(topic,supplied);
    return NextResponse.json({
      topic,
      style:bible.style,
      characters:bible.characters,
      continuityRules:bible.continuityRules,
      promptPrefix:characterPrompt(bible),
      characterAssets:"not-from-studio-library"
    });
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Character bible failed."},{status:500});
  }
}
