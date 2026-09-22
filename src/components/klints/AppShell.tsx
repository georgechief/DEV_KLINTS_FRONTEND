import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Workflow,
  ListChecks,
  Plug,
  Activity as ActivityIcon,
  Settings,
  Search,
  Bell,
  ChevronDown,
  Command,
  ShieldCheck,
  LogOut,
  User,
  Shield,
  Send,
  Wrench,
  Layers,
  Loader2,
  ArrowRight,
  Lock,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { KlintsLogo } from "@/components/klints/KlintsLogo";
import {
  DCS_STATUS_QUERY_KEY,
  DCS_STATUS_STALE_MS,
  getDcsRunningRefetchInterval,
  invalidateAfterDcsRunComplete,
  refreshConnectorsThenDcsStatus,
} from "@/lib/app-access";
import { clearAuth, getAccessToken, getCurrentUser, isUnauthorizedError, userInitials } from "@/lib/auth";
import {
  isConnectorBootstrapInFlight,
  listConnectors,
} from "@/lib/connectors";
import {
  DCS_BUILD_READY_THRESHOLD,
  DCS_WORKLIST_QUERY_KEY,
  displayHeadlineScore,
  dcsScoreDisplayColor,
  formatDcsScore,
  getDcsStatus,
  getDcsWorklist,
  isAppLocked,
  isDcsScoreHiddenAfterFailure,
  isDcsScoreReady,
  isNavRouteAllowed,
  type DcsAppStatus,
} from "@/lib/dcs";
import { ORCH_PLAN_QUERY_KEY } from "@/lib/orchestration";
import { formatDisplayCount } from "@/lib/presentation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AUDIT_EVENTS_QUERY_KEY,
  AUDIT_NOTIFICATIONS_QUERY_KEY,
  listAuditNotifications,
  markAllAuditRead,
  markAuditEventRead,
  resolveAuditDeepLink,
  type AuditEvent,
} from "@/lib/audit";
import { SpotlightSearch } from "@/components/klints/SpotlightSearch";
import { NotificationsPanel } from "@/components/klints/NotificationsPanel";
import { FlowStepper, stepKeyFromPath } from "@/components/klints/FlowStepper";
import { KlintsLoader } from "@/components/klints/KlintsLoader";
import {
  getFixFlowIssueIdFromSearch,
  findWorklistIssueByCheckId,
  isFixtureIssueId,
  needsFixFlowWorklist,
  parseFixFlowSearch,
  resolveFixFlowIssueTitle,
  sidebarFixFlowSearch,
} from "@/lib/fix-flow";
import {
  deriveJourneyStage,
  getUseCaseRecommendations,
  isHandoffQaRequired,
  parseWorkflowSearch,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
} from "@/lib/use-cases";
import {
  getLatestPackageQa,
  isQaPass,
  packageQaQueryKey,
  QA_STALE_MS,
} from "@/lib/qa";

const SCORE_CHIP_CIRC = 2 * Math.PI * 13;

const navWorkspace = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/data-consistency", label: "Data Consistency Score", icon: ShieldCheck, phase: "1" },
] as const;

/** Phase order matches reference HTML: 1 Diagnose → 2 Fix → 3 Build → 4 QA → 5 Handoff */
const navFixFlow = [
  { to: "/fix", label: "Fix", icon: Wrench, phase: "2" },
  { to: "/workflow", label: "Workflow Studio", icon: Workflow, phase: "3" },
  { to: "/qa", label: "QA validation", icon: Shield, phase: "4" },
  { to: "/handoff", label: "Handoff", icon: Send, phase: "5" },
] as const;

const navReference = [
  { to: "/lifecycle", label: "Lifecycle cockpit", icon: Layers },
  { to: "/opportunities", label: "Opportunity tracker", icon: ListChecks },
  { to: "/integrations", label: "Connected stack", icon: Plug },
  { to: "/activity", label: "Activity", icon: ActivityIcon },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  phase?: string;
};

function defaultDcsLockMessage(status: DcsAppStatus): string {
  const isSoftLocked = status.app_access === "soft_locked_running";
  if (isSoftLocked || status.lock_reason === "running_no_score") {
    return "Scoring in progress. Score will appear here when ready.";
  }
  switch (status.lock_reason) {
    case "no_run":
      return "Data Consistency Score is not calculated yet. Wait for the daily job or trigger a score run after connectors are healthy.";
    case "failed": {
      const base =
        "The latest DCS run failed. Review the issue below, fix connectors, then retry scoring.";
      const error = status.latest_run?.error?.trim();
      if (!error) return base;
      const truncated = error.length > 120 ? `${error.slice(0, 117)}…` : error;
      return `${base} ${truncated}`;
    }
    case "blocked":
      return "Score is not calculated — required foundation gates failed. Fix the issues under Connected stack. (Optional checks like ERP/FD-03 are not enough to show this.)";
    case "incomplete_no_score":
      return "Score is not calculated yet (run incomplete / missing scored checks). Review any open issues below.";
    default:
      return "Data Consistency Score is not calculated yet. Review the issues below and fix them under Connected stack.";
  }
}

function DcsLockBanner({ status }: { status: DcsAppStatus }) {
  const isSoftLocked = status.app_access === "soft_locked_running";
  const bannerMessage = status.message?.trim() || defaultDcsLockMessage(status);

  return (
    <div
      className={`mb-6 rounded-lg border px-4 py-3.5 ${
        isSoftLocked
          ? "border-primary/20 bg-primary/5"
          : "border-spark/25 bg-spark/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isSoftLocked && (
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Calculating score
            </div>
          )}
          <p className="text-[13.5px] leading-relaxed text-foreground">{bannerMessage}</p>
        </div>
        {!isSoftLocked && (
          <Link
            to="/integrations"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-sand"
          >
            Open Connected stack
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function DcsScoreChip({
  status,
  pending,
  allowed,
}: {
  status: DcsAppStatus | undefined;
  pending: boolean;
  allowed: boolean;
}) {
  const scoreReady = status ? isDcsScoreReady(status) : false;
  const headline = status ? displayHeadlineScore(status) : null;
  const score = scoreReady && headline != null ? Math.round(headline) : null;
  const arcColor = dcsScoreDisplayColor(score, { empty: "#E8E4D9" });
  const offset =
    score == null ? SCORE_CHIP_CIRC : SCORE_CHIP_CIRC * (1 - Math.min(100, Math.max(0, score)) / 100);
  const label =
    pending && !status
      ? "…"
      : score != null
        ? formatDcsScore(score)
        : (status?.score_display.label ?? "—");

  const body = (
    <>
      <svg className="h-[26px] w-[26px] shrink-0" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="#E8E4D9" strokeWidth="3" />
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke={arcColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={SCORE_CHIP_CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 16 16)"
        />
      </svg>
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className="font-display text-sm font-semibold tracking-[-0.01em] tabular text-ink">
          {label}
        </span>
        <span className="text-[11px] tracking-[0.04em] text-fog">DCS</span>
      </span>
    </>
  );

  if (!allowed) {
    return (
      <span
        className="inline-flex items-center gap-2.5 rounded-full border border-border bg-elevated py-1 pl-1.5 pr-3 opacity-60"
        title={status?.message ?? "Score unlocks after your first calculated run"}
      >
        {body}
      </span>
    );
  }

  return (
    <Link
      to="/data-consistency"
      className="inline-flex items-center gap-2.5 rounded-full border border-border bg-elevated py-1 pl-1.5 pr-3 transition-colors hover:border-ink/15 hover:bg-sand"
      title="Open Data Consistency Center"
    >
      {body}
    </Link>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  issueTitle,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Lights up the global Diagnose→Handoff stepper when set */
  issueTitle?: string | null;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const fixFlowSearch = useRouterState({
    select: (r) => parseFixFlowSearch(r.location.search as Record<string, unknown>),
  });
  const workflowSearch = useRouterState({
    select: (r) => parseWorkflowSearch(r.location.search as Record<string, unknown>),
  });
  const flowStep = stepKeyFromPath(pathname);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authStatus, setAuthStatus] = useState<"pending" | "authed" | "unauthed">(
    "pending",
  );
  const isAuthed = authStatus === "authed";
  const hasToken = typeof window !== "undefined" && Boolean(getAccessToken());

  const {
    data: currentUser,
    isError: currentUserError,
    isPending: currentUserPending,
    error: currentUserLoadError,
  } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    enabled: hasToken,
    retry: false,
  });

  const dcsQueryEnabled =
    authStatus === "authed" &&
    Boolean(currentUser) &&
    currentUser?.needs_connector !== true;

  const { data: shellConnectors } = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    enabled: dcsQueryEnabled,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) =>
      isConnectorBootstrapInFlight(query.state.data) ? DCS_STATUS_STALE_MS : false,
  });
  const bootstrapPending = isConnectorBootstrapInFlight(shellConnectors);

  // After Shopify/Manago reconnect, bootstrap finishes then BE enqueues DCS —
  // refetch connectors so expectDcsSoon polling can start immediately.
  const wasBootstrapPendingRef = useRef(false);
  useEffect(() => {
    if (wasBootstrapPendingRef.current && !bootstrapPending) {
      void refreshConnectorsThenDcsStatus(queryClient);
    }
    wasBootstrapPendingRef.current = bootstrapPending;
  }, [bootstrapPending, queryClient]);

  const {
    data: dcsStatus,
    isPending: dcsStatusPending,
    isError: dcsStatusError,
  } = useQuery({
    queryKey: DCS_STATUS_QUERY_KEY,
    queryFn: getDcsStatus,
    enabled: dcsQueryEnabled,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) =>
      getDcsRunningRefetchInterval(query.state.data, Date.now(), {
        expectDcsSoon: bootstrapPending,
      }),
  });

  const fixFlowNeedsWorklist = needsFixFlowWorklist(fixFlowSearch);
  const {
    data: fixFlowWorklist,
    isPending: fixFlowWorklistPending,
  } = useQuery({
    queryKey: DCS_WORKLIST_QUERY_KEY,
    queryFn: getDcsWorklist,
    enabled: dcsQueryEnabled && fixFlowNeedsWorklist && Boolean(flowStep),
  });

  const issueIdFromSearch = getFixFlowIssueIdFromSearch(fixFlowSearch);
  const resolvedIssueTitle =
    issueTitle ??
    resolveFixFlowIssueTitle(fixFlowSearch, fixFlowWorklist?.issues) ??
    // Keep Working-on label honest while worklist title is still loading.
    (issueIdFromSearch && !isFixtureIssueId(issueIdFromSearch)
      ? issueIdFromSearch
      : null);

  const liveStepperIssue =
    issueIdFromSearch && !isFixtureIssueId(issueIdFromSearch)
      ? issueIdFromSearch
      : undefined;

  const fixFlowWorklistLoading =
    fixFlowNeedsWorklist &&
    Boolean(flowStep) &&
    Boolean(liveStepperIssue) &&
    fixFlowWorklistPending;

  const {
    data: stepperRecommendations,
    isPending: stepperRecsPending,
    isSuccess: stepperRecsSuccess,
    isError: stepperRecsError,
  } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
    // Include QA/Handoff so demo flag handoff_qa_required is available without an issue id.
    enabled: dcsQueryEnabled && Boolean(flowStep),
  });

  const stepperPackageId = workflowSearch.package_id;
  const {
    data: stepperQa,
    isPending: stepperQaPending,
    isFetching: stepperQaFetching,
    isSuccess: stepperQaSuccess,
    isFetched: stepperQaFetched,
  } = useQuery({
    queryKey: packageQaQueryKey(stepperPackageId ?? ""),
    queryFn: () => getLatestPackageQa(stepperPackageId!),
    enabled: dcsQueryEnabled && Boolean(flowStep) && Boolean(stepperPackageId),
    staleTime: QA_STALE_MS,
    retry: false,
  });

  const qaMatchesPackage =
    Boolean(stepperPackageId) &&
    Boolean(stepperQa) &&
    (stepperQa!.package_id === stepperPackageId ||
      stepperQa!.object_id === stepperPackageId);

  const stepperQaStatus: "PASS" | "FAIL" | null | undefined = !stepperPackageId
    ? undefined
    : stepperQaSuccess && qaMatchesPackage && isQaPass(stepperQa)
      ? "PASS"
      : stepperQaSuccess && qaMatchesPackage
        ? "FAIL"
        : stepperQaFetched
          ? null
          : undefined;

  // Pending = first load, or refetch with no trustworthy matched result yet.
  const stepperQaAwaiting =
    Boolean(stepperPackageId) &&
    (stepperQaPending ||
      (stepperQaFetching && stepperQaStatus !== "PASS" && stepperQaStatus !== "FAIL"));

  const stepperJourney =
    flowStep && liveStepperIssue
      ? {
          pilots: stepperRecommendations?.pilots,
          recommendationsPending: stepperRecsPending,
          recommendationsSuccess: stepperRecsSuccess,
          recommendationsError: stepperRecsError,
          packageId: stepperPackageId,
          ucFromSearch: workflowSearch.uc,
          qaStatus: stepperQaStatus ?? null,
          qaPending: stepperQaAwaiting,
          qaRunId: qaMatchesPackage ? stepperQa?.qa_run_id : undefined,
          handoffQaRequired: isHandoffQaRequired(
            qaMatchesPackage ? stepperQa : undefined,
            stepperRecommendations?.summary,
          ),
        }
      : flowStep
        ? {
            pilots: undefined,
            recommendationsPending: false,
            recommendationsSuccess: true,
            recommendationsError: false,
            packageId: stepperPackageId,
            ucFromSearch: workflowSearch.uc,
            qaStatus: stepperQaStatus ?? null,
            qaPending: stepperQaAwaiting,
            qaRunId: qaMatchesPackage ? stepperQa?.qa_run_id : undefined,
            handoffQaRequired: isHandoffQaRequired(
              qaMatchesPackage ? stepperQa : undefined,
              stepperRecommendations?.summary,
            ),
          }
        : undefined;

  const worklistIssueStatus = useMemo(() => {
    if (!liveStepperIssue || !fixFlowWorklist?.issues) return null;
    return findWorklistIssueByCheckId(fixFlowWorklist.issues, liveStepperIssue)?.status ?? null;
  }, [liveStepperIssue, fixFlowWorklist?.issues]);

  const derivedFlowStep = useMemo(() => {
    if (!flowStep) return null;
    return deriveJourneyStage({
      pathname,
      issueId: issueIdFromSearch,
      isFixture: Boolean(issueIdFromSearch && isFixtureIssueId(issueIdFromSearch)),
      issueStatus: worklistIssueStatus,
      ucFromSearch: workflowSearch.uc,
      packageId: stepperPackageId,
      pilots: stepperRecommendations?.pilots,
      recommendationsSuccess: liveStepperIssue ? stepperRecsSuccess : undefined,
      worklistPending: fixFlowWorklistLoading,
      qaStatus: stepperQaStatus ?? null,
    });
  }, [
    flowStep,
    pathname,
    issueIdFromSearch,
    worklistIssueStatus,
    workflowSearch.uc,
    stepperPackageId,
    stepperRecommendations?.pilots,
    liveStepperIssue,
    stepperRecsSuccess,
    fixFlowWorklistLoading,
    stepperQaStatus,
  ]);

  const isScoreRunning =
    Boolean(dcsStatus?.scheduled) ||
    dcsStatus?.app_access === "soft_locked_running" ||
    dcsStatus?.active_run?.status === "pending" ||
    dcsStatus?.active_run?.status === "running";

  // When a DCS score run finishes anywhere in the app, refresh dependent caches
  // (worklist, history, pilots, architecture, orch plan).
  const wasScoreRunningRef = useRef(false);
  useEffect(() => {
    if (wasScoreRunningRef.current && !isScoreRunning) {
      invalidateAfterDcsRunComplete(queryClient);
    }
    wasScoreRunningRef.current = Boolean(isScoreRunning);
  }, [isScoreRunning, queryClient]);

  const {
    data: auditNotifications,
    isPending: auditNotificationsPending,
    isError: auditNotificationsError,
    refetch: refetchAuditNotifications,
  } = useQuery({
    queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY,
    queryFn: () => listAuditNotifications({ limit: 5 }),
    enabled: authStatus === "authed",
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const markAllAuditReadMutation = useMutation({
    mutationFn: markAllAuditRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
      toast.success("All notifications marked as read");
    },
    onError: () => {
      toast.error("Could not mark notifications as read");
    },
  });

  const markAuditEventReadMutation = useMutation({
    mutationFn: (eventId: string) => markAuditEventRead(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
    },
  });

  const unreadCount = auditNotifications?.unread_count ?? 0;
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);
  const notificationEvents = auditNotifications?.results ?? [];

  async function handleNotificationItemClick(event: AuditEvent) {
    setNotifOpen(false);
    try {
      await markAuditEventReadMutation.mutateAsync(event.id);
    } catch {
      // Still navigate if mark-read fails.
    }
    const link = resolveAuditDeepLink(event, {
      fixAllowed: isNavRouteAllowed(dcsStatus, "/fix"),
    });
    void navigate({
      to: link.to,
      search: link.search,
      hash: link.hash,
    } as never);
  }

  const failIssueCount =
    (dcsStatus?.check_summary?.FAIL ?? 0) + (dcsStatus?.check_summary?.WARN ?? 0);

  const renderNavItem = (item: NavItem) => {
    const allowed = isNavRouteAllowed(dcsStatus, item.to);
    const active =
      pathname === item.to ||
      (item.to !== "/dashboard" && pathname.startsWith(item.to));
    const Icon = item.icon;
    const phase = item.phase;
    const showDcsDot = item.to === "/data-consistency" && failIssueCount > 0 && allowed;
    const baseClass = `group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] leading-snug tracking-[-0.01em] transition-colors ${
      active
        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
        : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    }`;
    const disabledClass =
      "group flex w-full cursor-default items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[12.5px] font-medium leading-snug text-sidebar-foreground/50 opacity-45";

    const inner = (
      <>
        {phase ? (
          <span
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold tabular leading-none ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "bg-sidebar-accent text-sidebar-foreground/65"
            }`}
          >
            {phase}
          </span>
        ) : (
          <Icon
            className="h-[15px] w-[15px] shrink-0 opacity-75"
            strokeWidth={1.75}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
        {!allowed && (
          <Lock className="ml-auto h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
        )}
        {showDcsDot && (
          <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary" />
        )}
        {active && !showDcsDot && allowed && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary" />
        )}
      </>
    );

    if (!allowed) {
      const lockHint =
        dcsStatus?.message ??
        "Available after your Data Consistency Score is calculated — fix issues in Connected stack.";
      return (
        <span
          key={item.to}
          className={disabledClass}
          aria-disabled="true"
          title={lockHint}
        >
          {inner}
        </span>
      );
    }

    return (
      <Link
        key={item.to}
        to={item.to}
        search={sidebarFixFlowSearch(item.to, {
          issue: issueIdFromSearch ?? workflowSearch.issue,
          uc: workflowSearch.uc,
          package_id: workflowSearch.package_id,
          qa_run_id: qaMatchesPackage ? stepperQa?.qa_run_id : undefined,
        })}
        className={baseClass}
      >
        {inner}
      </Link>
    );
  };

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      setAuthStatus("unauthed");
      return;
    }

    if (currentUserPending) {
      return;
    }

    if (currentUserError) {
      if (isUnauthorizedError(currentUserLoadError)) {
        clearAuth();
        void queryClient.removeQueries({ queryKey: ["auth", "me"] });
      }
      setAuthStatus("unauthed");
      return;
    }

    if (!currentUser) {
      clearAuth();
      void queryClient.removeQueries({ queryKey: ["auth", "me"] });
      setAuthStatus("unauthed");
      return;
    }

    setAuthStatus("authed");
  }, [
    currentUser,
    currentUserError,
    currentUserPending,
    currentUserLoadError,
    queryClient,
  ]);

  useEffect(() => {
    if (authStatus === "unauthed") {
      void navigate({ to: "/signin", replace: true });
    }
  }, [authStatus, navigate]);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen && !notifOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, notifOpen]);

  const companyName =
    currentUser?.company?.name ?? currentUser?.tenant.name ?? "Workspace";
  const dcsNavAllowed = isNavRouteAllowed(dcsStatus, "/data-consistency");
  const sidebarScore =
    dcsStatus && isDcsScoreReady(dcsStatus) ? displayHeadlineScore(dcsStatus) : null;
  const sidebarScoreRounded =
    sidebarScore != null ? Math.round(sidebarScore) : null;
  const sidebarScoreColor = dcsScoreDisplayColor(sidebarScoreRounded);
  const ptsToBuild =
    sidebarScore != null
      ? formatDisplayCount(Math.max(0, DCS_BUILD_READY_THRESHOLD - sidebarScore))
      : null;
  const weakestDim =
    dcsStatus?.dimensions && Object.keys(dcsStatus.dimensions).length > 0
      ? Object.values(dcsStatus.dimensions).reduce((min, dim) =>
          dim.score < min ? dim.score : min,
          100,
        )
      : null;

  return authStatus === "pending" ? (
    <KlintsLoader label="Loading workspace…" />
  ) : isAuthed ? (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5">
          <KlintsLogo variant="wordmark" tone="light" to="/dashboard" className="h-6" />
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3.5">
          {[
            { heading: "Workspace", items: navWorkspace },
            { heading: "Fix flow", items: navFixFlow },
            { heading: "Reference", items: navReference },
          ].map((group) => (
            <div key={group.heading} className="space-y-px">
              <div className="px-2.5 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
                {group.heading}
              </div>
              {group.items.map((item) => renderNavItem(item as NavItem))}
            </div>
          ))}
        </nav>

        {dcsNavAllowed ? (
          <Link
            to="/data-consistency"
            className="mx-3 mb-3 block shrink-0 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-3 py-2.5 transition-colors hover:bg-sidebar-accent/70"
          >
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
              Data Consistency · 7 dims
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="font-display text-[1.35rem] leading-none tracking-tight tabular-nums"
                style={{ color: sidebarScoreColor }}
              >
                {sidebarScore != null ? formatDcsScore(sidebarScore) : "—"}
              </span>
              <span className="font-mono text-[10.5px] text-sidebar-foreground/40">/ 100</span>
            </div>
            <div className="mt-1 text-[10.5px] leading-snug text-sidebar-foreground/60">
              {sidebarScore != null && ptsToBuild != null
                ? `${ptsToBuild} pts to build-ready${
                    weakestDim != null ? ` · weakest ${formatDcsScore(weakestDim)}` : ""
                  }`
                : "Score awaiting calculated run"}
            </div>
          </Link>
        ) : (
          <div className="mx-3 mb-3 block shrink-0 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-3 py-2.5 opacity-70">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40">
              Data Consistency · 7 dims
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="font-display text-[1.35rem] leading-none tracking-tight tabular-nums"
                style={{ color: dcsScoreDisplayColor(null) }}
              >
                —
              </span>
              <span className="font-mono text-[10.5px] text-sidebar-foreground/40">/ 100</span>
            </div>
            <div className="mt-1 text-[10.5px] leading-snug text-sidebar-foreground/60">
              Score awaiting calculated run
            </div>
          </div>
        )}

        <div className="relative shrink-0 border-t border-sidebar-border p-3" ref={userMenuRef}>
          <button
            type="button"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-sidebar-accent/50"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary/20 text-[11px] font-semibold text-sidebar-primary tabular-nums">
              {currentUser ? userInitials(currentUser.name) : "…"}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-semibold tracking-[-0.01em]">
                {currentUser?.name ?? "…"}
              </div>
              <div className="mt-0.5 truncate text-[10.5px] text-sidebar-foreground/45">
                {currentUser?.email ?? "…"}
              </div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 opacity-55 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              className="absolute bottom-[calc(100%-0.25rem)] left-3 right-3 z-30 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar shadow-elevated"
            >
              <Link
                role="menuitem"
                to="/settings"
                search={{ tab: "account" }}
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent"
              >
                <User className="h-3.5 w-3.5 opacity-70" />
                User settings
              </Link>
              <Link
                role="menuitem"
                to="/settings"
                search={{ tab: "workspace" }}
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent"
              >
                <Settings className="h-3.5 w-3.5 opacity-70" />
                Workspace settings
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  clearAuth();
                  void navigate({ to: "/signin" });
                }}
                className="flex w-full items-center gap-2.5 border-t border-sidebar-border px-3 py-2 text-[12.5px] font-medium text-spark hover:bg-sidebar-accent"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{companyName}</span>
              <span className="opacity-40">/</span>
              <span className="truncate text-foreground">{title}</span>
            </div>
            {subtitle && (
              <div className="truncate text-[12px] text-muted-foreground/80">{subtitle}</div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="hidden items-center gap-2 rounded-md border border-border bg-elevated px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex md:w-80"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">Search issues, workflows…</span>
            <kbd className="flex items-center gap-0.5 rounded border border-border px-1 text-[10px] text-muted-foreground">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          {actions}

          {dcsQueryEnabled && (
            <DcsScoreChip
              status={dcsStatus}
              pending={dcsStatusPending}
              allowed={dcsNavAllowed}
            />
          )}

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              aria-label="Notifications"
              aria-expanded={notifOpen}
              onClick={() => {
                const opening = !notifOpen;
                setNotifOpen(opening);
                setUserMenuOpen(false);
                if (opening) {
                  void queryClient.invalidateQueries({
                    queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY,
                  });
                }
              }}
              className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spark px-1 text-[9px] font-semibold text-white">
                  {badgeLabel}
                </span>
              )}
            </button>
            {notifOpen && (
              <NotificationsPanel
                events={notificationEvents}
                unreadCount={unreadCount}
                isPending={auditNotificationsPending}
                isError={auditNotificationsError}
                isMarkingAll={markAllAuditReadMutation.isPending}
                onClose={() => setNotifOpen(false)}
                onMarkAll={() => markAllAuditReadMutation.mutate()}
                onRetry={() => void refetchAuditNotifications()}
                onItemClick={(event) => void handleNotificationItemClick(event)}
              />
            )}
          </div>
        </header>

        <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {dcsStatusError && dcsQueryEnabled && !dcsStatus && (
            <div className="mb-6 rounded-lg border border-loss/20 bg-loss-soft px-4 py-3 text-[13px] text-loss">
              Could not load Data Consistency Score status. Refresh to try again.
            </div>
          )}
          {dcsStatus &&
            (isAppLocked(dcsStatus) || isDcsScoreHiddenAfterFailure(dcsStatus)) && (
            <DcsLockBanner status={dcsStatus} />
          )}
          {dcsStatus?.app_access === "unlocked" &&
            dcsStatus.scheduled &&
            !isDcsScoreHiddenAfterFailure(dcsStatus) && (
            <div className="mb-6 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                Refreshing Data Consistency Score…
              </div>
            </div>
          )}
          {flowStep && derivedFlowStep && (
            <FlowStepper
              current={derivedFlowStep}
              issueId={issueIdFromSearch}
              issueTitle={resolvedIssueTitle}
              dataCenterAllowed={dcsNavAllowed}
              journey={stepperJourney}
            />
          )}
          {children}
        </div>
      </main>

      <SpotlightSearch
        open={spotlightOpen}
        onOpenChange={setSpotlightOpen}
        dcsStatus={dcsStatus}
      />
    </div>
  ) : null;
}

export function PageTitle({
  title,
  kicker,
  description,
  actions,
  variant = "default",
}: {
  title: string;
  kicker?: string;
  description?: string;
  actions?: ReactNode;
  /** `design` matches the client-approved Frontend_design PageTitle. */
  variant?: "default" | "design";
}) {
  if (variant === "design") {
    return (
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker && (
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fog">
              {kicker}
            </div>
          )}
          <h1 className="font-display mt-1.5 text-[1.5rem] font-semibold tracking-tight text-foreground md:text-[1.65rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    );
  }

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {kicker && (
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-fog">
            {kicker}
          </div>
        )}
        <h1 className="font-display flex items-center gap-2.5 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.02em] text-ink md:text-[1.75rem]">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-spark" aria-hidden />
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-ink/60">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
