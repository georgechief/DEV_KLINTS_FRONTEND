import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section, StatusBadge, Money } from "@/components/klints/primitives";
import { getCheckIdFromSearch, parseFixFlowSearch } from "@/lib/fix-flow";
import { formatDisplayCount } from "@/lib/presentation";
import { formatDisplayWhen } from "@/lib/datetime";
import {
  DCS_STATUS_QUERY_KEY,
  DCS_STATUS_STALE_MS,
  DCS_STALE_POLL_MS,
  getDcsRunningRefetchInterval,
  invalidateAfterDcsRunComplete,
  isDcsScoringStuck,
} from "@/lib/app-access";
import {
  AUDIT_EVENTS_QUERY_KEY,
  AUDIT_NOTIFICATIONS_QUERY_KEY,
} from "@/lib/audit";
import {
  assessmentReportErrorMessage,
  downloadOverviewBrief,
} from "@/lib/assessment-report";
import { ORCH_PLAN_QUERY_KEY, ORCH_STALE_MS, fixTasksFromPlan, getOrchestrationPlan, sortIssuesByPlanOrder } from "@/lib/orchestration";
import {
  DCS_BUILD_READY_THRESHOLD,
  dcsScoreDisplayColor,
  DCS_HISTORY_QUERY_KEY,
  DCS_WORKLIST_QUERY_KEY,
  computeDimensionDeltas,
  displayHeadlineScore,
  dcsWorklistIssueQueryKey,
  formatCustomerIssueExplanation,
  formatCustomerSuggestedFix,
  formatDcsRevenue,
  formatDcsScore,
  formatConsecutiveRunDiffLabel,
  formatExecutiveIssueCard,
  getDcsScoreHistory,
  getDcsStatus,
  getDcsWorklist,
  getDcsWorklistIssue,
  isDcsScoreReady,
  resolvePeriodHeadlineDelta,
  severityLabel,
  sortDcsWorklistIssues,
  formatFreshImportFailedCopy,
  formatFreshImportPhaseCopy,
  formatFreshImportPlatformLabel,
  hasEligibleConnectedDcsConnectors,
  hasFreshImportsOnRun,
  isDcsFreshImportPhaseRunning,
  resolveFreshImportFailedPlatform,
  startDcsRun,
  type DcsIssue,
  type DcsIssueStatus,
} from "@/lib/dcs";
import {
  getUseCaseRecommendations,
  resolveDcsRowCtas,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  type UseCasePilotRecommendation,
} from "@/lib/use-cases";
import {
  classifyIssueRouteKind,
  issueRouteSignalsFromDcs,
} from "@/lib/issue-routing";
import { getApiErrorMessage, isConnectorBootstrapInFlight, listConnectors } from "@/lib/connectors";
import {
  aggregateDcsTrendPoints,
  computeTrendDelta,
  overviewPeriods,
  resolveOverviewPeriodWindow,
  type OverviewPeriod,
} from "@/lib/overview-period";
import {
  ArrowRight,
  ChevronDown,
  Loader2,
  Lock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { DiagnoseEvidence, ImpactRibbon } from "@/components/klints/DiagnoseEvidence";
import { DcsSubScores } from "@/components/klints/DcsSubScores";
import {
  DcsStatusChart,
  DcsTrendChart,
} from "@/components/klints/DcsCharts";
import { KlintsLoader } from "@/components/klints/KlintsLoader";

export const Route = createFileRoute("/data-consistency")({
  validateSearch: parseFixFlowSearch,
  head: () => ({
    meta: [
      { title: "Data Center — Klints" },
      {
        name: "description",
        content:
          "Data Consistency Score, readiness gate, and integrity worklist across your stack.",
      },
    ],
  }),
  component: DataConsistencyPage,
});

const CIRC = 2 * Math.PI * 51.4;

type ConnectorFilter = "All" | "Manago.ai" | "Shopify";

function issueBorderClass(status: DcsIssueStatus): string {
  if (status === "FAIL") return "border-l-loss";
  if (status === "WARN") return "border-l-risk";
  return "border-l-border";
}

function issueConnectors(issue: DcsIssue): ConnectorFilter[] {
  const check = (issue.check_id ?? "").toUpperCase();
  const text =
    `${issue.title} ${issue.detail} ${issue.dimension ?? ""}`.toLowerCase();
  const out: ConnectorFilter[] = [];
  if (
    text.includes("manago") ||
    text.includes("salesmanago") ||
    /^(FD|CI|LE|SP|CC|ME)-/.test(check)
  ) {
    out.push("Manago.ai");
  }
  if (
    text.includes("shopify") ||
    text.includes("commerce") ||
    text.includes("storefront") ||
    check.startsWith("FD-02") ||
    check.startsWith("FD-07")
  ) {
    out.push("Shopify");
  }
  if (out.length === 0) {
    out.push("Manago.ai", "Shopify");
  }
  return out;
}

function formatSampleSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  const formatted = Math.round(n).toLocaleString("en-US");
  return `${formatted} profiles`;
}

function countIssuesByDisplayStatus(issues: DcsIssue[]) {
  let blocked = 0;
  let leaking = 0;
  let opportunity = 0;
  let tracked = 0;
  for (const issue of issues) {
    if (issue.is_optional) {
      opportunity += 1;
    } else if (issue.status === "FAIL") {
      blocked += 1;
    } else if (issue.status === "WARN") {
      leaking += 1;
    } else {
      tracked += 1;
    }
  }
  return { blocked, leaking, opportunity, tracked };
}

function DcsIssueRowActions({
  issue,
  pilots,
  recommendationsPending,
  recommendationsSuccess,
  size = "sm",
}: {
  issue: DcsIssue;
  pilots: UseCasePilotRecommendation[] | undefined;
  recommendationsPending: boolean;
  recommendationsSuccess: boolean;
  size?: "sm" | "default";
}) {
  const checkId = issue.check_id;
  if (!checkId) return null;

  const rowStatus: "FAIL" | "WARN" | "PASS" =
    issue.status === "FAIL" || issue.status === "WARN" ? issue.status : "PASS";

  const ctas = resolveDcsRowCtas({
    checkId,
    status: rowStatus,
    isOptional: issue.is_optional,
    pilots,
    recommendationsPending,
    recommendationsSuccess,
    issue: {
      checkId,
      dimension: issue.dimension,
      fixOwner: issue.fix_owner,
      title: issue.title,
      detail: issue.detail,
      suggestedFix: issue.suggested_fix,
      systemsCompared: issue.systems_compared,
      isOptional: issue.is_optional,
      status: issue.status,
    },
  });

  const ctaClass =
    size === "sm" ? "dcc-fix-cta dcc-fix-cta-sm" : "dcc-fix-cta";
  const arrowClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  if (ctas.pending && !ctas.primary) {
    return (
      <span className="text-[11px] text-muted-foreground">Loading gates…</span>
    );
  }

  if (!ctas.primary) return null;

  const failWarn =
    issue.status === "FAIL" || issue.status === "WARN";

  return (
    <div className="flex flex-col items-end gap-1.5">
      {ctas.primary.kind === "fix" ? (
        <Link
          to="/fix"
          search={{ issue: ctas.primary.checkId }}
          className={ctaClass}
          data-issue-route="data"
        >
          Fix this issue <ArrowRight className={arrowClass} />
        </Link>
      ) : null}
      {ctas.primary.kind === "build" ? (
        <Link
          to={ctas.primary.link.to}
          search={ctas.primary.link.search}
          className={`${ctaClass} build`}
          data-issue-route="workflow"
        >
          {ctas.primary.label} <ArrowRight className={arrowClass} />
        </Link>
      ) : null}
      {ctas.primary.kind === "integrations" ? (
        <Link
          to="/integrations"
          className={ctaClass}
          data-issue-route="security"
        >
          {ctas.primary.label} <ArrowRight className={arrowClass} />
        </Link>
      ) : null}
      {ctas.primary.kind === "passed" ? (
        <span className="text-[11px] font-medium text-muted-foreground">Passed</span>
      ) : null}
      {ctas.pending && failWarn ? (
        <span className="text-[10px] text-muted-foreground">Loading gates…</span>
      ) : null}
      {!ctas.pending && ctas.secondary ? (
        <Link
          to={ctas.secondary.link.to}
          search={ctas.secondary.link.search}
          className="text-[11px] font-medium text-anchor hover:underline"
        >
          Blocks {ctas.secondary.uc}
        </Link>
      ) : null}
    </div>
  );
}

function WorklistIssueDetail({
  checkId,
  listIssue,
  pilots,
  recommendationsPending,
  recommendationsSuccess,
}: {
  checkId: string;
  listIssue: DcsIssue;
  pilots: UseCasePilotRecommendation[] | undefined;
  recommendationsPending: boolean;
  recommendationsSuccess: boolean;
}) {
  const {
    data: detail,
    isPending,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: dcsWorklistIssueQueryKey(checkId),
    queryFn: () => getDcsWorklistIssue(checkId),
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-2 border-t border-border px-4 py-6 text-sm text-muted-foreground sm:pl-14">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading evidence…
      </div>
    );
  }

  if (isError || !detail) {
    return (
      <div className="space-y-3 border-t border-border px-4 py-6 sm:pl-14">
        <p className="text-sm text-muted-foreground">
          Could not load evidence for {checkId}. The check may no longer be FAIL or
          WARN on the latest run.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border px-4 py-4 sm:pl-14">
      <ImpactRibbon worklistDetail={detail} />
      <DiagnoseEvidence detail={detail} />
      <div className="dcc-fix-foot">
        <p className="max-w-xl text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
          {formatCustomerSuggestedFix({
            title: detail.title || listIssue.title,
            detail: detail.detail || listIssue.detail,
            suggested_fix:
              listIssue.suggested_fix || detail.suggested_fix || "",
            status: detail.status || listIssue.status,
            severity: detail.severity || listIssue.severity,
            dimension: detail.dimension ?? listIssue.dimension,
            is_optional: detail.is_optional ?? listIssue.is_optional,
            revenue_impact: detail.revenue_impact ?? listIssue.revenue_impact,
          })}
        </p>
        <DcsIssueRowActions
          issue={listIssue}
          pilots={pilots}
          recommendationsPending={recommendationsPending}
          recommendationsSuccess={recommendationsSuccess}
          size="default"
        />
      </div>
    </div>
  );
}

function DataConsistencyError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-6 shadow-card">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Could not load Data Center
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        The worklist or status could not be loaded. Check your connection and try
        again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

function FailedRunWorklistRow({
  issue,
  rank,
}: {
  issue: DcsIssue;
  rank: number;
}) {
  // No check_id — do not send users to bare /fix. Security copy → Integrations;
  // otherwise Data Center to re-score / re-import.
  const taxonomy = classifyIssueRouteKind(issueRouteSignalsFromDcs(issue));
  const cta =
    taxonomy === "security"
      ? {
          to: "/integrations" as const,
          label: "Open Integrations · reconnect",
          route: "security" as const,
        }
      : {
          to: "/data-consistency" as const,
          label: "Open Data Center · re-score",
          route: "data" as const,
        };

  return (
    <div className="border-l-[3px] border-l-loss bg-[#FDFCF8]">
      <div className="flex gap-3 px-4 py-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="font-display shrink-0 text-2xl tabular text-fog/80">
            {String(rank).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                Use-case {String(rank).padStart(2, "0")} · Run
              </span>
              <StatusBadge status="FAIL" />
            </div>
            <div className="mt-1 text-sm font-semibold">
              {formatExecutiveIssueCard(issue).title}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {formatExecutiveIssueCard(issue).summary}
            </p>
          </div>
        </div>
        <div className="dcc-issue-actions shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Projected impact
            </div>
            <Link
              to={cta.to}
              className="dcc-fix-cta dcc-fix-cta-sm mt-2"
              data-issue-route={cta.route}
              data-failed-run-cta="gap01e-w802"
            >
              {cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataConsistencyPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const checkFromUrl = getCheckIdFromSearch(search);

  const { data: connectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) =>
      isConnectorBootstrapInFlight(query.state.data) ? DCS_STATUS_STALE_MS : false,
  });
  const bootstrapPending = isConnectorBootstrapInFlight(connectors);

  const {
    data: dcsStatus,
    isPending: statusPending,
    isError: statusError,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: DCS_STATUS_QUERY_KEY,
    queryFn: getDcsStatus,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) =>
      getDcsRunningRefetchInterval(query.state.data, Date.now(), {
        expectDcsSoon: bootstrapPending,
      }),
  });

  const isScoreRunning =
    Boolean(dcsStatus?.scheduled) ||
    dcsStatus?.app_access === "soft_locked_running" ||
    dcsStatus?.active_run?.status === "pending" ||
    dcsStatus?.active_run?.status === "running";
  const scoringStuck = isDcsScoringStuck(dcsStatus);

  const {
    data: worklist,
    isPending: worklistPending,
    isError: worklistError,
    isFetching: worklistFetching,
    refetch: refetchWorklist,
  } = useQuery({
    queryKey: DCS_WORKLIST_QUERY_KEY,
    queryFn: getDcsWorklist,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval:
      bootstrapPending || isScoreRunning
        ? scoringStuck
          ? DCS_STALE_POLL_MS
          : DCS_STATUS_STALE_MS
        : false,
  });

  const {
    data: recommendations,
    isPending: recommendationsPending,
    isSuccess: recommendationsSuccess,
  } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  const {
    data: orchPlan,
    isError: orchPlanError,
    isFetching: orchPlanFetching,
    refetch: refetchOrchPlan,
  } = useQuery({
    queryKey: ORCH_PLAN_QUERY_KEY,
    queryFn: getOrchestrationPlan,
    staleTime: ORCH_STALE_MS,
  });

  const rerunMutation = useMutation({
    mutationFn: () => startDcsRun(),
    onSuccess: (data) => {
      pendingFreshImportAckRef.current = true;
      pendingFreshImportRunIdRef.current = data.data_run_id;
      const runLabel = data.dcs_run_id
        ? `Run ${data.dcs_run_id.slice(0, 8)} queued`
        : `Run #${data.data_run_id} queued`;
      rerunToastIdRef.current = toast.success("Verification started", {
        id: "dcs-rerun-started",
        description: `${runLabel} · Manago.ai + Shopify checks.`,
      });
      void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: DCS_WORKLIST_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: DCS_HISTORY_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ORCH_PLAN_QUERY_KEY });
    },
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: DCS_STATUS_QUERY_KEY });
      toast.error("Could not start checks", {
        description: getApiErrorMessage(
          err,
          "Start Redis and Celery, then try again.",
        ),
      });
    },
  });

  const [expandedId, setExpandedId] = useState<string | null>(
    checkFromUrl ?? null,
  );
  const [statusFilter, setStatusFilter] = useState<"All" | DcsIssueStatus>(
    "All",
  );
  const [connectorFilter, setConnectorFilter] =
    useState<ConnectorFilter>("All");
  /** PRD-ORCH-01: Plan is default; Impact keeps revenue sort. */
  const [sortMode, setSortMode] = useState<"plan" | "impact">("plan");
  const [trendPeriod, setTrendPeriod] =
    useState<OverviewPeriod>("Last 30 days");

  useEffect(() => {
    if (checkFromUrl) setExpandedId(checkFromUrl);
  }, [checkFromUrl]);

  const wasScoreRunningRef = useRef(false);
  const pendingFreshImportAckRef = useRef(false);
  const pendingFreshImportRunIdRef = useRef<number | null>(null);
  const rerunToastIdRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (wasScoreRunningRef.current && !isScoreRunning) {
      invalidateAfterDcsRunComplete(queryClient);
    }
    wasScoreRunningRef.current = Boolean(isScoreRunning);
  }, [isScoreRunning, queryClient]);

  const expectFreshImport = hasEligibleConnectedDcsConnectors(connectors);
  const isFreshImportPhase = dcsStatus
    ? isDcsFreshImportPhaseRunning(dcsStatus, {
        expectFreshImport,
      })
    : false;
  const freshImportFailedPlatform = dcsStatus
    ? resolveFreshImportFailedPlatform(dcsStatus)
    : null;
  const freshImportFailedCopy = formatFreshImportFailedCopy(
    freshImportFailedPlatform,
  );
  const showFreshImportFailure = Boolean(
    freshImportFailedCopy &&
      (dcsStatus?.latest_run?.status === "failed" ||
        dcsStatus?.active_run?.status === "failed"),
  );

  useEffect(() => {
    if (!pendingFreshImportAckRef.current || !dcsStatus) return;

    const expectedRunId = pendingFreshImportRunIdRef.current;
    const activeRun = dcsStatus.active_run;
    if (expectedRunId == null || activeRun?.data_run_id !== expectedRunId) return;

    if (hasFreshImportsOnRun(activeRun)) {
      pendingFreshImportAckRef.current = false;
      pendingFreshImportRunIdRef.current = null;
      toast.success("Verification started", {
        id: rerunToastIdRef.current ?? "dcs-rerun-started",
        description:
          "Fetched latest connector data · Manago.ai + Shopify checks running.",
      });
      return;
    }

    if (activeRun.status === "failed" || activeRun.status === "succeeded") {
      pendingFreshImportAckRef.current = false;
      pendingFreshImportRunIdRef.current = null;
    }
  }, [dcsStatus]);

  const scoreReady = dcsStatus ? isDcsScoreReady(dcsStatus) : false;

  const periodWindow = useMemo(
    () => resolveOverviewPeriodWindow(trendPeriod),
    [trendPeriod],
  );

  const exportFixPlanMutation = useMutation({
    mutationFn: () =>
      downloadOverviewBrief({
        since: periodWindow.since.toISOString(),
        until: periodWindow.until.toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY,
      });
    },
    onError: (error) => {
      toast.error("Could not export fix plan", {
        description: assessmentReportErrorMessage(error),
      });
    },
  });
  const exportFixPlanBusy = exportFixPlanMutation.isPending;
  const exportFixPlanDisabled = !scoreReady || exportFixPlanBusy;

  const headline =
    scoreReady && dcsStatus
      ? (displayHeadlineScore(dcsStatus) ?? worklist?.headline_score ?? null)
      : dcsStatus
        ? displayHeadlineScore(dcsStatus)
        : null;
  const score =
    scoreReady && headline != null ? Math.round(headline) : null;
  const scoreDisplay = score != null ? formatDcsScore(score) : null;
  const isCalculating = dcsStatus?.score_display.state === "calculating";
  const threshold = DCS_BUILD_READY_THRESHOLD;
  const pointsToReady =
    score != null ? Math.max(0, threshold - score) : threshold;
  const isReady = score != null && score >= threshold;
  const arcOffset = score != null ? CIRC * (1 - score / 100) : CIRC;
  const arcColor = dcsScoreDisplayColor(score);

  const { data: scoreHistoryData } = useQuery({
    queryKey: [
      ...DCS_HISTORY_QUERY_KEY,
      "data-center",
      trendPeriod,
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

  const historyInWindow = useMemo(() => {
    return (scoreHistoryData?.points ?? []).filter((point) => {
      const at = new Date(point.at).getTime();
      return (
        at >= periodWindow.since.getTime() && at <= periodWindow.until.getTime()
      );
    });
  }, [scoreHistoryData?.points, periodWindow]);

  const trendChartData = useMemo(
    () => aggregateDcsTrendPoints(historyInWindow, periodWindow.granularity),
    [historyInWindow, periodWindow.granularity],
  );

  const liveTrendDelta = useMemo(() => {
    const fromPeriod = resolvePeriodHeadlineDelta(periodCompare);
    if (fromPeriod) return fromPeriod;
    return computeTrendDelta(historyInWindow, scoreReady ? score : null);
  }, [periodCompare, historyInWindow, scoreReady, score]);

  const dimensionDeltas = useMemo(
    () =>
      computeDimensionDeltas(
        dcsStatus?.dimensions,
        historyInWindow,
      ),
    [dcsStatus?.dimensions, historyInWindow],
  );

  const trendPrevious =
    trendChartData.length >= 2
      ? Math.round(trendChartData[0]!.score)
      : null;
  const trendLatest =
    trendChartData.length > 0
      ? Math.round(trendChartData[trendChartData.length - 1]!.score)
      : null;
  const trendCurrent = score ?? trendLatest;
  const consecutiveRunDiffLabel = formatConsecutiveRunDiffLabel(
    dcsStatus?.latest_run?.run_diff,
  );

  const issues = worklist?.issues ?? [];
  const failCount = issues.filter((i) => i.status === "FAIL").length;
  const warnCount = issues.filter((i) => i.status === "WARN").length;
  const planFixCount = fixTasksFromPlan(orchPlan).length;
  // Plan sort when selected and we have FIX tasks (keep Impact order if plan empty/pending/error).
  const usePlanSort = sortMode === "plan" && planFixCount > 0;
  const worklistRankTitle = usePlanSort
    ? "Ranked by onboarding plan"
    : "Ranked by projected impact";

  const rankedIssues = useMemo(() => {
    const filtered = issues
      .filter((i) =>
        statusFilter === "All" ? true : i.status === statusFilter,
      )
      .filter((i) =>
        connectorFilter === "All"
          ? true
          : issueConnectors(i).includes(connectorFilter),
      );
    if (usePlanSort) {
      return sortIssuesByPlanOrder(filtered, orchPlan);
    }
    return sortDcsWorklistIssues(filtered);
  }, [issues, statusFilter, connectorFilter, usePlanSort, orchPlan]);

  const selectCheck = (checkId: string | null) => {
    setExpandedId(checkId);
    void navigate({
      search: (prev) => {
        const next = { ...prev };
        if (checkId) next.check = checkId;
        else delete next.check;
        return next;
      },
      replace: true,
    });
  };

  const isLoading =
    (statusPending && !dcsStatus) || (worklistPending && !worklist);
  const isError =
    (statusError && !dcsStatus) || (worklistError && !worklist);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#dcs-issues") return;
    if (isLoading) return;
    const el = document.getElementById("dcs-issues");
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [isLoading, worklist]);

  const retryAll = () => {
    void refetchStatus();
    void refetchWorklist();
  };

  if (isLoading) {
    return (
      <>
        <KlintsLoader label="Loading Data Center…" />
        <AppShell
          title="Data Center"
          subtitle="Integrity score · readiness gate · worklist"
        >
          {null}
        </AppShell>
      </>
    );
  }

  if (isError) {
    return (
      <AppShell
        title="Data Center"
        subtitle="Integrity score · readiness gate · worklist"
      >
        <DataConsistencyError
          onRetry={retryAll}
          retrying={statusFetching || worklistFetching}
        />
      </AppShell>
    );
  }

  const checkSummary = dcsStatus?.check_summary;
  const deterministicCheckCount =
    (checkSummary?.PASS ?? 0) +
    (checkSummary?.FAIL ?? 0) +
    (checkSummary?.WARN ?? 0) +
    (checkSummary?.NOT_CONNECTED ?? 0) +
    (checkSummary?.NOT_APPLICABLE ?? 0);
  const anomalyDetectorCount = checkSummary?.UNKNOWN ?? 0;
  const issueStatusCounts = countIssuesByDisplayStatus(issues);
  const connectedCount = (connectors ?? []).filter(
    (c) => c.status === "connected",
  ).length;
  const connectorTotal = (connectors ?? []).length;

  return (
    <AppShell
      title="Data Center"
      subtitle="Integrity score · readiness gate · worklist"
    >
      <div className="dcc-page">
        <PageTitle
          kicker="Phase 1 · Diagnose · the single entry point to every fix"
          title="Data Consistency Score"
          description="Deterministic checks plus drift detection across Manago.ai and Shopify. Pick an issue to light the fix flow."
          actions={
            <>
              <button
                type="button"
                disabled={rerunMutation.isPending || isScoreRunning}
                onClick={() => rerunMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:pointer-events-none disabled:opacity-60"
              >
                {rerunMutation.isPending || isScoreRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {isFreshImportPhase
                  ? "Fetching data…"
                  : isScoreRunning
                    ? "Checks running…"
                    : "Re-run checks"}
              </button>
              <button
                type="button"
                disabled={exportFixPlanDisabled}
                onClick={() => exportFixPlanMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
              >
                {exportFixPlanBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Export fix plan
              </button>
            </>
          }
        />

        {isFreshImportPhase ? (
          <div
            className="mt-4 rounded-md border border-border bg-sand px-4 py-3 text-sm text-ink"
            role="status"
          >
            <p className="font-medium">Fetching connector data</p>
            <p className="mt-1 text-fog">
              {formatFreshImportPhaseCopy()} Re-run pulls fresh Shopify and Manago
              data before scoring.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              “Refresh status” only reloads progress on this page — it does not
              fetch new connector data.
            </p>
          </div>
        ) : null}

        {showFreshImportFailure ? (
          <div
            className="mt-4 rounded-md border border-loss/30 bg-loss-soft px-4 py-3 text-sm text-ink"
            role="alert"
          >
            <p className="font-medium">Fresh import failed</p>
            <p className="mt-1 text-fog">{freshImportFailedCopy}</p>
          </div>
        ) : null}

        {scoringStuck ? (
          <div
            className="mt-4 rounded-md border border-border bg-sand px-4 py-3 text-sm text-ink"
            role="status"
          >
            <p className="font-medium">Scoring unavailable</p>
            <p className="mt-1 text-fog">
              Checks have been waiting for a worker. Start Redis and Celery, then
              click Re-run — or refresh status to clear a stuck run. Refresh
              status only polls this page; it does not fetch connector data.
            </p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-sm font-medium hover:bg-sand"
              onClick={() => {
                void refetchStatus();
                void refetchWorklist();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh status
            </button>
          </div>
        ) : null}

        <div className="dcc-grid mt-2">
          <div className="dcc-card">
            <div className="dcc-score-hero">
              <div className="dcc-arc-wrap">
                <svg width="104" height="104" viewBox="0 0 120 120" aria-hidden>
                  <circle
                    cx="60"
                    cy="60"
                    r="51.4"
                    fill="none"
                    stroke="#E8E4D9"
                    strokeWidth="7"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="51.4"
                    fill="none"
                    stroke={arcColor}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={arcOffset}
                    transform="rotate(-90 60 60)"
                    className={score == null ? "opacity-40" : ""}
                  />
                </svg>
                <div className="dcc-arc-num">
                  {score != null ? (
                    <>
                      <div className="num">{scoreDisplay}</div>
                      <div className="denom">/ 100</div>
                    </>
                  ) : (
                    <div className="px-2 text-center text-[11px] font-medium leading-snug text-muted-foreground">
                      {isFreshImportPhase ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {formatFreshImportPhaseCopy()}
                        </span>
                      ) : showFreshImportFailure && freshImportFailedPlatform ? (
                        <span className="text-loss">
                          {formatFreshImportPlatformLabel(freshImportFailedPlatform)}{" "}
                          import failed
                        </span>
                      ) : isCalculating ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Calculating…
                        </span>
                      ) : (
                        dcsStatus?.score_display.label ?? "Not calculated"
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="dcc-trend-block">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                      Score trend · {periodWindow.periodLabel}
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="sr-only">Trend period</span>
                      <select
                        value={trendPeriod}
                        onChange={(e) =>
                          setTrendPeriod(e.target.value as OverviewPeriod)
                        }
                        className="rounded border border-border bg-elevated px-2 py-0.5 text-[11px] font-medium text-foreground"
                      >
                        {overviewPeriods.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="dcc-trend-head mt-2">
                    <span className="font-display text-base font-semibold tracking-tight">
                      {trendPrevious != null && trendCurrent != null ? (
                        <>
                          {formatDcsScore(trendPrevious)} →{" "}
                          {formatDcsScore(trendCurrent)}
                        </>
                      ) : trendCurrent != null ? (
                        formatDcsScore(trendCurrent)
                      ) : (
                        "—"
                      )}
                    </span>
                    {liveTrendDelta.delta != null &&
                    liveTrendDelta.direction !== "flat" ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${
                          liveTrendDelta.direction === "down"
                            ? "bg-risk-soft text-risk"
                            : "bg-revenue-soft text-revenue"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            liveTrendDelta.direction === "down"
                              ? "bg-risk"
                              : "bg-revenue"
                          }`}
                        />
                        {liveTrendDelta.delta >= 0 ? "+" : ""}
                        {formatDisplayCount(liveTrendDelta.delta)} over{" "}
                        {periodWindow.spanDays} days
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded bg-sand px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-fog" />
                        {scoreReady
                          ? liveTrendDelta.direction === "flat"
                            ? `No change over ${periodWindow.spanDays} days`
                            : "No history yet"
                          : "Awaiting score"}
                      </span>
                    )}
                  </div>
                </div>
                <DcsTrendChart
                  tone="light"
                  data={trendChartData}
                  threshold={threshold}
                />
              </div>
            </div>

            <div className="dcc-readiness">
              <div className="dcc-rg-head">
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                  Activation readiness
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${
                    isReady
                      ? "bg-revenue-soft text-revenue"
                      : "bg-risk-soft text-risk"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isReady ? "bg-revenue" : "bg-risk"
                    }`}
                  />
                  {score == null
                    ? "Score not ready"
                    : isReady
                      ? "Build-ready"
                      : `${pointsToReady} point${pointsToReady === 1 ? "" : "s"} to build-ready`}
                </span>
              </div>
              <div className="dcc-rg-bar">
                <div className="dcc-rg-zone blocked" />
                <div className="dcc-rg-zone limited" />
                <div className="dcc-rg-zone ready" />
                <div className="dcc-rg-threshold" />
                <div
                  className={`dcc-rg-marker ${isReady ? "is-ready" : ""}`}
                  style={{ left: `${score ?? 0}%` }}
                />
              </div>
              <div className="dcc-rg-labels">
                <span style={{ width: "50%" }}>Blocked</span>
                <span style={{ width: "20%", textAlign: "center" }}>
                  Limited
                </span>
                <span style={{ width: "30%", textAlign: "right" }}>
                  Build-ready
                </span>
              </div>
              <div className="dcc-rg-caption">
                The Data Consistency Score is the gate for building and handing
                off workflows.{" "}
                {score == null ? (
                  <>Score not yet calculated — repair connectors to unlock scoring.</>
                ) : isReady ? (
                  <>
                    At <strong>{scoreDisplay}</strong> the data is consistent
                    enough to build on.
                  </>
                ) : (
                  <>
                    At <strong>{scoreDisplay}</strong> the data is not yet
                    consistent enough to build on.{" "}
                    <strong>Fix the checks below.</strong>
                  </>
                )}
              </div>
              <div className="dcc-rg-unlocks">
                <div className="dcc-rg-unlock">
                  <Lock />
                  <span>
                    Workflow briefs build on validated data — not on figures the
                    score still disputes
                  </span>
                </div>
                <div className="dcc-rg-unlock">
                  <Lock />
                  <span>
                    QA gates can pass, so validated specs reach the Manago.ai
                    agent
                  </span>
                </div>
                <div className="dcc-rg-unlock">
                  <Lock />
                  <span>
                    Validated specs are cleared for handoff — every change still
                    passes a human approval gate
                  </span>
                </div>
              </div>
            </div>
          </div>

          <aside className="dcc-rail dcc-stage">
            <div className="dcc-label">Why this score</div>
            <h3>Deterministic checks plus drift detection</h3>
            <p>
              The score blends deterministic consistency checks across 7
              dimensions (identity, consent, segment parity) with statistical
              drift detectors (event latency, schema variance, business
              plausibility). Expand any dimension below to see its checks.
            </p>
            <div className="dcc-stat-row">
              <span className="k">Deterministic checks</span>
              <span className="v">
                {deterministicCheckCount > 0
                  ? formatDisplayCount(deterministicCheckCount)
                  : "—"}
              </span>
            </div>
            <div className="dcc-stat-row">
              <span className="k">Anomaly detectors</span>
              <span className="v">
                {anomalyDetectorCount > 0
                  ? formatDisplayCount(anomalyDetectorCount)
                  : "—"}
              </span>
            </div>
            <div className="dcc-stat-row">
              <span className="k">Connectors live</span>
              <span className="v">
                {formatDisplayCount(connectedCount)} / {connectorTotal ? formatDisplayCount(connectorTotal) : "—"}
              </span>
            </div>
            <div className="dcc-stat-row">
              <span className="k">Last full sweep</span>
              <span
                className="v"
                title={dcsStatus?.latest_run?.finished_at ?? undefined}
              >
                {formatDisplayWhen(dcsStatus?.latest_run?.finished_at)}
              </span>
            </div>
            {consecutiveRunDiffLabel ? (
              <div className="dcc-stat-row">
                <span className="k">Vs prior run</span>
                <span className="v">{consecutiveRunDiffLabel}</span>
              </div>
            ) : null}
            <div className="dcc-stat-row">
              <span className="k">Sample size</span>
              <span className="v">
                {formatSampleSize(dcsStatus?.sample_size)}
              </span>
            </div>
            <div className="dcc-mini-charts">
              <div className="dcc-label">Open issues by status</div>
              <DcsStatusChart issueCounts={issueStatusCounts} />
            </div>
            <p className="dcc-rail-foot">
              A score below {threshold} indicates the data is not yet consistent
              enough to build and hand off workflows on.
            </p>
          </aside>
        </div>

        <Section
          title="Data Consistency Score by dimension"
          description="Seven sub-scores · weakest marked · expand a tile for checks"
          className="mt-6"
        >
          <div className="p-4">
            {scoreReady && dcsStatus?.dimensions ? (
              <DcsSubScores
                variant="tiles"
                expandable
                liveDimensions={dcsStatus.dimensions}
                dimensionChecks={dcsStatus.dimension_checks}
                dimensionDeltas={dimensionDeltas}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Dimension scores appear when the headline score is ready. Expand
                tiles below once scoring completes.
              </p>
            )}
          </div>
        </Section>

        <Section
          id="dcs-issues"
          title={worklistRankTitle}
          description="Next best actions"
          className="mt-6 scroll-mt-24"
          action={
            <span className="text-[11px] font-medium text-loss">
              {failCount} blocked · {warnCount} leaking
            </span>
          }
        >
          <div className="dcc-howto">
            {usePlanSort
              ? (
                <>
                  How to use this: pick the top plan item → review the evidence →
                  press <strong>Fix this issue</strong>.
                </>
              ) : (
                <>
                  How to use this: pick the highest-impact issue → review the evidence →
                  press <strong>Fix this issue</strong>.
                </>
              )}
          </div>
          <div className="dcc-filters">
            <label>
              <span className="dcc-filter-label">Sort</span>
              <select
                value={sortMode}
                onChange={(e) =>
                  setSortMode(e.target.value as "plan" | "impact")
                }
              >
                <option value="plan">Plan (default)</option>
                <option value="impact">Impact</option>
              </select>
            </label>
            <label>
              <span className="dcc-filter-label">Status</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "All" | DcsIssueStatus)
                }
              >
                <option value="All">All ({issues.length})</option>
                <option value="FAIL">FAIL ({formatDisplayCount(failCount)})</option>
                <option value="WARN">WARN ({formatDisplayCount(warnCount)})</option>
              </select>
            </label>
            <label>
              <span className="dcc-filter-label">Connector</span>
              <select
                value={connectorFilter}
                onChange={(e) =>
                  setConnectorFilter(e.target.value as ConnectorFilter)
                }
              >
                <option value="All">All ({issues.length})</option>
                <option value="Manago.ai">Manago.ai</option>
                <option value="Shopify">Shopify</option>
              </select>
            </label>
            {orchPlanError ? (
              <button
                type="button"
                className="self-end rounded-md border border-border bg-elevated px-3 py-2 text-xs font-medium hover:bg-sand disabled:opacity-60"
                disabled={orchPlanFetching}
                onClick={() => void refetchOrchPlan()}
              >
                {orchPlanFetching ? "Retrying…" : "Retry plan"}
              </button>
            ) : null}
          </div>
          <div className="divide-y divide-border">
            {rankedIssues.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No issues match these filters.
              </div>
            )}
            {rankedIssues.map((issue, idx) => {
              if (!issue.check_id) {
                return (
                  <FailedRunWorklistRow
                    key="dcs-run-failed"
                    issue={issue}
                    rank={idx + 1}
                  />
                );
              }
              const checkId = issue.check_id;
              const open = expandedId === checkId;
              const exec = formatExecutiveIssueCard(issue, idx);
              const dimensionLabel =
                issue.dimension?.replace(/^\d+\s+/, "").trim() ||
                exec.areaBadge;
              const connectorsLabel = issueConnectors(issue).join(" · ");
              return (
                <div
                  key={checkId}
                  className={`border-l-[3px] ${issueBorderClass(issue.status)} ${
                    open ? "bg-[#FDFCF8]" : ""
                  }`}
                >
                  <div className="flex gap-3 px-4 py-4">
                    <button
                      type="button"
                      onClick={() => selectCheck(open ? null : checkId)}
                      className="min-w-0 flex-1 text-left hover:opacity-90"
                      aria-expanded={open}
                    >
                      <div className="flex gap-3">
                        <span className="font-display shrink-0 text-2xl tabular text-fog/80">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="dcc-issue-meta min-w-0 flex-1">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                                Use-case {String(idx + 1).padStart(2, "0")} ·{" "}
                                {dimensionLabel}
                              </span>
                              <StatusBadge status={issue.status} />
                              {issue.is_optional ? (
                                <span className="text-[10px] text-muted-foreground">
                                  Optional
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm font-semibold">
                              {exec.title}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {exec.summary}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span>{connectorsLabel}</span>
                              <span>·</span>
                              <span>
                                Severity {severityLabel(issue.severity)}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="dcc-blocks-label">Affects</div>
                            <div className="text-[13px] font-medium leading-snug text-foreground">
                              {formatCustomerSuggestedFix(issue)}
                            </div>
                            <div className="mt-2">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${
                                  issue.status === "FAIL"
                                    ? "bg-loss-soft text-loss"
                                    : "bg-risk-soft text-risk"
                                }`}
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                {issue.status === "FAIL"
                                  ? "Blocks build-ready"
                                  : "Leaking consistency"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>

                    <div className="dcc-issue-actions shrink-0">
                      <button
                        type="button"
                        onClick={() => selectCheck(open ? null : checkId)}
                        className="text-right"
                      >
                        <Money
                          value={formatDcsRevenue(
                            issue.revenue_impact,
                            issue.currency,
                          )}
                          tone={
                            issue.revenue_impact > 0 ? "revenue" : "neutral"
                          }
                          size="lg"
                        />
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Projected impact
                        </div>
                        <span className="mt-1.5 inline-flex items-center justify-end gap-1 text-xs font-medium text-primary">
                          {open ? "Hide details" : "Expand details"}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          />
                        </span>
                      </button>

                      {!open ? (
                        <DcsIssueRowActions
                          issue={issue}
                          pilots={recommendations?.pilots}
                          recommendationsPending={recommendationsPending}
                          recommendationsSuccess={recommendationsSuccess}
                        />
                      ) : null}
                    </div>
                  </div>
                  {open ? (
                    <>
                      <div className="border-t border-border px-4 pt-3 sm:pl-14">
                        <div className="dcc-blocks-label">Explanation</div>
                        <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
                          {formatCustomerIssueExplanation(issue)}
                        </p>
                      </div>
                      <WorklistIssueDetail
                        checkId={checkId}
                        listIssue={issue}
                        pilots={recommendations?.pilots}
                        recommendationsPending={recommendationsPending}
                        recommendationsSuccess={recommendationsSuccess}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
