import { apiRequest } from "@/lib/api";

export const AF_LATEST_QUERY_KEY = ["architecture", "latest"] as const;
export const AF_COVERAGE_QUERY_KEY = ["architecture", "coverage"] as const;
export const AF_LATEST_STALE_MS = 8_000;

export type AfUiStatus =
  | "updating"
  | "up_to_date"
  | "waiting_for_score"
  | "incomplete_map"
  | "failed";

export type AfMode =
  | "AUGMENT"
  | "SELECTIVE_REBUILD"
  | "REBUILD"
  | "INCOMPLETE"
  | null;

export type AfVerdict =
  | "KEEP"
  | "KEEP_IMPROVE"
  | "FIX_FIRST"
  | "CONSOLIDATE"
  | "RETIRE_CANDIDATE";

export type AfVerdictCounts = Record<AfVerdict, number>;

export type ArchitectureAssessmentSummary = {
  assessment_id: string;
  status: string;
  mode: AfMode;
  weighted_score: number | null;
  critical_defects: number;
  evidence_coverage: number | null;
  graph_complete: boolean;
  asset_count: number;
  edge_count: number;
  workflow_count: number;
  workflow_fix_first_count: number;
  verdict_counts: AfVerdictCounts;
  data_run_id: number;
  source_dcs_data_run_id: number | null;
  created_at: string | null;
  finished_at: string | null;
  error_message: string | null;
};

export type ArchitectureOverviewSummary = {
  mode: AfMode;
  summary_line: string;
  asset_count: number;
  fix_first_count: number;
  consolidate_count: number;
  coverage_pct: number;
  graph_complete: boolean;
  incomplete_message: string | null;
  cta: { label: string; href: string };
};

export type ArchitectureLifecycleSummary = {
  as_of: string | null;
  workflow_count: number;
  workflow_fix_first_count: number;
  workflow_line: string;
  gaps: {
    fix_first: number;
    consolidate: number;
    coverage_gaps?: number;
    total: number;
  };
  verdict_counts: AfVerdictCounts;
  graph_complete: boolean;
  lifecycle_covered_stage_count?: number | null;
  lifecycle_gap_count?: number | null;
};

export type AfOpportunityGap = {
  stage: number;
  stage_id: string;
  phase: string;
  customer_state?: string;
  uc_group: string;
  job: string;
};

export type ArchitectureOpportunitiesSummary = {
  assessment_id: string;
  mode: AfMode;
  graph_complete: boolean;
  covered_stage_count: number;
  gap_count: number;
  fix_first_count: number;
  consolidate_count: number;
  gaps: AfOpportunityGap[];
  cta: { label: string; href: string };
  note: string;
};

export type ArchitectureLatestResponse = {
  assessment: ArchitectureAssessmentSummary | null;
  active_assessment: ArchitectureAssessmentSummary | null;
  ui_status: AfUiStatus;
  ui_status_label: string;
  overview: ArchitectureOverviewSummary | null;
  lifecycle: ArchitectureLifecycleSummary | null;
  opportunities: ArchitectureOpportunitiesSummary | null;
  message: string | null;
};

export type AfCoverageStage = {
  stage: number;
  stage_id: string;
  phase: string;
  customer_state: string;
  uc_group: string;
  job: string;
  fe_phase_key: string | null;
  asset_count: number;
  verdict_counts: AfVerdictCounts;
  gap: boolean;
  assets: Array<{
    asset_id: string;
    asset_type: string;
    name: string;
    status: string;
    verdict: AfVerdict | null;
  }>;
};

export type AfFePhaseCard = {
  fe_phase_key: string;
  phases: string[];
  asset_count: number;
  verdict_counts: AfVerdictCounts;
  gap_stages: number;
  stage_count: number;
};

export type ArchitectureCoverageResponse = {
  assessment_id: string;
  mode: AfMode;
  graph_complete: boolean;
  horizon: "quarter" | "year" | null;
  stage_count: number;
  covered_stage_count: number;
  coverage_gap_count: number;
  coverage_ratio: number;
  unassigned_asset_count: number;
  opportunities_gaps?: AfOpportunityGap[];
  fe_phase_cards: AfFePhaseCard[];
  stages: AfCoverageStage[];
};

export type FePhaseKey = "acq" | "act" | "exp" | "loy" | "ret";

export const FE_PHASE_META: Record<
  FePhaseKey,
  {
    tone: FePhaseKey;
    num: string;
    name: string;
    desc: string;
  }
> = {
  acq: {
    tone: "acq",
    num: "01 · ACQUISITION",
    name: "Turning visitors into contacts",
    desc: "Where the lifecycle starts — capture and consent before the first purchase.",
  },
  act: {
    tone: "act",
    num: "02 · ACTIVATION",
    name: "First purchase to habit",
    desc: "Onboarding and second-order push across activation stages.",
  },
  exp: {
    tone: "exp",
    num: "03 · EXPANSION",
    name: "Cross-sell and upsell",
    desc: "Complementary and premium moments after the core habit is set.",
  },
  loy: {
    tone: "loy",
    num: "04 · LOYALTY",
    name: "VIP and recognition",
    desc: "Progression and milestones for high-value customers.",
  },
  ret: {
    tone: "ret",
    num: "05 · RETENTION",
    name: "Save, winback, reactivation",
    desc: "Early risk, lapse, and paid reactivation coverage.",
  },
};

export const OVERVIEW_PHASE_LABELS: Record<FePhaseKey, string> = {
  acq: "01 Acquisition",
  act: "02 Activation",
  exp: "03 Expansion",
  loy: "04 Loyalty",
  ret: "05 Retention & Reactivation",
};

export function getArchitectureLatest(): Promise<ArchitectureLatestResponse> {
  return apiRequest(
    "/api/v1/architecture/assessments/latest/",
  ) as Promise<ArchitectureLatestResponse>;
}

export function getArchitectureCoverage(
  assessmentId: string,
  horizon?: "quarter" | "year",
): Promise<ArchitectureCoverageResponse> {
  const qs = horizon ? `?horizon=${horizon}` : "";
  return apiRequest(
    `/api/v1/architecture/assessments/${assessmentId}/coverage/${qs}`,
  ) as Promise<ArchitectureCoverageResponse>;
}

export function verdictUiLabel(verdict: AfVerdict | string | null | undefined): string {
  switch (verdict) {
    case "KEEP":
      return "Keep";
    case "KEEP_IMPROVE":
      return "Improve";
    case "FIX_FIRST":
      return "Fix data first";
    case "CONSOLIDATE":
      return "Consolidate";
    case "RETIRE_CANDIDATE":
      return "Retire candidate";
    default:
      return "—";
  }
}

export function emptyVerdictCounts(): AfVerdictCounts {
  return {
    KEEP: 0,
    KEEP_IMPROVE: 0,
    FIX_FIRST: 0,
    CONSOLIDATE: 0,
    RETIRE_CANDIDATE: 0,
  };
}

export function modeBadgeLabel(mode: AfMode | undefined | null): string {
  if (!mode) return "—";
  return mode.replaceAll("_", " ");
}

export function isAfUpdating(uiStatus: AfUiStatus | undefined): boolean {
  return uiStatus === "updating";
}

export function phaseCardCoveragePct(card: AfFePhaseCard | undefined): number | null {
  if (!card || card.stage_count <= 0) return null;
  const covered = card.stage_count - card.gap_stages;
  return Math.round((covered / card.stage_count) * 100);
}
