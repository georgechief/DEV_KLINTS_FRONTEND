import { apiRequest } from "@/lib/api";
import { parseFixFlowSearch } from "@/lib/fix-flow";
import {
  classifyIssueRouteKind,
  type IssueRouteSignals,
} from "@/lib/issue-routing";

export const UC_RECOMMENDATIONS_QUERY_KEY = ["use-cases", "recommendations"] as const;
export const UC_DETAIL_QUERY_KEY = ["use-cases", "detail"] as const;
export const BUILD_PACKAGE_QUERY_KEY = ["build-packages"] as const;
export const UC_STALE_MS = 8_000;

export const UC_ID_RE = /^UC-[0-9]{2}[A-Z]?$/;

export type UseCasePilotStatus =
  | "ready"
  | "ready_provisional"
  | "blocked_dcs_score"
  | "blocked_checks"
  | "blocked_mode"
  | "unavailable";

export const BUILDABLE_STATUSES: UseCasePilotStatus[] = [
  "ready",
  "ready_provisional",
];

/** Pack sheet 11 / DCS-09 — excluded from headline 42 (never DCS worklist). */
export const SUPPLEMENTAL_PREFLIGHT_CHECKS = new Set([
  "BR-03",
  "BR-09",
  "CC-06",
  "CI-08",
  "LE-07",
  "LE-10",
  "PT-05",
  "PT-06",
  "PT-11",
  "PT-13",
  "SP-04",
  "SP-10",
]);

export function isSupplementalGate(
  checkId: string | null | undefined,
): boolean {
  if (!checkId) return false;
  return SUPPLEMENTAL_PREFLIGHT_CHECKS.has(checkId.trim().toUpperCase());
}

/** Resolve check id from blocker payload (check_id or ?issue= in href). */
export function blockerCheckId(
  blocker: Pick<UseCaseBlocker, "check_id" | "href">,
): string | null {
  const direct = blocker.check_id?.trim();
  if (direct) return direct.toUpperCase();
  const href = blocker.href ?? "";
  const match = href.match(/[?&]issue=([^&]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toUpperCase() || null;
  } catch {
    return match[1].trim().toUpperCase() || null;
  }
}

export function isSupplementalBlocker(blocker: UseCaseBlocker): boolean {
  return isSupplementalGate(blockerCheckId(blocker));
}

/** Supplemental statuses that are not PASS / not_evaluated (honest blockers). */
export function supplementalBlockingEntries(
  pilot: Pick<UseCasePilotRecommendation, "supplemental_status"> | null | undefined,
): Array<{ check_id: string; status: string }> {
  const map = pilot?.supplemental_status ?? {};
  return Object.entries(map)
    .map(([check_id, status]) => ({
      check_id: check_id.trim().toUpperCase(),
      status: String(status ?? "").trim(),
    }))
    .filter(
      ({ check_id, status }) =>
        Boolean(check_id) &&
        status !== "" &&
        status.toLowerCase() !== "pass" &&
        status.toLowerCase() !== "not_evaluated",
    )
    .sort((a, b) => a.check_id.localeCompare(b.check_id));
}

export function isBuildableStatus(status: UseCasePilotStatus): boolean {
  return BUILDABLE_STATUSES.includes(status);
}

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
  provisional_supplemental?: boolean;
  supplemental_status?: Record<string, string>;
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
    ready_full?: number;
    ready_provisional?: number;
    blocked: number;
    gap_suggested: number;
    unavailable?: number;
    /** True (default) = Handoff needs QA PASS; False = demo bypass from backend. */
    handoff_qa_required?: boolean;
  };
  pilots: UseCasePilotRecommendation[];
};

export type UseCaseDetailResponse = {
  use_case_id: string;
  pilot_rank: number;
  title: string;
  release: string;
  blueprint_id?: string | null;
  variant_id?: string | null;
  business_objective?: string | null;
  solution_type?: string | null;
  target_platform?: string[];
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
  data_contract?: {
    required_fields?: string[];
    required_entities?: string[];
  };
  approval?: { roles?: string[] };
  suppressions?: string[];
  schema_version?: string | null;
  content_hash?: string | null;
  workflow_summary?: {
    node_count: number;
    nodes: Array<{
      node_id?: string | null;
      node_type?: string | null;
      label?: string | null;
      platform_primitive?: string | null;
      description?: string | null;
      configured_by?: string | null;
      executed_by?: string | null;
      fields?: string[];
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

export type BuildPackageResponse = {
  package_id: string;
  use_case_id: string;
  blueprint_id: string;
  variant_id?: string | null;
  title: string;
  route: string;
  provisional_supplemental: boolean;
  /** CAP-01 Matrix resolver rows (optional on older stored packages). */
  capability_resolution?: Array<{
    capability_id: string;
    required_status?: string | null;
    resolved_status: string;
    fallback_used?: string | null;
    matrix_status?: string | null;
    channel?: string | null;
  }>;
  human_guide: {
    steps: Array<{
      node_id?: string | null;
      node_type?: string | null;
      title?: string | null;
      description?: string | null;
      fields?: string[];
    }>;
  };
  agent_spec: Record<string, unknown>;
  gates_snapshot: {
    min_dcs: number;
    checks: Record<string, string>;
    provisional_supplemental: boolean;
  };
  qa_requirements: { minimum_score: number; hard_tests: string[] };
  handoff_stub: {
    activation_state: string;
    /** GAP-01 Slice D: runtime honesty until Track B MCP */
    format?: string;
    idempotency_key_template?: string | null;
  };
  hashes: { blueprint_content_hash: string; package_content_hash: string };
  created_at?: string;
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

export function parseWorkflowSearch(search: Record<string, unknown>): {
  uc?: string;
  package_id?: string;
  issue?: string;
  check?: string;
} {
  const fix = parseFixFlowSearch(search);
  const wf = parseUseCaseSearch(search);
  const packageId =
    typeof search.package_id === "string" && search.package_id.trim().length > 0
      ? search.package_id.trim()
      : undefined;
  return {
    ...fix,
    ...wf,
    ...(packageId ? { package_id: packageId } : {}),
  };
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

export function generateBuildPackage(
  useCaseId: string,
): Promise<BuildPackageResponse> {
  return apiRequest(
    `/api/v1/use-cases/${encodeURIComponent(useCaseId)}/build-package/`,
    { method: "POST" },
  ) as Promise<BuildPackageResponse>;
}

export function getBuildPackage(packageId: string): Promise<BuildPackageResponse> {
  return apiRequest(
    `/api/v1/build-packages/${encodeURIComponent(packageId)}/`,
  ) as Promise<BuildPackageResponse>;
}

export function pilotStatusLabel(status: UseCasePilotStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "ready_provisional":
      return "Ready (provisional)";
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
    case "ready_provisional":
      return "warn";
    case "blocked_dcs_score":
    case "blocked_checks":
      return "risk";
    case "blocked_mode":
      return "warn";
    default:
      return "muted";
  }
}

/** PRD-REAL-01 Phase C — deep link for a numbered unlock step. */
export type PilotUnlockStepLink = {
  to: "/fix" | "/data-consistency" | "/lifecycle" | "/qa" | "/workflow";
  search?: { issue?: string; uc?: string; package_id?: string };
};

export type PilotUnlockStep = {
  text: string;
  link?: PilotUnlockStepLink;
};

export type PilotUnlockGuide = {
  title: string;
  steps: PilotUnlockStep[];
  footnote?: string;
};

/** Non-PASS gating check ids from blockers + check_results (Phase C unlock lists). */
function unlockBlockingCheckIds(
  pilot: Pick<
    UseCasePilotRecommendation,
    "blockers" | "gates" | "check_results"
  >,
): string[] {
  const gating = new Set(
    (pilot.gates?.gating_check_ids ?? [])
      .map((id) => id.trim().toUpperCase())
      .filter(Boolean),
  );
  const ids = new Set<string>();

  for (const blocker of pilot.blockers ?? []) {
    const id = blockerCheckId(blocker);
    if (id) ids.add(id);
  }

  for (const row of pilot.check_results ?? []) {
    const id = row.check_id?.trim().toUpperCase();
    if (!id) continue;
    if (gating.size > 0 && !gating.has(id)) continue;
    const result = String(row.result ?? "")
      .trim()
      .toUpperCase();
    if (!result || result === "PASS" || result === "NOT_EVALUATED") continue;
    ids.add(id);
  }

  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * PRD-REAL-01 §5.6 / Phase C — Steps to unlock Studio when a pilot is blocked.
 * Returns null when the pilot is already buildable.
 */
export function buildPilotUnlockGuide(
  pilot: Pick<
    UseCasePilotRecommendation,
    | "status"
    | "blockers"
    | "gates"
    | "use_case_id"
    | "check_results"
    | "supplemental_status"
  >,
): PilotUnlockGuide | null {
  if (isBuildableStatus(pilot.status)) return null;

  const minDcs = pilot.gates?.min_dcs ?? 70;

  if (pilot.status === "blocked_dcs_score") {
    const steps: PilotUnlockStep[] = [
      {
        text: "Open Data Consistency — treat FAIL / WARN via Fix (Approve or Steps to pass).",
        link: { to: "/data-consistency" },
      },
    ];

    const failing = unlockBlockingCheckIds(pilot).filter(
      (id) => !isSupplementalGate(id),
    );
    for (const id of failing.slice(0, 5)) {
      steps.push({
        text: `${id}: open Fix → clear this check (raises the headline score).`,
        link: { to: "/fix", search: { issue: id } },
      });
    }

    steps.push({
      text: `Re-run Data Consistency Score until headline ≥ ${minDcs} for this pilot.`,
      link: { to: "/data-consistency" },
    });
    steps.push({
      text: "Return here — status leaves “Needs higher score” when the score clears.",
    });

    return {
      title: "Steps to unlock",
      steps,
      footnote:
        "Do not set REQUIRE_* = False to unlock Studio — clear the real score gate.",
    };
  }

  if (pilot.status === "blocked_checks") {
    const checkIds = unlockBlockingCheckIds(pilot);

    const steps: PilotUnlockStep[] = [
      {
        text: "Clear each gating check (FAIL → PASS on latest DCS / pilot-gates).",
      },
    ];

    for (const id of checkIds.slice(0, 8)) {
      if (isSupplementalGate(id)) {
        steps.push({
          text: `${id}: fix in Manago/Shopify, then re-evaluate pilot gates (supplemental — not on Fix worklist).`,
        });
      } else {
        steps.push({
          text: `${id}: open Fix → follow Steps to pass or Approve → re-run DCS.`,
          link: { to: "/fix", search: { issue: id } },
        });
      }
    }

    if (checkIds.length === 0) {
      const declared = (pilot.gates?.gating_check_ids ?? [])
        .map((id) => id.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 8);
      for (const id of declared) {
        if (isSupplementalGate(id)) {
          steps.push({
            text: `${id}: confirm supplemental gate PASS via pilot-gates (not on Fix worklist).`,
          });
        } else {
          steps.push({
            text: `${id}: open Fix / Data Consistency and clear this gating check.`,
            link: { to: "/fix", search: { issue: id } },
          });
        }
      }
    }

    steps.push({
      text: "Re-run DCS (and pilot-gates if supplementals). Return when blockers clear.",
      link: { to: "/data-consistency" },
    });

    return {
      title: "Steps to unlock",
      steps,
      footnote:
        "Do not set REQUIRE_PILOT_GATING_CHECKS=False — clear real FAIL checks.",
    };
  }

  if (pilot.status === "blocked_mode") {
    const archDetail =
      pilot.blockers.find((b) => b.code === "architecture_mode")?.detail ?? "";
    const notFinished = /has not finished/i.test(archDetail);
    const notAllowed = /not in allowed modes/i.test(archDetail);
    const allowedModes = (pilot.gates?.architecture_modes ?? [])
      .map((m) => String(m).trim())
      .filter(Boolean);

    if (notFinished) {
      return {
        title: "Steps to unlock",
        steps: [
          {
            text: "Open Lifecycle and run Architecture Assessment.",
            link: { to: "/lifecycle" },
          },
          {
            text: "Wait for assessment to finish — Studio stays blocked until AF mode is set.",
          },
          {
            text: "If AF stays INCOMPLETE, connect Manago MCP for workflow_read + segment inventory (graph_complete).",
            link: { to: "/lifecycle" },
          },
        ],
        footnote:
          "Do not set REQUIRE_ARCHITECTURE_PILOT_GATES=False to unlock while AF is missing.",
      };
    }

    if (notAllowed) {
      return {
        title: "Steps to unlock",
        steps: [
          {
            text: "Open Lifecycle and review the current Architecture mode.",
            link: { to: "/lifecycle" },
          },
          {
            text: archDetail
              ? `${archDetail}${
                  allowedModes.length
                    ? ` This pilot allows: ${allowedModes.join(", ")}.`
                    : ""
                }`
              : `Architecture mode is not allowed for this pilot${
                  allowedModes.length
                    ? ` (needs ${allowedModes.join(", ")})`
                    : ""
                }.`,
            link: { to: "/lifecycle" },
          },
          {
            text: "Re-assess Architecture or pick a pilot whose allowed modes match the current AF mode.",
          },
        ],
        footnote:
          "Do not set REQUIRE_ARCHITECTURE_PILOT_GATES=False to force Generate.",
      };
    }

    return {
      title: "Steps to unlock",
      steps: [
        {
          text: "Open Lifecycle and run / refresh Architecture Assessment.",
          link: { to: "/lifecycle" },
        },
        {
          text: "Architecture must leave INCOMPLETE: evidence coverage ≥ 0.80 and graph_complete (rich workflow definitions + segments).",
          link: { to: "/lifecycle" },
        },
        {
          text: "REST workflow list is often shallow — Manago MCP workflow_read + segment inventory are required for a full graph. There is no Generate bypass.",
        },
        {
          text: "When AF mode is allowed for this pilot, return here to open Workflow Studio.",
        },
      ],
      footnote:
        "Do not set REQUIRE_ARCHITECTURE_PILOT_GATES=False to unlock while AF is INCOMPLETE.",
    };
  }

  return {
    title: "Steps to unlock",
    steps: [
      {
        text: "This pilot is unavailable for the current company context. Confirm connectors and blueprint gates.",
        link: { to: "/data-consistency" },
      },
    ],
  };
}

/** PRD-REAL-01 Phase C — Steps when Handoff is blocked on QA. */
export function buildHandoffQaUnlockGuide(input: {
  qaNeverRun: boolean;
  qaRunNotFound: boolean;
  qaPackageMismatch: boolean;
  /** Optional hard-test ids still FAIL — listed on QA / Handoff unlock panels. */
  failedHardTestIds?: string[];
  /** When set, hard-test fix steps deep-link to Studio for this pilot. */
  uc?: string;
  packageId?: string;
}): PilotUnlockGuide {
  if (input.qaRunNotFound) {
    return {
      title: "Steps to unlock Handoff",
      steps: [
        {
          text: "Open QA and run or select a valid QA run for this package.",
          link: { to: "/qa" },
        },
        {
          text: "Return to Handoff after QA status is PASS (score ≥ 80, all hard tests).",
        },
      ],
      footnote: "REQUIRE_HANDOFF_QA_PASS=True — demo bypass is off.",
    };
  }
  if (input.qaPackageMismatch) {
    return {
      title: "Steps to unlock Handoff",
      steps: [
        {
          text: "Return to QA for the package in the URL and use the latest matching QA result.",
          link: { to: "/qa" },
        },
        { text: "Stage Handoff only after that QA result is PASS." },
      ],
    };
  }
  if (input.qaNeverRun) {
    return {
      title: "Steps to unlock Handoff",
      steps: [
        {
          text: "Run QA in Workflow Studio for this build package.",
          link: { to: "/qa" },
        },
        {
          text: "Achieve QA PASS (≥80, all hard tests), then return here to stage.",
        },
      ],
      footnote: "Handoff will not stage while QA is FAIL or missing.",
    };
  }

  const steps: PilotUnlockStep[] = [
    {
      text: "Clear failing hard tests until QA status is PASS (score ≥ 80).",
      link: { to: "/qa" },
    },
  ];
  const studioSearch =
    input.uc || input.packageId
      ? {
          ...(input.uc ? { uc: input.uc } : {}),
          ...(input.packageId ? { package_id: input.packageId } : {}),
        }
      : undefined;
  for (const id of (input.failedHardTestIds ?? []).slice(0, 5)) {
    const clean = id.trim();
    if (!clean) continue;
    steps.push({
      text: `${clean}: fix package evidence in Studio (or regenerate), then re-run QA.`,
      link: studioSearch
        ? { to: "/workflow", search: studioSearch }
        : { to: "/workflow" },
    });
  }
  steps.push({
    text: "Return to Handoff and stage only after QA PASS.",
  });

  return {
    title: "Steps to unlock Handoff",
    steps,
    footnote: "Do not set REQUIRE_HANDOFF_QA_PASS=False to open Handoff early.",
  };
}

/** Fixture workflow ids from original-designs → live MVP1 pilots (PRD-WF-01 §7.5). */
export const LEGACY_WORKFLOW_TO_UC: Record<string, string> = {
  "wf-second-purchase": "UC-06B",
};

export type WorkflowStudioLink = {
  to: "/workflow";
  search: { uc?: string; package_id?: string; issue?: string; check?: string };
};

export function workflowStudioLink(
  search: {
    uc?: string;
    package_id?: string;
    issue?: string;
    check?: string;
  } = {},
): WorkflowStudioLink {
  return { to: "/workflow", search };
}

export function workflowStudioFromLegacyWorkflow(
  workflowId: string | undefined | null,
): WorkflowStudioLink {
  if (!workflowId) return workflowStudioLink();
  const uc = LEGACY_WORKFLOW_TO_UC[workflowId];
  return uc ? workflowStudioLink({ uc }) : workflowStudioLink();
}

/** Pilots that list `checkId` as a gating check (buildable or blocked). */
export function pilotsGatedByCheck(
  pilots: UseCasePilotRecommendation[] | undefined,
  checkId: string | undefined | null,
): UseCasePilotRecommendation[] {
  if (!pilots || checkId == null) return [];
  const normalized = checkId.trim().toUpperCase();
  if (!normalized) return [];
  return pilots.filter((pilot) =>
    (pilot.gates?.gating_check_ids ?? []).some(
      (gateId) => gateId.trim().toUpperCase() === normalized,
    ),
  );
}

/**
 * PRD-WF-02 §3 — Studio-eligible when the check gates ≥1 MVP1 pilot.
 * Writeback eligibility (Maheep allowlist) is independent — use writebacks.ts.
 */
export function isStudioEligibleCheck(
  pilots: UseCasePilotRecommendation[] | undefined,
  checkId: string | undefined | null,
): boolean {
  return pilotsGatedByCheck(pilots, checkId).length > 0;
}

/**
 * Fix-page "Proceed to Workflow Studio" suppress list.
 * PT-04 treating path is Approve writeback → re-run DCS → PASS (handoff gates),
 * not Fix → Studio mid-writeback.
 */
export function suppressFixProceedToStudio(checkId: string | undefined | null): boolean {
  const id = typeof checkId === "string" ? checkId.trim().toUpperCase() : "";
  return id === "PT-04";
}

/** PRD-WF-02 §6.1 — Fix Proceed CTA visibility (pure, testable). */
export type FixStudioEligibility = {
  showProceed: boolean;
  known: boolean;
};

export function resolveFixStudioEligibility(input: {
  isFixture: boolean;
  checkId: string | undefined;
  pilots: UseCasePilotRecommendation[] | undefined;
  recommendationsPending: boolean;
  recommendationsSuccess: boolean;
  recommendationsError: boolean;
}): FixStudioEligibility {
  if (input.isFixture) {
    return { showProceed: true, known: true };
  }
  if (!input.checkId?.trim()) {
    return { showProceed: false, known: true };
  }
  if (input.recommendationsPending) {
    return { showProceed: false, known: false };
  }
  if (input.recommendationsError || !input.recommendationsSuccess) {
    return { showProceed: false, known: true };
  }
  if (suppressFixProceedToStudio(input.checkId)) {
    return { showProceed: false, known: true };
  }
  return {
    showProceed: isStudioEligibleCheck(input.pilots, input.checkId),
    known: true,
  };
}

/** PRD-WF-02 §7.1 — Data Consistency worklist row CTAs (pure, testable). */
export type DcsRowCtaPrimary =
  | { kind: "fix"; checkId: string }
  | { kind: "build"; label: string; link: WorkflowStudioLink }
  | { kind: "integrations"; label: string }
  | { kind: "passed" };

export type DcsRowCtaSecondary = {
  kind: "blocks_uc";
  uc: string;
  link: WorkflowStudioLink;
};

export type DcsRowCtaResolution = {
  primary: DcsRowCtaPrimary | null;
  secondary: DcsRowCtaSecondary | null;
  /** Recommendations still loading — defer Build / Blocks UC hints. */
  pending: boolean;
};

export function resolveDcsRowCtas(input: {
  checkId: string;
  status: "FAIL" | "WARN" | "PASS";
  isOptional?: boolean;
  pilots?: UseCasePilotRecommendation[];
  recommendationsPending?: boolean;
  recommendationsSuccess?: boolean;
  /** GAP-01E W8-02 — optional signals for Security vs Data taxonomy. */
  issue?: IssueRouteSignals | null;
}): DcsRowCtaResolution {
  const checkId = input.checkId?.trim();
  if (!checkId) {
    return { primary: null, secondary: null, pending: false };
  }

  const failWarn = input.status === "FAIL" || input.status === "WARN";
  const signals: IssueRouteSignals = {
    checkId,
    isOptional: input.isOptional,
    status: input.status,
    ...(input.issue ?? {}),
  };

  if (failWarn && classifyIssueRouteKind(signals) === "security") {
    return {
      primary: {
        kind: "integrations",
        label: "Open Integrations · reconnect",
      },
      secondary: null,
      pending: false,
    };
  }

  if (input.recommendationsPending) {
    if (failWarn) {
      return {
        primary: { kind: "fix", checkId },
        secondary: null,
        pending: true,
      };
    }
    return { primary: null, secondary: null, pending: true };
  }

  const recsOk = input.recommendationsSuccess === true;
  const pilots = input.pilots;
  const studioEligible = recsOk && isStudioEligibleCheck(pilots, checkId);
  const primaryPilot = recsOk ? pickPrimaryPilotForCheck(pilots, checkId) : undefined;
  const buildable = Boolean(primaryPilot && isBuildableStatus(primaryPilot.status));

  if (input.isOptional && recsOk) {
    const gatedLink = workflowStudioFromFix(pilots, checkId);
    // Only Build when this check gates a pilot — never attach an unrelated ready UC.
    if (gatedLink.search.uc) {
      return {
        primary: {
          kind: "build",
          label: `Build ${gatedLink.search.uc}`,
          link: gatedLink,
        },
        secondary: null,
        pending: false,
      };
    }
  }

  if (input.status === "PASS") {
    if (studioEligible && buildable && primaryPilot) {
      const link = workflowStudioFromFix(pilots, checkId);
      return {
        primary: {
          kind: "build",
          label: `Build ${primaryPilot.use_case_id}`,
          link,
        },
        secondary: null,
        pending: false,
      };
    }
    return { primary: { kind: "passed" }, secondary: null, pending: false };
  }

  const secondary =
    studioEligible && primaryPilot
      ? {
          kind: "blocks_uc" as const,
          uc: primaryPilot.use_case_id,
          link: workflowStudioFromFix(pilots, checkId),
        }
      : null;

  return {
    primary: { kind: "fix", checkId },
    secondary,
    pending: false,
  };
}

/** PRD-WF-02 §4 — journey stage keys (matches fixFlowStages). */
export type JourneyStageKey = "diagnose" | "fix" | "build" | "qa" | "handoff";

export const FLOW_STEPPER_TOOLTIPS = {
  fixNoIssue: "Pick an issue in Data Consistency first",
  buildNoGate: "This check doesn't gate a workflow blueprint — Fix / evidence only",
  buildLoading: "Loading workflow gates…",
  buildRecsError: "Could not load workflow gates — refresh and try again",
  qaNoPackage: "Generate a build package in Workflow Studio first",
  /** PRD-QA-01 §8.7 — Handoff locked until latest package QA PASS. */
  handoffQaLocked: "Clear QA (≥80, all hard tests) first",
  /** Demo: Handoff open while QA not PASS (REQUIRE_HANDOFF_QA_PASS=False). */
  handoffQaDemoBypass: "Demo: Handoff unlocked while QA/PT-04 can stay FAIL",
  /** @deprecated Prefer handoffQaLocked (same copy). */
  handoffNoPackage: "Clear QA (≥80, all hard tests) first",
  dataCenterLocked: "Available after your Data Consistency Score is calculated",
} as const;

/** Backend demo flag — prefer QA payload, then recommendations summary; default enforce. */
export function isHandoffQaRequired(
  ...sources: Array<
    | { handoff_qa_required?: boolean }
    | UseCaseRecommendationsResponse["summary"]
    | null
    | undefined
  >
): boolean {
  for (const source of sources) {
    if (source && typeof source.handoff_qa_required === "boolean") {
      return source.handoff_qa_required;
    }
  }
  return true;
}

export type FlowStepperStageResolution = {
  enabled: boolean;
  tooltip?: string;
  to: "/data-consistency" | "/fix" | "/workflow" | "/qa" | "/handoff";
  search: {
    issue?: string;
    check?: string;
    uc?: string;
    package_id?: string;
    qa_run_id?: string;
  };
};

export function resolveFlowStepperStage(
  stageKey: JourneyStageKey,
  ctx: {
    issueId?: string | null;
    isFixture: boolean;
    legacyWorkflowId?: string;
    pilots: UseCasePilotRecommendation[] | undefined;
    recommendationsPending: boolean;
    recommendationsSuccess: boolean;
    recommendationsError: boolean;
    packageId?: string;
    ucFromSearch?: string;
    dataCenterAllowed?: boolean;
    /** Latest package QA overall status (PRD-QA-01 §8.7). */
    qaStatus?: "PASS" | "FAIL" | null;
    qaPending?: boolean;
    qaRunId?: string;
    /** False = demo bypass REQUIRE_HANDOFF_QA_PASS (open Handoff without QA PASS). */
    handoffQaRequired?: boolean;
  },
): FlowStepperStageResolution {
  const issue = ctx.issueId?.trim() || undefined;
  const dataCenterAllowed = ctx.dataCenterAllowed !== false;
  const handoffSearch = (): FlowStepperStageResolution["search"] => ({
    ...(issue ? { issue } : {}),
    ...(ctx.packageId ? { package_id: ctx.packageId } : {}),
    ...(ctx.ucFromSearch ? { uc: ctx.ucFromSearch } : {}),
    ...(ctx.qaRunId ? { qa_run_id: ctx.qaRunId } : {}),
  });

  switch (stageKey) {
    case "diagnose":
      return {
        enabled: dataCenterAllowed,
        tooltip: dataCenterAllowed ? undefined : FLOW_STEPPER_TOOLTIPS.dataCenterLocked,
        to: "/data-consistency",
        search: issue ? { issue } : {},
      };
    case "fix":
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/fix",
          search: {},
        };
      }
      return { enabled: true, to: "/fix", search: { issue } };
    case "build": {
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/workflow",
          search: {},
        };
      }
      if (ctx.isFixture) {
        const legacyUc = ctx.legacyWorkflowId
          ? LEGACY_WORKFLOW_TO_UC[ctx.legacyWorkflowId]
          : undefined;
        return {
          enabled: Boolean(legacyUc),
          to: "/workflow",
          search: legacyUc ? { uc: legacyUc } : {},
        };
      }
      if (ctx.recommendationsPending) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildLoading,
          to: "/workflow",
          search: { issue },
        };
      }
      if (ctx.recommendationsError) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildRecsError,
          to: "/workflow",
          search: { issue },
        };
      }
      if (!ctx.recommendationsSuccess) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildLoading,
          to: "/workflow",
          search: { issue },
        };
      }
      if (!isStudioEligibleCheck(ctx.pilots, issue)) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildNoGate,
          to: "/workflow",
          search: { issue },
        };
      }
      const studioLink = workflowStudioFromFix(ctx.pilots, issue);
      return {
        enabled: true,
        to: "/workflow",
        search: studioLink.search,
      };
    }
    case "qa": {
      // PRD-QA-01 §8.7 — enable when package_id in search OR working uc is known.
      const qaSearch: FlowStepperStageResolution["search"] = {
        ...(issue ? { issue } : {}),
        ...(ctx.packageId ? { package_id: ctx.packageId } : {}),
        ...(ctx.ucFromSearch ? { uc: ctx.ucFromSearch } : {}),
      };
      if (ctx.packageId || ctx.ucFromSearch) {
        return { enabled: true, to: "/qa", search: qaSearch };
      }
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/qa",
          search: {},
        };
      }
      return {
        enabled: false,
        tooltip: FLOW_STEPPER_TOOLTIPS.qaNoPackage,
        to: "/qa",
        search: qaSearch,
      };
    }
    case "handoff": {
      // PRD-QA-01 §8.7 — enable only after latest QA PASS for that package.
      // Demo: handoffQaRequired=false unlocks when a QA run exists (PASS or FAIL).
      const requireQa = ctx.handoffQaRequired !== false;
      if (!ctx.packageId) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch(),
        };
      }
      if (ctx.qaPending) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch(),
        };
      }
      // null = never run / no result yet — still blocked (backend needs a QA row to stage).
      if (ctx.qaStatus == null) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch(),
        };
      }
      if (requireQa && ctx.qaStatus !== "PASS") {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch(),
        };
      }
      return {
        enabled: true,
        tooltip: requireQa
          ? undefined
          : FLOW_STEPPER_TOOLTIPS.handoffQaDemoBypass,
        to: "/handoff",
        search: handoffSearch(),
      };
    }
  }
}

function journeyIssueNeedsFix(status: "FAIL" | "WARN" | null | undefined): boolean {
  return status === "FAIL" || status === "WARN";
}

function journeyHasExplicitLaterStage(input: {
  ucFromSearch?: string;
  packageId?: string;
}): boolean {
  return Boolean(input.ucFromSearch?.trim() || input.packageId?.trim());
}

/**
 * PRD-WF-02 §5.2 — derive FlowStepper current stage (path hint alone is not enough).
 */
export function deriveJourneyStage(input: {
  pathname: string;
  issueId?: string | null;
  isFixture?: boolean;
  issueStatus?: "FAIL" | "WARN" | null;
  ucFromSearch?: string;
  packageId?: string;
  pilots?: UseCasePilotRecommendation[];
  recommendationsSuccess?: boolean;
  /** Worklist still loading — conservative Fix/Build gating per PRD §5.2 resume default. */
  worklistPending?: boolean;
  /** Latest package QA status — PRD-QA-01 §8.7. */
  qaStatus?: "PASS" | "FAIL" | null;
}): JourneyStageKey {
  const issue = input.issueId?.trim() || undefined;
  const path = input.pathname;

  if (!issue) {
    // Studio → QA/Handoff can omit ?issue=; still highlight the live stage.
    if (path.startsWith("/handoff")) {
      return input.qaStatus === "PASS" ? "handoff" : input.packageId ? "qa" : "diagnose";
    }
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/workflow") && input.ucFromSearch?.trim()) return "build";
    return "diagnose";
  }

  if (input.isFixture) {
    if (path.startsWith("/handoff")) return "handoff";
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/workflow")) return "build";
    if (path.startsWith("/fix")) return "fix";
    return "diagnose";
  }

  if (input.worklistPending) {
    if (path.startsWith("/handoff")) {
      return input.qaStatus === "PASS" ? "handoff" : input.packageId ? "qa" : "handoff";
    }
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/fix")) return "fix";
    if (path.startsWith("/data-consistency")) return "fix";
    if (path.startsWith("/workflow") && !input.ucFromSearch?.trim()) return "fix";
  }

  const failWarn = journeyIssueNeedsFix(input.issueStatus);
  const laterInUrl = journeyHasExplicitLaterStage(input);
  const recsOk = input.recommendationsSuccess === true;
  const studioEligible = recsOk && isStudioEligibleCheck(input.pilots, issue);

  if (path.startsWith("/fix") || (failWarn && !laterInUrl)) {
    return "fix";
  }

  if (path.startsWith("/workflow") || (studioEligible && Boolean(input.ucFromSearch?.trim()))) {
    return "build";
  }

  if (path.startsWith("/qa")) {
    return "qa";
  }

  if (path.startsWith("/handoff")) {
    // Not cleared yet — keep highlight on QA rather than unlocked handoff.
    if (input.qaStatus === "PASS") return "handoff";
    if (input.packageId) return "qa";
    return "handoff";
  }

  if (failWarn) {
    return "fix";
  }

  if (studioEligible) {
    const primary = pickPrimaryPilotForCheck(input.pilots, issue);
    if (primary && isBuildableStatus(primary.status)) {
      return "build";
    }
  }

  return "diagnose";
}

/** Pilots buildable after fixing `checkId` (that check passes in recommendation). */
export function pilotsUnblockedByCheck(
  pilots: UseCasePilotRecommendation[] | undefined,
  checkId: string | undefined | null,
): UseCasePilotRecommendation[] {
  if (!pilots || checkId == null) return [];
  const normalized = checkId.trim().toUpperCase();
  if (!normalized) return [];
  return pilots.filter((pilot) => {
    if (!isBuildableStatus(pilot.status)) return false;
    return (pilot.gates?.gating_check_ids ?? []).some(
      (gateId) => gateId.trim().toUpperCase() === normalized,
    );
  });
}

/**
 * Primary blueprint for a selected DCS/Fix check — same 1:1 jump as
 * Frontend_design (issue → workflow brief). When several pilots share a gate,
 * pick the lowest pilot_rank; prefer a now-buildable one after the fix.
 */
export function pickPrimaryPilotForCheck(
  pilots: UseCasePilotRecommendation[] | undefined,
  checkId: string | undefined | null,
): UseCasePilotRecommendation | undefined {
  const gated = pilotsGatedByCheck(pilots, checkId);
  if (gated.length === 0) return undefined;
  const unblocked = gated.filter((pilot) => isBuildableStatus(pilot.status));
  const pool = unblocked.length > 0 ? unblocked : gated;
  return [...pool].sort(
    (a, b) =>
      a.pilot_rank - b.pilot_rank || a.use_case_id.localeCompare(b.use_case_id),
  )[0];
}

/**
 * Fix → Studio bridge (PRD-WF-01 §7.5 Flow D + design auto-open).
 * Always bind ?uc= when this check gates a pilot so Diagnose → Fix → Build
 * opens the brief — do not dump the user on the blueprint picker.
 */
export function workflowStudioFromFix(
  pilots: UseCasePilotRecommendation[] | undefined,
  checkId: string | undefined | null,
): WorkflowStudioLink {
  const normalized =
    typeof checkId === "string" && checkId.trim().length > 0
      ? checkId.trim()
      : undefined;
  const chosen = pickPrimaryPilotForCheck(pilots, checkId);
  if (chosen) {
    return workflowStudioLink({
      uc: chosen.use_case_id,
      ...(normalized ? { issue: normalized } : {}),
    });
  }
  return normalized
    ? workflowStudioLink({ issue: normalized })
    : workflowStudioLink();
}

export type RouteIssueTarget =
  | {
      taxonomy: "data";
      to: "/fix";
      search: { issue: string };
      label: string;
      accessFallback?: boolean;
    }
  | {
      taxonomy: "data";
      to: "/data-consistency";
      search: { check: string };
      label: string;
      accessFallback: true;
    }
  | {
      taxonomy: "workflow";
      to: "/workflow";
      search: WorkflowStudioLink["search"];
      label: string;
      accessFallback?: boolean;
    }
  | {
      taxonomy: "security";
      to: "/integrations";
      label: string;
      accessFallback?: false;
    }
  | {
      /** App unlock only — not Security taxonomy (E0.6 honesty). */
      taxonomy: "fallback";
      to: "/integrations";
      label: string;
      accessFallback: true;
    };

/**
 * Shared 3-way router (GAP-01E W8-02 / E0.5 / E0.8).
 * Workflow: optional issues that gate a Studio pilot.
 * Security: auth/connector failures → Integrations.
 * Data: default → Fix (FE-13 unlock fallback when access provided).
 */
export function routeIssueTarget(input: {
  checkId: string;
  issue?: IssueRouteSignals | null;
  pilots?: UseCasePilotRecommendation[] | null;
  access?: { fixAllowed: boolean; dataCenterAllowed: boolean };
}): RouteIssueTarget | null {
  const checkId = input.checkId?.trim();
  if (!checkId) return null;

  const signals: IssueRouteSignals = {
    checkId,
    ...(input.issue ?? {}),
  };
  const taxonomy = classifyIssueRouteKind(signals);

  if (taxonomy === "security") {
    return {
      taxonomy: "security",
      to: "/integrations",
      label: "Open Integrations · reconnect",
      accessFallback: false,
    };
  }

  const optional = Boolean(signals.isOptional);
  const pilots = input.pilots ?? undefined;
  const studioEligible = isStudioEligibleCheck(pilots, checkId);

  if (optional && studioEligible) {
    const link = workflowStudioFromFix(pilots, checkId);
    const uc = link.search.uc;
    return {
      taxonomy: "workflow",
      to: "/workflow",
      search: link.search,
      label: uc ? `Open Studio · ${uc}` : "Open Workflow Studio",
    };
  }

  if (!input.access || input.access.fixAllowed) {
    return {
      taxonomy: "data",
      to: "/fix",
      search: { issue: checkId },
      label: `Open Fix · ${checkId}`,
    };
  }
  if (input.access.dataCenterAllowed) {
    return {
      taxonomy: "data",
      to: "/data-consistency",
      search: { check: checkId },
      label: `Open Data Center · ${checkId}`,
      accessFallback: true,
    };
  }
  return {
    taxonomy: "fallback",
    to: "/integrations",
    label: "Open Integrations",
    accessFallback: true,
  };
}

export function parseQaSearch(search: Record<string, unknown>): {
  issue?: string;
  check?: string;
  uc?: string;
  package_id?: string;
} {
  return {
    ...parseFixFlowSearch(search),
    ...parseWorkflowSearch(search),
  };
}

/** Handoff route search — package + qa_run_id from QA CTA; handoff_id for audit deep-links (HO-02 §7.3). */
export function parseHandoffSearch(search: Record<string, unknown>): {
  issue?: string;
  check?: string;
  uc?: string;
  package_id?: string;
  qa_run_id?: string;
  handoff_id?: string;
} {
  const base = parseWorkflowSearch(search);
  const qaRunId =
    typeof search.qa_run_id === "string" && search.qa_run_id.trim().length > 0
      ? search.qa_run_id.trim()
      : undefined;
  const handoffId =
    typeof search.handoff_id === "string" && search.handoff_id.trim().length > 0
      ? search.handoff_id.trim()
      : undefined;
  return {
    ...base,
    ...(qaRunId ? { qa_run_id: qaRunId } : {}),
    ...(handoffId ? { handoff_id: handoffId } : {}),
  };
}
