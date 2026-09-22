import {NextResponse} from "next/server";

export const runtime="nodejs";

type Evidence={source:string;title:string;url:string;domain:string;sourceType:string;text:string;publishedAt?:string|null};

const blocked=new Set(["facebook.com","instagram.com","tiktok.com","x.com","twitter.com","pinterest.com","reddit.com"]);

function domainOf(url:string){try{return new URL(url).hostname.replace(/^www\./,"").toLowerCase()}catch{return ""}}

async function fetchPage(url:string){
 const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; CartoonStudiosResearch/1.0)","accept":"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw new Error("HTTP "+r.status);
 const html=await r.text();
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||url).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
 const text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
 return {title,text:text.slice(0,12000)};
}

async function wikipedia(topic:string):Promise<Evidence[]>{
 const r=await fetch("https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(topic)+"&gsrlimit=3&prop=extracts|info&explaintext=1&exintro=1&inprop=url&format=json",{headers:{"user-agent":"CartoonStudiosResearch/1.0"},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error("Wikipedia unavailable");
 const d=await r.json(),pages=Object.values(d?.query?.pages||{}) as any[];
 return pages.map(p=>({source:"Wikipedia",title:p.title,url:p.fullurl||("https://en.wikipedia.org/wiki/"+encodeURIComponent(String(p.title).replace(/ /g,"_"))),domain:"wikipedia.org",sourceType:"encyclopedia",text:String(p.extract||"")})).filter(x=>x.text.length>100);
}

async function wikidata(topic:string):Promise<Evidence[]>{
 const r=await fetch("https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+encodeURIComponent(topic)+"&language=en&format=json&limit=3",{headers:{"user-agent":"CartoonStudiosResearch/1.0"},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error("Wikidata unavailable");
 const d=await r.json();
 return (d.search||[]).map((x:any)=>({source:"Wikidata",title:x.label||x.id,url:"https://www.wikidata.org/wiki/"+x.id,domain:"wikidata.org",sourceType:"structured-data",text:[x.label,x.description].filter(Boolean).join(". ")}));
}

async function webSearch(topic:string):Promise<string[]>{
 const endpoints=[
  "https://html.duckduckgo.com/html/?q="+encodeURIComponent(topic),
  "https://lite.duckduckgo.com/lite/?q="+encodeURIComponent(topic)
 ];
 for(const endpoint of endpoints)try{
  const r=await fetch(endpoint,{headers:{"user-agent":"Mozilla/5.0 (compatible; CartoonStudiosResearch/1.0)"},signal:AbortSignal.timeout(9000)});
  if(!r.ok)continue; const html=await r.text(),out:string[]=[];
  const re=/<a[^>]+href=["']([^"']+)["'][^>]*>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))&&out.length<8){let u=m[1];try{const p=new URL(u,"https://duckduckgo.com");u=p.searchParams.get("uddg")||u;}catch{}if(/^https?:\/\//.test(u)&&!out.includes(u))out.push(u);}
  if(out.length)return out;
 }catch{}
 return [];
}

export async function POST(req:Request){
 try{
  const b=await req.json() as {topic?:string;urls?:string[]};
  const topic=String(b.topic||"").trim(); const urls=Array.isArray(b.urls)?b.urls.map(String).filter(Boolean):[];
  if(!topic&&!urls.length)return NextResponse.json({error:"Provide a topic or at least one source URL."},{status:400});
  const evidence:Evidence[]=[];
  if(topic){
   try{evidence.push(...await wikipedia(topic));}catch{}
   try{evidence.push(...await wikidata(topic));}catch{}
   const candidates=await webSearch(topic);
   for(const url of candidates){
    const domain=domainOf(url); if(!domain||blocked.has(domain)||evidence.some(e=>e.domain===domain))continue;
    try{const p=await fetchPage(url);if(p.text.length>200)evidence.push({source:domain,title:p.title,url,domain,sourceType:"web",text:p.text});}catch{}
    if(evidence.filter(e=>e.sourceType==="web").length>=4)break;
   }
  }
  for(const url of urls){
   try{
    const domain=domainOf(url);if(!domain)continue;
    const p=await fetchPage(url);
    if(p.text.length>200)evidence.push({source:"Uploaded link",title:p.title,url,domain,sourceType:"user-provided",text:p.text});
   }catch{}
  }
  const unique=[...new Map(evidence.map(e=>[e.url,e])).values()];
  if(!unique.length)return NextResponse.json({error:"No usable research sources were found."},{status:502});
  return NextResponse.json({topic,evidence:unique.slice(0,12),sources:unique.map(({text,...s})=>s),sourceCount:unique.length});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Research failed."},{status:500});}
}