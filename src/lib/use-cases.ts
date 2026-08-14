import { apiRequest } from "@/lib/api";

export const UC_RECOMMENDATIONS_QUERY_KEY = ["use-cases", "recommendations"] as const;
export const UC_DETAIL_QUERY_KEY = ["use-cases", "detail"] as const;
export const UC_STALE_MS = 8_000;

export const UC_ID_RE = /^UC-[0-9]{2}[A-Z]?$/;

export type UseCasePilotStatus =
  | "ready"
  | "blocked_dcs_score"
  | "blocked_checks"
  | "blocked_mode"
  | "unavailable";

export type UseCaseBlocker = {
  code: string;
  detail: string;
  href?: string | null;
  check_id?: string;
};

export type UseCaseCheckResult = {
  check_id: string;
  result: string;
  href?: string;
};

export type UseCasePilotRecommendation = {
  use_case_id: string;
  pilot_rank: number;
  title: string;
  status: UseCasePilotStatus;
  gap_suggested: boolean;
  gap_stages: string[];
  gates: {
    min_dcs: number;
    gating_check_ids: string[];
    architecture_modes: string[];
  };
  blockers: UseCaseBlocker[];
  check_results: UseCaseCheckResult[];
  execution: {
    mcp_dependency: boolean;
    fallback: string;
    build_available: boolean;
    note: string;
  };
  cta: { label: string; href: string };
};

export type UseCaseRecommendationsResponse = {
  as_of: string;
  dcs: {
    headline_score: number | null;
    min_dcs_required: number;
    data_run_id: number | null;
    score_ready: boolean;
  };
  architecture: {
    mode: string | null;
    assessment_id: string | null;
    gap_count: number;
    gap_stage_ids: string[];
  };
  summary: {
    ready: number;
    blocked: number;
    gap_suggested: number;
    unavailable?: number;
  };
  pilots: UseCasePilotRecommendation[];
};

export type UseCaseDetailResponse = {
  use_case_id: string;
  pilot_rank: number;
  title: string;
  release: string;
  business_objective?: string | null;
  solution_type?: string | null;
  gates: {
    min_dcs: number | null;
    gating_check_ids: string[];
    architecture_modes: string[];
  };
  primary_stage_ids: string[];
  node_count: number;
  trigger?: { description?: string | null; timezone?: string | null };
  audience?: { definition?: string | null; consent?: string | null };
  measurement?: {
    primary_kpi?: string | null;
    success_criteria?: string | null;
  };
  workflow_summary?: {
    node_count: number;
    nodes: Array<{
      node_id?: string | null;
      node_type?: string | null;
      label?: string | null;
    }>;
    truncated: boolean;
  };
  execution: {
    mcp_dependency: boolean;
    fallback: string;
    build_available: boolean;
    note: string;
  };
};

export function parseUseCaseSearch(search: Record<string, unknown>): {
  uc?: string;
} {
  const raw =
    typeof search.uc === "string" && search.uc.trim().length > 0
      ? search.uc.trim().toUpperCase()
      : undefined;
  if (!raw || !UC_ID_RE.test(raw)) return {};
  return { uc: raw };
}

export function getUseCaseRecommendations(): Promise<UseCaseRecommendationsResponse> {
  return apiRequest(
    "/api/v1/use-cases/recommendations/",
  ) as Promise<UseCaseRecommendationsResponse>;
}

export function getUseCase(useCaseId: string): Promise<UseCaseDetailResponse> {
  return apiRequest(
    `/api/v1/use-cases/${encodeURIComponent(useCaseId)}/`,
  ) as Promise<UseCaseDetailResponse>;
}

export function pilotStatusLabel(status: UseCasePilotStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "blocked_dcs_score":
      return "Needs higher score";
    case "blocked_checks":
      return "Blocked by data checks";
    case "blocked_mode":
      return "Waiting on architecture";
    case "unavailable":
      return "Unavailable";
    default:
      return status;
  }
}

export function pilotStatusTone(
  status: UseCasePilotStatus,
): "ready" | "warn" | "risk" | "muted" {
  switch (status) {
    case "ready":
      return "ready";
    case "blocked_dcs_score":
    case "blocked_checks":
      return "risk";
    case "blocked_mode":
      return "warn";
    default:
      return "muted";
  }
}
