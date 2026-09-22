import { apiRequest } from "@/lib/api";
import { formatDisplayCount, formatDisplayNumber } from "@/lib/presentation";

/** Routes allowed while the app is locked (`hard_locked` or `soft_locked_running`). */
export const LOCKED_ALLOWED_ROUTES = [
  "/dashboard",
  "/integrations",
  "/settings",
  "/activity",
] as const;

export const DCS_WORKLIST_QUERY_KEY = ["dcs", "worklist"] as const;
export const DCS_HISTORY_QUERY_KEY = ["dcs", "history"] as const;

/** Product threshold for workflow build readiness (shared across overview, sidebar, Data Center). */
export const DCS_BUILD_READY_THRESHOLD = 70;

/** Score band below build-ready that still shows warn (amber), not critical red. */
export const DCS_SCORE_WARN_FLOOR = 60;

/** PRD DCS-10: period captured widget — not banked revenue. */
export const DCS_PERIOD_CAPTURED_TOOLTIP =
  "Open at-stake risk reduced between the oldest and newest scored run in the selected period. This is not banked or captured revenue.";

export const DCS_PERIOD_CAPTURED_EYEBROW = "Period impact";

export type DcsThresholdState = "below" | "at" | "above";

/**
 * Headline score colour — same bands as Data Center ring:
 * ≥70 green · ≥60 amber · else red · null = muted.
 */
export function dcsScoreDisplayColor(
  score: number | null | undefined,
  options?: {
    threshold?: number;
    warnFloor?: number;
    empty?: string;
  },
): string {
  const threshold = options?.threshold ?? DCS_BUILD_READY_THRESHOLD;
  const warnFloor = options?.warnFloor ?? DCS_SCORE_WARN_FLOOR;
  const empty = options?.empty ?? "#9C9A92";
  if (score == null || !Number.isFinite(score)) return empty;
  const rounded = Math.round(score);
  if (rounded >= threshold) return "#2E8857";
  if (rounded >= warnFloor) return "#D97706";
  return "#B91C1C";
}

export function resolveDcsThresholdState(
  score: number | null | undefined,
  threshold: number = DCS_BUILD_READY_THRESHOLD,
): DcsThresholdState | null {
  if (score == null || !Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  if (rounded < threshold) return "below";
  if (rounded > threshold) return "above";
  return "at";
}

export function formatDcsThresholdBadge(
  score: number | null | undefined,
  threshold: number = DCS_BUILD_READY_THRESHOLD,
): string | null {
  const state = resolveDcsThresholdState(score, threshold);
  if (!state) return null;
  if (state === "below") return `Below ${threshold} threshold`;
  if (state === "above") return `Above ${threshold} threshold`;
  return `At ${threshold} threshold`;
}

export type DcsScoreHistoryPoint = {
  at: string;
  score: number;
  data_run_id: number;
  run_state: string | null;
  /** Per-dimension scores when persisted on the run (for period deltas). */
  dimensions?: Record<string, number>;
};

export type DcsValueCapturePoint = {
  at: string;
  value: number;
  data_run_id: number;
};

export type DcsValueCaptureHistory = {
  revenue: DcsValueCapturePoint[];
  margin: DcsValueCapturePoint[];
};

export type DcsPeriodCompareSnapshot = {
  data_run_id: number;
  at: string;
  headline_score: number | null;
  dimensions?: Record<string, number>;
  business_impact?: {
    estimate: number;
    currency?: string;
  };
};

export type DcsPeriodCompareDeltas = {
  headline_score?: number;
  dimensions?: Record<string, number>;
  estimate?: number;
  captured_from_estimate?: number;
};

export type DcsPeriodCompare = {
  available: boolean;
  run_count: number;
  first: DcsPeriodCompareSnapshot | null;
  last: DcsPeriodCompareSnapshot | null;
  deltas: DcsPeriodCompareDeltas | null;
};

export type DcsAtStakeSeriesPoint = {
  at: string;
  value: number;
  data_run_id: number;
  currency?: string | null;
};

export type DcsScoreHistoryResponse = {
  points: DcsScoreHistoryPoint[];
  value_capture?: DcsValueCaptureHistory;
  at_stake_series?: DcsAtStakeSeriesPoint[];
  period_compare?: DcsPeriodCompare;
  since: string | null;
  until: string | null;
};

export type DcsAppAccess = "unlocked" | "hard_locked" | "soft_locked_running";

export type DcsLockReason =
  | "no_run"
  | "failed"
  | "blocked"
  | "incomplete_no_score"
  | "running_no_score";

export type DcsScoreDisplayState = "ready" | "calculating" | "not_calculated";

export type DcsDataRunStatus = "pending" | "running" | "succeeded" | "failed";

export type DcsScoreDisplay = {
  state: DcsScoreDisplayState;
  headline_score: number | null;
  label: string | null;
};

export type DcsFreshImportPlatform = "shopify" | "manago_ai";

export type DcsFreshImportPlatformSummary = {
  data_run_id?: number;
  window_end?: string;
};

/** PRD-DCS-10 Slice B — per-platform fresh import summary on run payloads. */
export type DcsFreshImportsSummary = Partial<
  Record<DcsFreshImportPlatform, DcsFreshImportPlatformSummary>
>;

export type DcsRunSummary = {
  data_run_id: number;
  domain_run_id: string | null;
  status: DcsDataRunStatus;
  run_state: string | null;
  headline_score: number | null;
  blocking_gates_failed: number;
  error: string | null;
  triggered_by: string | null;
  started_at: string | null;
  created_at?: string | null;
  finished_at: string | null;
  run_diff?: DcsRunDiff | null;
  fresh_imports?: DcsFreshImportsSummary | null;
  fresh_import_failed_platform?: DcsFreshImportPlatform | null;
};

export type DcsRunDiffHeadline = {
  previous?: number | null;
  current?: number | null;
  delta?: number | null;
};

/** Consecutive run-diff from DCS-10 (vs immediately prior scored run). */
export type DcsRunDiff = {
  baseline?: boolean;
  compared_to_data_run_id?: number | null;
  headline_score?: DcsRunDiffHeadline | null;
};

export type DcsEvidenceItem = {
  source: string;
  locator: string;
  value: unknown;
  observed_at: string;
  /** PRD-FE-11 — enriched by worklist normalize when available. */
  entity?: string;
  db_key?: string;
  api_key?: string;
  element?: string;
  element_label?: string;
};

export type DcsDimensionCheck = {
  check_id: string;
  name: string;
  status: string;
};

export type DcsIssueStatus = "FAIL" | "WARN";

export type DcsIssue = {
  check_id: string | null;
  run_issue_id: string | null;
  title: string;
  status: DcsIssueStatus;
  severity: string;
  dimension: string | null;
  detail: string;
  suggested_fix: string;
  /** Excel Fix Owner: Klints (automated), Data lead, External integrator, CRM manager. */
  fix_owner?: string | null;
  fix_type?: string | null;
  fix_in_klints?: boolean | null;
  /** Excel systems compared — e.g. "Manago", "Manago vs Shopify". */
  systems_compared?: string | null;
  root_cause_ids: string[];
  is_optional: boolean;
  revenue_impact: number;
  currency: string | null;
  evidence_preview: DcsEvidenceItem[];
};

export type DcsDimensionScore = {
  score: number;
  coverage: number;
  confidence: number;
  weight_percent: number;
  /** Change vs previous scored run (from status API). */
  score_delta?: number | null;
};

export type DcsCheckSummary = Record<string, number>;

export type DcsBusinessImpact = {
  currency: string | null;
  estimate: number | null;
  by_check: Record<string, number>;
  excluded_from_rollup: Record<string, number>;
  window_days: number | null;
  as_of: string | null;
  formula_version: string;
  revenue_mixed_currency: boolean;
};

export type DcsRunStageState = "pending" | "running" | "passed" | "failed" | "skipped";

export type DcsRunStage = {
  dimension_id: string;
  key: string;
  label: string;
  state: DcsRunStageState;
  fail_count: number;
  warn_count: number;
  check_count: number;
  evaluated_count: number;
};

export type DcsRunProgress = {
  data_run_id: number | null;
  data_run_status: DcsDataRunStatus | "pending";
  current_dimension_id: string | null;
  stages: DcsRunStage[];
};

export type DcsAppStatus = {
  app_access: DcsAppAccess;
  lock_reason: DcsLockReason | null;
  message: string | null;
  score_display: DcsScoreDisplay;
  latest_run: DcsRunSummary | null;
  active_run: DcsRunSummary | null;
  scheduled: boolean;
  has_ever_scored: boolean;
  best_headline_score: number | null;
  issues: DcsIssue[];
  allowed_routes: string[];
  run_progress: DcsRunProgress | null;
  check_summary: DcsCheckSummary | null;
  dimensions: Record<string, DcsDimensionScore> | null;
  dimension_checks: Record<string, DcsDimensionCheck[]> | null;
  sample_size: number | null;
  business_impact: DcsBusinessImpact | null;
};

export type DcsWorklistResponse = {
  data_run_id: number | null;
  domain_run_id: string | null;
  run_state: string | null;
  headline_score: number | null;
  business_impact: DcsBusinessImpact | null;
  count: number;
  issues: DcsIssue[];
};

export type DcsWorklistIssueDetail = {
  data_run_id: number;
  domain_run_id: string | null;
  check_id: string;
  run_issue_id: string | null;
  title: string;
  status: DcsIssueStatus;
  severity: string;
  dimension: string | null;
  detail: string;
  suggested_fix: string;
  root_cause_ids: string[];
  is_optional: boolean;
  revenue_impact: number;
  currency: string | null;
  revenue_formula_id: string | null;
  fix_owner?: string | null;
  fix_type?: string | null;
  systems_compared?: string | null;
  evidence: DcsEvidenceItem[];
  matches: DcsEvidenceItem[];
  mismatches: DcsEvidenceItem[];
  provenance: Record<string, unknown>;
};

export async function getDcsStatus(): Promise<DcsAppStatus> {
  return apiRequest("/api/v1/dcs/status/") as Promise<DcsAppStatus>;
}

export type StartDcsRunResponse = {
  data_run_id: number;
  dcs_run_id: string | null;
  status: DcsDataRunStatus | string;
  scoring_model_version: string;
};

export type StartDcsRunPayload = {
  erp_in_scope?: boolean;
  source_run_ids?: {
    shopify?: string | null;
    manago_ai?: string | null;
  };
};

/** POST /api/v1/dcs/runs/ — enqueue a DCS score + checks run (admin). */
export async function startDcsRun(
  payload: StartDcsRunPayload = {},
): Promise<StartDcsRunResponse> {
  return apiRequest("/api/v1/dcs/runs/", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<StartDcsRunResponse>;
}

export async function getDcsScoreHistory(params: {
  since?: string;
  until?: string;
  days?: number;
}): Promise<DcsScoreHistoryResponse> {
  const search = new URLSearchParams();
  if (params.since) search.set("since", params.since);
  if (params.until) search.set("until", params.until);
  if (params.days != null) search.set("days", String(params.days));
  const qs = search.toString();
  const endpoint = qs
    ? `/api/v1/dcs/history/?${qs}`
    : "/api/v1/dcs/history/";
  return apiRequest(endpoint) as Promise<DcsScoreHistoryResponse>;
}

export async function getDcsWorklist(): Promise<DcsWorklistResponse> {
  return apiRequest("/api/v1/dcs/worklist/") as Promise<DcsWorklistResponse>;
}

export async function getDcsWorklistIssue(checkId: string): Promise<DcsWorklistIssueDetail> {
  const encoded = encodeURIComponent(checkId.trim());
  return apiRequest(`/api/v1/dcs/worklist/${encoded}/`) as Promise<DcsWorklistIssueDetail>;
}

export function dcsWorklistIssueQueryKey(checkId: string) {
  return ["dcs", "worklist", checkId] as const;
}

export function isAppLocked(status: DcsAppStatus): boolean {
  return status.app_access !== "unlocked";
}

/** Unlocked after a prior score, but latest terminal run failed — hide ready score. */
export function isDcsScoreHiddenAfterFailure(status: DcsAppStatus): boolean {
  return (
    status.app_access === "unlocked" &&
    status.score_display.state === "not_calculated" &&
    status.latest_run?.status === "failed"
  );
}

export function isDcsScoreReady(status: DcsAppStatus): boolean {
  return (
    status.score_display.state === "ready" &&
    status.score_display.headline_score != null
  );
}

export function displayHeadlineScore(status: DcsAppStatus): number | null {
  // Only surface the score the API marked ready — never invent from best_headline.
  if (
    status.score_display.state === "ready" &&
    status.score_display.headline_score != null
  ) {
    return status.score_display.headline_score;
  }
  return null;
}

function normalizeIsoCurrency(currency: string | null | undefined): string | null {
  const code = currency?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) return null;
  return code;
}

function currencyDisplaySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** Display backend revenue amounts with the ISO currency returned by the API — never invent €/$. */
export function formatDcsRevenue(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || amount <= 0) return "—";

  const code = normalizeIsoCurrency(currency);
  if (!code) {
    if (Math.abs(amount) >= 1000) {
      const k = Math.abs(amount) / 1000;
      const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
      const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
      return `${amount < 0 ? "-" : ""}${body}K`;
    }
    return Math.round(amount).toLocaleString("en-IE");
  }

  const compact =
    Math.abs(amount) >= 1000
      ? (() => {
          const k = Math.abs(amount) / 1000;
          const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
          const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
          return `${currencyDisplaySymbol(code)}${body}K`;
        })()
      : null;

  if (compact) return compact;

  try {
    return Math.round(amount).toLocaleString("en-IE", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${currencyDisplaySymbol(code)}${Math.round(amount).toLocaleString("en-IE")}`;
  }
}

/** Display DCS headline / dimension scores without decimals. */
export function formatDcsScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

/** Canonical product order: "01 Customer Identity" … "07 Business Reality". */
export function sortDimensionEntries(
  dimensions: Record<string, DcsDimensionScore>,
): Array<[string, DcsDimensionScore]> {
  const sortKey = (label: string): string => {
    const token = label.trim().split(/\s+/, 1)[0] ?? "";
    return /^\d{2}$/.test(token) ? token : "99";
  };
  return Object.entries(dimensions).sort(
    ([a], [b]) => sortKey(a).localeCompare(sortKey(b)) || a.localeCompare(b),
  );
}

export function resolveDimensionScoreDelta(
  dim: DcsDimensionScore,
  historyFallback?: number | null,
): number | null {
  if (dim.score_delta != null && Number.isFinite(dim.score_delta)) {
    return Math.round(dim.score_delta);
  }
  if (historyFallback != null && Number.isFinite(historyFallback)) {
    return Math.round(historyFallback);
  }
  return null;
}

export function computeDimensionDeltas(
  dimensions: Record<string, DcsDimensionScore> | null | undefined,
  historyPoints: DcsScoreHistoryPoint[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  if (!dimensions) return result;

  const sorted = [...historyPoints].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const withDimensions = sorted.filter(
    (point) => point.dimensions && Object.keys(point.dimensions).length > 0,
  );
  const baseline = withDimensions.length >= 2 ? withDimensions[0] : null;

  for (const [name, dim] of Object.entries(dimensions)) {
    if (dim.score_delta != null && Number.isFinite(dim.score_delta)) {
      result[name] = Math.round(dim.score_delta);
      continue;
    }
    if (!baseline) {
      result[name] = null;
      continue;
    }
    const current = Math.round(dim.score);
    const baselineScore = baseline.dimensions?.[name];
    if (baselineScore == null || !Number.isFinite(baselineScore)) {
      result[name] = null;
      continue;
    }
    result[name] = current - Math.round(baselineScore);
  }
  return result;
}

export function liveDimensionsToChartData(
  dimensions: Record<string, DcsDimensionScore> | null | undefined,
  dimensionDeltas?: Record<string, number | null> | null,
): Array<{ name: string; score: number; delta: number | null }> {
  if (!dimensions) return [];
  return sortDimensionEntries(dimensions).map(([name, dim]) => ({
    name,
    score: Math.round(dim.score),
    delta: resolveDimensionScoreDelta(dim, dimensionDeltas?.[name] ?? null),
  }));
}

export type PeriodHeadlineDelta = {
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
};

/** Overview period score change (oldest vs newest run in window). */
export function resolvePeriodHeadlineDelta(
  periodCompare: DcsPeriodCompare | null | undefined,
): PeriodHeadlineDelta | null {
  if (!periodCompare?.available) return null;
  const raw = periodCompare.deltas?.headline_score;
  if (raw == null || !Number.isFinite(raw)) return null;
  const delta = Math.round(raw);
  if (delta === 0) return { delta: 0, direction: "flat" };
  return { delta, direction: delta > 0 ? "up" : "down" };
}

/** Per-dimension period deltas for Overview charts (not consecutive run-diff). */
export function periodCompareDimensionDeltas(
  periodCompare: DcsPeriodCompare | null | undefined,
): Record<string, number> | null {
  if (!periodCompare?.available) return null;
  const dims = periodCompare.deltas?.dimensions;
  if (!dims) return null;
  const result: Record<string, number> = {};
  for (const [name, value] of Object.entries(dims)) {
    if (Number.isFinite(value)) result[name] = Math.round(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function liveDimensionsWithPeriodDeltas(
  dimensions: Record<string, DcsDimensionScore> | null | undefined,
  periodCompare: DcsPeriodCompare | null | undefined,
): Array<{ name: string; score: number; delta: number | null }> {
  if (!dimensions) return [];
  const periodDeltas = periodCompareDimensionDeltas(periodCompare);
  return sortDimensionEntries(dimensions).map(([name, dim]) => ({
    name,
    score: Math.round(dim.score),
    delta: periodDeltas?.[name] ?? null,
  }));
}

/** At-stake risk reduced over the selected period (not banked revenue). */
export function resolvePeriodCapturedAmount(
  periodCompare: DcsPeriodCompare | null | undefined,
): number | null {
  if (!periodCompare?.available) return null;
  const captured = periodCompare.deltas?.captured_from_estimate;
  if (captured == null || !Number.isFinite(captured) || captured <= 0) {
    return null;
  }
  return Math.round(captured);
}

/** Period impact UI state for Overview captured block (DCS-10). */
export type PeriodImpactState = "loading" | "empty" | "insufficient" | "ready";

export function resolvePeriodImpactState(
  periodCompare: DcsPeriodCompare | null | undefined,
  historyLoaded: boolean,
): PeriodImpactState {
  if (!historyLoaded) return "loading";
  if (periodCompare?.available) return "ready";
  if ((periodCompare?.run_count ?? 0) === 0) return "empty";
  return "insufficient";
}

export function periodImpactCapturedSubcopy(state: PeriodImpactState): string {
  switch (state) {
    case "ready":
      return "Open risk improved in selected period";
    case "insufficient":
      return "Need ≥2 scored runs in period";
    case "empty":
      return "No scores in this period";
    case "loading":
      return "—";
  }
}

export function resolvePeriodCapturedCurrency(
  periodCompare: DcsPeriodCompare | null | undefined,
  fallback?: string | null,
): string | null {
  const fromLast = periodCompare?.last?.business_impact?.currency;
  const fromFirst = periodCompare?.first?.business_impact?.currency;
  const resolved =
    (typeof fromLast === "string" && fromLast.trim() ? fromLast : null) ??
    (typeof fromFirst === "string" && fromFirst.trim() ? fromFirst : null) ??
    fallback ??
    null;
  return resolved;
}

/** Data Center / latest run: consecutive score change vs prior scored run. */
export function formatConsecutiveRunDiffLabel(
  runDiff: DcsRunDiff | null | undefined,
): string | null {
  if (!runDiff || runDiff.baseline) return null;
  const headline = runDiff.headline_score;
  if (!headline || headline.delta == null || !Number.isFinite(headline.delta)) {
    return null;
  }

  const current =
    headline.current != null && Number.isFinite(headline.current)
      ? Math.round(headline.current)
      : null;
  const previous =
    headline.previous != null && Number.isFinite(headline.previous)
      ? Math.round(headline.previous)
      : null;
  const displayDelta =
    current != null && previous != null
      ? current - previous
      : Math.round(headline.delta);

  if (displayDelta === 0) return "No change vs prior run";
  return displayDelta > 0
    ? `+${displayDelta} vs prior run`
    : `${displayDelta} vs prior run`;
}

const DCS_CHECK_ID_PATTERN = /^[A-Z]{2}-\d{2}$/i;
/** Sandbox writeback registry ids (PRD-WB-01B e.g. WB-SHOP-01). */
const WRITEBACK_SANDBOX_CHECK_ID_PATTERN = /^WB-[A-Z]+-\d{2}$/i;

export function isFixFlowCheckOrMappingId(value: string | undefined | null): boolean {
  if (!value?.trim()) return false;
  const id = value.trim();
  if (/^iss-/i.test(id)) return false;
  return (
    DCS_CHECK_ID_PATTERN.test(id) || WRITEBACK_SANDBOX_CHECK_ID_PATTERN.test(id)
  );
}

export function resolveCheckIdFromSearch(
  check?: string | null,
  issue?: string | null,
): string | undefined {
  if (typeof check === "string" && check.trim()) return check.trim();
  if (typeof issue === "string" && isFixFlowCheckOrMappingId(issue)) {
    return issue.trim();
  }
  return undefined;
}

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (pathOnly === "/") return pathOnly;
  return pathOnly.replace(/\/$/, "") || "/";
}

function isPathInRouteList(pathname: string, routes: readonly string[]): boolean {
  const normalized = normalizePathname(pathname);
  return routes.some(
    (route) => normalized === route || normalized.startsWith(`${route}/`),
  );
}

export function isRouteAllowed(status: DcsAppStatus, pathname: string): boolean {
  const allowedRoutes = status.allowed_routes ?? [];

  if (allowedRoutes.includes("*")) {
    return true;
  }

  if (isAppLocked(status) && isPathInRouteList(pathname, LOCKED_ALLOWED_ROUTES)) {
    return true;
  }

  const routes =
    allowedRoutes.length > 0 ? allowedRoutes : [...LOCKED_ALLOWED_ROUTES];
  return isPathInRouteList(pathname, routes);
}

/**
 * Nav / spotlight route gate.
 * While status is unknown, only allow FE-03 locked-safe routes (avoid enabled links that
 * `requireAppAccess` will reject). When unlocked, all routes; when locked, backend list.
 */
export function isNavRouteAllowed(
  dcsStatus: DcsAppStatus | undefined,
  route: string,
): boolean {
  if (!dcsStatus) {
    return isPathInRouteList(route, LOCKED_ALLOWED_ROUTES);
  }
  if (!isAppLocked(dcsStatus)) return true;
  return isRouteAllowed(dcsStatus, route);
}

const SEVERITY_SORT_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

function severitySortKey(severity: string): number {
  const value = severity.trim().toLowerCase();
  if (!value) return SEVERITY_SORT_ORDER.high;
  return SEVERITY_SORT_ORDER[value] ?? 5;
}

/** PRD §4.2: revenue DESC → required before optional → severity → check_id ASC. */
export function sortDcsWorklistIssues(issues: DcsIssue[]): DcsIssue[] {
  return [...issues].sort((a, b) => {
    if (b.revenue_impact !== a.revenue_impact) {
      return b.revenue_impact - a.revenue_impact;
    }
    if (a.is_optional !== b.is_optional) {
      return a.is_optional ? 1 : -1;
    }
    const severityDiff = severitySortKey(a.severity) - severitySortKey(b.severity);
    if (severityDiff !== 0) return severityDiff;
    return (a.check_id ?? "").localeCompare(b.check_id ?? "");
  });
}

export function severityLabel(severity: string): string {
  const value = severity.trim().toLowerCase();
  if (!value) return "High";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Pretty systems string from CheckMaster (Manago → Manago.ai). */
export function formatSystemsCompared(systems: string | null | undefined): string {
  const raw = (systems ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/\bManago\b/gi, "Manago.ai")
    .replace(/\s+vs\.?\s+/gi, " · ")
    .replace(/\s*\+\s*/g, " · ")
    .replace(/\s*,\s*/g, " · ");
}

/**
 * Owner cell for Opportunity tracker / worklist:
 * - External integrator → show system name (Manago.ai / Shopify), not the role jargon
 * - Klints (automated) → Klints
 * - Data lead / CRM manager → keep role; append systems when useful
 */
export function formatWorklistOwner(issue: {
  fix_owner?: string | null;
  systems_compared?: string | null;
  fix_in_klints?: boolean | null;
}): string {
  const owner = (issue.fix_owner ?? "").trim();
  const systems = formatSystemsCompared(issue.systems_compared);
  const ownerKey = owner.toLowerCase();

  if (ownerKey === "external integrator" || ownerKey === "external integrator.") {
    return systems || "External integrator";
  }
  if (issue.fix_in_klints || ownerKey === "klints (automated)") {
    return systems ? `Klints · ${systems}` : "Klints";
  }
  if (owner && systems) return `${owner} · ${systems}`;
  if (owner) return owner;
  if (systems) return systems;
  return "—";
}

export function severityChipClass(severity: string, isOptional: boolean): string {
  if (isOptional) return "bg-muted text-muted-foreground";
  const value = severity.trim().toLowerCase();
  if (value === "critical") return "bg-loss-soft text-loss";
  if (value === "high") return "bg-spark/10 text-spark";
  if (value === "medium") return "bg-risk-soft text-risk";
  if (value === "low" || value === "informational") return "bg-info-soft text-info";
  return "bg-risk-soft text-risk";
}

export type ExecutiveIssueCard = {
  /** Customer-facing title (from backend title, lightly cleaned). */
  title: string;
  /** Primary NBA line — revenue or live metric from backend. */
  impactLabel: string;
  /** When true, render ` / q` after the primary line (monetary impact). */
  impactShowQuarterly: boolean;
  /** Max 2 short sentences: what is wrong + business effect. */
  summary: string;
  /** Short live context for the card footer (above Open →). */
  whyMatters: string;
  /** Compact dimension / area badge. */
  areaBadge: string;
  /** Compact severity badge label. */
  severityBadge: string;
  /** Rank caption for overview cards, e.g. "Highest impact". */
  rankCaption: string;
};

const TECHNICAL_TOKEN_RE =
  /\b(?:RC|FD|LE|PT|ME|CI|CS|CC|BR|ID|SP)-\d{2}(?:-\d+)?\b/gi;
const KEY_VALUE_METRIC_RE =
  /\b[a-z][a-z0-9_]*(?:=|:)\s*[\d.]+%?(?:\s*(?:clusters?|pairs?|contacts?|orders?))?/gi;
/** Flags like dead-state=True, elevated: false, status=None */
const KEY_VALUE_FLAG_RE =
  /\b[a-z][a-z0-9_-]*(?:\s*[=:]\s*)(?:true|false|none|null|yes|no|ok|fail(?:ed)?|pass(?:ed)?|elevated|warn(?:ing)?)\b/gi;
const DETAIL_PREFIX_RE =
  /^(?:detail|message|error|failed|fail|warning|warn)\s*[:.—-]\s*/i;
const ROOT_CAUSE_PHRASE_RE =
  /\b(?:root\s*cause|failed:\s*rc-\d+|integration gap|standard remediation)\b/gi;
const SNAKE_FIELD_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/g;
const HYPHEN_FIELD_RE = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+){1,}\b/gi;
const JSONISH_RE = /[{}\[\]"]/g;
const STACK_HINT_RE =
  /\b(?:traceback|stack\s*trace|exception|TypeError|ValueError|KeyError|null\s*pointer)\b/gi;
const STATUS_JARGON_RE =
  /\b(?:elevated|dead[- ]?state|warn(?:ing)?[- ]?state|fail(?:ure)?[- ]?state|pass[- ]?state|boolean|null(?:able)?|undefined|nan)\b/gi;
const FORBIDDEN_TECH_WORD_RE =
  /\b(?:validation|provenance|baseline\s+compatibility|migration|pipeline|backend|api|apis|record\s+mismatch(?:es)?|schema|payload|endpoint|upsert|backfill|reconciliation|reconcile|validator|implementation|exception|traceback|parity|delta|cluster(?:s)?|topology|dedup(?:lication)?)\b/gi;

const CUSTOMER_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bnet\s*vs\.?\s*gross(?:\s+transaction\s+truth)?\b/gi, "different transaction totals"],
  [/\btransaction\s+truth\b/gi, "reported purchase amounts"],
  [/\bconsent\s+provenance\b/gi, "consent data across systems"],
  [/\bbaseline\s+compatibility\b/gi, "required setup"],
  [/\bhistorical\s+migration\b/gi, "older customer data"],
  [/\bduplicate\s+purchase\s+events?(?:\s+per\s+order)?\b/gi, "duplicate purchases"],
  [/\bevent\s+deduplication\b/gi, "duplicate purchases"],
  [/\brecord\s+mismatch(?:es)?\b/gi, "customer data is inconsistent"],
  [/\bRETURN\/CANCELLATION\b/gi, "return/cancellation"],
  [/\bgeo_variant\b/gi, "regional store"],
  [/\bindependent_business_line\b/gi, "separate business line"],
  [/\bsegment_variant\b/gi, "customer segment"],
  [/\bexcel\s+classification\b/gi, "account classification"],
  [/\bclassification\s+matrix\b/gi, "account classification"],
  [/\bprimary[_\s-]?owner\b/gi, "primary shop owner"],
  [/\bneeds_primary_selection\b/gi, "primary owner selection"],
  [/\btopology[_\s-]?configured\b/gi, "account mapping"],
  [/\baccount\/sub-account\s+topology\b/gi, "account and sub-account mapping"],
  [/\bsub[- ]?account\s+topology\b/gi, "sub-account mapping"],
  [/\btopology\s+mapped\b/gi, "account mapping"],
  [/\btopology\b/gi, "account mapping"],
  [/\bupsert\b/gi, "update"],
  [/\bbackfill\b/gi, "complete missing"],
  [/\breconcile\b/gi, "align"],
  [/\breconciliation\b/gi, "alignment"],
  [/\bpayload\b/gi, "data"],
  [/\bschema\b/gi, "data structure"],
  [/\bendpoint\b/gi, "connection"],
  [/\bprovenance\b/gi, "source information"],
  [/\bpipeline\b/gi, "data flow"],
  [/\bvalidation\b/gi, "check"],
  [/\bmigration\b/gi, "data transfer"],
  [/\bbackend\b/gi, "system"],
  [/\bAPIs?\b/g, "connections"],
  [/\bNOT[_\s-]?CONNECTED\b/gi, "not connected"],
  [/\bNOT[_\s-]?APPLICABLE\b/gi, "not applicable"],
];

/** Strip developer diagnostics while keeping the underlying backend wording. */
export function stripTechnicalDiagnostics(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  let cleaned = text
    .replace(STACK_HINT_RE, " ")
    .replace(TECHNICAL_TOKEN_RE, " ")
    .replace(KEY_VALUE_FLAG_RE, " ")
    .replace(KEY_VALUE_METRIC_RE, " ")
    .replace(ROOT_CAUSE_PHRASE_RE, " ")
    .replace(DETAIL_PREFIX_RE, "")
    .replace(STATUS_JARGON_RE, " ")
    .replace(JSONISH_RE, " ")
    .replace(/\([^)]{0,40}=[^)]{0,40}\)/g, " ")
    .replace(SNAKE_FIELD_RE, " ")
    .replace(HYPHEN_FIELD_RE, " ")
    .replace(/\b(?:true|false|none|null)\b/gi, " ")
    .replace(/\s*[·|]\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/([.!?])\1+/g, "$1")
    .replace(/^[.\s,:;—-]+|[.\s,:;—-]+$/g, "")
    .trim();

  // Drop leftover fragments that are mostly punctuation / codes.
  if (cleaned.length < 12) return "";
  if (/^[A-Z0-9_\-.\s]+$/.test(cleaned) && cleaned.length < 40) return "";
  return cleaned;
}

function humanizeCustomerLanguage(text: string): string {
  if (!text) return "";
  let out = text;
  for (const [pattern, replacement] of CUSTOMER_PHRASE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(FORBIDDEN_TECH_WORD_RE, " ");
  return out.replace(/\s{2,}/g, " ").trim();
}

function ensureSentence(text: string): string {
  const trimmed = text.trim().replace(/^[a-z]/, (ch) => ch.toUpperCase());
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function looksLikeRawCode(text: string): boolean {
  if (!text) return true;
  if (/\b(?:RC|FD|LE|PT|ME|CI|CS|CC|BR|ID|SP)-\d{2}(?:-\d+)?\b/i.test(text)) return true;
  if (/[=:{}\[\]_]{2,}/.test(text)) return true;
  if (/\b(?:true|false|none|null)\b/i.test(text)) return true;
  if (/\b(?:elevated|dead[- ]?state|parity|delta|cluster|topology|payload|schema)\b/i.test(text)) {
    return true;
  }
  if (/[a-z0-9_-]+\s*[=:]\s*[a-z0-9._%-]+/i.test(text)) return true;
  if (/^\s*[A-Z]{2,}-\d+/.test(text)) return true;
  if (/\bfailed\b/i.test(text) && text.split(/\s+/).length <= 6) return true;
  return text.split(/\s+/).length < 4 && /[_/\\-]/.test(text);
}

/** True when cleaned copy still reads like developer diagnostics. */
function stillLooksTechnical(text: string): boolean {
  if (!text?.trim()) return true;
  if (looksLikeRawCode(text)) return true;
  const lower = text.toLowerCase();
  if (
    /\b(validation|provenance|migration|pipeline|backend|apis?\b|schema|payload|endpoint|upsert|backfill|reconciliation|reconcile|validator|implementation|exception|traceback|parity|delta|clusters?|topology|dedup)/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\b(elevated|dead[ -]?state|boolean|undefined|nan)\b/i.test(lower)) return true;
  if (/\b(did not pass|failed|error|exception)\b/i.test(lower) && text.split(/\s+/).length <= 8) {
    return true;
  }
  return false;
}

function textOverlap(a: string, b: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(" ").filter((t) => t.length > 3));
  const rightTokens = right.split(" ").filter((t) => t.length > 3);
  if (rightTokens.length === 0) return false;
  const shared = rightTokens.filter((t) => leftTokens.has(t)).length;
  return shared / rightTokens.length >= 0.7;
}

function clampSummary(text: string, maxChars = 140, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let out = "";
  let count = 0;
  for (const sentence of sentences) {
    if (count >= maxSentences) break;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > maxChars && out) break;
    out = next;
    count += 1;
  }
  if (!out) out = text.slice(0, maxChars).trim();
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 1).trimEnd()}…`;
  }
  if (out && !/[.!?]$/.test(out)) out = `${out}.`;
  return out;
}

function limitSentences(text: string, maxSentences = 2): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= maxSentences) return sentences.join(" ");
  return sentences.slice(0, maxSentences).join(" ");
}

function asEvidenceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asLiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function detailClause(detail: string): string {
  const idx = detail.lastIndexOf("Detail:");
  return (idx >= 0 ? detail.slice(idx + "Detail:".length) : detail).trim();
}

function parseParityCountsFromDetail(detail: string): {
  shopify: number;
  manago: number;
  deltaPct: number | null;
} | null {
  const clause = detailClause(detail);
  const shopify = clause.match(/Shopify=(\d+)/i)?.[1];
  const manago = clause.match(/Manago=(\d+)/i)?.[1];
  if (!shopify || !manago) return null;

  const deltaRaw = clause.match(/overall_delta=([\d.]+)(%?)/i);
  let deltaPct: number | null = null;
  if (deltaRaw) {
    const n = Number(deltaRaw[1]);
    if (Number.isFinite(n)) {
      deltaPct = deltaRaw[2] === "%" || n > 1 ? n : n * 100;
    }
  }

  return { shopify: Number(shopify), manago: Number(manago), deltaPct };
}

function parseGapCountsFromDetail(detail: string): number | null {
  const clause = detailClause(detail);
  const shopifyOnly = clause.match(/shopify_only=(\d+)/i)?.[1];
  const managoOnly = clause.match(/manago_only=(\d+)/i)?.[1];
  if (!shopifyOnly && !managoOnly) return null;
  const total = Number(shopifyOnly ?? 0) + Number(managoOnly ?? 0);
  return total > 0 ? total : null;
}

function formatShopifyManagoLine(shopify: number, manago: number): string {
  return `Shopify: ${formatDisplayCount(shopify)} · Manago: ${formatDisplayCount(manago)}`;
}

function formatMismatchPercent(pct: number): string {
  return `${formatDisplayCount(Math.round(pct))}% event mismatch detected`;
}

function liveContextFromEvidencePreview(
  preview: DcsEvidenceItem[] | null | undefined,
): string | null {
  const items = preview ?? [];

  for (const item of items) {
    const rec = asEvidenceRecord(item.value);
    if (!rec) continue;

    const shopify = asLiveNumber(rec.shopify_paid_orders);
    const manago = asLiveNumber(rec.manago_purchase_events);
    if (shopify != null && manago != null) {
      return formatShopifyManagoLine(shopify, manago);
    }

    const delta = asLiveNumber(rec.overall_count_delta);
    if (delta != null && delta > 0) {
      return formatMismatchPercent(delta <= 1 ? delta * 100 : delta);
    }

    const shopifyOnly = asLiveNumber(rec.shopify_only_count);
    const managoOnly = asLiveNumber(rec.manago_only_count);
    if (shopifyOnly != null || managoOnly != null) {
      const total = (shopifyOnly ?? 0) + (managoOnly ?? 0);
      if (total > 0) {
        return `${formatDisplayCount(total)} purchase events need attention`;
      }
    }

    const missing = asLiveNumber(rec.missing_count);
    if (missing != null && missing > 0) {
      return `${formatDisplayCount(missing)} records need attention`;
    }

    const dupExtra = asLiveNumber(rec.duplicate_extra_events);
    if (dupExtra != null && dupExtra > 0) {
      return `${formatDisplayCount(dupExtra)} duplicate purchase events`;
    }
  }

  const gapRows = items.filter((item) => {
    const rec = asEvidenceRecord(item.value);
    return rec?.side === "shopify_only" || rec?.side === "manago_only";
  });
  if (gapRows.length > 0) {
    return `${formatDisplayCount(gapRows.length)} purchase events need attention`;
  }

  return null;
}

function resolveIssueLiveContextLabel(issue: DcsIssue): string | null {
  const detail = issue.detail?.trim() ?? "";

  const parity = detail ? parseParityCountsFromDetail(detail) : null;
  if (parity) return formatShopifyManagoLine(parity.shopify, parity.manago);

  const gapTotal = detail ? parseGapCountsFromDetail(detail) : null;
  if (gapTotal != null) {
    return `${formatDisplayCount(gapTotal)} purchase events need attention`;
  }

  const missingOrders = detail.match(/(\d+)\s+orders?\s+missing/i);
  if (missingOrders) {
    return `${formatDisplayCount(Number(missingOrders[1]))} orders need attention`;
  }

  const dupRate = detail.match(/Duplicate PURCHASE rate=([\d.]+)%/i);
  if (dupRate) {
    return `${formatDisplayCount(Number(dupRate[1]))}% duplicate purchase events`;
  }

  const fromEvidence = liveContextFromEvidencePreview(issue.evidence_preview);
  if (fromEvidence) return fromEvidence;

  const deltaOnly = detailClause(detail).match(/overall_delta=([\d.]+)(%?)/i);
  if (deltaOnly) {
    const n = Number(deltaOnly[1]);
    if (Number.isFinite(n) && n > 0) {
      const pct = deltaOnly[2] === "%" || n > 1 ? n : n * 100;
      return formatMismatchPercent(pct);
    }
  }

  return null;
}

export function resolveIssueRevenueAmount(
  issue: DcsIssue,
  businessImpact?: DcsBusinessImpact | null,
): number {
  if (issue.revenue_impact > 0) return issue.revenue_impact;
  const checkId = issue.check_id?.trim();
  if (!checkId || !businessImpact?.by_check) return 0;
  const fromRollup = businessImpact.by_check[checkId];
  return typeof fromRollup === "number" && fromRollup > 0 ? fromRollup : 0;
}

export function resolveIssueDisplayCurrency(
  issue: DcsIssue,
  businessImpact?: DcsBusinessImpact | null,
): string | null {
  return issue.currency?.trim() || businessImpact?.currency?.trim() || null;
}

function impactAreaFallback(issue: DcsIssue): string {
  const area = areaBadgeForIssue(issue).toLowerCase();
  if (area.includes("foundation")) return "DCS readiness blocked";
  if (area.includes("identity")) return "Customer data quality";
  if (
    area.includes("lifecycle") ||
    area.includes("product") ||
    area.includes("transaction") ||
    area.includes("measurement") ||
    area.includes("business")
  ) {
    return "Reporting accuracy at risk";
  }
  if (area.includes("consent") || area.includes("channel")) {
    return "Customer data quality";
  }
  if (!issue.is_optional && issue.status === "FAIL") return "DCS readiness blocked";
  if (issue.status === "WARN") return "Reporting accuracy at risk";
  return "Operational risk";
}

export function formatNbaCardPrimaryLine(
  issue: DcsIssue,
  businessImpact?: DcsBusinessImpact | null,
): { text: string; showQuarterly: boolean } {
  const amount = resolveIssueRevenueAmount(issue, businessImpact);
  const currency = resolveIssueDisplayCurrency(issue, businessImpact);

  if (amount > 0) {
    return { text: formatDcsRevenue(amount, currency), showQuarterly: true };
  }

  const liveContext = resolveIssueLiveContextLabel(issue);
  if (liveContext) return { text: liveContext, showQuarterly: false };

  return { text: impactAreaFallback(issue), showQuarterly: false };
}

function liveDuplicateCountFromIssue(issue: DcsIssue): number | null {
  const detail = issue.detail ?? "";
  const clusterMatch = detail.match(/clusters?=(\d+)/i);
  if (clusterMatch) {
    const n = Number(clusterMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  for (const item of issue.evidence_preview ?? []) {
    const rec = asEvidenceRecord(item.value);
    if (!rec) continue;
    const extra = asLiveNumber(rec.duplicate_extra_events);
    if (extra != null && extra > 0) return extra;
    const clusters = asLiveNumber(rec.duplicate_clusters);
    if (clusters != null && clusters > 0) return clusters;
  }

  return null;
}

function formatNbaWhyMatters(issue: DcsIssue): string {
  const detail = issue.detail?.trim() ?? "";

  const parity = detail ? parseParityCountsFromDetail(detail) : null;
  if (parity) {
    const gap = Math.abs(parity.shopify - parity.manago);
    if (gap > 0) {
      return `${formatDisplayCount(gap)} purchases are out of sync between connected systems.`;
    }
    if (parity.deltaPct != null && parity.deltaPct > 0) {
      return `${formatDisplayCount(Math.round(parity.deltaPct))}% of purchase counts do not match across connected systems.`;
    }
  }

  const gapTotal = detail ? parseGapCountsFromDetail(detail) : null;
  if (gapTotal != null) {
    return `${formatDisplayCount(gapTotal)} purchase events are out of sync between connected systems.`;
  }

  const dupCount = liveDuplicateCountFromIssue(issue);
  if (dupCount != null) {
    return `Duplicate purchases were detected for ${formatDisplayCount(dupCount)} orders.`;
  }

  if (/duplicate\s+purchase/i.test(detail)) {
    return "Duplicate purchases were detected for some orders.";
  }

  const missingOrders = detail.match(/(\d+)\s+orders?\s+missing/i);
  if (missingOrders) {
    return `${formatDisplayCount(Number(missingOrders[1]))} orders are missing from customer journey records.`;
  }

  const dupRate = detail.match(/Duplicate PURCHASE rate=([\d.]+)%/i);
  if (dupRate) {
    return `${formatDisplayCount(Number(dupRate[1]))}% of purchases appear duplicated across connected systems.`;
  }

  const fromEvidence = liveContextFromEvidencePreview(issue.evidence_preview);
  if (
    fromEvidence &&
    !fromEvidence.includes("Shopify:") &&
    !stillLooksTechnical(fromEvidence)
  ) {
    return ensureSentence(fromEvidence.replace(/need attention/i, "need alignment"));
  }

  // Prefer plain conversational wording over any leftover diagnostics.
  return conversationalWhyMatters(issue);
}

function conversationalWhyMatters(issue: DcsIssue): string {
  const area = areaBadgeForIssue(issue);
  const title = cleanIssueTitle(issue.title);
  return limitSentences(
    problemSentenceFromTitle(title, area, issue.detail ?? ""),
    2,
  );
}

/** Non-monetary impact label for the revenue slot when amount is absent. */
function impactLabelForIssue(issue: DcsIssue): string {
  if (issue.revenue_impact > 0) return "Business impact";
  const liveContext = resolveIssueLiveContextLabel(issue);
  if (liveContext) return liveContext;
  return impactAreaFallback(issue);
}

function rankCaptionForIndex(
  index: number,
  issue: Pick<DcsIssue, "severity" | "revenue_impact" | "status">,
): string {
  if (index === 0) return "Highest impact";
  const severity = issue.severity.trim().toLowerCase();
  if (severity === "critical") return "Critical";
  if (severity === "high" || issue.revenue_impact > 0) return "High impact";
  if (issue.status === "WARN") return "Needs review";
  return "Quick win";
}

function areaBadgeForIssue(issue: {
  dimension?: string | null;
  status?: string;
}): string {
  if (!issue.dimension?.trim()) return issue.status === "WARN" ? "Warning" : "Integrity";
  // Backend dims look like "02 Lifecycle Event" — keep the human part.
  return issue.dimension.replace(/^\d+\s+/, "").trim() || "Integrity";
}

/**
 * Backend failure messages look like:
 * `LE-01 (Purchase event count parity) failed: RC-01 … — …`
 * When CheckMaster is not seeded, `title` falls back to that message.
 * Extract the human check name from parentheses before stripping codes.
 */
function extractCheckNameFromFailureTitle(title: string): string | null {
  const parenMatch = title.match(/\(([^)]+)\)\s+failed\b/i);
  if (parenMatch?.[1]?.trim()) return parenMatch[1].trim();
  const beforeFailed = title.split(/\bfailed\s*:/i)[0]?.trim();
  if (!beforeFailed) return null;
  const trailingParen = beforeFailed.match(/\(([^)]+)\)\s*$/);
  if (trailingParen?.[1]?.trim()) return trailingParen[1].trim();
  const withoutCode = beforeFailed.replace(TECHNICAL_TOKEN_RE, " ").replace(/\s{2,}/g, " ").trim();
  return withoutCode.length >= 4 ? withoutCode : null;
}

/** Light title cleanup — keep readable wording, drop check codes. */
function cleanIssueTitle(title: string | null | undefined): string {
  if (!title?.trim()) return "Data consistency issue";

  const fromFailure = extractCheckNameFromFailureTitle(title);
  const base = fromFailure ?? title;

  const cleaned = humanizeCustomerLanguage(
    base
      .replace(TECHNICAL_TOKEN_RE, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,;:])/g, "$1")
      .replace(/^[.\s,:;—-]+|[.\s,:;—-]+$/g, "")
      .trim(),
  )
    .replace(/\bcount\s+parity\b/gi, "count mismatch")
    .replace(/\bvalue\s+parity\b/gi, "amount mismatch")
    .replace(/\bparity\b/gi, "mismatch")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || "Data consistency issue";
}

const PRESERVED_TITLE_TOKENS: Record<string, string> = {
  shopify: "Shopify",
  manago: "Manago.ai",
  "manago.ai": "Manago.ai",
  vip: "VIP",
  utm: "UTM",
  api: "API",
};

const CHECK_ID_TITLE_RE = /^[A-Z]{2}-\d{2}$/i;

function titleCaseToken(word: string): string {
  const bare = word.replace(/[.,;:]+$/, "");
  const suffix = word.slice(bare.length);
  const lower = bare.toLowerCase();
  if (PRESERVED_TITLE_TOKENS[lower]) return PRESERVED_TITLE_TOKENS[lower] + suffix;
  if (CHECK_ID_TITLE_RE.test(bare)) return bare.toUpperCase() + suffix;
  if (bare.includes("-")) {
    return bare
      .split("-")
      .map((part) => titleCaseToken(part))
      .join("-") + suffix;
  }
  if (!bare) return word;
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase() + suffix;
}

/**
 * Customer-facing title casing — sentence case minimum; Title Case for short names (≤8 words).
 * Preserves Manago.ai, Shopify, VIP, UTM, API, and check ids.
 */
export function toCustomerTitleCase(cleaned: string): string {
  const trimmed = cleaned.trim();
  if (!trimmed) return "Data consistency issue";

  const words = trimmed.split(/\s+/).filter(Boolean);
  const isAllLowercase =
    trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);

  if (!isAllLowercase) {
    const first = trimmed.charAt(0);
    if (first && first === first.toLowerCase() && /[a-z]/i.test(first)) {
      return first.toUpperCase() + trimmed.slice(1);
    }
    return trimmed;
  }

  if (words.length <= 8) {
    return words.map(titleCaseToken).join(" ");
  }

  const [head, ...tail] = words;
  return [titleCaseToken(head ?? ""), ...tail.map((w) => w.toLowerCase())].join(" ");
}

/** Customer-facing issue / check title. Never leave fully lowercase. */
export function formatCustomerIssueTitle(raw: string | null | undefined): string {
  return toCustomerTitleCase(cleanIssueTitle(raw));
}

/**
 * Paraphrase a live title into a plain-language problem sentence.
 * Only uses wording implied by the title itself — no invented metrics.
 */
function isTopologyMappingIssue(title: string, detail: string): boolean {
  const blob = `${title} ${detail}`.toLowerCase();
  return (
    /topology|sub-?account|geo_variant|independent_business_line|segment_variant|primary\s+owner|account\s+mapping|multi[- ]account/.test(
      blob,
    ) && /manago|account|shop|store|business/.test(blob)
  );
}

function topologyExplanation(): string {
  return "Multiple Manago accounts or sub-accounts are not clearly mapped. Because of this, data from different stores or business units cannot be matched correctly, preventing a reliable Data Consistency Score.";
}

function topologySuggestedFix(): string {
  return "In Connected stack, check how your Manago accounts and sub-accounts are mapped. Make sure each store or brand is linked clearly so the same customers and orders can be matched.";
}

function problemSentenceFromTitle(title: string, area: string, detail = ""): string {
  const t = title.toLowerCase();
  const blob = `${title} ${detail}`.toLowerCase();

  if (isTopologyMappingIssue(title, detail)) {
    return topologyExplanation();
  }
  if (/duplicate/.test(t) && /(purchase|order|event|transaction)/.test(t)) {
    return "The same purchases are being counted more than once, so sales numbers look wrong.";
  }
  if (/(return|cancellation)/.test(t)) {
    return "Returns and cancellations are not showing the same way in every connected system.";
  }
  if (/net|gross|transaction/.test(t) && /(truth|value|amount|total)/.test(t)) {
    return "Connected systems are showing different amounts for the same purchases.";
  }
  if (/(identity|duplicate.*customer|customer.*record|same person)/.test(t)) {
    return "Some customers appear more than once, so it is hard to trust who is who.";
  }
  if (/consent/.test(t)) {
    return "Consent details do not match across connected systems.";
  }
  if (/(count\s+parity|purchase\s+count|event\s+count)/.test(blob)) {
    return "Purchase counts do not match between your shop and Manago.";
  }
  if (/(value\s+parity|amount\s+parity|revenue\s+parity)/.test(blob)) {
    return "Purchase amounts do not match between your shop and Manago.";
  }
  if (/(foundation|connector|setup|shopify|manago|token|scope)/.test(t)) {
    return "Setup is incomplete, so we cannot score your data reliably yet.";
  }
  if (/dcs run failed|scoring run/.test(t)) {
    return "The latest data check did not finish, so results may be incomplete.";
  }
  if (/(segment|propert)/.test(t)) {
    return "Customer segments or properties are out of sync across connected systems.";
  }
  if (/(channel|email|sms|push)/.test(t)) {
    return "Channel or messaging data is inconsistent across connected systems.";
  }
  if (/(measurement|attribution)/.test(t)) {
    return "Measurement data is incomplete, so results may be hard to trust.";
  }

  const cleaned = humanizeCustomerLanguage(stripTechnicalDiagnostics(title));
  if (cleaned.length >= 12 && !stillLooksTechnical(cleaned)) {
    return ensureSentence(
      `${cleaned.replace(/\.$/, "")} is leaving customer data inconsistent across connected systems`,
    );
  }

  const areaLower = area.toLowerCase();
  if (areaLower.includes("identity")) {
    return "Customer records do not line up across connected systems.";
  }
  if (areaLower.includes("lifecycle")) {
    return "Customer journey events do not line up across connected systems.";
  }
  if (areaLower.includes("product") || areaLower.includes("transaction")) {
    return "Product or purchase records do not line up across connected systems.";
  }
  if (areaLower.includes("consent") || areaLower.includes("channel")) {
    return "Consent or messaging data does not line up across connected systems.";
  }
  if (areaLower.includes("foundation")) {
    return "Required setup is incomplete, so connected systems cannot be scored reliably.";
  }

  return "Customer data does not line up across connected systems.";
}

function suggestedFixFromIssue(issue: {
  title: string;
  detail: string;
  suggested_fix: string;
  dimension: string | null;
}): string {
  if (isTopologyMappingIssue(issue.title, issue.detail)) {
    return topologySuggestedFix();
  }

  const cleaned = humanizeCustomerLanguage(
    stripTechnicalDiagnostics(issue.suggested_fix),
  );
  // Only keep backend copy when it already reads like normal instructions.
  if (cleaned && cleaned.length >= 20 && !stillLooksTechnical(cleaned)) {
    return ensureSentence(cleaned);
  }

  const t = `${issue.title} ${issue.detail}`.toLowerCase();
  const area = areaBadgeForIssue(issue).toLowerCase();

  if (/duplicate/.test(t) && /(purchase|order|event|transaction)/.test(t)) {
    return "Check how purchases are sent from your shop to Manago. Make sure each order is recorded once, then re-run the data check.";
  }
  if (/(return|cancellation)/.test(t)) {
    return "Make sure returns and cancellations in your shop are also updated in Manago, then re-run the data check.";
  }
  if (/(count\s+parity|purchase\s+count|event\s+count)/.test(t)) {
    return "Compare purchase totals in Shopify and Manago. Fix any missing or extra orders, then re-run the data check.";
  }
  if (/(value\s+parity|amount\s+parity|net|gross)/.test(t)) {
    return "Compare purchase amounts in Shopify and Manago. Align discounts, taxes, and refunds the same way in both places, then re-run the data check.";
  }
  if (/(identity|duplicate.*customer|customer.*record)/.test(t)) {
    return "Look for customers who appear more than once and merge or link them so each person has one profile.";
  }
  if (/consent/.test(t)) {
    return "Check consent settings in Shopify and Manago so the same customer has the same marketing preferences in both places.";
  }
  if (
    /(foundation|connector|setup|token|scope)/.test(t) ||
    area.includes("foundation")
  ) {
    return "Open Connected stack and finish any missing connection or account setup, then re-run the data check.";
  }
  if (area.includes("identity")) {
    return "Review customer profiles that look duplicated and keep one clear record per person.";
  }
  if (area.includes("lifecycle")) {
    return "Make sure key customer events (like purchase or signup) show up the same way in Shopify and Manago, then re-run the data check.";
  }
  if (
    area.includes("product") ||
    area.includes("transaction") ||
    area.includes("measurement") ||
    area.includes("business")
  ) {
    return "Align product and purchase records between Shopify and Manago so sales numbers match, then re-run the data check.";
  }
  if (area.includes("consent") || area.includes("channel")) {
    return "Align messaging and consent details between your systems before sending campaigns.";
  }
  return "Open Connected stack, review the affected records, fix the mismatch between systems, then re-run the data check.";
}

/** One short issue description for card footers — live backend, customer language. */
function whyMattersForIssue(issue: DcsIssue): string {
  return formatNbaWhyMatters(issue);
}

/**
 * Card body copy: what happened + business effect (max 2 short sentences).
 * Monetary impact and “why” live in separate card slots.
 */
type CustomerIssueCopySource = {
  title: string;
  detail: string;
  suggested_fix: string;
  status: string;
  severity: string;
  dimension: string | null;
  is_optional: boolean;
  revenue_impact: number;
};

function businessFriendlyIssueSummary(issue: CustomerIssueCopySource): string {
  const area = areaBadgeForIssue(issue);
  const title = cleanIssueTitle(issue.title);
  const detail = humanizeCustomerLanguage(stripTechnicalDiagnostics(issue.detail));

  let problem: string;
  if (isTopologyMappingIssue(issue.title, issue.detail)) {
    problem = topologyExplanation();
  } else if (detail && detail.length >= 20 && !stillLooksTechnical(detail)) {
    problem = ensureSentence(detail);
  } else {
    problem = problemSentenceFromTitle(title, area, issue.detail);
  }

  const hasMoney = issue.revenue_impact > 0;
  const effect = hasMoney
    ? "Fixing this will improve reporting and help the data score move forward."
    : !issue.is_optional && issue.status === "FAIL"
      ? "Fixing this will improve reporting and data readiness."
      : "Fixing this will improve reporting quality.";

  if (textOverlap(problem, effect)) {
    return clampSummary(problem, 150, 2);
  }

  return clampSummary(`${problem} ${effect}`, 160, 2);
}

/**
 * Longer customer-facing explanation for worklist / report detail (not card clamp).
 * Never surfaces RC codes, field names, or raw validator text.
 */
export function formatCustomerIssueExplanation(
  issue: CustomerIssueCopySource,
): string {
  if (isTopologyMappingIssue(issue.title, issue.detail)) {
    return topologyExplanation();
  }

  const area = areaBadgeForIssue(issue);
  const title = cleanIssueTitle(issue.title);
  const detail = humanizeCustomerLanguage(stripTechnicalDiagnostics(issue.detail));

  if (detail && detail.length >= 20 && !stillLooksTechnical(detail)) {
    const problem = ensureSentence(detail);
    const effect =
      "Until this is fixed, Klints cannot produce a reliable data consistency score for the affected records.";
    if (textOverlap(problem, effect)) return clampSummary(problem, 320, 3);
    return clampSummary(`${problem} ${effect}`, 360, 3);
  }

  return clampSummary(problemSentenceFromTitle(title, area, issue.detail), 360, 3);
}

/** Customer-facing suggested fix — never raw backend remediation text. */
export function formatCustomerSuggestedFix(issue: CustomerIssueCopySource): string {
  return suggestedFixFromIssue(issue);
}

/**
 * Executive-friendly card copy derived only from live issue fields.
 * Titles stay close to backend wording; explanations are customer language.
 */
export function formatExecutiveIssueCard(
  issue: DcsIssue,
  rankIndex = 0,
  businessImpact?: DcsBusinessImpact | null,
): ExecutiveIssueCard {
  const primary = formatNbaCardPrimaryLine(issue, businessImpact);
  return {
    title: formatCustomerIssueTitle(issue.title),
    impactLabel: primary.text,
    impactShowQuarterly: primary.showQuarterly,
    summary: businessFriendlyIssueSummary(issue),
    whyMatters: whyMattersForIssue(issue),
    areaBadge: areaBadgeForIssue(issue),
    severityBadge: severityLabel(issue.severity),
    rankCaption: rankCaptionForIndex(rankIndex, issue),
  };
}

const CHECK_PREFIX_TO_STAGE: Record<string, string> = {
  FD: "00",
  CI: "01",
  LE: "02",
  PT: "03",
  SP: "04",
  CC: "05",
  ME: "06",
  BR: "07",
};

const STAGE_LABEL_HINTS: Array<{ id: string; hints: string[] }> = [
  { id: "00", hints: ["foundation"] },
  { id: "01", hints: ["identity", "customer identity"] },
  { id: "02", hints: ["lifecycle"] },
  { id: "03", hints: ["product", "transaction"] },
  { id: "04", hints: ["segment", "property"] },
  { id: "05", hints: ["channel", "consent"] },
  { id: "06", hints: ["measurement"] },
  { id: "07", hints: ["business", "margin"] },
];

/** Map a live worklist/status issue onto a run-progress stage id (`00`…`07`). */
export function issueStageDimensionId(issue: DcsIssue): string | null {
  const dim = issue.dimension?.trim() ?? "";
  if (dim) {
    const token = dim.split(/\s+/)[0] ?? "";
    if (/^\d{2}$/.test(token)) return token;
    const lower = dim.toLowerCase();
    for (const entry of STAGE_LABEL_HINTS) {
      if (entry.hints.some((hint) => lower.includes(hint))) return entry.id;
    }
  }

  const check = (issue.check_id ?? "").trim().toUpperCase();
  const prefix = check.split("-")[0] ?? "";
  return CHECK_PREFIX_TO_STAGE[prefix] ?? null;
}

export type StageCustomerCopy = {
  line1: string | null;
  line2: string | null;
};

export type PrimaryBlocker = {
  dimensionId: string;
  label: string;
};

/**
 * Resolve the primary blocking dimension from live run progress / issues.
 * Prefers Foundation Gate when it failed; otherwise earliest failed stage / top FAIL issue.
 */
export function resolvePrimaryBlocker(
  stages: DcsRunStage[] | null | undefined,
  issues: DcsIssue[] = [],
): PrimaryBlocker | null {
  const list = stages ?? [];
  const failedStages = list.filter((stage) => stage.state === "failed");
  const foundation = failedStages.find((stage) => stage.dimension_id === "00");
  if (foundation) {
    return {
      dimensionId: foundation.dimension_id,
      label: foundation.label.trim() || "Foundation Gate",
    };
  }

  const ranked = sortDcsWorklistIssues(issues).filter(
    (issue) => !issue.is_optional && issue.status === "FAIL",
  );
  const top = ranked[0];
  if (top) {
    const dimensionId = issueStageDimensionId(top);
    const label =
      top.dimension?.replace(/^\d+\s+/, "").trim() ||
      (dimensionId
        ? list.find((stage) => stage.dimension_id === dimensionId)?.label?.trim()
        : null) ||
      null;
    if (dimensionId && label) {
      return { dimensionId, label };
    }
  }

  const firstFailed = failedStages[0];
  if (firstFailed) {
    return {
      dimensionId: firstFailed.dimension_id,
      label: firstFailed.label.trim() || "required check",
    };
  }

  return null;
}

/**
 * Status-only copy for Run Progress tiles (no issue explanations).
 */
export function formatStageCustomerCopy(
  stage: Pick<DcsRunStage, "dimension_id" | "label" | "state">,
  primaryBlocker: PrimaryBlocker | null,
): StageCustomerCopy {
  if (stage.state === "passed") {
    return {
      line1: "Score pending.",
      line2: "Waiting for remaining required checks.",
    };
  }

  if (stage.state !== "failed") {
    return { line1: null, line2: null };
  }

  const isPrimary =
    primaryBlocker != null &&
    (stage.dimension_id === primaryBlocker.dimensionId ||
      stage.label.trim().toLowerCase() === primaryBlocker.label.trim().toLowerCase());

  if (isPrimary || !primaryBlocker) {
    return {
      line1: "DCS score cannot be generated.",
      line2: "Complete this check first.",
    };
  }

  return {
    line1: `Waiting for ${primaryBlocker.label}.`,
    line2: null,
  };
}

/** Resolve the primary blocking dimension label from live status/issues. */
export function primaryBlockingDimensionLabel(status: DcsAppStatus): string | null {
  return resolvePrimaryBlocker(status.run_progress?.stages, status.issues)?.label ?? null;
}

const FRESH_IMPORT_PLATFORMS: readonly DcsFreshImportPlatform[] = [
  "shopify",
  "manago_ai",
];

export function formatFreshImportPlatformLabel(
  platform: DcsFreshImportPlatform,
): string {
  switch (platform) {
    case "shopify":
      return "Shopify";
    case "manago_ai":
      return "Manago";
  }
}

export function getRunFreshImports(
  run: DcsRunSummary | null | undefined,
): DcsFreshImportsSummary | null {
  const raw = run?.fresh_imports;
  if (!raw || typeof raw !== "object") return null;
  return raw;
}

function coerceFreshImportDataRunId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/** True when the run payload includes at least one fresh-import data_run_id. */
export function hasFreshImportsOnRun(
  run: DcsRunSummary | null | undefined,
): boolean {
  const fresh = getRunFreshImports(run);
  if (!fresh) return false;
  return FRESH_IMPORT_PLATFORMS.some((platform) => {
    const block = fresh[platform];
    return coerceFreshImportDataRunId(block?.data_run_id) != null;
  });
}

export type DcsImportConnectorRef = {
  name: string;
  status: string;
};

/** True when at least one Shopify/Manago connector expects a DCS fresh import. */
export function hasEligibleConnectedDcsConnectors(
  connectors: DcsImportConnectorRef[] | null | undefined,
): boolean {
  if (!connectors?.length) return false;
  return connectors.some(
    (connector) =>
      (connector.name === "shopify" || connector.name === "manago_ai") &&
      (connector.status === "connected" || connector.status === "degraded"),
  );
}

export function getFoundationRunStage(
  stages: DcsRunStage[] | null | undefined,
): DcsRunStage | null {
  return stages?.find((stage) => stage.dimension_id === "00") ?? null;
}

/**
 * PRD-DCS-10 Slice D — connector import phase before scoring.
 * Foundation (`00`) is running, no checks evaluated yet, and this run has not
 * recorded fresh_imports (import still in flight).
 */
export function isDcsFreshImportPhaseRunning(
  status: DcsAppStatus,
  options?: { expectFreshImport?: boolean },
): boolean {
  if (options?.expectFreshImport === false) return false;

  const run = status.active_run;
  const runActive =
    Boolean(status.scheduled) ||
    status.app_access === "soft_locked_running" ||
    run?.status === "pending" ||
    run?.status === "running";
  if (!runActive) return false;

  const foundation = getFoundationRunStage(status.run_progress?.stages);
  if (foundation?.state !== "running") return false;
  if ((foundation.evaluated_count ?? 0) > 0) return false;

  return !hasFreshImportsOnRun(run);
}

export function formatFreshImportPhaseCopy(): string {
  return "Fetching latest Shopify + Manago data…";
}

export function resolveFreshImportFailedPlatform(
  status: DcsAppStatus,
): DcsFreshImportPlatform | null {
  for (const run of [status.active_run, status.latest_run]) {
    if (!run || run.status !== "failed") continue;
    const platform = run.fresh_import_failed_platform;
    if (platform === "shopify" || platform === "manago_ai") return platform;
  }
  return null;
}

export function formatFreshImportFailedCopy(
  platform: DcsFreshImportPlatform | null | undefined,
): string | null {
  if (platform == null) return null;
  return `Could not fetch latest ${formatFreshImportPlatformLabel(platform)} data for this run. Check Connected stack, fix the connection if needed, then re-run checks.`;
}

/** Customer-facing score card copy when the headline score is not ready. */
export function formatScoreBlockedCopy(status: DcsAppStatus): {
  lead: string;
  primaryBlocker: string | null;
} {
  const primaryBlocker = primaryBlockingDimensionLabel(status);
  const freshImportFailed = resolveFreshImportFailedPlatform(status);
  const freshImportFailedCopy = formatFreshImportFailedCopy(freshImportFailed);

  if (freshImportFailedCopy) {
    return {
      lead: freshImportFailedCopy,
      primaryBlocker,
    };
  }

  if (isDcsFreshImportPhaseRunning(status)) {
    return {
      lead: formatFreshImportPhaseCopy(),
      primaryBlocker: null,
    };
  }

  if (status.lock_reason === "running_no_score" || status.app_access === "soft_locked_running") {
    return {
      lead: "The DCS score is being calculated from your latest run.",
      primaryBlocker,
    };
  }

  if (status.lock_reason === "failed") {
    return {
      lead: "The DCS score is not available because the latest scoring run did not finish.",
      primaryBlocker,
    };
  }

  if (status.latest_run?.status === "failed") {
    return {
      lead: "The DCS score is not available because the latest scoring run did not finish.",
      primaryBlocker,
    };
  }

  return {
    lead: "The DCS score is not available because a required setup check is still failing.",
    primaryBlocker,
  };
}

/* ─── Customer-facing evidence tables (display only) ─── */

export type FriendlyEvidenceColumn = {
  key: "system" | "what" | "detail" | "element" | "when";
  label: string;
};

export type FriendlyEvidenceRow = {
  id: string;
  system: string;
  what: string;
  detail: string;
  element: string;
  when: string;
};

export type FriendlyProvenanceRow = {
  label: string;
  value: string;
};

const FRIENDLY_EVIDENCE_COLUMNS: FriendlyEvidenceColumn[] = [
  { key: "system", label: "Where it came from" },
  { key: "what", label: "What we found" },
  { key: "detail", label: "Details" },
  { key: "element", label: "Elements" },
  { key: "when", label: "Checked" },
];

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asPlainNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asPlainString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function humanizeSnakeLabel(key: string): string {
  return key
    .replace(/[_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

function formatMoneyish(amount: number, currency?: string | null): string {
  if (currency) return formatDcsRevenue(amount, currency);
  if (Math.abs(amount) >= 1000) {
    const k = Math.abs(amount) / 1000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${amount < 0 ? "-" : ""}${body}K`;
  }
  return amount.toLocaleString("en-IE", {
    maximumFractionDigits: 2,
  });
}

/** Map backend source codes to customer-facing system names. */
export function friendlyEvidenceSystem(
  source: string,
  value?: unknown,
  locator?: string,
): string {
  const blob = `${source} ${locator ?? ""}`.toLowerCase();
  const rec = asPlainRecord(value);
  const side = asPlainString(rec?.side)?.toLowerCase() ?? "";

  if (
    side === "dead_state" ||
    side === "dead_date_cluster" ||
    /drift\.contact_state|contact_state_distribution/.test(blob)
  ) {
    return "Manago.ai";
  }

  if (side === "shopify_only" || /shopify/.test(blob)) return "Shopify";
  if (side === "manago_only" || /manago/.test(blob)) return "Manago.ai";
  if (side === "duplicate_purchase" || side.includes("duplicate")) {
    return "Shopify & Manago";
  }
  if (/klints|internal|computed|derived/.test(blob)) {
    // Klints compared systems — never show "klints" as the data origin.
    if (/shopify/.test(`${locator ?? ""} ${JSON.stringify(value ?? {})}`.toLowerCase())) {
      return "Shopify";
    }
    if (/manago/.test(`${locator ?? ""} ${JSON.stringify(value ?? {})}`.toLowerCase())) {
      return "Manago.ai";
    }
    return "Shopify & Manago";
  }
  if (!source.trim()) return "Connected systems";
  return humanizeSnakeLabel(source.replace(/_ai$/i, "")).replace(/\bAi\b/g, "AI");
}

function orderIdFromRecord(rec: Record<string, unknown>): string | null {
  return (
    asPlainString(rec["order.id"]) ||
    asPlainString(rec.order_id) ||
    asPlainString(rec.orderId) ||
    asPlainString(rec.external_id) ||
    asPlainString(rec.externalId)
  );
}

function describeDuplicateCluster(
  rec: Record<string, unknown>,
  currency?: string | null,
): { what: string; detail: string } {
  const orderId = orderIdFromRecord(rec);
  const count = asPlainNumber(rec.count) ?? asPlainNumber(rec.duplicate_count);
  const amount =
    asPlainNumber(rec.cluster_impact) ??
    asPlainNumber(rec.representative_value) ??
    asPlainNumber(rec.amount);
  const values = Array.isArray(rec.values)
    ? rec.values.map((v) => asPlainNumber(v)).filter((n): n is number => n != null)
    : [];

  const what =
    count != null && count > 1
      ? `Same purchase counted ${formatDisplayCount(count)} times`
      : "Duplicate purchase detected";

  const parts: string[] = [];
  if (orderId) parts.push(`Order ${orderId}`);
  if (amount != null) parts.push(formatMoneyish(amount, currency));
  else if (values.length) {
    parts.push(values.map((v) => formatMoneyish(v, currency)).join(" · "));
  }

  return { what, detail: parts.join(" · ") || "Duplicate purchase record" };
}

function describeGenericRecord(
  rec: Record<string, unknown>,
  locator: string,
  currency?: string | null,
): { what: string; detail: string } {
  const side = asPlainString(rec.side);
  if (side === "shopify_only") {
    const orderId = orderIdFromRecord(rec);
    return {
      what: "Found in Shopify only",
      detail: orderId ? `Order ${orderId}` : "Missing match in Manago",
    };
  }
  if (side === "manago_only") {
    const orderId = orderIdFromRecord(rec);
    return {
      what: "Found in Manago only",
      detail: orderId ? `Order ${orderId}` : "Missing match in Shopify",
    };
  }
  if (side === "duplicate_purchase" || side?.includes("duplicate")) {
    return describeDuplicateCluster(rec, currency);
  }
  if (side === "dead_state") {
    const bucket = asPlainString(rec.bucket);
    const count = asPlainNumber(rec.count);
    return {
      what: bucket ? `${humanizeSnakeLabel(bucket)} state cluster` : "Dead-state cluster",
      detail: count != null ? `Count: ${formatDisplayCount(count)}` : "Blocked or resigned contacts",
    };
  }
  if (side === "dead_date_cluster") {
    const day = asPlainString(rec.day);
    const count = asPlainNumber(rec.count);
    const parts = [day ? `Spike day ${day}` : "State spike day"];
    if (count != null) parts.push(`Count: ${formatDisplayCount(count)}`);
    return {
      what: "Contact state spike",
      detail: parts.join(" · "),
    };
  }

  const rate = asPlainNumber(rec.duplicate_rate);
  if (rate != null) {
    const pct = rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
    return {
      what: "Duplicate purchase rate",
      detail: `About ${pct}% of purchases look duplicated`,
    };
  }

  const preferredKeys = [
    "message",
    "summary",
    "label",
    "name",
    "status",
    "count",
    "gap_count",
    "shopify",
    "manago",
    "delta",
  ];
  const parts: string[] = [];
  for (const key of preferredKeys) {
    if (!(key in rec)) continue;
    const val = rec[key];
    if (val == null || typeof val === "object") continue;
    if (typeof val === "number") {
      parts.push(`${humanizeSnakeLabel(key)}: ${formatDisplayNumber(val)}`);
    } else {
      parts.push(`${humanizeSnakeLabel(key)}: ${String(val)}`);
    }
    if (parts.length >= 3) break;
  }

  if (!parts.length) {
    for (const [key, val] of Object.entries(rec)) {
      if (val == null || typeof val === "object") continue;
      if (/formula|source|window|as_of|id$/i.test(key)) continue;
      parts.push(`${humanizeSnakeLabel(key)}: ${String(val)}`);
      if (parts.length >= 3) break;
    }
  }

  const what = locator && !isPlaceholderEvidenceLocator(locator)
    ? humanizeSnakeLabel(locator.split(".").pop() || locator)
    : side
      ? humanizeSnakeLabel(side)
      : "Data difference";
  return {
    what,
    detail: parts.join(" · ") || "See connected systems for this check",
  };
}

function isPlaceholderEvidenceLocator(locator: string | undefined): boolean {
  const trimmed = (locator ?? "").trim().toLowerCase();
  return !trimmed || trimmed === "—" || trimmed === "-" || trimmed === "n/a" || trimmed === "na";
}

type FriendlyEvidenceElementFields = Pick<
  DcsEvidenceItem,
  "element" | "element_label" | "api_key" | "db_key" | "entity"
>;

function looksLikeFieldPath(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
}

function formatEntityField(
  entity: string | null | undefined,
  field: string | null | undefined,
): string | null {
  const e = entity?.trim();
  const f = field?.trim();
  if (e && f) return `${e}.${f}`;
  if (f) return f;
  return null;
}

function evidenceElementLabel(
  item?: FriendlyEvidenceElementFields,
  value?: unknown,
): string | null {
  const rec = asPlainRecord(value);
  return asPlainString(item?.element_label) || asPlainString(rec?.element_label);
}

/** PRD-FE-11B — Elements = {entity}.{api_key}; never prefer element_label. */
function friendlyEvidenceElement(
  locator: string | undefined,
  value: unknown,
  item?: FriendlyEvidenceElementFields,
): string {
  const rec = asPlainRecord(value);
  const entity = asPlainString(item?.entity) || asPlainString(rec?.entity);
  const apiKey = asPlainString(item?.api_key) || asPlainString(rec?.api_key);
  const fromApi = formatEntityField(entity, apiKey);
  if (fromApi) return fromApi;

  const dbKey =
    asPlainString(item?.db_key) ||
    asPlainString(rec?.db_key) ||
    asPlainString(rec?.field);
  const fromDb = formatEntityField(entity, dbKey);
  if (fromDb) return fromDb;

  const element =
    asPlainString(item?.element) ||
    asPlainString(rec?.element) ||
    asPlainString(rec?.element_name) ||
    asPlainString(rec?.fix_target);
  if (element) {
    if (looksLikeFieldPath(element) || element.includes(".")) return element;
    const withEntity = formatEntityField(entity, element);
    if (withEntity) return withEntity;
    return element;
  }

  const loc = (locator ?? "").trim();
  if (loc && !isPlaceholderEvidenceLocator(loc)) {
    if (looksLikeFieldPath(loc)) return loc;
    const leaf = loc.split(/[./]+/).filter(Boolean).pop();
    if (leaf) return leaf;
  }

  const side = asPlainString(rec?.side);
  if (side) return humanizeSnakeLabel(side);

  return "—";
}

function formatWhenLabel(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    // Lazy import pattern avoided — callers pass preformatted when needed.
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function pushFriendlyRow(
  rows: FriendlyEvidenceRow[],
  item: DcsEvidenceItem,
  index: number,
  what: string,
  detail: string,
  currency?: string | null,
): void {
  const whatLabel = evidenceElementLabel(item, item.value) || what;
  rows.push({
    id: `${item.source}-${item.locator}-${index}-${whatLabel}`,
    system: friendlyEvidenceSystem(item.source, item.value, item.locator),
    what: whatLabel,
    detail,
    element: friendlyEvidenceElement(item.locator, item.value, item),
    when: formatWhenLabel(item.observed_at),
  });
  void currency;
}

/**
 * Expand live evidence / mismatch / match rows into plain-language table rows.
 * Never mutates backend data — display formatting only.
 */
export function formatFriendlyEvidenceRows(
  items: DcsEvidenceItem[],
  options?: { currency?: string | null },
): { columns: FriendlyEvidenceColumn[]; rows: FriendlyEvidenceRow[] } {
  const currency = options?.currency ?? null;
  const rows: FriendlyEvidenceRow[] = [];

  items.forEach((item, index) => {
    const rec = asPlainRecord(item.value);

    if (rec && Array.isArray(rec.clusters_sample) && rec.clusters_sample.length) {
      const before = rows.length;
      const rate = asPlainNumber(rec.duplicate_rate);
      if (rate != null) {
        const pct = rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
        pushFriendlyRow(
          rows,
          item,
          index,
          "Overall duplicate rate",
          `About ${pct}% of purchases look duplicated`,
          currency,
        );
      }
      rec.clusters_sample.forEach((cluster, clusterIndex) => {
        const clusterRec = asPlainRecord(cluster);
        if (!clusterRec) return;
        const described = describeDuplicateCluster(clusterRec, currency);
        const whatLabel =
          evidenceElementLabel(item, clusterRec) || described.what;
        rows.push({
          id: `${item.source}-${index}-cluster-${clusterIndex}`,
          system: friendlyEvidenceSystem(item.source, clusterRec, item.locator),
          what: whatLabel,
          detail: described.detail,
          element: friendlyEvidenceElement(item.locator, clusterRec, item),
          when: formatWhenLabel(item.observed_at),
        });
      });
      // If clusters_sample was unusable, fall through to generic formatting.
      if (rows.length > before) return;
    }

    if (rec) {
      const described = describeGenericRecord(rec, item.locator || "", currency);
      pushFriendlyRow(rows, item, index, described.what, described.detail, currency);
      return;
    }

    if (typeof item.value === "string" || typeof item.value === "number") {
      pushFriendlyRow(
        rows,
        item,
        index,
        item.locator ? humanizeSnakeLabel(item.locator) : "Recorded value",
        String(item.value),
        currency,
      );
      return;
    }

    pushFriendlyRow(
      rows,
      item,
      index,
      item.locator ? humanizeSnakeLabel(item.locator) : "Data difference",
      "Details available in connected systems",
      currency,
    );
  });

  return { columns: FRIENDLY_EVIDENCE_COLUMNS, rows };
}

const PROVENANCE_LABELS: Record<string, string> = {
  gap_count: "Orders affected",
  revenue_impact: "Estimated money at stake",
  revenue_currency: "Currency",
  revenue_window_days: "Days checked",
  revenue_as_of: "Checked on",
  revenue_source: "Based on",
  sample_count: "Sample size",
  mismatch_count: "Mismatches found",
  match_count: "Matches found",
  duplicate_rate: "Duplicate rate",
  shopify_count: "Shopify count",
  manago_count: "Manago count",
};

const PROVENANCE_SKIP = new Set([
  "matches",
  "mismatches",
  "evidence",
  "sample_rows",
  "samples",
  "rows",
  "clusters_sample",
  "revenue_formula_id",
  "formula_id",
  "formula_version",
]);

const PROVENANCE_SOURCE_LABELS: Record<string, string> = {
  snapshot_raw: "Latest imported data",
  snapshot: "Latest imported data",
  live: "Live connection",
  computed: "Compared systems",
  rollup: "Rollup estimate",
};

/**
 * Plain-language provenance rows — hides formula IDs and raw field names.
 */
export function formatFriendlyProvenanceRows(
  provenance: Record<string, unknown>,
  options?: { currency?: string | null },
): FriendlyProvenanceRow[] {
  const currencyHint =
    options?.currency ||
    asPlainString(provenance.revenue_currency) ||
    asPlainString(provenance.currency);

  const rows: FriendlyProvenanceRow[] = [];
  for (const [key, raw] of Object.entries(provenance)) {
    if (PROVENANCE_SKIP.has(key)) continue;
    if (raw == null || typeof raw === "object") continue;

    const label = PROVENANCE_LABELS[key] ?? humanizeSnakeLabel(key);
    let value: string;

    if (key === "revenue_as_of" && typeof raw === "string") {
      value = formatWhenLabel(raw);
    } else if (key === "revenue_source" && typeof raw === "string") {
      value = PROVENANCE_SOURCE_LABELS[raw] ?? humanizeSnakeLabel(raw);
    } else if (
      (key === "revenue_impact" || /impact|amount|gmv|revenue/i.test(key)) &&
      typeof raw === "number"
    ) {
      value = formatMoneyish(raw, currencyHint);
    } else if (key === "duplicate_rate" && typeof raw === "number") {
      const pct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
      value = `${pct}%`;
    } else if (typeof raw === "number") {
      value = formatDisplayNumber(raw);
    } else if (typeof raw === "boolean") {
      value = raw ? "Yes" : "No";
    } else {
      value = String(raw);
    }

    // Skip leftover technical keys that slipped through.
    if (/formula|_id$|checksum|hash|trace/i.test(key)) continue;
    rows.push({ label, value });
  }
  return rows;
}

export function friendlyEvidenceSectionTitle(kind: "mismatches" | "matches" | "evidence"): string {
  if (kind === "mismatches") return "Differences found";
  if (kind === "matches") return "Matching records";
  return "What we checked";
}

