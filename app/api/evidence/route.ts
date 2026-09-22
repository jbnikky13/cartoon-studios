import { NextResponse } from "next/server";

function getMeta(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^()|[\]\\]/g, "\\$&");
  const property = new RegExp('<meta[^>]+property=["\\\\']' + escaped + '["\\\\'][^>]+content=["\\\\']([^"\\\\']+)["\\\\']', "i");
  const name = new RegExp('<meta[^>]+name=["\\\\']' + escaped + '["\\\\'][^>]+content=["\\\\']([^"\\\\']+)["\\\\']', "i");
  return property.exec(html)?.[1] ?? name.exec(html)?.[1] ?? "";
}

function resolveUrl(base: string, value: string): string {
  try { return new URL(value, base).toString(); } catch { return ""; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    const url = typeof body === "object" && body !== null && "url" in body
      ? (body as { url?: unknown }).url
      : undefined;

    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "A public URL is required." }, { status: 400 });
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only public http(s) URLs are supported." }, { status: 400 });
    }

    const response = await fetch(parsed.toString(), {
      headers: { "user-agent": "CartoonStudioDiscovery/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "The webpage could not be fetched." }, { status: 502 });
    }

    const html = await response.text();
    const title =
      getMeta(html, "og:title") ||
      getMeta(html, "twitter:title") ||
      /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ||
      "Discovery Story";

    const description = getMeta(html, "og:description") || getMeta(html, "description");
    const imageUrls: string[] = [];
    const imageContexts: string[] = [];
    const imagePattern = /<(?:meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']|img[^>]+(?:src|data-src)=["']([^"']+)["'])/gi;

    let match: RegExpExecArray | null;
    while ((match = imagePattern.exec(html)) !== null && imageUrls.length < 12) {
      const imageUrl = resolveUrl(response.url, match[1] || match[2]);
      if (imageUrl && !imageUrls.includes(imageUrl)) {
        imageUrls.push(imageUrl);
        imageContexts.push("");
      }
    }

    const text = stripHtml(html).slice(0, 18000);
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence: string) => sentence.length > 40)
      .slice(0, 8);

    return NextResponse.json({
      story: {
        title,
        description,
        sourceUrl: response.url,
        text,
        imageUrls,
        imageContexts,
        sentences,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery failed." },
      { status: 500 },
    );
  }
}
