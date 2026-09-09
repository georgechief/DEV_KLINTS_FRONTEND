import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DcsDimensionChart, DcsTrendChart, OverviewValueSpark } from "@/components/klints/DcsCharts";
import { NbaBlurbBox } from "@/components/klints/NbaBlurbBox";
import {
  AUDIT_EVENTS_QUERY_KEY,
  AUDIT_NOTIFICATIONS_QUERY_KEY,
  listAuditEvents,
  resolveAuditDeepLink,
  resolveAuditEventMeta,
  formatAuditEventSummary,
  type AuditEvent,
  type AuditTone,
} from "@/lib/audit";
import { connectorLastDataRefresh, listConnectors } from "@/lib/connectors";
import {
  DCS_BUILD_READY_THRESHOLD,
  DCS_PERIOD_CAPTURED_EYEBROW,
  DCS_PERIOD_CAPTURED_TOOLTIP,
  DCS_WORKLIST_QUERY_KEY,
  displayHeadlineScore,
  formatDcsThresholdBadge,
  resolveDcsThresholdState,
  DCS_HISTORY_QUERY_KEY,
  formatDcsRevenue,
  formatDcsScore,
  formatExecutiveIssueCard,
  formatCustomerIssueTitle,
  formatScoreBlockedCopy,
  formatStageCustomerCopy,
  getDcsScoreHistory,
  getDcsWorklist,
  isDcsScoreReady,
  isNavRouteAllowed,
  liveDimensionsWithPeriodDeltas,
  periodImpactCapturedSubcopy,
  resolvePeriodCapturedAmount,
  resolvePeriodCapturedCurrency,
  resolvePeriodHeadlineDelta,
  resolvePeriodImpactState,
  resolveIssueDisplayCurrency,
  resolveIssueRevenueAmount,
  resolvePrimaryBlocker,
  sortDcsWorklistIssues,
  type DcsAppStatus,
  type DcsIssue,
} from "@/lib/dcs";
import {
  fixTasksFromPlan,
  getOrchestrationPlan,
  joinPlanFixIssues,
  ORCH_PLAN_QUERY_KEY,
  ORCH_STALE_MS,
} from "@/lib/orchestration";
import {
  listOrchestrationTasks,
  ORCH_TASKS_QUERY_KEY,
  ORCH_TASKS_STALE_MS,
  orchTaskDisplayTitle,
  orchTaskStatusChipClass,
  orchTaskStatusLabel,
  type OrchestrationTaskRecord,
} from "@/lib/orchestration-tasks";
import {
  AF_COVERAGE_QUERY_KEY,
  AF_LATEST_QUERY_KEY,
  AF_LATEST_STALE_MS,
  getArchitectureCoverage,
  getArchitectureLatest,
  isAfUpdating,
  modeBadgeLabel,
  OVERVIEW_PHASE_LABELS,
  phaseCardCoveragePct,
  type FePhaseKey,
} from "@/lib/architecture";
import {
  getUseCaseRecommendations,
  routeIssueTarget,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  type RouteIssueTarget,
  type UseCasePilotRecommendation,
} from "@/lib/use-cases";
import { issueRouteSignalsFromDcs } from "@/lib/issue-routing";
import {
  filterOverviewHits,
  getOverviewSearchSnapshot,
  highlightSearchText,
  joinSearchText,
  normalizeSearchQuery,
  scrollOverviewHitIntoView,
  setOverviewSearchHits,
  subscribeOverviewSearch,
  textMatchesQuery,
  type OverviewSearchHit,
} from "@/lib/overview-search";
import { cn } from "@/lib/utils";
import {
  assessmentReportErrorMessage,
  downloadOverviewBrief,
} from "@/lib/assessment-report";
import { toast } from "sonner";
import {
  aggregateDcsTrendPoints,
  aggregateValueCapturePoints,
  computeTrendDelta,
  overviewPeriods,
  resolveOverviewPeriodWindow,
  type OverviewPeriod,
} from "@/lib/overview-period";
import {
  formatDisplayCount,
  formatDisplayScore,
  formatDisplayText,
} from "@/lib/presentation";
import {
  formatDisplayDate,
  formatDisplayIsoTitle,
  formatDisplayWhen,
} from "@/lib/datetime";

const periods = overviewPeriods;
const statusFilters = ["All", "Blocked", "Leaking", "Opportunity", "Tracked"] as const;

const OVERVIEW_PHASE_KEYS: FePhaseKey[] = ["acq", "act", "exp", "loy", "ret"];

function nbaFilterBucket(issue: DcsIssue): (typeof statusFilters)[number] {
  if (issue.is_optional) return "Opportunity";
  if (issue.status === "FAIL") return "Blocked";
  if (issue.status === "WARN") return "Leaking";
  return "Tracked";
}

/**
 * PRD-FE-13 + GAP-01E W8-02 — taxonomy routing (Data/Workflow/Security) with unlock fallback.
 * Name retained for verify:fe13.
 */
function nbaOpenTarget(
  checkId: string,
  options?: {
    issue?: DcsIssue | null;
    pilots?: UseCasePilotRecommendation[] | null;
  },
): RouteIssueTarget | null {
  return routeIssueTarget({
    checkId,
    issue: options?.issue ? issueRouteSignalsFromDcs(options.issue) : { checkId },
    pilots: options?.pilots,
  });
}

/** FE-13 — taxonomy first; then Fix when unlocked; else DCS; else Integrations. */
function issueOpenTarget(
  checkId: string,
  options: {
    fixAllowed: boolean;
    dataCenterAllowed: boolean;
    issue?: DcsIssue | null;
    pilots?: UseCasePilotRecommendation[] | null;
  },
): RouteIssueTarget | null {
  return routeIssueTarget({
    checkId,
    issue: options.issue ? issueRouteSignalsFromDcs(options.issue) : { checkId },
    pilots: options.pilots,
    access: {
      fixAllowed: options.fixAllowed,
      dataCenterAllowed: options.dataCenterAllowed,
    },
  });
}

function nbaCardVariant(issue: DcsIssue): string {
  if (issue.is_optional) return "is-opportunity";
  if (issue.status === "FAIL" && !issue.is_optional) return "is-critical";
  if (issue.status === "WARN") return "is-warn";
  return "";
}

type LiveStakeRow = {
  checkId: string;
  title: string;
  amount: number;
  currency: string | null;
};

function buildLiveStakeRows(
  businessImpact: DcsAppStatus["business_impact"],
  issues: DcsIssue[],
): LiveStakeRow[] {
  const byCheck = businessImpact?.by_check ?? {};
  const byCheckEntries = Object.entries(byCheck).filter(([, amount]) => amount > 0);

  if (byCheckEntries.length > 0) {
    return byCheckEntries
      .map(([checkId, amount]) => {
        const issue = issues.find((item) => item.check_id === checkId);
        return {
          checkId,
          title: issue?.title?.trim() || checkId,
          amount,
          currency: businessImpact?.currency ?? issue?.currency ?? null,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  return issues
    .filter((issue) => issue.revenue_impact > 0 && issue.check_id)
    .map((issue) => ({
      checkId: issue.check_id!,
      title: formatCustomerIssueTitle(issue.title) || issue.check_id!,
      amount: issue.revenue_impact,
      currency: issue.currency ?? businessImpact?.currency ?? null,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function LiveRevenueStakeBreakdown({
  rows,
  fixAllowed,
  dataCenterAllowed,
  issues,
  pilots,
}: {
  rows: LiveStakeRow[];
  fixAllowed: boolean;
  dataCenterAllowed: boolean;
  issues: DcsIssue[];
  pilots?: UseCasePilotRecommendation[] | null;
}) {
  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((row) => row.amount), 1);

  return (
    <div className="ov-stake-list">
      {rows.map((row) => {
        const amountLabel = formatDcsRevenue(row.amount, row.currency);
        const shortId =
          row.checkId.length > 14 ? `${row.checkId.slice(0, 12)}…` : row.checkId;
        const common = {
          className: "ov-stake-row",
          title: `${row.title} · ${amountLabel} / q`,
        } as const;

        const body = (
          <>
            <span className="ov-stake-id">{shortId}</span>
            <div className="ov-stake-track">
              <div
                className="ov-stake-fill"
                style={{
                  width: `${(row.amount / max) * 100}%`,
                  background: "#1F3A5F",
                }}
              />
            </div>
            <span className="ov-stake-val">{amountLabel}</span>
          </>
        );

        const issue = issues.find((item) => item.check_id === row.checkId) ?? null;
        const target = issueOpenTarget(row.checkId, {
          fixAllowed,
          dataCenterAllowed,
          issue,
          pilots,
        });
        if (target) {
          return (
            <Link
              key={row.checkId}
              to={target.to}
              search={"search" in target ? target.search : undefined}
              data-issue-route={target.taxonomy}
              {...common}
            >
              {body}
            </Link>
          );
        }

        return (
          <Link key={row.checkId} to="/integrations" data-issue-route="fallback" {...common}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

function nbaSeverityTone(issue: DcsIssue): string {
  if (issue.is_optional) return "waiting";
  const severity = issue.severity.trim().toLowerCase();
  if (severity === "critical" || (issue.status === "FAIL" && severity === "high")) {
    return "blocked";
  }
  if (issue.status === "WARN" || severity === "medium") return "waiting";
  return "blocked";
}

function normalizeAuditTone(tone: string): AuditTone {
  if (tone === "revenue" || tone === "risk" || tone === "loss" || tone === "info") {
    return tone;
  }
  return "info";
}

function auditFeedToneClass(tone: AuditTone): string {
  if (tone === "revenue") return "t-approve";
  if (tone === "risk") return "t-fail";
  if (tone === "loss") return "t-drift";
  return "t-eval";
}

function formatAuditTimestamp(createdAt: string): string {
  return formatDisplayWhen(createdAt);
}

function formatAuditActionLabel(action: string | null | undefined): string | null {
  if (!action?.trim()) return null;
  const cleaned = action.trim().replace(/[_.]+/g, " ");
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function recentActivityHeading(events: AuditEvent[]): string {
  if (events.length === 0) return "Latest events";
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const allWithinDay = events.every((event) => {
    const ts = new Date(event.created_at).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
  return allWithinDay ? "Last 24 hours" : "Latest events";
}

function RecentActivityCard({
  events,
  isPending,
  isError,
  isFetching,
  onRetry,
  searchQuery,
  activeId,
  fixAllowed,
}: {
  events: AuditEvent[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  searchQuery: string;
  activeId: string | null;
  fixAllowed: boolean;
}) {
  const heading = recentActivityHeading(events);
  const sectionMatches =
    Boolean(normalizeSearchQuery(searchQuery)) &&
    textMatchesQuery(
      joinSearchText("Recent activity", heading, "View all"),
      searchQuery,
    );

  return (
    <div
      data-ov-search-id="activity-section"
      className={cn(
        "ov-card",
        sectionMatches && "ov-search-hit",
        activeId === "activity-section" && "ov-search-hit--active",
      )}
    >
      <div className="ov-card-head">
        <div>
          <div className="ov-eyebrow" style={{ marginBottom: 4 }}>
            {highlightSearchText("Recent activity", searchQuery)}
          </div>
          <h2 className="ov-h2">{highlightSearchText(heading, searchQuery)}</h2>
        </div>
        <Link to="/activity" className="ov-btn ov-btn-ghost ov-btn-sm">
          View all →
        </Link>
      </div>

      <div className="ov-card-body" style={{ padding: "6px 20px" }}>
        {isPending ? (
          <div className="ov-activity-state">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity…
          </div>
        ) : isError ? (
          <div className="ov-activity-state ov-activity-state--error">
            <span>Could not load recent activity.</span>
            <button
              type="button"
              className="ov-btn ov-btn-sm"
              onClick={onRetry}
              disabled={isFetching}
            >
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="ov-activity-state">No activity yet.</div>
        ) : (
          events.map((event) => {
            const tone = normalizeAuditTone(event.tone);
            const actor = (event.actor || event.performed_by || "").trim();
            const actionLabel = formatAuditActionLabel(event.action);
            const summaryRaw = event.summary?.trim() || actionLabel || "Activity";
            const summary = formatAuditEventSummary(event);
            const metaRaw = resolveAuditEventMeta(event);
            const meta = metaRaw ? formatDisplayText(metaRaw) : null;
            const actionNorm = actionLabel?.toLowerCase() ?? "";
            const summaryNorm = summary.toLowerCase();
            const showAction =
              Boolean(actionLabel) &&
              actionNorm !== summaryNorm &&
              !summaryNorm.includes(actionNorm);
            const badge =
              meta && meta.length <= 18
                ? meta
                : tone === "revenue"
                  ? "fix"
                  : tone === "risk" || tone === "loss"
                    ? tone
                    : null;
            const secondary =
              meta && (!badge || badge.toLowerCase() !== meta.toLowerCase())
                ? meta
                : null;
            const when = formatAuditTimestamp(event.created_at);
            const searchId = `activity-${event.id}`;
            const rowText = joinSearchText(
              when,
              actor,
              actionLabel,
              summary,
              secondary,
              badge,
              tone,
              "Recent activity",
            );
            const rowMatches =
              Boolean(normalizeSearchQuery(searchQuery)) &&
              textMatchesQuery(rowText, searchQuery);

            const deepLink = resolveAuditDeepLink(event, { fixAllowed });

            return (
              <Link
                key={event.id}
                to={deepLink.to}
                search={deepLink.search}
                hash={deepLink.hash}
                data-ov-search-id={searchId}
                className={cn(
                  "ov-feed-row",
                  auditFeedToneClass(tone),
                  rowMatches && "ov-search-hit",
                  activeId === searchId && "ov-search-hit--active",
                )}
              >
                <span className="when" title={formatDisplayIsoTitle(event.created_at)}>
                  {highlightSearchText(when, searchQuery)}
                </span>
                <span className="actor" title={actor || undefined}>
                  {highlightSearchText(actor || "system", searchQuery)}
                </span>
                <span className="what">
                  {showAction ? (
                    <>
                      <span className="verb">
                        {highlightSearchText(actionLabel ?? "", searchQuery)}
                      </span>
                      <span className="secondary">
                        {" · "}
                        {highlightSearchText(summary, searchQuery)}
                      </span>
                    </>
                  ) : (
                    <span className="verb">
                      {highlightSearchText(summary, searchQuery)}
                    </span>
                  )}
                  {secondary ? (
                    <span className="secondary">
                      {" · "}
                      {highlightSearchText(secondary, searchQuery)}
                    </span>
                  ) : null}
                </span>
                {badge ? (
                  <span className="meta">
                    {highlightSearchText(badge, searchQuery)}
                  </span>
                ) : (
                  <span className="meta" aria-hidden />
                )}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function PersistedOrchTasksCard({
  tasks,
  isPending,
  isError,
  isFetching,
  onRetry,
  searchQuery,
  activeId,
}: {
  tasks: OrchestrationTaskRecord[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  searchQuery: string;
  activeId: string | null;
}) {
  const sectionMatches =
    Boolean(normalizeSearchQuery(searchQuery)) &&
    textMatchesQuery(
      joinSearchText("Persisted orchestration tasks", "Workflow state"),
      searchQuery,
    );

  return (
    <div
      data-ov-search-id="orch-tasks-section"
      className={cn(
        "ov-card",
        sectionMatches && "ov-search-hit",
        activeId === "orch-tasks-section" && "ov-search-hit--active",
      )}
    >
      <div className="ov-card-head">
        <div>
          <div className="ov-eyebrow" style={{ marginBottom: 4 }}>
            {highlightSearchText("Workflow state", searchQuery)}
          </div>
          <h2 className="ov-h2">
            {highlightSearchText("Persisted orchestration tasks", searchQuery)}
          </h2>
        </div>
      </div>

      <div className="ov-card-body" style={{ padding: "6px 20px" }}>
        {isPending ? (
          <div className="ov-activity-state">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading orchestration tasks…
          </div>
        ) : isError ? (
          <div className="ov-activity-state ov-activity-state--error">
            <span>Could not load orchestration tasks.</span>
            <button
              type="button"
              className="ov-btn ov-btn-sm"
              onClick={onRetry}
              disabled={isFetching}
            >
              {isFetching ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="ov-activity-state">No persisted orchestration tasks yet.</div>
        ) : (
          tasks.map((task) => {
            const title = orchTaskDisplayTitle(task);
            const statusLabel = orchTaskStatusLabel(task.status);
            const chipClass = orchTaskStatusChipClass(task.status);
            const searchId = `orch-task-${task.id}`;
            const rowText = joinSearchText(
              task.task_id,
              task.task_type,
              title,
              task.check_id,
              statusLabel,
              task.status,
              "Persisted orchestration tasks",
            );
            const rowMatches =
              Boolean(normalizeSearchQuery(searchQuery)) &&
              textMatchesQuery(rowText, searchQuery);

            return (
              <div
                key={task.id}
                data-ov-search-id={searchId}
                className={cn(
                  "ov-feed-row",
                  rowMatches && "ov-search-hit",
                  activeId === searchId && "ov-search-hit--active",
                )}
              >
                <span className="when ov-badge mono" title={task.task_id}>
                  {highlightSearchText(task.task_type, searchQuery)}
                </span>
                <span className="actor ov-badge mono" title={task.task_id}>
                  {highlightSearchText(task.task_id, searchQuery)}
                </span>
                <span className="what">
                  <span className="verb">{highlightSearchText(title, searchQuery)}</span>
                  {task.check_id ? (
                    <span className="secondary">
                      {" · "}
                      {highlightSearchText(task.check_id, searchQuery)}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn("ov-chip-readiness", chipClass)}
                  data-orch-task-status={String(task.status).trim().toUpperCase()}
                >
                  {highlightSearchText(statusLabel, searchQuery)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function OverviewPanel({
  dcsStatus,
  companyName,
}: {
  dcsStatus: DcsAppStatus;
  companyName: string;
}) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<OverviewPeriod>("Last 14 days");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>("All");
  const periodRef = useRef<HTMLDivElement>(null);
  const searchSnap = useSyncExternalStore(
    subscribeOverviewSearch,
    getOverviewSearchSnapshot,
    getOverviewSearchSnapshot,
  );
  const searchQuery = searchSnap.query;
  const activeId = searchSnap.activeId;

  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
  });
  const {
    data: afLatest,
    isPending: afPending,
  } = useQuery({
    queryKey: AF_LATEST_QUERY_KEY,
    queryFn: getArchitectureLatest,
    staleTime: AF_LATEST_STALE_MS,
    refetchInterval: (query) =>
      isAfUpdating(query.state.data?.ui_status) ? AF_LATEST_STALE_MS : false,
  });
  const afAssessmentId = afLatest?.assessment?.assessment_id;
  const { data: afCoverage } = useQuery({
    queryKey: [...AF_COVERAGE_QUERY_KEY, afAssessmentId, "overview"] as const,
    queryFn: () => getArchitectureCoverage(afAssessmentId!),
    enabled: Boolean(afAssessmentId),
    staleTime: AF_LATEST_STALE_MS,
  });
  const { data: ucRecommendations } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });
  const {
    data: orchPlan,
    isError: orchPlanError,
    refetch: refetchOrchPlan,
    isFetching: orchPlanFetching,
  } = useQuery({
    queryKey: ORCH_PLAN_QUERY_KEY,
    queryFn: getOrchestrationPlan,
    staleTime: ORCH_STALE_MS,
  });
  const {
    data: orchTasksData,
    isPending: orchTasksPending,
    isError: orchTasksError,
    refetch: refetchOrchTasks,
    isFetching: orchTasksFetching,
  } = useQuery({
    queryKey: ORCH_TASKS_QUERY_KEY,
    queryFn: () => listOrchestrationTasks(),
    staleTime: ORCH_TASKS_STALE_MS,
  });
  const persistedOrchTasks = useMemo(
    () => orchTasksData?.results?.slice(0, 12) ?? [],
    [orchTasksData?.results],
  );
  const { data: dcsWorklist } = useQuery({
    queryKey: DCS_WORKLIST_QUERY_KEY,
    queryFn: getDcsWorklist,
    staleTime: ORCH_STALE_MS,
  });
  const pilotsReadyCount = ucRecommendations?.summary.ready;
  const {
    data: activityData,
    isPending: activityPending,
    isError: activityError,
    refetch: refetchActivity,
    isFetching: activityFetching,
  } = useQuery({
    queryKey: [...AUDIT_EVENTS_QUERY_KEY, "overview", 6] as const,
    queryFn: () => listAuditEvents({ limit: 6 }),
    staleTime: 30_000,
  });
  const activityEvents = useMemo(
    () => activityData?.results?.slice(0, 6) ?? [],
    [activityData?.results],
  );

  const periodWindow = useMemo(
    () => resolveOverviewPeriodWindow(period),
    [period],
  );

  const scoreReady = isDcsScoreReady(dcsStatus);
  const queryClient = useQueryClient();
  const exportBriefMutation = useMutation({
    mutationFn: () =>
      downloadOverviewBrief({
        since: periodWindow.since.toISOString(),
        until: periodWindow.until.toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error("Could not export brief", {
        description: assessmentReportErrorMessage(error),
      });
    },
  });
  const exportBriefBusy = exportBriefMutation.isPending;
  const exportBriefDisabled = !scoreReady || exportBriefBusy;

  const { data: scoreHistoryData, isSuccess: scoreHistoryLoaded } = useQuery({
    queryKey: [
      ...DCS_HISTORY_QUERY_KEY,
      "overview",
      period,
      periodWindow.since.toISOString(),
      periodWindow.until.toISOString(),
    ] as const,
    queryFn: () =>
      getDcsScoreHistory({
        since: periodWindow.since.toISOString(),
        until: periodWindow.until.toISOString(),
      }),
    staleTime: 60_000,
    enabled: scoreReady,
    retry: false,
  });

  const periodCompare = scoreHistoryData?.period_compare;
  const periodCompareAvailable = periodCompare?.available ?? false;
  const periodImpactState = resolvePeriodImpactState(
    periodCompare,
    scoreHistoryLoaded,
  );
  const periodCapturedSubcopy = periodImpactCapturedSubcopy(periodImpactState);

  const trendChartData = useMemo(() => {
    return aggregateDcsTrendPoints(
      scoreHistoryData?.points ?? [],
      periodWindow.granularity,
    );
  }, [scoreHistoryData?.points, periodWindow.granularity]);

  const atStakeSeriesInWindow = useMemo(() => {
    return (scoreHistoryData?.at_stake_series ?? []).filter((point) => {
      const at = new Date(point.at).getTime();
      return (
        at >= periodWindow.since.getTime() && at <= periodWindow.until.getTime()
      );
    });
  }, [scoreHistoryData?.at_stake_series, periodWindow]);

  const atStakeSparkChart = useMemo(
    () =>
      aggregateValueCapturePoints(
        atStakeSeriesInWindow,
        periodWindow.granularity,
      ),
    [atStakeSeriesInWindow, periodWindow.granularity],
  );

  const headline = displayHeadlineScore(dcsStatus);
  const periodCapturedAmount = useMemo(
    () => resolvePeriodCapturedAmount(periodCompare),
    [periodCompare],
  );
  const trendDelta = useMemo(() => {
    const fromPeriod = resolvePeriodHeadlineDelta(periodCompare);
    if (fromPeriod) return fromPeriod;
    return computeTrendDelta(
      scoreHistoryData?.points ?? [],
      scoreReady && headline != null ? headline : null,
    );
  }, [periodCompare, scoreHistoryData?.points, scoreReady, headline]);
  const thresholdBadgeLabel =
    scoreReady && headline != null
      ? formatDcsThresholdBadge(headline, DCS_BUILD_READY_THRESHOLD)
      : null;
  const thresholdState =
    scoreReady && headline != null
      ? resolveDcsThresholdState(headline, DCS_BUILD_READY_THRESHOLD)
      : null;
  const scoreLabel =
    dcsStatus.score_display.label ??
    (scoreReady && headline != null
      ? formatDisplayScore(headline)
      : "Not calculated");
  const isCalculating = dcsStatus.score_display.state === "calculating";
  const dataCenterAllowed = isNavRouteAllowed(dcsStatus, "/data-consistency");
  const fixAllowed = isNavRouteAllowed(dcsStatus, "/fix");
  const businessImpact = dcsStatus.business_impact;
  const atStakeAmount = businessImpact?.estimate;
  const atStakeCurrency = businessImpact?.currency;
  const periodCapturedCurrency = useMemo(
    () => resolvePeriodCapturedCurrency(periodCompare, atStakeCurrency),
    [periodCompare, atStakeCurrency],
  );
  const impactWindowLabel =
    businessImpact?.window_days != null
      ? `${businessImpact.window_days}-day window`
      : null;
  const impactAsOfLabel = businessImpact?.as_of
    ? formatDisplayDate(businessImpact.as_of)
    : null;
  const revenueMixedCurrency = Boolean(businessImpact?.revenue_mixed_currency);
  const runTrigger = dcsStatus.latest_run?.triggered_by?.replaceAll("_", " ") ?? null;
  const runState = dcsStatus.latest_run?.run_state ?? null;

  const rankedIssues = useMemo(
    () => sortDcsWorklistIssues(dcsStatus.issues),
    [dcsStatus.issues],
  );
  /** Prefer full worklist over status cap-30 for NBA joining. */
  const nbaIssuePool = useMemo(() => {
    const fromWorklist = dcsWorklist?.issues;
    if (fromWorklist && fromWorklist.length > 0) return fromWorklist;
    return dcsStatus.issues ?? [];
  }, [dcsWorklist?.issues, dcsStatus.issues]);
  const planFixTasks = useMemo(() => fixTasksFromPlan(orchPlan), [orchPlan]);
  // Use cached plan rows even if a refetch failed (still show Retry).
  const nbaUsesPlanOrder = planFixTasks.length > 0;
  const nbaRankLabel = nbaUsesPlanOrder
    ? "Ordered by onboarding plan"
    : "Ranked by projected impact";
  const nbaOrderedIssues = useMemo(() => {
    if (nbaUsesPlanOrder) {
      return joinPlanFixIssues(orchPlan, nbaIssuePool);
    }
    return sortDcsWorklistIssues(nbaIssuePool);
  }, [nbaUsesPlanOrder, nbaIssuePool, orchPlan]);
  const revenueStakeRows = useMemo(
    () => buildLiveStakeRows(businessImpact, rankedIssues),
    [businessImpact, rankedIssues],
  );
  const filteredRanked = useMemo(
    () =>
      nbaOrderedIssues.filter((issue) =>
        statusFilter === "All" ? true : nbaFilterBucket(issue) === statusFilter,
      ),
    [nbaOrderedIssues, statusFilter],
  );
  /** Executive overview shows a 4-card summary only; full backlog lives on Opportunity tracker. */
  const nbaIssues = filteredRanked.slice(0, 4);
  const topIssue = nbaOrderedIssues[0] ?? rankedIssues[0];
  const topIssueExec = topIssue
    ? formatExecutiveIssueCard(topIssue, 0, businessImpact)
    : null;
  const blockedScoreCopy = !scoreReady ? formatScoreBlockedCopy(dcsStatus) : null;
  const primaryBlocker = resolvePrimaryBlocker(
    dcsStatus.run_progress?.stages,
    dcsStatus.issues,
  );

  const failCount = dcsStatus.check_summary?.FAIL ?? 0;
  const warnCount = dcsStatus.check_summary?.WARN ?? 0;
  const openCheckCount = failCount + warnCount;
  const passCount = dcsStatus.check_summary?.PASS ?? 0;
  const notConnectedCount = dcsStatus.check_summary?.NOT_CONNECTED ?? 0;
  const opportunityCount = rankedIssues.filter((issue) => issue.is_optional).length;
  const governanceIssues = rankedIssues.filter((issue) => !issue.is_optional);
  const openIssueCount = governanceIssues.length;
  const blockedIssueCount = governanceIssues.filter(
    (issue) => issue.status === "FAIL",
  ).length;
  const leakingIssueCount = governanceIssues.filter(
    (issue) => issue.status === "WARN",
  ).length;
  const blockingGatesFailed = dcsStatus.latest_run?.blocking_gates_failed ?? 0;
  const atStakeLabel = formatDcsRevenue(atStakeAmount, atStakeCurrency);

  const revCompareCapturedPct = useMemo(() => {
    const captured =
      periodCapturedAmount != null && periodCapturedAmount > 0
        ? periodCapturedAmount
        : 0;
    const atRisk =
      atStakeAmount != null && atStakeAmount > 0 ? atStakeAmount : 0;
    const total = captured + atRisk;
    if (total <= 0) return null;
    return Math.round((captured / total) * 100);
  }, [periodCapturedAmount, atStakeAmount]);

  const marCompareCapturedPct = useMemo(() => null, []);

  const revCapturedCompareLabel =
    periodCapturedAmount != null
      ? `${formatDcsRevenue(periodCapturedAmount, periodCapturedCurrency)} at-stake reduced`
      : periodCompareAvailable
        ? "— at-stake reduced"
        : "— captured";
  const marCapturedCompareLabel = "— captured";

  const r = 49;
  const circ = 2 * Math.PI * r;
  const arcScore = scoreReady && headline != null ? headline : 0;
  const arcOffset = circ * (1 - arcScore / 100);

  // Period deltas from history period_compare (not consecutive run-diff).
  const liveDimChart = useMemo(
    () => liveDimensionsWithPeriodDeltas(dcsStatus.dimensions, periodCompare),
    [dcsStatus.dimensions, periodCompare],
  );
  const hasLiveDimensions = liveDimChart.length > 0;

  const overviewHits = useMemo(() => {
    const hits: OverviewSearchHit[] = [];

    hits.push({
      id: "value-captured",
      section: "value",
      title: DCS_PERIOD_CAPTURED_EYEBROW,
      subtitle: "At-stake risk reduced · Margin gain",
      haystack: normalizeSearchQuery(
        joinSearchText(
          DCS_PERIOD_CAPTURED_EYEBROW,
          "At-stake risk reduced",
          "Margin gain",
          "Not available yet",
          "Need ≥2 scored runs in period",
          "No scores in this period",
        ),
      ),
    });
    hits.push({
      id: "value-atstake",
      section: "value",
      title: "At stake · open issues",
      subtitle: "Revenue at risk",
      haystack: normalizeSearchQuery(
        joinSearchText(
          "At stake",
          "open issues",
          impactWindowLabel,
          impactAsOfLabel,
          "Revenue at risk",
          "Margin at risk",
          atStakeLabel,
          openCheckCount,
          failCount,
          "blocked",
          warnCount,
          "leaking",
          revenueMixedCurrency ? "Mixed currencies" : null,
          ...revenueStakeRows.flatMap((row) => [row.checkId, row.title]),
          "risk",
          "governance",
        ),
      ),
    });

    for (const [index, issue] of nbaIssues.entries()) {
      const exec = formatExecutiveIssueCard(issue, index, businessImpact);
      hits.push({
        id: `nba-${issue.check_id ?? index}`,
        section: "nba",
        title: exec.title,
        subtitle: exec.areaBadge,
        haystack: normalizeSearchQuery(
          joinSearchText(
            nbaRankLabel,
            "Next best actions",
            "Ordered by onboarding plan",
            "Ranked by projected impact",
            exec.title,
            exec.summary,
            exec.whyMatters,
            exec.impactLabel,
            exec.areaBadge,
            exec.severityBadge,
            exec.rankCaption,
            exec.impactLabel,
            issue.dimension,
            issue.status,
            issue.severity,
            issue.detail,
            "at risk",
          ),
        ),
      });
    }

    if (pilotsReadyCount != null) {
      hits.push({
        id: "pilots-ready-chip",
        section: "nba",
        title: `${formatDisplayCount(pilotsReadyCount)} pilots ready`,
        subtitle: "Opportunity tracker",
        haystack: normalizeSearchQuery(
          joinSearchText(
            "pilots ready",
            pilotsReadyCount,
            "Opportunity tracker",
            "use cases",
            "MVP1",
          ),
        ),
      });
    }

    hits.push({
      id: "score-card",
      section: "score",
      title: "Data Consistency Score",
      subtitle: blockedScoreCopy?.primaryBlocker ?? scoreLabel,
      haystack: normalizeSearchQuery(
        joinSearchText(
          "Data Consistency Score",
          "DCS",
          scoreLabel,
          blockedScoreCopy?.lead,
          blockedScoreCopy?.primaryBlocker
            ? `Primary blocker: ${blockedScoreCopy.primaryBlocker}`
            : null,
          runState,
          runTrigger,
          "Your data consistency score has been calculated",
          "Calculating",
          "Not calculated",
        ),
      ),
    });

    hits.push({
      id: "run-progress",
      section: "run",
      title: "Run progress",
      subtitle: "How far the latest Data Consistency run got across dimensions",
      haystack: normalizeSearchQuery(
        joinSearchText(
          "Run progress",
          "How far the latest Data Consistency run got across dimensions",
        ),
      ),
    });

    for (const stage of dcsStatus.run_progress?.stages ?? []) {
      const copy = formatStageCustomerCopy(stage, primaryBlocker);
      const status =
        stage.state === "passed"
          ? "Passed ✓"
          : stage.state === "failed"
            ? "Failed"
            : stage.state === "running"
              ? "Running"
              : stage.state === "skipped"
                ? "Skipped"
                : "Waiting";
      hits.push({
        id: `run-${stage.dimension_id}`,
        section: "run",
        title: stage.label,
        subtitle: status,
        haystack: normalizeSearchQuery(
          joinSearchText(
            "Run progress",
            stage.label,
            status,
            stage.state,
            copy.line1,
            copy.line2,
            "Score pending",
            "Waiting for Foundation Gate",
          ),
        ),
      });
    }

    hits.push({
      id: "stack-status",
      section: "stack",
      title: "Stack status",
      subtitle: `${formatDisplayCount(openIssueCount)} open issues`,
      haystack: normalizeSearchQuery(
        joinSearchText(
          "Stack status",
          "open issues",
          openIssueCount,
          blockedIssueCount,
          "blocked",
          leakingIssueCount,
          "leaking",
          "open checks",
          openCheckCount,
          failCount,
          "fail",
          warnCount,
          "warn",
          "opportunities",
          opportunityCount,
          "latest run",
          dcsStatus.latest_run?.status,
          runState,
          "blocking gates",
          blockingGatesFailed,
          "checks passed",
          passCount,
          "not connected",
          notConnectedCount,
        ),
      ),
    });

    hits.push({
      id: "lifecycle-section",
      section: "lifecycle",
      title: "Lifecycle coverage",
      subtitle:
        afLatest?.overview?.summary_line ??
        afLatest?.ui_status_label ??
        "Updates after scoring",
      haystack: normalizeSearchQuery(
        joinSearchText(
          "Lifecycle coverage",
          "architecture",
          afLatest?.overview?.mode,
          afLatest?.overview?.summary_line,
          afLatest?.ui_status_label,
          afLatest?.overview?.incomplete_message,
          ...OVERVIEW_PHASE_KEYS.map((key) => OVERVIEW_PHASE_LABELS[key]),
        ),
      ),
    });

    hits.push({
      id: "activity-section",
      section: "activity",
      title: "Recent activity",
      subtitle: recentActivityHeading(activityEvents),
      haystack: normalizeSearchQuery(
        joinSearchText("Recent activity", recentActivityHeading(activityEvents)),
      ),
    });

    hits.push({
      id: "orch-tasks-section",
      section: "orch",
      title: "Persisted orchestration tasks",
      subtitle: `${persistedOrchTasks.length} task${persistedOrchTasks.length === 1 ? "" : "s"}`,
      haystack: normalizeSearchQuery(
        joinSearchText(
          "Persisted orchestration tasks",
          "Workflow state",
          ...persistedOrchTasks.flatMap((task) => [
            task.task_id,
            task.task_type,
            orchTaskDisplayTitle(task),
            task.check_id,
            orchTaskStatusLabel(task.status),
            task.status,
          ]),
        ),
      ),
    });

    for (const task of persistedOrchTasks) {
      hits.push({
        id: `orch-task-${task.id}`,
        section: "orch",
        title: orchTaskDisplayTitle(task),
        subtitle: orchTaskStatusLabel(task.status),
        haystack: normalizeSearchQuery(
          joinSearchText(
            task.task_id,
            task.task_type,
            task.check_id,
            orchTaskStatusLabel(task.status),
            task.status,
            "Persisted orchestration tasks",
          ),
        ),
      });
    }

    for (const event of activityEvents) {
      const actor = (event.actor || event.performed_by || "").trim();
      const actionLabel = formatAuditActionLabel(event.action);
      const summary = formatDisplayText(
        event.summary?.trim() || actionLabel || "Activity",
      );
      hits.push({
        id: `activity-${event.id}`,
        section: "activity",
        title: summary,
        subtitle: actor || undefined,
        haystack: normalizeSearchQuery(
          joinSearchText(
            "Recent activity",
            formatAuditTimestamp(event.created_at),
            actor,
            actionLabel,
            summary,
            event.meta ? formatDisplayText(event.meta) : null,
            event.tone,
            event.action,
            "Shopify",
            "System",
          ),
        ),
      });
    }

    for (const connector of connectors ?? []) {
      hits.push({
        id: `connector-${connector.id}`,
        section: "stack",
        title: connector.display_name,
        subtitle: connector.type,
        haystack: normalizeSearchQuery(
          joinSearchText(
            "Connected",
            connector.display_name,
            connector.type,
            connector.status,
            "Shopify",
            "Manago",
          ),
        ),
      });
    }

    return hits;
  }, [
    activityEvents,
    afLatest,
    atStakeLabel,
    blockedScoreCopy,
    blockingGatesFailed,
    connectors,
    dcsStatus.latest_run?.status,
    dcsStatus.run_progress?.stages,
    failCount,
    impactAsOfLabel,
    impactWindowLabel,
    nbaIssues,
    nbaRankLabel,
    notConnectedCount,
    openCheckCount,
    opportunityCount,
    passCount,
    persistedOrchTasks,
    pilotsReadyCount,
    primaryBlocker,
    revenueMixedCurrency,
    revenueStakeRows,
    runState,
    runTrigger,
    scoreLabel,
    warnCount,
  ]);

  useEffect(() => {
    setOverviewSearchHits(overviewHits);
  }, [overviewHits]);

  useEffect(() => {
    const q = normalizeSearchQuery(searchQuery);
    if (!q) return;
    const matches = filterOverviewHits(overviewHits, searchQuery);
    if (matches.length === 0) return;
    const sections = new Set(matches.map((hit) => hit.section));
    if (matches.length === 1 || sections.size === 1) {
      scrollOverviewHitIntoView(matches[0]!.id);
    }
  }, [overviewHits, searchQuery]);

  useEffect(() => {
    if (!activeId) return;
    scrollOverviewHitIntoView(activeId);
  }, [activeId]);

  useEffect(() => {
    if (!periodOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [periodOpen]);

  const qActive = Boolean(normalizeSearchQuery(searchQuery));

  return (
    <div className="overview-panel">
      <div className="ov-panel-head">
        <div>
          <div className="ov-eyebrow" style={{ marginBottom: 8 }}>
            Executive overview · {period}
          </div>
          <h1 className="ov-panel-title">
            <span className="ov-brand-tick" />
            {companyName} · Production
          </h1>
          <p className="ov-panel-sub">The governance layer above your connected stack.</p>
          <div className="ov-connector-strip">
            <span className="ov-strip-label">Connected</span>
            {(connectors ?? []).map((c) => {
              const degraded = c.status === "degraded" || c.status === "error";
              const refresh = connectorLastDataRefresh(c);
              const syncing =
                refresh?.data_run_status === "pending" ||
                refresh?.data_run_status === "running";
              const searchId = `connector-${c.id}`;
              const pillText = joinSearchText(
                "Connected",
                c.display_name,
                c.type,
                c.status,
                "Shopify",
                "Manago",
              );
              const pillMatches =
                qActive && textMatchesQuery(pillText, searchQuery);
              return (
                <Link
                  key={c.id}
                  to="/integrations"
                  data-ov-search-id={searchId}
                  className={cn(
                    `ov-conn-pill${syncing ? " syncing" : ""}${degraded ? " is-warn" : ""}`,
                    pillMatches && "ov-search-hit",
                    activeId === searchId && "ov-search-hit--active",
                  )}
                  title={
                    [
                      c.status,
                      refresh?.summary_status
                        ? `refresh: ${refresh.summary_status}`
                        : null,
                      refresh
                        ? `${formatDisplayCount(refresh.contacts)} contacts · ${formatDisplayCount(refresh.orders)} orders`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                >
                  <span className="ov-cp-dot" />
                  <span className="ov-cp-name">
                    {highlightSearchText(c.display_name, searchQuery)}
                  </span>
                  <span className="ov-cp-cat">
                    {highlightSearchText(c.type, searchQuery)}
                  </span>
                </Link>
              );
            })}
            {(connectors ?? []).length === 0 ? (
              <Link to="/integrations" className="ov-conn-pill">
                Connect stack →
              </Link>
            ) : null}
          </div>
        </div>
        <div className="ov-panel-actions">
          <div className="relative" ref={periodRef}>
            <button
              type="button"
              className="ov-btn"
              onClick={() => setPeriodOpen((o) => !o)}
            >
              {period}
              <ChevronDown
                className={`h-3.5 w-3.5 opacity-60 transition-transform ${periodOpen ? "rotate-180" : ""}`}
              />
            </button>
            {periodOpen && (
              <div className="absolute right-0 z-30 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-elevated shadow-elevated">
                {periods.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPeriod(p);
                      setPeriodOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-sand ${
                      p === period ? "bg-sand font-medium" : ""
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="ov-btn"
            disabled={exportBriefDisabled}
            aria-busy={exportBriefBusy}
            title={
              !scoreReady
                ? (blockedScoreCopy?.lead ?? "A scored DCS run is required to export.")
                : "Download the assessment report for this period"
            }
            onClick={() => {
              if (!scoreReady) {
                toast.message("Score not ready yet", {
                  description:
                    blockedScoreCopy?.lead ??
                    "A scored DCS run is required to export.",
                });
                return;
              }
              if (exportBriefBusy) return;
              exportBriefMutation.mutate();
            }}
          >
            {exportBriefBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export brief
          </button>
          {dataCenterAllowed ? (
            <Link to="/workflow" className="ov-btn ov-btn-anchor">
              <Plus className="h-3.5 w-3.5" />
              Add workflow
            </Link>
          ) : (
            <span className="ov-btn opacity-50 cursor-not-allowed">
              <Plus className="h-3.5 w-3.5" />
              Add workflow
            </span>
          )}
        </div>
      </div>

      {qActive && filterOverviewHits(overviewHits, searchQuery).length === 0 ? (
        <div className="ov-search-empty" role="status">
          No matching results found.
        </div>
      ) : null}

      <div className="ov-value-bar">
        <div
          data-ov-search-id="value-captured"
          className={cn(
            "ov-vb-block captured",
            qActive &&
              textMatchesQuery(
                joinSearchText(
                  DCS_PERIOD_CAPTURED_EYEBROW,
                  "At-stake risk reduced",
                  "Margin gain",
                  "Not available yet",
                  "Need ≥2 scored runs in period",
                ),
                searchQuery,
              ) &&
              "ov-search-hit",
            activeId === "value-captured" && "ov-search-hit--active",
          )}
          title={DCS_PERIOD_CAPTURED_TOOLTIP}
        >
          <div className="ov-vb-eyebrow">
            {highlightSearchText(
              `${DCS_PERIOD_CAPTURED_EYEBROW} · ${period.toLowerCase()}`,
              searchQuery,
            )}
          </div>
          <div className="ov-vb-cards">
            <div>
              <div className="ov-vb-num" style={{ color: "var(--ov-good)" }}>
                {periodCapturedAmount != null ? (
                  <>
                    {highlightSearchText(
                      formatDcsRevenue(periodCapturedAmount, periodCapturedCurrency),
                      searchQuery,
                    )}{" "}
                    <span className="ov-vb-cadence">/ q</span>
                  </>
                ) : (
                  <>
                    — <span className="ov-vb-cadence">/ q</span>
                  </>
                )}
              </div>
              <div className="ov-vb-label">
                {highlightSearchText("At-stake risk reduced", searchQuery)}
              </div>
              <div className="ov-vb-sub">
                {highlightSearchText(periodCapturedSubcopy, searchQuery)}
              </div>
              <OverviewValueSpark
                metric="revenueCaptured"
                data={atStakeSparkChart}
                currency={periodCapturedCurrency ?? atStakeCurrency}
                emptyMessage={
                  scoreHistoryLoaded && atStakeSparkChart.length === 0
                    ? null
                    : "Awaiting data"
                }
              />
            </div>
            <div>
              <div className="ov-vb-num" style={{ color: "var(--ov-good)" }}>
                — <span className="ov-vb-cadence">/ q</span>
              </div>
              <div className="ov-vb-label">
                {highlightSearchText("Margin gain", searchQuery)}
              </div>
              <div className="ov-vb-sub">
                {highlightSearchText("Not available yet", searchQuery)}
              </div>
            </div>
          </div>
        </div>
        <div
          data-ov-search-id="value-atstake"
          className={cn(
            "ov-vb-block atstake",
            qActive &&
              textMatchesQuery(
                joinSearchText(
                  "At stake open issues",
                  impactWindowLabel,
                  "Revenue at risk",
                  "Margin at risk",
                  atStakeLabel,
                  "risk",
                ),
                searchQuery,
              ) &&
              "ov-search-hit",
            activeId === "value-atstake" && "ov-search-hit--active",
          )}
        >
          <div className="ov-vb-eyebrow">
            {highlightSearchText(
              `At stake · open issues${impactWindowLabel ? ` · ${impactWindowLabel}` : ""}`,
              searchQuery,
            )}
          </div>
          <div className="ov-vb-cards">
            <div>
              <div className="ov-vb-num">
                {highlightSearchText(atStakeLabel, searchQuery)}
                {atStakeAmount != null && atStakeAmount > 0 ? (
                  <span className="ov-vb-cadence">
                    {businessImpact?.window_days != null
                      ? ` / ${businessImpact.window_days}d`
                      : " / q"}
                  </span>
                ) : (
                  <span className="ov-vb-cadence"> / q</span>
                )}
              </div>
              <div className="ov-vb-label">
                {highlightSearchText("Revenue at risk", searchQuery)}
              </div>
              <div className="ov-vb-sub">
                {highlightSearchText(
                  `${
                    revenueMixedCurrency
                      ? "Mixed currencies — amount not rolled up"
                      : openCheckCount > 0
                        ? `${failCount} blocked issues · by workflow`
                        : "0 blocked issues · by workflow"
                  }${impactAsOfLabel ? ` · as of ${impactAsOfLabel}` : ""}`,
                  searchQuery,
                )}
              </div>
              <LiveRevenueStakeBreakdown
                rows={revenueStakeRows}
                fixAllowed={fixAllowed}
                dataCenterAllowed={dataCenterAllowed}
                issues={rankedIssues}
                pilots={ucRecommendations?.pilots}
              />
            </div>
            <div>
              <div className="ov-vb-num" style={{ color: "var(--ov-warn)" }}>
                — <span className="ov-vb-cadence">/ q</span>
              </div>
              <div className="ov-vb-label">
                {highlightSearchText("Margin at risk", searchQuery)}
              </div>
              <div className="ov-vb-sub">
                {highlightSearchText("Not available yet", searchQuery)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ov-vb-compare">
        <div className="ov-vbc-row">
          <span className="ov-vbc-label">
            Revenue <span className="ov-lc-type rev">rev</span>
          </span>
          <div className="ov-vbc-track">
            <div
              className="ov-vbc-captured"
              style={{
                width: `${revCompareCapturedPct ?? 0}%`,
              }}
            />
            <div
              className="ov-vbc-risk"
              style={{
                width: `${100 - (revCompareCapturedPct ?? 0)}%`,
                background: "var(--ov-anchor)",
                opacity: atStakeAmount != null && atStakeAmount > 0 ? 1 : 0.25,
              }}
            />
          </div>
          <span className="ov-vbc-nums">
            <span style={{ color: "var(--ov-good)" }}>{revCapturedCompareLabel}</span>
            {" · "}
            <span style={{ color: "var(--ov-anchor)" }}>
              {atStakeLabel !== "—" ? `${atStakeLabel} at risk` : "— at risk"}
            </span>
          </span>
        </div>
        <div className="ov-vbc-row">
          <span className="ov-vbc-label">
            Margin <span className="ov-lc-type mar">mar</span>
          </span>
          <div className="ov-vbc-track">
            <div
              className="ov-vbc-captured"
              style={{
                width: `${marCompareCapturedPct ?? 0}%`,
              }}
            />
            <div
              className="ov-vbc-risk"
              style={{
                width: `${100 - (marCompareCapturedPct ?? 0)}%`,
                background: "var(--ov-warn)",
                opacity: 0.25,
              }}
            />
          </div>
          <span className="ov-vbc-nums">
            <span style={{ color: "var(--ov-good)" }}>{marCapturedCompareLabel}</span>
            {" · "}
            <span style={{ color: "var(--ov-warn)" }}>— at risk</span>
          </span>
        </div>
        <div className="ov-vbc-caption">
          revenue and margin shown separately — never summed · bars sized from the figures
          above
        </div>
      </div>

      {topIssue && topIssueExec && (
        <div className="ov-blocker-strip">
          <span>
            Top blocker today:{" "}
            {(() => {
              const impact = formatDcsRevenue(
                resolveIssueRevenueAmount(topIssue, businessImpact),
                resolveIssueDisplayCurrency(topIssue, businessImpact),
              );
              const label =
                impact !== "—"
                  ? `${topIssueExec.title} · ${impact}`
                  : topIssueExec.title;
              if (topIssue.check_id) {
                const target = issueOpenTarget(topIssue.check_id, {
                  fixAllowed,
                  dataCenterAllowed,
                  issue: topIssue,
                  pilots: ucRecommendations?.pilots,
                });
                if (target) {
                  return (
                    <>
                      <Link
                        to={target.to}
                        search={"search" in target ? target.search : undefined}
                        className="mono"
                        data-issue-route={target.taxonomy}
                      >
                        {label}
                      </Link>
                      {" → Open"}
                    </>
                  );
                }
              }
              if (!dataCenterAllowed && !fixAllowed) {
                return (
                  <>
                    <span className="mono">{label}</span>
                    {" → "}
                    <Link to="/integrations" className="mono" data-issue-route="fallback">
                      Open
                    </Link>
                  </>
                );
              }
              return <span className="mono">{label}</span>;
            })()}
          </span>
          <span className="ov-bs-dol">
            Klints supplies cross-stack context; the Manago.ai agent builds the workflow.
          </span>
        </div>
      )}

      <div className="ov-spacer" />

      <div
        data-ov-search-id="nba-section"
        className={cn(
          qActive &&
            textMatchesQuery(
              joinSearchText(
                "Next best actions",
                nbaRankLabel,
                pilotsReadyCount != null
                  ? `${formatDisplayCount(pilotsReadyCount)} pilots ready`
                  : null,
              ),
              searchQuery,
            ) &&
            "ov-search-hit",
        )}
      >
        <div className="ov-flex-between">
          <div>
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>
              {highlightSearchText("Next best actions", searchQuery)}
            </div>
            <h2 className="ov-h2">
              {highlightSearchText(nbaRankLabel, searchQuery)}
            </h2>
          </div>
          <div className="ov-filters">
            {statusFilters.map((s) => (
              <button
                key={s}
                type="button"
                className={`ov-filter-pill ${statusFilter === s ? "active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
            {orchPlanError ? (
              <button
                type="button"
                className="ov-btn ov-btn-ghost ov-btn-sm"
                disabled={orchPlanFetching}
                onClick={() => void refetchOrchPlan()}
              >
                {orchPlanFetching ? "Retrying…" : "Retry plan"}
              </button>
            ) : null}
            {pilotsReadyCount != null ? (
              <Link
                to="/opportunities"
                className="ov-chip-readiness ready"
                data-ov-search-id="pilots-ready-chip"
              >
                {highlightSearchText(
                  `${formatDisplayCount(pilotsReadyCount)} pilots ready`,
                  searchQuery,
                )}{" "}
                →
              </Link>
            ) : null}
            <Link to="/opportunities" className="ov-btn ov-btn-ghost ov-btn-sm">
              Open backlog →
            </Link>
          </div>
        </div>

        {nbaIssues.length === 0 ? (
          <div className="rounded-xl border border-border bg-elevated px-5 py-8 text-sm text-muted-foreground">
            {nbaOrderedIssues.length === 0
              ? "No FAIL or WARN checks on the latest run. Connect your stack or review Connected stack if scoring is blocked."
              : `No ${statusFilter.toLowerCase()} items in the current ranked list.`}
          </div>
        ) : (
          <div className="ov-grid-4">
            {nbaIssues.map((issue, index) => {
              const exec = formatExecutiveIssueCard(issue, index, businessImpact);
              const checkId = issue.check_id?.trim() || null;
              const openTarget = checkId
                ? nbaOpenTarget(checkId, {
                    issue,
                    pilots: ucRecommendations?.pilots,
                  })
                : null;
              const searchId = `nba-${issue.check_id ?? index}`;
              const isOpp = issue.is_optional;
              const cardMatches =
                qActive &&
                textMatchesQuery(
                  joinSearchText(
                    exec.title,
                    exec.summary,
                    exec.whyMatters,
                    exec.impactLabel,
                    exec.areaBadge,
                    exec.severityBadge,
                    exec.impactLabel,
                    issue.dimension,
                  ),
                  searchQuery,
                );
              const openCard = () => {
                if (openTarget) {
                  void navigate({
                    to: openTarget.to,
                    search: "search" in openTarget ? openTarget.search : undefined,
                  });
                  return;
                }
                void navigate({ to: "/integrations" });
              };
              return (
                <div
                  key={issue.check_id ?? `issue-${index}`}
                  data-ov-search-id={searchId}
                  role={cardMatches ? "button" : undefined}
                  tabIndex={cardMatches ? 0 : undefined}
                  onClick={cardMatches ? openCard : undefined}
                  onKeyDown={
                    cardMatches
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openCard();
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    `ov-nba-card ${nbaCardVariant(issue)}`,
                    cardMatches && "ov-search-hit",
                    activeId === searchId && "ov-search-hit--active",
                    cardMatches && "ov-search-hit--clickable",
                  )}
                >
                  <div className="ov-nba-head">
                    <div className="ov-nba-rank">
                      {highlightSearchText(
                        `${String(index + 1).padStart(2, "0")} · ${exec.rankCaption}`,
                        searchQuery,
                      )}
                    </div>
                    {isOpp ? (
                      <span className="ov-opp-tag">Opportunity</span>
                    ) : (
                      <span className="ov-spark-tag">Next best</span>
                    )}
                  </div>
                  <div className="ov-nba-body">
                    <div className="ov-nba-title">
                      {highlightSearchText(exec.title, searchQuery)}
                    </div>
                    <div
                      className={cn(
                        "ov-nba-revenue",
                        !exec.impactShowQuarterly && "ov-nba-revenue--metric",
                      )}
                    >
                      {exec.impactShowQuarterly ? (
                        <>
                          {highlightSearchText(exec.impactLabel, searchQuery)}{" "}
                          <span className="annual">/ q</span>
                        </>
                      ) : (
                        highlightSearchText(exec.impactLabel, searchQuery)
                      )}
                    </div>
                    <div className="ov-nba-meta">
                      <span className="ov-badge">
                        {highlightSearchText(exec.areaBadge, searchQuery)}
                      </span>
                      <span className="ov-badge mono">
                        {resolveIssueRevenueAmount(issue, businessImpact) > 0 ? "M" : "S"}
                      </span>
                      <span className={`ov-chip-readiness ${nbaSeverityTone(issue)}`}>
                        {highlightSearchText(exec.severityBadge, searchQuery)}
                      </span>
                    </div>
                  </div>
                  <NbaBlurbBox
                    checkId={checkId ?? ""}
                    dcsRunId={
                      dcsWorklist?.data_run_id ?? dcsStatus.latest_run?.data_run_id
                    }
                    planRank={index + 1}
                    enabled={Boolean(checkId)}
                  />
                  <div className="ov-nba-action">
                    <div className="why">
                      {highlightSearchText(exec.whyMatters, searchQuery)}
                    </div>
                    {openTarget ? (
                      <Link
                        to={openTarget.to}
                        search={
                          "search" in openTarget ? openTarget.search : undefined
                        }
                        className="ov-btn ov-btn-sm"
                        data-issue-route={openTarget.taxonomy}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open →
                      </Link>
                    ) : (
                      <Link
                        to="/integrations"
                        className="ov-btn ov-btn-sm"
                        data-issue-route="fallback"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ov-spacer" />

      <div className="ov-cmo-hero">
        <div className="ov-cmo-body">
          <div
            data-ov-search-id="score-card"
            className={cn(
              "ov-cmo-score",
              qActive &&
                textMatchesQuery(
                  joinSearchText(
                    "Data Consistency Score",
                    scoreLabel,
                    blockedScoreCopy?.lead,
                    blockedScoreCopy?.primaryBlocker,
                  ),
                  searchQuery,
                ) &&
                "ov-search-hit",
              activeId === "score-card" && "ov-search-hit--active",
            )}
          >
            <div className="ov-eyebrow">
              {highlightSearchText("Data Consistency Score", searchQuery)}
            </div>
            <div className="ov-score-arc-wrap">
              <svg width="116" height="116" viewBox="0 0 116 116">
                <circle
                  className="ov-score-arc-track"
                  cx="58"
                  cy="58"
                  r={r}
                  fill="none"
                  strokeWidth="6"
                />
                <circle
                  className={`ov-score-arc-progress ${scoreReady ? "" : "opacity-30"}`}
                  cx="58"
                  cy="58"
                  r={r}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={arcOffset}
                  transform="rotate(-90 58 58)"
                />
              </svg>
              <div className="ov-score-arc-num">
                {scoreReady && headline != null ? (
                  <>
                    <div className="num">{formatDisplayScore(headline)}</div>
                    <div className="denom">/ 100</div>
                  </>
                ) : (
                  <div className="px-2 text-center text-[11px] font-medium leading-snug text-muted-foreground">
                    {isCalculating ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculating…
                      </span>
                    ) : (
                      scoreLabel
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="ov-score-delta-row">
              <span className="delta">
                {trendDelta.direction === "up"
                  ? `↑ ${formatDisplayCount(trendDelta.delta)}`
                  : trendDelta.direction === "down"
                    ? `↓ ${formatDisplayCount(Math.abs(trendDelta.delta ?? 0))}`
                    : trendDelta.direction === "flat"
                      ? "—"
                      : "—"}
              </span>
              <span>over {periodWindow.spanDays} days</span>
            </div>
            <div className="ov-score-trend">
              <DcsTrendChart
                tone="dark"
                height={88}
                data={trendChartData}
                threshold={DCS_BUILD_READY_THRESHOLD}
              />
            </div>
            {thresholdBadgeLabel ? (
              <span
                className={cn(
                  "ov-threshold-badge",
                  thresholdState === "below" && "ov-threshold-warn",
                  thresholdState === "above" && "ov-threshold-ok",
                  thresholdState === "at" && "ov-threshold-neutral",
                )}
              >
                {highlightSearchText(thresholdBadgeLabel, searchQuery)}
              </span>
            ) : null}
            {dataCenterAllowed ? (
              <Link to="/data-consistency" className="ov-btn ov-btn-sm">
                Open Data Center →
              </Link>
            ) : (
              <Link to="/integrations" className="ov-btn ov-btn-sm">
                Connected stack →
              </Link>
            )}
            {!scoreReady && blockedScoreCopy ? (
              <div className="ov-score-help">
                <p>{highlightSearchText(blockedScoreCopy.lead, searchQuery)}</p>
                {blockedScoreCopy.primaryBlocker ? (
                  <p className="ov-score-help__reason">
                    {highlightSearchText(
                      `Primary blocker: ${blockedScoreCopy.primaryBlocker}`,
                      searchQuery,
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            data-ov-search-id="run-progress"
            className={cn(
              "ov-cmo-dims",
              qActive &&
                textMatchesQuery(
                  joinSearchText(
                    "Why the score sits at",
                    "dimensions",
                    "weakest first",
                  ),
                  searchQuery,
                ) &&
                "ov-search-hit",
              activeId === "run-progress" && "ov-search-hit--active",
            )}
          >
            <div className="ov-cmo-dims-head">
              <div className="ov-eyebrow" style={{ marginBottom: 2 }}>
                {highlightSearchText(
                  scoreReady && headline != null
                    ? `Why the score sits at ${formatDisplayScore(headline)}`
                    : "Why the score sits at —",
                  searchQuery,
                )}
              </div>
              <span>
                {highlightSearchText(
                  hasLiveDimensions
                    ? `${liveDimChart.length} dimensions · weakest first`
                    : "— dimensions · weakest first",
                  searchQuery,
                )}
              </span>
            </div>
            {scoreReady && hasLiveDimensions ? (
              <DcsDimensionChart
                height={248}
                showDelta={periodCompareAvailable}
                dimensions={liveDimChart}
              />
            ) : (
              <div
                className="flex h-[248px] items-center justify-center px-4 text-center text-sm leading-relaxed text-[rgb(245_242_235/0.45)]"
                aria-live="polite"
              >
                {scoreReady
                  ? "Dimension scores are not available for the latest scored run."
                  : "—"}
              </div>
            )}
          </div>

          <div
            data-ov-search-id="stack-status"
            className={cn(
              "ov-cmo-status",
              qActive &&
                textMatchesQuery(
                  joinSearchText(
                    "Stack status",
                    "open checks",
                    "checks passed",
                    "blocking gates",
                    "latest run",
                  ),
                  searchQuery,
                ) &&
                "ov-search-hit",
              activeId === "stack-status" && "ov-search-hit--active",
            )}
          >
            <div className="ov-eyebrow" style={{ marginBottom: 10 }}>
              {highlightSearchText("Stack status", searchQuery)}
            </div>
            <div className="ov-cmo-stat-grid">
              <div>
                <div className="ov-cs-num">
                  {highlightSearchText(formatDisplayCount(openIssueCount), searchQuery)}
                </div>
                <div className="ov-cs-lbl">
                  {highlightSearchText("open issues", searchQuery)}{" "}
                  {(blockedIssueCount > 0 || leakingIssueCount > 0) && (
                    <span className="muted">
                      {highlightSearchText(
                        `${formatDisplayCount(blockedIssueCount)} blocked · ${formatDisplayCount(leakingIssueCount)} leaking`,
                        searchQuery,
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="ov-cs-num">
                  {highlightSearchText(formatDisplayCount(openCheckCount), searchQuery)}
                </div>
                <div className="ov-cs-lbl">
                  {highlightSearchText("open checks", searchQuery)}{" "}
                  <span className="muted">
                    {highlightSearchText(
                      `${formatDisplayCount(failCount)} fail · ${formatDisplayCount(warnCount)} warn`,
                      searchQuery,
                    )}
                  </span>
                </div>
              </div>
              <div>
                <div className="ov-cs-num">
                  {highlightSearchText(formatDisplayCount(opportunityCount), searchQuery)}
                </div>
                <div className="ov-cs-lbl">
                  {highlightSearchText("opportunities", searchQuery)}
                </div>
              </div>
              <div>
                <div className="ov-cs-num">
                  {highlightSearchText(
                    formatDisplayCount(blockingGatesFailed),
                    searchQuery,
                  )}
                </div>
                <div className="ov-cs-lbl">
                  {highlightSearchText("blocking gates", searchQuery)}
                  {dcsStatus.scheduled ? (
                    <span className="muted">
                      {highlightSearchText("run scheduled", searchQuery)}
                    </span>
                  ) : dcsStatus.latest_run?.status ? (
                    <span className="muted">
                      {highlightSearchText(
                        `latest run · ${dcsStatus.latest_run.status.replaceAll("_", " ")}`,
                        searchQuery,
                      )}
                    </span>
                  ) : runState ? (
                    <span className="muted">
                      {highlightSearchText(runState.replaceAll("_", " "), searchQuery)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ov-spacer" />

      <div
        data-ov-search-id="lifecycle-section"
        className={cn(
          "ov-card",
          qActive &&
            textMatchesQuery(
              joinSearchText(
                "Lifecycle coverage architecture",
                afLatest?.overview?.summary_line,
                afLatest?.ui_status_label,
              ),
              searchQuery,
            ) &&
            "ov-search-hit",
          activeId === "lifecycle-section" && "ov-search-hit--active",
        )}
      >
        <div className="ov-card-head">
          <div>
            <div className="ov-eyebrow" style={{ marginBottom: 4 }}>
              {highlightSearchText("Lifecycle coverage", searchQuery)}
            </div>
            <h2 className="ov-h2">
              {highlightSearchText(
                afLatest?.overview
                  ? modeBadgeLabel(afLatest.overview.mode)
                  : afPending
                    ? "Loading…"
                    : afLatest?.ui_status_label ?? "Waiting for score",
                searchQuery,
              )}
            </h2>
            {afLatest?.overview?.summary_line ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                {highlightSearchText(afLatest.overview.summary_line, searchQuery)}
              </p>
            ) : afLatest?.message ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                {highlightSearchText(afLatest.message, searchQuery)}
              </p>
            ) : null}
            {afLatest?.overview?.incomplete_message ? (
              <p className="mt-1 text-[11px] text-risk">
                {afLatest.overview.incomplete_message}
              </p>
            ) : null}
          </div>
          <Link to="/lifecycle" className="ov-btn ov-btn-ghost ov-btn-sm">
            {afLatest?.overview?.cta?.label ?? "Open Lifecycle cockpit"} →
          </Link>
        </div>
        <div className="ov-card-body">
          <div className="ov-lifecycle-strip">
            {OVERVIEW_PHASE_KEYS.map((key) => {
              const card = afCoverage?.fe_phase_cards?.find(
                (row) => row.fe_phase_key === key,
              );
              const pct = phaseCardCoveragePct(card);
              const name = OVERVIEW_PHASE_LABELS[key];
              const meta =
                !afLatest?.assessment
                  ? afPending
                    ? "Loading…"
                    : "Awaiting score"
                  : pct == null
                    ? "Awaiting map"
                    : pct === 0
                      ? "No coverage"
                      : `${card?.asset_count ?? 0} assets`;
              return (
                <Link key={key} to="/lifecycle" className="ov-life-stage">
                  <div className="name">{highlightSearchText(name, searchQuery)}</div>
                  <div className="pct">{pct == null ? "—" : `${pct}%`}</div>
                  <div className="meta">{meta}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ov-spacer" />

      <PersistedOrchTasksCard
        tasks={persistedOrchTasks}
        isPending={orchTasksPending}
        isError={orchTasksError}
        isFetching={orchTasksFetching}
        onRetry={() => void refetchOrchTasks()}
        searchQuery={searchQuery}
        activeId={activeId}
      />

      <div className="ov-spacer" />

      <RecentActivityCard
        events={activityEvents}
        isPending={activityPending}
        isError={activityError}
        isFetching={activityFetching}
        onRetry={() => void refetchActivity()}
        searchQuery={searchQuery}
        activeId={activeId}
        fixAllowed={fixAllowed}
      />
    </div>
  );
}
