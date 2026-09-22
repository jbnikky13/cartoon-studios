import { NextResponse } from "next/server";
import { buildCharacterBible, characterPrompt } from "../../../../lib/explainer/characterBible";

export const runtime = "nodejs";
export const maxDuration = 30;

type Source = { url:string; title:string; domain:string; text:string };
const BLOCKED = new Set(["pinterest.com","quora.com","facebook.com","instagram.com","tiktok.com","twitter.com","x.com","reddit.com"]);

function domainOf(value:string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; }
}

function stripHtml(html:string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg[\s\S]*?<\/svg>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&#39;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/\s+/g," ")
    .trim();
}

function meta(html:string,key:string) {
  const escapedKey = key.replace(/[.*+?^{}()|[\\]\\\\]/g, "\\\\$&");
  const re = new RegExp("<meta\\\\b[^>]*(?:property|name)=['\\\"]"+escapedKey+"['\\\"][^>]*content=['\\\"]([^'\\\"]*)['\\\"][^>]*>", "i");
  return re.exec(html)?.[1] || "";
}

async function searchDuckDuckGo(topic:string) {
  const response = await fetch("https://duckduckgo.com/html/?q="+encodeURIComponent(topic), {
    headers: { "user-agent":"Mozilla/5.0 (CartoonStudioTopicStory/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Topic search failed.");
  const html = await response.text();
  const urls:string[] = [];
  const re = /<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match:RegExpExecArray|null;
  while ((match=re.exec(html)) && urls.length<8) {
    let href=match[1];
    try {
      const u=new URL(href,"https://duckduckgo.com");
      const redirected=u.searchParams.get("uddg");
      href=redirected ? decodeURIComponent(redirected) : href;
    } catch {}
    if (href.startsWith("http") && !urls.includes(href)) urls.push(href);
  }
  return urls;
}

async function fetchSource(url:string):Promise<Source|null> {
  const domain=domainOf(url);
  if (!domain || BLOCKED.has(domain)) return null;
  try {
    const response=await fetch(url,{
      headers:{"user-agent":"CartoonStudioTopicStory/1.0"},
      signal:AbortSignal.timeout(12000),
      redirect:"follow",
    });
    if (!response.ok || !(response.headers.get("content-type")||"").includes("text/html")) return null;
    const finalUrl=response.url;
    const finalDomain=domainOf(finalUrl);
    if (!finalDomain || BLOCKED.has(finalDomain)) return null;
    const html=await response.text();
    const title=meta(html,"og:title") || meta(html,"twitter:title") || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g," ").trim() || finalDomain;
    const description=meta(html,"og:description") || meta(html,"description");
    const text=stripHtml(html).slice(0,18000);
    return {url:finalUrl,title,domain:finalDomain,text: text.length>=200 ? text : description || ""};
  } catch { return null; }
}

function sentences(text:string) {
  return text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>=40);
}

function similar(a:string,b:string) {
  const A=new Set(a.toLowerCase().split(/\s+/));
  const B=new Set(b.toLowerCase().split(/\s+/));
  if (!A.size || !B.size) return false;
  let overlap=0; for(const word of A) if(B.has(word)) overlap++;
  return overlap/Math.min(A.size,B.size)>=0.6;
}

function synthesizeFallback(topic:string,sources:Source[],count=8) {
  const beats=[`Let's talk about ${topic}.`];
  const used:string[]=[];
  const pools=sources.map(s=>sentences(s.text));
  while(beats.length<count && pools.some(p=>p.length)) {
    let progressed=false;
    for(const pool of pools) {
      const candidate=pool.shift();
      if(!candidate || used.some(x=>similar(candidate,x))) continue;
      beats.push(candidate); used.push(candidate); progressed=true;
      if(beats.length>=count) break;
    }
    if(!progressed) break;
  }
  while(beats.length<count) beats.push("There's more to this story than meets the eye.");
  return beats.slice(0,count).map((text)=>({narration:text,imagePrompt:`gold-linework watercolor illustration, editorial explainer, cohesive muted palette, visualizing: ${text}`}));
}

async function synthesizeWithGemini(topic:string,sources:Source[],count:number) {
  const key=process.env.GEMINI_API_KEY;
  if(!key) return null;
  const sourceText=sources.map(s=>`SOURCE ${s.domain}: ${s.text.slice(0,5000)}`).join("\n\n");
  const bible=buildCharacterBible(topic, []);
  const prompt=`Create a factual ${count}-beat short explainer about "${topic}" using ONLY the supplied sources. Return JSON only as an array. Each item must have "narration" (one punchy sentence, max 22 words) and "imagePrompt" (one visual prompt). You may introduce original recurring characters when useful, but they must remain identical across scenes. ${characterPrompt(bible)} Do not use or reference any existing Cartoon Studios character assets. Do not invent facts.\n\n${sourceText}`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.3}})
  });
  if(!response.ok) throw new Error("Gemini script generation failed.");
  const data=await response.json();
  const raw=data?.candidates?.[0]?.content?.parts?.map((p:{text?:string})=>p.text||"").join("")||"";
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed)) throw new Error("Gemini returned an invalid script.");
  return parsed.slice(0,count).map((item:{narration?:unknown;imagePrompt?:unknown})=>({
    narration:String(item.narration||"").trim(),
    imagePrompt:String(item.imagePrompt||"gold-linework watercolor illustration, editorial explainer, muted palette").trim()
  })).filter((item:{narration:string})=>item.narration);
}

export async function POST(req:Request) {
  try {
    const body:unknown=await req.json();
    const topic=typeof body==="object"&&body!==null&&"topic" in body ? String((body as {topic?:unknown}).topic||"").trim() : "";
    if(!topic) return NextResponse.json({error:"A topic is required."},{status:400});

    const candidates=await searchDuckDuckGo(topic);
    const sources:Source[]=[];
    const seen=new Set<string>();
    for(const url of candidates) {
      const source=await fetchSource(url);
      if(!source || seen.has(source.domain)) continue;
      sources.push(source); seen.add(source.domain);
      if(sources.length>=4) break;
    }
    if(!sources.length) return NextResponse.json({error:"Couldn't find usable sources for this topic."},{status:502});

    const beatCount=Math.min(12,Math.max(8,Number((body as {beatCount?:unknown})?.beatCount)||8));
    let beats=await synthesizeWithGemini(topic,sources,beatCount);
    const provider=beats ? "duckduckgo-html + Gemini script director" : "duckduckgo-html + native fallback director";
    if(!beats) beats=synthesizeFallback(topic,sources,beatCount);
    return NextResponse.json({
      topic,
      beats,
      script:beats.map((b:{narration:string})=>b.narration),
      sources:sources.map(({url,title,domain})=>({url,title,domain})),
      provider,
      llmUsed:Boolean(process.env.GEMINI_API_KEY),
      characterAssets:"topic-specific-originals-only",
    });
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Topic research failed."},{status:500});
  }
}
