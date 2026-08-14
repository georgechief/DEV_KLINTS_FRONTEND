import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section } from "@/components/klints/primitives";
import {
  formatTrackerImpact,
  workflowStateLabel,
  type TrackerReadiness,
  type TrackerRow,
  type TrackerWorkflowState,
} from "@/lib/klints-data";
import {
  DCS_WORKLIST_QUERY_KEY,
  formatDcsRevenue,
  formatExecutiveIssueCard,
  formatSystemsCompared,
  formatWorklistOwner,
  getDcsWorklist,
  resolveIssueDisplayCurrency,
  resolveIssueRevenueAmount,
  severityLabel,
  sortDcsWorklistIssues,
  stripTechnicalDiagnostics,
  type DcsBusinessImpact,
  type DcsIssue,
} from "@/lib/dcs";
import {
  emptyPlanReasonLabel,
  fixTasksFromPlan,
  formatPriorityScore,
  getOrchestrationPlan,
  ORCH_PLAN_QUERY_KEY,
  ORCH_STALE_MS,
  type OrchPlanTask,
} from "@/lib/orchestration";
import { getIssueById } from "@/lib/fix-flow";
import {
  getUseCase,
  getUseCaseRecommendations,
  parseUseCaseSearch,
  pilotStatusLabel,
  pilotStatusTone,
  UC_DETAIL_QUERY_KEY,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  type UseCaseBlocker,
  type UseCaseCheckResult,
  type UseCasePilotRecommendation,
  type UseCasePilotStatus,
} from "@/lib/use-cases";
import { getApiErrorMessage } from "@/lib/connectors";
import { ArrowRight, Loader2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Layout SoT: Frontend_design / original-designs opportunities.tsx
 * UC-01B: tracker PRIMARY · ORCH-01 Plan queue · MVP1 pilots SECONDARY · no AF gaps table here
 */
export const Route = createFileRoute("/opportunities")({
  validateSearch: parseUseCaseSearch,
  head: () => ({
    meta: [
      { title: "Opportunity tracker — Klints" },
      {
        name: "description",
        content:
          "Every fix, its phase, and its result — est. vs measured impact, live or not.",
      },
    ],
  }),
  component: OpportunityTrackerPage,
});

type StatusFilter = "all" | TrackerReadiness;
type SortKey = "newest" | "est" | "real";
type DateFilter = "all" | "30d" | "90d" | "365d";
type LiveFilter = "all" | TrackerWorkflowState;

function daysSince(iso: string): number {
  const d = new Date(iso);
  const today = new Date();
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/** Live DCS check_ids open Data Center until Fix binds live worklist (same as Overview NBA). */
function planOpenTarget(checkId: string): {
  to: "/fix" | "/data-consistency";
  search: { issue: string } | { check: string };
} {
  if (getIssueById(checkId)) {
    return { to: "/fix", search: { issue: checkId } };
  }
  return { to: "/data-consistency", search: { check: checkId } };
}

type LiveTrackerRow = TrackerRow & {
  currency: string | null;
  systemsLabel: string;
  fixType: string;
  fixOwnerRaw: string;
  detailPreview: string;
};

/** Map live DCS worklist into the Frontend_design tracker row shape. */
function worklistToTrackerRows(
  issues: DcsIssue[],
  businessImpact: DcsBusinessImpact | null | undefined,
): LiveTrackerRow[] {
  return sortDcsWorklistIssues(issues).map((issue, index) => {
    const checkId =
      issue.check_id?.trim() ||
      issue.run_issue_id?.trim() ||
      `issue-${index}`;
    const exec = formatExecutiveIssueCard(issue, index, businessImpact);
    const amount = resolveIssueRevenueAmount(issue, businessImpact);
    const currency = resolveIssueDisplayCurrency(issue, businessImpact);
    const systems = formatSystemsCompared(issue.systems_compared);
    const area =
      issue.dimension?.replace(/^\d+\s+/, "").trim() ||
      (issue.is_optional ? "Opportunity" : "Integrity");
    const readiness: TrackerReadiness = issue.is_optional ? "queued" : "inflow";
    const fixType = issue.fix_type?.trim() || "";
    const fixOwnerRaw = issue.fix_owner?.trim() || "";
    // Frontend_design status vocabulary (phase language), not FAIL/WARN jargon.
    const status = issue.is_optional
      ? "Queued · ready"
      : "Phase 2 · Fix";
    // Design meta = short human line (systems · area), not a field dump.
    const metaParts = [
      systems || null,
      area,
      severityLabel(issue.severity),
    ].filter(Boolean);
    const detailPreview = "";

    return {
      id: checkId,
      title: exec.title || stripTechnicalDiagnostics(issue.title) || checkId,
      meta: metaParts.join(" · "),
      handedOff: null,
      workflowState: "pending-handoff" as TrackerWorkflowState,
      endedDate: null,
      estImpact: {
        value: amount > 0 ? amount : null,
        type: "revenue" as const,
        cadence: amount > 0 ? ("/q" as const) : null,
      },
      realImpact: {
        value: null,
        type: "revenue" as const,
        cadence: null,
      },
      status,
      readiness,
      owner: formatWorklistOwner(issue),
      issueId: checkId,
      currency,
      systemsLabel: systems,
      fixType,
      fixOwnerRaw,
      detailPreview,
    };
  });
}

function statusChipClass(tone: ReturnType<typeof pilotStatusTone>): string {
  switch (tone) {
    case "ready":
      return "bg-revenue-soft text-revenue";
    case "risk":
      return "bg-loss-soft text-loss";
    case "warn":
      return "bg-risk-soft text-risk";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function checkResultClass(result: string): string {
  const r = result.toUpperCase();
  if (r === "PASS") return "text-revenue";
  if (r === "WARN") return "text-risk";
  if (r === "FAIL") return "text-loss";
  return "text-muted-foreground";
}

function BlockerDeepLink({ blocker }: { blocker: UseCaseBlocker }) {
  const label = blocker.detail;
  if (blocker.check_id) {
    return (
      <Link
        to="/data-consistency"
        search={{ issue: blocker.check_id }}
        className="text-primary underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    );
  }
  if (blocker.href === "/lifecycle" || blocker.code === "architecture_mode") {
    return (
      <Link
        to="/lifecycle"
        className="text-primary underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    );
  }
  if (
    blocker.href === "/data-consistency" ||
    blocker.code === "min_dcs" ||
    blocker.href?.startsWith("/data-consistency")
  ) {
    const issueMatch = blocker.href?.match(/[?&]issue=([^&]+)/);
    const issue = issueMatch ? decodeURIComponent(issueMatch[1]) : undefined;
    return (
      <Link
        to="/data-consistency"
        search={issue ? { issue } : {}}
        className="text-primary underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    );
  }
  return <span>{label}</span>;
}

function OpportunityTrackerPage() {
  const { uc } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const {
    data: worklist,
    isPending: trackerPending,
    isError: trackerError,
    error: trackerErr,
    refetch: refetchTracker,
    isFetching: trackerFetching,
  } = useQuery({
    queryKey: DCS_WORKLIST_QUERY_KEY,
    queryFn: getDcsWorklist,
    staleTime: 8_000,
  });

  const {
    data: orchPlan,
    isPending: planPending,
    isError: planError,
    error: planErr,
    refetch: refetchPlan,
    isFetching: planFetching,
  } = useQuery({
    queryKey: ORCH_PLAN_QUERY_KEY,
    queryFn: getOrchestrationPlan,
    staleTime: ORCH_STALE_MS,
  });

  const planFixTasks = useMemo(() => fixTasksFromPlan(orchPlan), [orchPlan]);

  const trackerSource = useMemo(
    () =>
      worklistToTrackerRows(worklist?.issues ?? [], worklist?.business_impact),
    [worklist],
  );

  const {
    data: recommendations,
    isPending: pilotsPending,
    isError: pilotsError,
    error: pilotsErr,
    refetch: refetchPilots,
    isFetching: pilotsFetching,
  } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  const pilots = recommendations?.pilots ?? [];
  const selectedPilot = useMemo(
    () =>
      uc
        ? pilots.find((p) => p.use_case_id.toUpperCase() === uc.toUpperCase())
        : undefined,
    [pilots, uc],
  );

  const {
    data: detail,
    isPending: detailPending,
    isError: detailError,
    error: detailErr,
  } = useQuery({
    queryKey: [...UC_DETAIL_QUERY_KEY, uc],
    queryFn: () => getUseCase(uc!),
    enabled: Boolean(uc),
    staleTime: UC_STALE_MS,
  });

  const closeDetail = () => {
    void navigate({ to: "/opportunities", search: {}, replace: true });
  };

  const openDetail = (useCaseId: string) => {
    void navigate({
      to: "/opportunities",
      search: { uc: useCaseId },
      replace: false,
    });
  };

  const counts = useMemo(() => {
    const inflow = trackerSource.filter((r) => r.readiness === "inflow").length;
    const queued = trackerSource.filter((r) => r.readiness === "queued").length;
    const done = trackerSource.filter((r) => r.readiness === "done");
    const measured = done.reduce((s, r) => s + (r.realImpact.value ?? 0), 0);
    const estimated = done.reduce((s, r) => s + (r.estImpact.value ?? 0), 0);
    return { inflow, queued, done: done.length, measured, estimated };
  }, [trackerSource]);

  const rows = useMemo(() => {
    let list = [...trackerSource];

    if (statusFilter !== "all") {
      list = list.filter((r) => r.readiness === statusFilter);
    }
    if (liveFilter !== "all") {
      list = list.filter((r) => r.workflowState === liveFilter);
    }
    if (dateFilter !== "all") {
      const maxDays = dateFilter === "30d" ? 30 : dateFilter === "90d" ? 90 : 365;
      list = list.filter((r) => {
        if (!r.handedOff) return false;
        return daysSince(r.handedOff) <= maxDays;
      });
    }

    if (sort === "est") {
      list.sort((a, b) => (b.estImpact.value ?? 0) - (a.estImpact.value ?? 0));
    } else if (sort === "real") {
      list.sort((a, b) => {
        const av = a.realImpact.value;
        const bv = b.realImpact.value;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
    } else {
      // Open issues first by est impact (no handoff dates yet from orchestration)
      list.sort((a, b) => (b.estImpact.value ?? 0) - (a.estImpact.value ?? 0));
    }
    return list;
  }, [trackerSource, statusFilter, liveFilter, dateFilter, sort]);

  const activeFilters =
    (statusFilter !== "all" ? 1 : 0) +
    (liveFilter !== "all" ? 1 : 0) +
    (dateFilter !== "all" ? 1 : 0) +
    (sort !== "newest" ? 1 : 0);

  const clearFilters = () => {
    setStatusFilter("all");
    setLiveFilter("all");
    setDateFilter("all");
    setSort("newest");
  };

  const selectClass =
    "mt-1 w-full min-w-[132px] cursor-pointer rounded-md border border-primary/20 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-foreground outline-none hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15";

  const summary = recommendations?.summary;
  const sheetOpen = Boolean(uc);

  return (
    <AppShell title="Opportunity tracker" subtitle="Results loop · est. vs real">
      <PageTitle
        kicker="Reference · opportunity tracker"
        title="Every fix, its phase, and its result"
        description="In progress, queued, and done — estimated impact vs what measured once live."
        actions={
          activeFilters > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-sm hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          ) : undefined
        }
      />

      {/* PRIMARY — Frontend_design tracker composition · live DCS worklist */}
      <div className="mb-5 grid grid-cols-3 gap-2.5 md:gap-3">
        <div className="rounded-lg border border-border bg-elevated p-3.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            In fix flow now
          </div>
          <div className="font-display mt-1 text-2xl tabular">
            {trackerPending ? "—" : counts.inflow}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Not yet live · still in Diagnose→Handoff
          </div>
        </div>
        <div className="rounded-lg border border-border bg-elevated p-3.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Queued
          </div>
          <div className="font-display mt-1 text-2xl tabular">
            {trackerPending ? "—" : counts.queued}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Optional / awaiting capacity · est. impact only
          </div>
        </div>
        <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-3.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Completed · last 90 days
          </div>
          <div className="font-display mt-1 text-2xl tabular">
            {trackerPending ? "—" : counts.done}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {counts.measured > 0
              ? `€${Math.round(counts.measured / 1000)}K real`
              : "Measured impact after handoff goes live"}
          </div>
        </div>
      </div>

      <Section
        title="Tracker"
        description={
          trackerPending
            ? "Loading live issues from Data Center…"
            : trackerError
              ? "Could not load live issues"
              : `${rows.length} of ${trackerSource.length} · Est. from Data Center · Real after live handoff`
        }
        action={
          <div className="flex flex-wrap items-end justify-end gap-2">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={selectClass}
              >
                <option value="all">All ({trackerSource.length})</option>
                <option value="inflow">In fix flow ({counts.inflow})</option>
                <option value="queued">Queued ({counts.queued})</option>
                <option value="done">Completed ({counts.done})</option>
              </select>
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
              Live?
              <select
                value={liveFilter}
                onChange={(e) => setLiveFilter(e.target.value as LiveFilter)}
                className={selectClass}
              >
                <option value="all">All</option>
                <option value="active">Active · live</option>
                <option value="pending-handoff">Not yet live</option>
                <option value="in-build">In build</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
              Handed off
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className={selectClass}
              >
                <option value="all">All time</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="365d">Last 12 months</option>
              </select>
            </label>
            <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className={selectClass}
              >
                <option value="newest">By est. impact</option>
                <option value="est">Highest est. impact</option>
                <option value="real">Highest real impact</option>
              </select>
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          {trackerPending ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading live tracker…
            </div>
          ) : trackerError ? (
            <div className="space-y-3 px-4 py-8">
              <p className="text-sm text-muted-foreground">
                {getApiErrorMessage(trackerErr, "Could not load Data Center worklist.")}
              </p>
              <button
                type="button"
                onClick={() => void refetchTracker()}
                disabled={trackerFetching}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
              >
                {trackerFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Retry
              </button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Issue / opportunity</th>
                  <th className="px-3 py-2.5 font-medium">Handed off</th>
                  <th className="px-3 py-2.5 font-medium">Live?</th>
                  <th className="px-3 py-2.5 text-right font-medium">Est. impact</th>
                  <th className="px-3 py-2.5 text-right font-medium">Real impact</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <TrackerTableRow key={row.id} row={row} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {trackerSource.length === 0
                        ? "No open Data Center issues right now."
                        : "Nothing matches these filters. "}
                      {trackerSource.length > 0 ? (
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={clearFilters}
                        >
                          Clear filters
                        </button>
                      ) : (
                        <Link
                          to="/data-consistency"
                          className="font-medium text-primary hover:underline"
                        >
                          Open Data Center
                        </Link>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* ORCH-01 — Plan queue (after tracker, before pilots) */}
      <Section
        id="plan-queue"
        title="Plan queue"
        description={
          planPending
            ? "Loading onboarding plan…"
            : planError
              ? "Could not load plan"
              : planFixTasks.length > 0
                ? `${planFixTasks.length} open fix task${planFixTasks.length === 1 ? "" : "s"} · ordered by priority`
                : emptyPlanReasonLabel(orchPlan?.reason ?? null)
        }
        className="mt-6 scroll-mt-24"
        action={
          <Link
            to="/data-consistency"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary"
          >
            Open Data Center <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        <div className="px-5 py-4">
          {planPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading plan…
            </div>
          ) : planError ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {getApiErrorMessage(
                  planErr,
                  "Could not load the onboarding plan.",
                )}
              </p>
              <button
                type="button"
                onClick={() => void refetchPlan()}
                disabled={planFetching}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
              >
                {planFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Retry
              </button>
            </div>
          ) : planFixTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {emptyPlanReasonLabel(orchPlan?.reason ?? null)}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {planFixTasks.map((task, index) => (
                <PlanQueueRow key={task.task_id} task={task} rank={index + 1} />
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* SECONDARY — live MVP1 pilots (UC-01 APIs) */}
      <div id="mvp1-pilots" className="mt-6">
        <Section
          title="MVP1 pilots · readiness"
          description={
            summary
              ? `${summary.ready} ready · ${summary.blocked} blocked · ${summary.gap_suggested} gap-suggested`
              : pilotsPending
                ? "Loading readiness from Data Center and Architecture…"
                : "Sixteen Build Pack pilots ranked by live gates"
          }
          action={
            <Link
              to="/lifecycle"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-primary"
            >
              Architecture coverage → Lifecycle <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="px-5 py-4">
            {pilotsPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading pilots…
              </div>
            ) : pilotsError ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {getApiErrorMessage(
                    pilotsErr,
                    "Could not load pilot recommendations.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void refetchPilots()}
                  disabled={pilotsFetching}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
                >
                  {pilotsFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Retry
                </button>
              </div>
            ) : pilots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pilots seeded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pilots.map((pilot) => (
                  <PilotListRow
                    key={pilot.use_case_id}
                    pilot={pilot}
                    selected={uc === pilot.use_case_id}
                    onOpen={() => openDetail(pilot.use_case_id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>
              {detail?.title ??
                selectedPilot?.title ??
                (uc ? uc : "Pilot blueprint")}
            </SheetTitle>
            <SheetDescription>
              {uc ? (
                <span className="tabular">
                  {uc}
                  {selectedPilot
                    ? ` · rank ${selectedPilot.pilot_rank}`
                    : detail
                      ? ` · rank ${detail.pilot_rank}`
                      : ""}
                </span>
              ) : (
                "Blueprint detail"
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 text-sm">
            {selectedPilot ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={selectedPilot.status} />
                {selectedPilot.gap_suggested ? (
                  <span className="rounded bg-risk/15 px-1.5 py-0.5 text-[11px] font-medium text-risk">
                    Gap suggested
                  </span>
                ) : null}
              </div>
            ) : null}

            {selectedPilot && selectedPilot.blockers.length > 0 ? (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Blockers
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px]">
                  {selectedPilot.blockers.map((b, i) => (
                    <li key={`${b.code}-${i}`}>
                      <BlockerDeepLink blocker={b} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {detailPending ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading blueprint…
              </div>
            ) : detailError ? (
              <p className="text-muted-foreground">
                {getApiErrorMessage(detailErr, "Could not load this blueprint.")}
              </p>
            ) : detail ? (
              <>
                {detail.business_objective ? (
                  <DetailBlock label="Business objective">
                    {detail.business_objective}
                  </DetailBlock>
                ) : null}
                {detail.trigger?.description ? (
                  <DetailBlock label="Trigger">
                    {detail.trigger.description}
                    {detail.trigger.timezone
                      ? ` · ${detail.trigger.timezone}`
                      : ""}
                  </DetailBlock>
                ) : null}
                {detail.audience?.definition ? (
                  <DetailBlock label="Audience">
                    {detail.audience.definition}
                    {detail.audience.consent
                      ? ` · Consent: ${detail.audience.consent}`
                      : ""}
                  </DetailBlock>
                ) : null}
                {detail.measurement?.primary_kpi ||
                detail.measurement?.success_criteria ? (
                  <DetailBlock label="Measurement">
                    {detail.measurement.primary_kpi
                      ? `KPI: ${detail.measurement.primary_kpi}`
                      : null}
                    {detail.measurement.primary_kpi &&
                    detail.measurement.success_criteria
                      ? " · "
                      : null}
                    {detail.measurement.success_criteria ?? null}
                  </DetailBlock>
                ) : null}

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Gates · live results
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-left text-[12px]">
                      <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        <tr>
                          <th className="px-2.5 py-1.5 font-medium">Gate</th>
                          <th className="px-2.5 py-1.5 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/70">
                          <td className="px-2.5 py-2">
                            Min DCS {detail.gates?.min_dcs ?? "—"}
                          </td>
                          <td className="px-2.5 py-2 text-muted-foreground">
                            {recommendations?.dcs.headline_score != null
                              ? `Score ${Math.round(recommendations.dcs.headline_score)}`
                              : "No score yet"}
                          </td>
                        </tr>
                        {(selectedPilot?.check_results ?? []).map(
                          (row: UseCaseCheckResult) => (
                            <tr
                              key={row.check_id}
                              className="border-b border-border/70 last:border-0"
                            >
                              <td className="px-2.5 py-2">
                                {row.result !== "PASS" ? (
                                  <Link
                                    to="/data-consistency"
                                    search={{ issue: row.check_id }}
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    {row.check_id}
                                  </Link>
                                ) : (
                                  row.check_id
                                )}
                              </td>
                              <td
                                className={`px-2.5 py-2 font-medium ${checkResultClass(row.result)}`}
                              >
                                {row.result}
                              </td>
                            </tr>
                          ),
                        )}
                        {(selectedPilot?.check_results?.length ?? 0) === 0 ? (
                          <tr>
                            <td
                              colSpan={2}
                              className="px-2.5 py-2 text-muted-foreground"
                            >
                              {(detail.gates?.gating_check_ids ?? []).length > 0
                                ? (detail.gates?.gating_check_ids ?? []).join(
                                    ", ",
                                  )
                                : "No gating checks listed"}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  {(detail.gates?.architecture_modes ?? []).length > 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Allowed modes:{" "}
                      {(detail.gates?.architecture_modes ?? []).join(", ")}
                    </p>
                  ) : null}
                </div>

                <DetailBlock label="Workflow">
                  {detail.workflow_summary?.node_count ?? detail.node_count}{" "}
                  nodes
                  {detail.workflow_summary?.truncated ? " (showing first 50)" : ""}
                </DetailBlock>
                {detail.workflow_summary?.nodes?.length ? (
                  <ol className="list-decimal space-y-1 pl-4 text-[12px] text-muted-foreground">
                    {detail.workflow_summary.nodes.slice(0, 12).map((n, i) => (
                      <li key={n.node_id ?? `${i}`}>
                        {n.label || n.node_type || n.node_id || "Step"}
                      </li>
                    ))}
                  </ol>
                ) : null}

                <p className="text-[11px] text-muted-foreground">
                  {detail.execution?.note}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Blueprint not found.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function PlanQueueRow({
  task,
  rank,
}: {
  task: OrchPlanTask;
  rank: number;
}) {
  const checkId = task.check_id?.trim() || "";
  const openTarget = checkId ? planOpenTarget(checkId) : null;
  const revenue =
    typeof task.revenue_impact === "number" &&
    Number.isFinite(task.revenue_impact) &&
    task.revenue_impact > 0
      ? formatDcsRevenue(task.revenue_impact, task.currency)
      : null;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <span className="font-display w-8 shrink-0 text-lg tabular text-fog/80">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{task.title}</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            READY
          </span>
          {task.priority_class ? (
            <span className="rounded bg-sand px-1.5 py-0.5 text-[10px] font-medium tabular text-muted-foreground">
              {task.priority_class}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
          <span className="tabular">
            Score {formatPriorityScore(task.priority_score)}
          </span>
          {checkId ? <span className="tabular">{checkId}</span> : null}
          {revenue && revenue !== "—" ? <span>{revenue} at stake</span> : null}
        </div>
      </div>
      {openTarget ? (
        <Link
          to={openTarget.to}
          search={openTarget.search}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
        >
          Open fix flow <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="text-[12px] text-muted-foreground">No deep-link</span>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: UseCasePilotStatus }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${statusChipClass(pilotStatusTone(status))}`}
    >
      {pilotStatusLabel(status)}
    </span>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

function PilotListRow({
  pilot,
  selected,
  onOpen,
}: {
  pilot: UseCasePilotRecommendation;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <li
      className={`px-4 py-3.5 ${selected ? "bg-primary/[0.04]" : "hover:bg-sand/40"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tabular text-muted-foreground">
              #{pilot.pilot_rank}
            </span>
            <span className="text-sm font-medium">{pilot.title}</span>
            <span className="text-[11px] tabular text-muted-foreground">
              {pilot.use_case_id}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip status={pilot.status} />
            {pilot.gap_suggested ? (
              <span className="rounded bg-risk/15 px-1.5 py-0.5 text-[11px] font-medium text-risk">
                Gap suggested
              </span>
            ) : null}
          </div>
          {pilot.blockers.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              {pilot.blockers.slice(0, 3).map((b, i) => (
                <li key={`${b.code}-${i}`}>
                  <BlockerDeepLink blocker={b} />
                </li>
              ))}
              {pilot.blockers.length > 3 ? (
                <li>+{pilot.blockers.length - 3} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent"
        >
          {pilot.cta?.label ?? "View blueprint"}{" "}
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

function TrackerTableRow({ row }: { row: LiveTrackerRow }) {
  const live = row.workflowState === "active";
  const notYet = row.workflowState === "pending-handoff";
  const beat =
    row.estImpact.value != null &&
    row.realImpact.value != null &&
    row.realImpact.value >= row.estImpact.value;
  const done = row.readiness === "done";
  const canOpen = Boolean(row.issueId);

  return (
    <tr className={done ? "opacity-75 hover:bg-sand/30" : "hover:bg-sand/40"}>
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{row.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{row.meta}</div>
        {canOpen && row.issueId ? (
          <Link
            to="/fix"
            search={{ issue: row.issueId }}
            className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
          >
            Open fix flow <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {row.handedOff ?? (notYet ? "— pending" : "—")}
      </td>
      <td className="px-3 py-3 text-xs">
        {live ? (
          <span className="font-medium text-revenue">Active · live</span>
        ) : (
          <span className="text-muted-foreground">
            {workflowStateLabel(row.workflowState, row.endedDate)}
          </span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-xs tabular text-foreground">
        {formatTrackerImpact(row.estImpact)}
      </td>
      <td
        className={`px-3 py-3 text-right text-xs tabular ${
          beat ? "font-semibold text-revenue" : "text-foreground"
        }`}
      >
        {formatTrackerImpact(row.realImpact, row.riskLabel)}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
            /blocked/i.test(row.status)
              ? "bg-loss-soft text-loss"
              : /waiting/i.test(row.status)
                ? "bg-risk-soft text-risk"
                : live || /ready|done|opportunity/i.test(row.status)
                  ? "bg-revenue-soft text-revenue"
                  : "bg-muted text-muted-foreground"
          }`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">{row.owner}</td>
    </tr>
  );
}
