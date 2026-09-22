import { apiRequest } from "@/lib/api";

export const AI_FIX_SUGGESTION_UNAVAILABLE =
  "AI suggestion unavailable — follow the suggested fix above.";

export type FixSuggestionStep = {
  step: number;
  title: string;
  detail: string;
};

export type FixSuggestionPayload = {
  task_type: "fix_suggestion";
  check_id: string;
  headline: string;
  whats_wrong: string;
  why_it_matters: string;
  suggestions: FixSuggestionStep[];
  cautions: string[];
  confidence: "low" | "medium" | "high";
};

export type FixSuggestionResponse = {
  suggestion_id: string;
  check_id: string;
  fingerprint: string;
  cached: boolean;
  /** True when payload is a legacy row without content_hash (hint Refresh). */
  stale?: boolean;
  model: string;
  prompt_version: string;
  payload: FixSuggestionPayload;
};

export function aiFixSuggestionQueryKey(
  checkId: string,
  dcsRunId?: number | null,
) {
  return [
    "ai",
    "suggestions",
    "fix",
    checkId.trim().toUpperCase(),
    dcsRunId ?? "latest",
  ] as const;
}

export async function getOrCreateFixSuggestion(
  checkId: string,
  dcsRunId?: number | null,
  options?: { forceRefresh?: boolean },
): Promise<FixSuggestionResponse> {
  const body: {
    check_id: string;
    dcs_run_id?: number;
    force_refresh?: boolean;
  } = {
    check_id: checkId.trim().toUpperCase(),
  };
  if (typeof dcsRunId === "number" && Number.isFinite(dcsRunId)) {
    body.dcs_run_id = dcsRunId;
  }
  if (options?.forceRefresh) {
    body.force_refresh = true;
  }
  return apiRequest("/api/v1/ai/suggestions/fix/", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<FixSuggestionResponse>;
}

export function isValidFixSuggestionPayload(
  payload: unknown,
): payload is FixSuggestionPayload {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Partial<FixSuggestionPayload>;
  return (
    typeof row.headline === "string" &&
    row.headline.trim().length > 0 &&
    typeof row.whats_wrong === "string" &&
    row.whats_wrong.trim().length > 0 &&
    typeof row.why_it_matters === "string" &&
    row.why_it_matters.trim().length > 0 &&
    Array.isArray(row.suggestions) &&
    row.suggestions.length >= 2
  );
}

export type ExplainFindingPayload = {
  task_type: "explain_finding";
  check_id: string;
  headline: string;
  explanation: string;
  systems: string[];
};

export type ExplainFindingResponse = {
  suggestion_id: string;
  check_id: string;
  fingerprint: string;
  cached: boolean;
  model: string;
  prompt_version: string;
  payload: ExplainFindingPayload;
};

export type NbaBlurbPayload = {
  task_type: "nba_blurb";
  check_id: string;
  blurb: string;
};

export type NbaBlurbResponse = {
  suggestion_id: string;
  check_id: string;
  fingerprint: string;
  cached: boolean;
  model: string;
  prompt_version: string;
  payload: NbaBlurbPayload;
};

export function aiExplainFindingQueryKey(
  checkId: string,
  dcsRunId?: number | null,
) {
  return [
    "ai",
    "suggestions",
    "explain",
    checkId.trim().toUpperCase(),
    dcsRunId ?? "latest",
  ] as const;
}

export function aiNbaBlurbQueryKey(
  checkId: string,
  dcsRunId?: number | null,
  planRank?: number | null,
) {
  return [
    "ai",
    "suggestions",
    "nba",
    checkId.trim().toUpperCase(),
    dcsRunId ?? "latest",
    planRank ?? "none",
  ] as const;
}

export async function getOrCreateExplainFinding(
  checkId: string,
  dcsRunId?: number | null,
): Promise<ExplainFindingResponse> {
  const body: { check_id: string; dcs_run_id?: number } = {
    check_id: checkId.trim().toUpperCase(),
  };
  if (typeof dcsRunId === "number" && Number.isFinite(dcsRunId)) {
    body.dcs_run_id = dcsRunId;
  }
  return apiRequest("/api/v1/ai/suggestions/explain/", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<ExplainFindingResponse>;
}

export async function getOrCreateNbaBlurb(
  checkId: string,
  dcsRunId?: number | null,
  planRank?: number | null,
): Promise<NbaBlurbResponse> {
  const body: { check_id: string; dcs_run_id?: number; plan_rank?: number } = {
    check_id: checkId.trim().toUpperCase(),
  };
  if (typeof dcsRunId === "number" && Number.isFinite(dcsRunId)) {
    body.dcs_run_id = dcsRunId;
  }
  if (typeof planRank === "number" && Number.isFinite(planRank) && planRank > 0) {
    body.plan_rank = planRank;
  }
  return apiRequest("/api/v1/ai/suggestions/nba/", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<NbaBlurbResponse>;
}

export function isValidExplainFindingPayload(
  payload: unknown,
): payload is ExplainFindingPayload {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Partial<ExplainFindingPayload>;
  return (
    typeof row.headline === "string" &&
    row.headline.trim().length > 0 &&
    typeof row.explanation === "string" &&
    row.explanation.trim().length > 0
  );
}

export function isValidNbaBlurbPayload(
  payload: unknown,
): payload is NbaBlurbPayload {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Partial<NbaBlurbPayload>;
  return typeof row.blurb === "string" && row.blurb.trim().length > 0;
}

export function aiSuggestionErrorMessage(error: unknown): string {
  if (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|networkerror/i.test(error.message))
  ) {
    return AI_FIX_SUGGESTION_UNAVAILABLE;
  }
  if (error && typeof error === "object") {
    const rec = error as { status?: unknown; code?: unknown };
    if (
      rec.status === 404 ||
      rec.status === 422 ||
      rec.status === 500 ||
      rec.status === 503 ||
      rec.code === "ai_disabled" ||
      rec.code === "gate_denied" ||
      rec.code === "json_retry_exhausted" ||
      rec.code === "provider_not_configured" ||
      rec.code === "rate_limited" ||
      rec.code === "ai_unavailable"
    ) {
      return AI_FIX_SUGGESTION_UNAVAILABLE;
    }
  }
  return AI_FIX_SUGGESTION_UNAVAILABLE;
}
