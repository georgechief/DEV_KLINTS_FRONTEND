/**
 * PRD-QA-01 — Workflow QA API client + hard-test copy (Step 6).
 *
 * Live `/qa` binding is Step 7; this module is the typed SoT for POST/GET.
 */

import { apiRequest } from "@/lib/api";

export const QA_RESULT_QUERY_KEY = ["qa-results"] as const;
export const QA_STALE_MS = 8_000;

function requireNonEmptyId(id: string, label: string): string {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

/** Pack-locked hard_tests (all 16 pilots) — PRD-QA-01 §2. */
export const PACK_HARD_TEST_IDS = [
  "data_gates_pass",
  "consent_branching",
  "terminal_reachable",
  "no_orphan_nodes",
  "collision_policy",
  "measurement_wired",
  "rollback_defined",
] as const;

export type PackHardTestId = (typeof PACK_HARD_TEST_IDS)[number];

export type QaHardTestStatus = "PASS" | "FAIL";
export type QaOverallStatus = "PASS" | "FAIL";

export type QaHardTestRow = {
  test_id: string;
  status: QaHardTestStatus;
  evidence_ids?: string[];
};

export type QaEvidence = {
  source: string;
  locator: string;
  value?: unknown;
  observed_at: string;
};

/** Pack schema + FE siblings (package_id, use_case_id, minimum_score). */
export type QaResultResponse = {
  schema_version: string;
  qa_run_id: string;
  tenant_id: string;
  object_id: string;
  package_id: string;
  use_case_id: string;
  score: number;
  minimum_score: number;
  hard_tests: QaHardTestRow[];
  status: QaOverallStatus;
  evidence: QaEvidence[];
  created_at: string;
  /** Demo gate: false = Handoff may open/stage while status is FAIL. */
  handoff_qa_required?: boolean;
};

/** PRD-QA-01 §8.3 — display names for gate rows. */
export const HARD_TEST_COPY: Record<
  PackHardTestId,
  { label: string; description: string }
> = {
  data_gates_pass: {
    label: "Data gates pass",
    description: "Gating DCS checks on this package are clear",
  },
  consent_branching: {
    label: "Consent branching",
    description: "Workflow branches on consent / opt-in",
  },
  terminal_reachable: {
    label: "Terminal reachable",
    description: "Every path reaches an exit",
  },
  no_orphan_nodes: {
    label: "No orphan nodes",
    description: "All nodes reachable from the trigger",
  },
  collision_policy: {
    label: "Collision policy",
    description: "Overlap / collision rules present",
  },
  measurement_wired: {
    label: "Measurement wired",
    description: "Primary metric defined",
  },
  rollback_defined: {
    label: "Rollback defined",
    description: "Rollback strategy present on package",
  },
};

export function packageQaQueryKey(packageId: string) {
  return [...QA_RESULT_QUERY_KEY, "package", packageId] as const;
}

export function qaRunQueryKey(qaRunId: string) {
  return [...QA_RESULT_QUERY_KEY, "run", qaRunId] as const;
}

/** GET /api/v1/build-packages/{id}/qa/ — latest run; 404 if never run. */
export function getLatestPackageQa(
  packageId: string,
): Promise<QaResultResponse> {
  const id = requireNonEmptyId(packageId, "packageId");
  return apiRequest(
    `/api/v1/build-packages/${encodeURIComponent(id)}/qa/`,
  ) as Promise<QaResultResponse>;
}

/** POST /api/v1/build-packages/{id}/qa/ — evaluate + persist (201). */
export function runPackageQa(packageId: string): Promise<QaResultResponse> {
  const id = requireNonEmptyId(packageId, "packageId");
  return apiRequest(
    `/api/v1/build-packages/${encodeURIComponent(id)}/qa/`,
    { method: "POST", body: JSON.stringify({}) },
  ) as Promise<QaResultResponse>;
}

/** GET /api/v1/qa-runs/{qa_run_id}/ — optional single-run fetch. */
export function getQaRun(qaRunId: string): Promise<QaResultResponse> {
  const id = requireNonEmptyId(qaRunId, "qaRunId");
  return apiRequest(
    `/api/v1/qa-runs/${encodeURIComponent(id)}/`,
  ) as Promise<QaResultResponse>;
}

export type QaApiError = {
  status: number;
  detail?: string;
  code?: string;
};

export function isQaApiError(err: unknown): err is QaApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

function qaErrorDetail(err: QaApiError): string {
  return typeof err.detail === "string" ? err.detail.toLowerCase() : "";
}

/** GET returned 404 because QA has never been run for this package. */
export function isQaNeverRunError(err: unknown): boolean {
  if (!isQaApiError(err) || err.status !== 404) return false;
  const detail = qaErrorDetail(err);
  return (
    detail.includes("has not been run") ||
    detail.includes("qa has not been run")
  );
}

/**
 * Package missing / wrong company.
 * Do not match bare "not found" — that also matches "QA run not found".
 */
export function isQaPackageNotFoundError(err: unknown): boolean {
  if (!isQaApiError(err) || err.status !== 404) return false;
  if (isQaNeverRunError(err)) return false;
  return qaErrorDetail(err).includes("build package not found");
}

/** GET /qa-runs/{id}/ — run missing or wrong company. */
export function isQaRunNotFoundError(err: unknown): boolean {
  if (!isQaApiError(err) || err.status !== 404) return false;
  if (isQaNeverRunError(err) || isQaPackageNotFoundError(err)) return false;
  return qaErrorDetail(err).includes("qa run not found");
}

/** Exclusive classifier for GET package QA errors (Step 7 auto-run). */
export function classifyPackageQaGetError(
  err: unknown,
): "never_run" | "package_not_found" | "other" {
  if (isQaNeverRunError(err)) return "never_run";
  if (isQaPackageNotFoundError(err)) return "package_not_found";
  return "other";
}

/** POST 409 — package payload missing/invalid qa_requirements. */
export function isQaRequirementsMissingError(err: unknown): boolean {
  if (!isQaApiError(err) || err.status !== 409) return false;
  return (
    err.code === "qa_requirements_missing" ||
    err.code === "qa_requirements_invalid" ||
    qaErrorDetail(err).includes("qa_requirements")
  );
}

export function hardTestLabel(testId: string): string {
  const row = HARD_TEST_COPY[testId as PackHardTestId];
  return row?.label ?? testId.replace(/_/g, " ");
}

export function hardTestDescription(testId: string): string {
  const row = HARD_TEST_COPY[testId as PackHardTestId];
  return row?.description ?? "";
}

export function countHardPasses(result: QaResultResponse): number {
  const rows = Array.isArray(result.hard_tests) ? result.hard_tests : [];
  return rows.filter((row) => row.status === "PASS").length;
}

export function failedHardTestIds(result: QaResultResponse): string[] {
  const rows = Array.isArray(result.hard_tests) ? result.hard_tests : [];
  return rows.filter((row) => row.status !== "PASS").map((row) => row.test_id);
}

export function isQaPass(result: QaResultResponse | null | undefined): boolean {
  return result?.status === "PASS";
}

/** QA row belongs to the build package in the URL (AppShell + handoff gate). */
export function qaResultMatchesPackage(
  result: QaResultResponse | null | undefined,
  packageId: string,
): boolean {
  const pid = typeof packageId === "string" ? packageId.trim() : "";
  if (!result || !pid) return false;
  return result.package_id === pid || result.object_id === pid;
}

/** Score-chip line for PASS/FAIL (PRD-QA-01 §8.4). */
export function qaScoreChipSummary(result: QaResultResponse): string {
  const score = Math.round(Number(result.score) || 0);
  const minimum = Math.round(Number(result.minimum_score) || 80);
  if (result.status === "PASS") {
    return `Cleared · score ${score} ≥ ${minimum}`;
  }
  const failed = failedHardTestIds(result);
  const failPart =
    failed.length > 0 ? ` · ${failed.join(", ")}` : "";
  return `Blocked · score ${score}${failPart}`;
}

export type HandoffFromQaLink = {
  to: "/handoff";
  search: {
    uc?: string;
    package_id?: string;
    qa_run_id?: string;
    issue?: string;
  };
};

/** Handoff deep-link stub (PRD-QA-01 §8.5) — no MCP send. */
export function handoffFromQa(input: {
  uc?: string;
  package_id?: string;
  qa_run_id?: string;
  issue?: string;
}): HandoffFromQaLink {
  const search: HandoffFromQaLink["search"] = {};
  if (input.uc?.trim()) search.uc = input.uc.trim().toUpperCase();
  if (input.package_id?.trim()) search.package_id = input.package_id.trim();
  if (input.qa_run_id?.trim()) search.qa_run_id = input.qa_run_id.trim();
  if (input.issue?.trim()) search.issue = input.issue.trim();
  return { to: "/handoff", search };
}

/** Graph / package-logic hard tests → Workflow Studio (GAP-01E W8-04 / E0.7). */
export const QA_FAIL_STUDIO_TEST_IDS = [
  "consent_branching",
  "terminal_reachable",
  "no_orphan_nodes",
  "collision_policy",
  "measurement_wired",
  "rollback_defined",
] as const;

export type QaFailRouteKind = "fix" | "studio" | "import";

export type QaFailDeepLink =
  | {
      kind: "fix";
      to: "/fix";
      search: { issue?: string };
      label: string;
    }
  | {
      kind: "studio";
      to: "/workflow";
      search: { uc?: string; package_id?: string; issue?: string };
      label: string;
    }
  | {
      kind: "import";
      to: "/data-consistency" | "/integrations";
      search?: { check?: string };
      label: string;
    };

/**
 * BE strips evidence[].id but keeps hard_tests[].evidence_ids and appends
 * evidence in hard-test order — join by cursor, not locator/test_id.
 */
export function firstEvidenceForHardTest(
  result: QaResultResponse,
  row: QaHardTestRow,
): QaEvidence | undefined {
  if (!row.evidence_ids?.length) return undefined;
  let cursor = 0;
  for (const hard of result.hard_tests) {
    const n = hard.evidence_ids?.length ?? 0;
    if (hard.test_id === row.test_id) {
      return result.evidence[cursor];
    }
    cursor += n;
  }
  return undefined;
}

/** Parse `gates_snapshot.checks.CC-03` (or trailing check token) from evidence. */
export function extractCheckIdFromQaEvidence(
  evidence: QaEvidence | null | undefined,
): string | null {
  if (!evidence) return null;
  const locator = String(evidence.locator ?? "");
  const fromLocator = locator.match(
    /gates_snapshot\.checks\.([A-Z]{1,4}-\d+)/i,
  );
  if (fromLocator?.[1]) return fromLocator[1].toUpperCase();
  const trailing = locator.match(/\b([A-Z]{1,4}-\d+)\b/i);
  if (trailing?.[1]) return trailing[1].toUpperCase();
  const value = evidence.value;
  if (typeof value === "string") {
    const fromValue = value.match(/\b([A-Z]{1,4}-\d+)\b/i);
    if (fromValue?.[1]) return fromValue[1].toUpperCase();
  }
  return null;
}

/** Prefer first gate-check evidence when evidence_ids join is missing. */
export function firstDataGatesCheckEvidence(
  result: QaResultResponse,
): QaEvidence | undefined {
  const rows = Array.isArray(result.evidence) ? result.evidence : [];
  return rows.find((ev) =>
    /gates_snapshot\.checks\.[A-Z]{1,4}-\d+/i.test(String(ev.locator ?? "")),
  );
}

function evidenceLooksStaleOrNeedsImport(
  evidence: QaEvidence | null | undefined,
): boolean {
  if (!evidence) return false;
  const value = String(evidence.value ?? "").toLowerCase();
  const locator = String(evidence.locator ?? "").toLowerCase();
  const blob = `${value} ${locator}`;
  if (
    value === "not_evaluated" ||
    value === "missing_or_empty" ||
    value.includes("not_evaluated")
  ) {
    return true;
  }
  return (
    blob.includes("stale") ||
    blob.includes("freshness") ||
    blob.includes("fresh_import") ||
    blob.includes("latency")
  );
}

/** Connector / webhook / latency only — no bare "sync" substring (avoids async_* false positives). */
function evidencePrefersIntegrations(
  evidence: QaEvidence | null | undefined,
): boolean {
  if (!evidence) return false;
  const blob = `${String(evidence.value ?? "")} ${String(evidence.locator ?? "")}`.toLowerCase();
  return (
    blob.includes("connector") ||
    blob.includes("webhook") ||
    blob.includes("latency")
  );
}

function resolveFailEvidence(
  result: QaResultResponse,
  row: QaHardTestRow,
): QaEvidence | undefined {
  const joined =
    firstEvidenceForHardTest(result, row) ??
    result.evidence.find((ev) =>
      String(ev.locator ?? "")
        .toLowerCase()
        .includes(row.test_id.toLowerCase()),
    );
  if (joined) return joined;
  if (row.test_id === "data_gates_pass") {
    return firstDataGatesCheckEvidence(result);
  }
  return undefined;
}

/**
 * QA FAIL deep-link matrix (GAP-01E W8-04 / E0.7).
 * PASS → null. Never invents check ids — only from evidence when present.
 * Multi-blocking data gates: CTA uses the first evidence row only (known limit).
 */
export function qaFailDeepLink(input: {
  result: QaResultResponse;
  row: QaHardTestRow;
  issueId?: string | null;
}): QaFailDeepLink | null {
  const { result, row } = input;
  if (row.status !== "FAIL") return null;

  const evidence = resolveFailEvidence(result, row);

  const uc = (result.use_case_id || "").trim().toUpperCase() || undefined;
  const packageId = (result.package_id || result.object_id || "").trim() || undefined;
  const issueFromSearch = input.issueId?.trim() || undefined;

  if (row.test_id === "data_gates_pass") {
    if (evidenceLooksStaleOrNeedsImport(evidence)) {
      const checkId = extractCheckIdFromQaEvidence(evidence);
      if (evidencePrefersIntegrations(evidence)) {
        return {
          kind: "import",
          to: "/integrations",
          label: "Open Integrations · sync health",
        };
      }
      return {
        kind: "import",
        to: "/data-consistency",
        search: checkId ? { check: checkId } : undefined,
        label: checkId
          ? `Open Data Center · ${checkId}`
          : "Open Data Center · re-import",
      };
    }
    const checkId = extractCheckIdFromQaEvidence(evidence);
    if (checkId) {
      return {
        kind: "fix",
        to: "/fix",
        search: { issue: checkId },
        label: `Open Fix · ${checkId}`,
      };
    }
    // Bare Fix — do not reuse unrelated URL issueId as a check id.
    return {
      kind: "fix",
      to: "/fix",
      search: {},
      label: "Open Fix",
    };
  }

  if (
    (QA_FAIL_STUDIO_TEST_IDS as readonly string[]).includes(row.test_id)
  ) {
    return {
      kind: "studio",
      to: "/workflow",
      search: {
        ...(uc ? { uc } : {}),
        ...(packageId ? { package_id: packageId } : {}),
        ...(issueFromSearch ? { issue: issueFromSearch } : {}),
      },
      label: uc ? `Open Studio · ${uc}` : "Open Workflow Studio",
    };
  }

  // Unknown test_id — Studio fallback (package-local), do not invent Fix check.
  return {
    kind: "studio",
    to: "/workflow",
    search: {
      ...(uc ? { uc } : {}),
      ...(packageId ? { package_id: packageId } : {}),
    },
    label: "Open Workflow Studio",
  };
}
