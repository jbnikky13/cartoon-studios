import { NextResponse } from "next/server";

function meta(html:string,key:string){
  const pattern='<meta[^>]+(?:property|name)=["\\']'+key+'["\\'][^>]+content=["\\']([^"\\']+)["\\']';
  const match=new RegExp(pattern,"i").exec(html);
  return match?.[1]||"";
}
function abs(base:string,value:string){try{return new URL(value,base).toString()}catch{return ""}}
function strip(html:string){return html.replace(/<script[\\s\\S]*?<\\/script>/gi," ").replace(/<style[\\s\\S]*?<\\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\\s+/g," ").trim()}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const url=body?.url;
    if(typeof url!=="string")return NextResponse.json({error:"A public URL is required."},{status:400});
    const parsed=new URL(url);
    if(!["http:","https:"].includes(parsed.protocol))throw new Error("Only public http(s) URLs are supported.");
    const res=await fetch(parsed.toString(),{headers:{"user-agent":"CartoonStudioDiscovery/1.0"},signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error("The webpage could not be fetched.");
    const html=await res.text();
    const title=meta(html,"og:title")||meta(html,"twitter:title")||(/<title[^>]*>([\\s\\S]*?)<\\/title>/i.exec(html)?.[1]||"Discovery Story").replace(/\\s+/g," ").trim();
    const description=meta(html,"og:description")||meta(html,"description");
    const imageUrls:string[]=[];
    const contexts:string[]=[];
    const re=/<(?:meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']|img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*)/gi;
    let match:RegExpExecArray|null;
    while((match=re.exec(html))&&imageUrls.length<12){
      const imageUrl=abs(res.url,match[1]||match[2]);
      if(imageUrl&&/^https?:/.test(imageUrl)&&!imageUrls.includes(imageUrl)){imageUrls.push(imageUrl);contexts.push("")}
    }
    const text=strip(html).slice(0,18000);
    const sentences=text.split(/(?<=[.!?])\\s+/).filter((s:string)=>s.length>40).slice(0,8);
    return NextResponse.json({story:{title,description,sourceUrl:res.url,text,imageUrls,imageContexts:contexts,sentences}});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Discovery failed."},{status:500});
  }
}