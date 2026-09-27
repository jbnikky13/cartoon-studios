import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IntentGuardRequest = {
  requestId: string;
  actorId: string;
  wallet?: string;
  requestedAt: string;
  signals: Array<{
    domain: "TRANSACTION" | "AGENT" | "PROTOCOL";
    code: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    source: string;
    timestamp: string;
    evidence?: Record<string, string | number | boolean>;
  }>;
};

function isIntentGuardRequest(value: unknown): value is IntentGuardRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.actorId === "string" &&
    typeof candidate.requestedAt === "string" &&
    Array.isArray(candidate.signals)
  );
}

export async function POST(request: Request) {
  const baseUrl = process.env.INTENTGUARD_STAGING_URL;
  const token = process.env.INTENTGUARD_STAGING_TOKEN;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "INTENTGUARD_STAGING_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!isIntentGuardRequest(body)) {
    return NextResponse.json({ error: "INVALID_INTENT_REQUEST" }, { status: 400 });
  }

  try {
    const upstream = await fetch(new URL("/api/staging/intent", baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    const payload: unknown = await upstream.json().catch(() => ({
      error: "INTENTGUARD_INVALID_RESPONSE"
    }));

    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { error: "INTENTGUARD_UNREACHABLE" },
      { status: 503 }
    );
  }
}
