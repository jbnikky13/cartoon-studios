import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Scene = {
  number:number; title:string; start:number; end:number; summary:string;
  emotion:string; setting:string; camera:string;
  actions:{character:string;action:string;emotion?:string;gesture?:string}[];
  imagePrompt:string;
};

function fallbackPlan(title:string, character:string, direction:string, duration:number) {
  const beats = [
    ["The Signal","curious","A quiet, cinematic opening location with one striking visual motif","wide","standing still, noticing a distant light"],
    ["The World Moves","restless","A wide environment that makes the lead feel small","slow pan","walking through the environment"],
    ["Inner Weather","vulnerable","An intimate close-up with expressive eyes and atmospheric reflections","close-up","looking away, then meeting the camera"],
    ["Reality Bends","intense","A surreal transition where the environment responds to the music","orbiting camera","turning as the world shifts around them"],
    ["The Threshold","hopeful","A symbolic doorway, bridge, horizon, or other visual choice point","push in","reaching toward the light"],
    ["Somewhere Else","liberated","A memorable final tableau that echoes the opening but feels transformed","pull back","walking forward into the new world"]
  ];
  return {
    story_title: title + " — Anime Music Video",
    mode:"anime-music-video",
    logline: direction || "A character crosses an emotional landscape and discovers a world that reflects their inner life.",
    theme:"identity, emotion and transformation",
    emotional_arc:["curious","restless","vulnerable","intense","hopeful","liberated"],
    characters:[{role:character,description:"Original anime lead character. Keep the face, hairstyle, outfit, proportions and palette consistent in every scene."}],
    scenes:beats.map((b,i)=>({
      number:i+1,title:b[0],start:Math.round(duration*i/6),end:Math.round(duration*(i+1)/6),
      summary:b[2]+". "+(direction||"Follow the emotional arc of the song.") ,
      emotion:b[1],setting:b[2],camera:b[3],
      actions:[{character,action:b[4],emotion:b[1]}],
      imagePrompt:"Cinematic original 2D anime music video frame, " + b[2] + ". " + b[4] + ". " + direction + ". Same lead character: " + character + ". Rich art direction, detailed lighting, expressive composition, atmospheric depth, no text, no subtitles, no logo, no watermark."
    }))
  };
}

export async function POST(req:Request) {
  try {
    const body = await req.json();
    const title = String(body.title||"Untitled Track").trim().slice(0,120);
    const artist = String(body.artist||"").trim().slice(0,120);
    const character = String(body.character||"Lead Character").trim().slice(0,80) || "Lead Character";
    const direction = String(body.direction||"").trim().slice(0,1200);
    const duration = Math.min(300,Math.max(15,Math.round(Number(body.duration)||90)));
    if (!title) return NextResponse.json({error:"Add a song or project title."},{status:400});
    const key=process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({plan:fallbackPlan(title,character,direction,duration),provider:"built-in storyboard templates",notice:"AI scene planning is not configured yet. Add GEMINI_API_KEY to enable generated scene plans; the storyboard template is ready to edit."});
    const prompt = `You are an expert anime music-video director. Create a cohesive 6-scene original anime storyboard for the song/project "${title}" by ${artist||"an independent artist"}. Creative direction: ${direction||"dreamlike, emotionally rich, cinematic anime"}.
Lead character name: ${character}. Total duration: ${duration} seconds. Keep timings contiguous and within total duration. Return ONLY valid JSON with keys story_title, mode, logline, theme, emotional_arc (array of 4-6 strings), characters (array of {role,description}), scenes (exactly 6 objects). Each scene object: number (1-6), title, start, end, summary, emotion, setting, camera, actions (array of {character,action,emotion,gesture}), imagePrompt. imagePrompt must be a detailed single-frame visual prompt; preserve the lead's same face, hair, outfit and palette in all scenes. No copyrighted characters, no text in artwork. Scene 1 starts at 0 and scene 6 ends at ${duration}. Use these durations approximately evenly.`;
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.8}})
    });
    if (!response.ok) return NextResponse.json({plan:fallbackPlan(title,character,direction,duration),provider:"built-in storyboard templates",notice:"The AI planner could not be reached, so a ready-to-edit template was created."});
    const data=await response.json();
    const text=String(data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"");
    const parsed=JSON.parse(text.replace(/^```json\s*/,"").replace(/\s*```$/,""));
    if (!Array.isArray(parsed.scenes)||!parsed.scenes.length) throw new Error("The AI planner returned an empty storyboard.");
    parsed.scenes=parsed.scenes.slice(0,8).map((s:any,i:number)=>({
      ...s,number:i+1,start:Math.max(0,Number(s.start)||0),end:Math.max(1,Number(s.end)||Math.round(duration*(i+1)/6)),
      actions:Array.isArray(s.actions)?s.actions:[{character,action:"standing and looking into the distance",emotion:s.emotion||"reflective"}],
      imagePrompt:String(s.imagePrompt||s.summary||"Cinematic anime scene")
    }));
    return NextResponse.json({plan:parsed,provider:"Gemini AI"});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Could not create storyboard."},{status:500});
  }
}
