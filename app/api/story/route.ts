import { NextResponse } from "next/server";
export const runtime = "nodejs";

type Song = { trackName?: string; artistName?: string; duration?: number; plainLyrics?: string };
type Action = { character: string; action: string; emotion?: string; gesture?: string };
type Scene = { number:number; title:string; start:number; end:number; summary:string; emotion:string; setting:string; camera:string; actions:Action[] };
type Story = { story_title:string; mode:string; logline:string; theme:string; emotional_arc:string[]; characters:{role:string;description:string}[]; scenes:Scene[] };

function cleanWords(text:string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g," ").split(/\s+/).filter(Boolean);
}

function buildStory(song:Song): Story {
  const title = String(song.trackName || "Untitled Song");
  const artist = String(song.artistName || "Unknown Artist");
  const lyrics = String(song.plainLyrics || "");
  const words = new Set(cleanWords(lyrics));
  const duration = Math.max(24, Math.round(Number(song.duration) || 120));
  const hasLove = ["love","heart","kiss","baby","darling","forever"].some(w=>words.has(w));
  const hasNight = ["night","moon","dark","stars","dream"].some(w=>words.has(w));
  const hasDance = ["dance","dancing","party","move","music"].some(w=>words.has(w));
  const hasSad = ["cry","tears","lonely","alone","miss","goodbye","pain"].some(w=>words.has(w));
  const hasHope = ["hope","rise","light","strong","again","better","free"].some(w=>words.has(w));

  const theme = hasLove ? "connection and emotional closeness" : hasHope ? "resilience and moving forward" : hasSad ? "finding meaning after a difficult moment" : hasDance ? "freedom, movement and shared energy" : "self-discovery and momentum";
  const arc = hasSad && hasHope ? ["restless","reflective","hopeful","uplifted"] : hasSad ? ["restless","reflective","accepting","quiet"] : hasDance ? ["curious","energized","joyful","liberated"] : ["curious","immersed","determined","fulfilled"];
  const setting = hasNight ? "a glowing city at night" : "a stylized neighborhood at golden hour";
  const step = duration / 4;
  const scenes:Scene[] = [
    {number:1,title:"The First Beat",start:0,end:Math.round(step),summary:`A lone character enters ${setting}, noticing a small visual detail that mirrors the song's mood.`,emotion:arc[0],setting,camera:"slow establishing push-in",actions:[{character:"Lead",action:"walk_in",emotion:arc[0]},{character:"Lead",action:"look",gesture:"pause and notice"}]},
    {number:2,title:"The World Responds",start:Math.round(step),end:Math.round(step*2),summary:`The environment begins reacting to the rhythm as the character follows the feeling of “${title}”.`,emotion:arc[1],setting,camera:"gentle tracking shot",actions:[{character:"Lead",action:hasDance?"dance":"walk",emotion:arc[1]},{character:"Lead",action:"look_right",gesture:"follow the movement"}]},
    {number:3,title:"The Turning Point",start:Math.round(step*2),end:Math.round(step*3),summary:hasLove?"The character reaches another figure and the emotional distance between them closes.":hasSad?"The character stops, faces the difficult feeling, and chooses to keep moving.":"The character reaches a turning point and commits to the next step.",emotion:arc[2],setting,camera:"medium orbit",actions:[{character:"Lead",action:"think",emotion:arc[2]},{character:hasLove?"Friend":"Lead",action:hasLove?"walk_in":"point",gesture:hasLove?"open arms":"look toward the horizon"}]},
    {number:4,title:"The Release",start:Math.round(step*3),end:duration,summary:`The final movement opens the frame into a clear visual resolution, leaving the character changed by the journey.`,emotion:arc[3],setting,camera:"wide pull-back",actions:[{character:"Lead",action:hasDance?"dance":"walk",emotion:arc[3]},{character:"Lead",action:"wave",gesture:"face the horizon"}]}
  ];
  return {story_title:`${title}: ${arc[3]}`,mode:"Canvas Story Director",logline:`${artist}'s “${title}” becomes a compact visual journey about ${theme}.`,theme,emotional_arc:arc,characters:[{role:"Lead",description:"A lightweight 2D protagonist whose movement carries the song's emotional arc."},{role:hasLove?"Friend":"Environment",description:hasLove?"A supporting presence that gives the emotional turning point a visual payoff.":"A responsive world that changes with the rhythm and mood."}],scenes};
}

export async function POST(req:Request){
  try {
    const body:unknown=await req.json();
    const song=typeof body==="object"&&body!==null&&"song" in body ? (body as {song?:unknown}).song : undefined;
    if(typeof song!=="object"||song===null) return NextResponse.json({error:"A song record is required."},{status:400});
    const story=buildStory(song as Song);
    return NextResponse.json({story,provider:"native-canvas-director"});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Story generation failed"},{status:500});
  }
}