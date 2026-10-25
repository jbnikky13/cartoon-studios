import {NextResponse} from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BASE = "https://api.minimax.io";

function safeProviderMessage(value: unknown) {
  return String(value || "No provider detail returned.")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]")
    .slice(0, 600);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body.action || "create");
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: "MiniMax video generation is not configured. Add MINIMAX_API_KEY to the Vercel Production environment and redeploy."
      }, { status: 503 });
    }

    const base = (process.env.MINIMAX_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    if (action === "status") {
      const taskId = String(body.taskId || "").trim();
      if (!taskId || taskId.length > 200 || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
        return NextResponse.json({ error: "A valid task ID is required." }, { status: 400 });
      }
      const response = await fetch(`${base}/v2/query/video_generation/${encodeURIComponent(taskId)}`, {
        method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(30000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return NextResponse.json({ error: `MiniMax status check failed (HTTP ${response.status}): ${safeProviderMessage(data?.base_resp?.status_msg || data?.message || data?.error)}` }, { status: 502 });
      }
      return NextResponse.json({ task: data.task || data, provider: "MiniMax H3" });
    }

    if (action !== "create") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const prompt = String(body.prompt || "").trim().slice(0, 5000);
    const referenceImage = typeof body.referenceImage === "string" ? body.referenceImage : "";
    const duration = Math.round(Number(body.duration) || 6);
    const ratio = body.ratio === "16:9" ? "16:9" : "9:16";
    const resolution = body.resolution === "1080P" || body.resolution === "720P" ? body.resolution : "768P";
    if (prompt.length < 8) return NextResponse.json({ error: "Enter a scene prompt of at least 8 characters." }, { status: 400 });
    if (duration < 4 || duration > 15) return NextResponse.json({ error: "MiniMax H3 scene duration must be between 4 and 15 seconds." }, { status: 400 });
    if (referenceImage && (!referenceImage.startsWith("data:image/") || referenceImage.length > 12_000_000)) {
      return NextResponse.json({ error: "Reference image must be a supported image under 9 MB." }, { status: 400 });
    }

    const content: Array<Record<string, unknown>> = [{
      type: "text",
      text: `Photorealistic live-action microdrama. Cinematic but believable human performance, natural lighting, realistic skin and hair, physically plausible movement, subtle camera motion. No cartoon, illustration, text overlays, subtitles or watermarks. ${prompt}`
    }];
    if (referenceImage) content.push({ type: "image_url", image_url: referenceImage, role: "reference_image" });

    const response = await fetch(`${base}/v2/video_generation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: "MiniMax-H3", content, resolution, duration, ratio }),
      cache: "no-store",
      signal: AbortSignal.timeout(55000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({
        error: `MiniMax video task creation failed (HTTP ${response.status}): ${safeProviderMessage(data?.base_resp?.status_msg || data?.message || data?.error)}`
      }, { status: 502 });
    }
    const taskId = data.task_id || data.taskId;
    if (!taskId) {
      return NextResponse.json({ error: "MiniMax did not return a task ID. Check that the configured account supports the selected video model." }, { status: 502 });
    }
    return NextResponse.json({ taskId: String(taskId), status: data.status || "submitted", provider: "MiniMax H3" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MiniMax request failed.";
    return NextResponse.json({ error: message.slice(0, 400) }, { status: 500 });
  }
}
