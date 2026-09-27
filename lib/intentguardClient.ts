export type IntentGuardAction =
  | "ALLOW"
  | "REQUIRE_APPROVAL"
  | "BLOCK"
  | "QUARANTINE";

type IntentGuardResponse = {
  decision?: {
    action?: IntentGuardAction;
  };
  error?: string;
};

export async function inspectWithIntentGuard(input: {
  operation: string;
  actorId?: string;
  evidence?: Record<string, string | number | boolean>;
}): Promise<IntentGuardResponse> {
  const timestamp = new Date().toISOString();
  const response = await fetch("/api/intentguard/inspect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `cartoon-studio-${Date.now()}`,
      actorId: input.actorId ?? "cartoon-studio-user",
      requestedAt: timestamp,
      signals: [
        {
          domain: "AGENT",
          code: input.operation,
          severity: "LOW",
          source: "cartoon-studio",
          timestamp,
          evidence: input.evidence ?? {}
        }
      ]
    })
  });

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "IntentGuard inspection failed";
    throw new Error(error);
  }

  return payload as IntentGuardResponse;
}
