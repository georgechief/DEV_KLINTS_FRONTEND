import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { KlintsLoader } from "@/components/klints/KlintsLoader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { FixPlan } from "@/lib/klints-data";
import { fixPlans } from "@/lib/klints-data";
import {
  DCS_WORKLIST_QUERY_KEY,
  dcsWorklistIssueQueryKey,
  getDcsWorklist,
  getDcsWorklistIssue,
} from "@/lib/dcs";
import { buildLiveFixPlan } from "@/lib/fix-live-plan";
import {
  downloadFixEvidenceExport,
  hasExportableEvidence,
} from "@/lib/fix-evidence-export";
import { WritebackPossibleSurfaces } from "@/components/klints/WritebackPossibleSurfaces";
import {
  approveWritebackApproval,
  executeWriteback,
  executeResultFromWritebackStatus,
  getWritebackMappings,
  getWritebackPossible,
  getWritebackStatus,
  isWritebackAlreadyExecutedForRunError,
  isWritebackDiffHashMismatchError,
  isWritebackDcsRunRequiredError,
  isWritebackApproveWriteExecutable,
  isWritebackRejectExecutable,
  isWritebackRequestApprovalExecutable,
  isWritebackApprovalRequestRole,
  isWritebackExecuteSuccess,
  isWritebackPreviewAvailable,
  isWritebackSheetRollbackSupported,
  pendingApprovalFromWritebackStatus,
  grantedApprovalFromWritebackStatus,
  isWritebackApprovalExpired,
  previewResultFromWritebackStatus,
  previewWriteback,
  rejectWritebackApproval,
  requestWritebackApproval,
  resolveWritebackApproveWriteBlockReason,
  resolveWritebackRejectBlockReason,
  resolveWritebackRequestApprovalBlockReason,
  rollbackWriteback,
  writebackApproveBlockMessage,
  writebackApprovalErrorMessage,
  writebackExecuteErrorMessage,
  writebackNonExecutableHonesty,
  writebackPreviewErrorMessage,
  writebackPreviewMeta,
  writebackPreviewToTable,
  writebackProvenanceLine,
  writebackActivityDeepLink,
  writebackRollbackConfirmDescription,
  writebackRollbackErrorMessage,
  writebackRollbackGovLabel,
  writebackRollbackHonestyNotice,
  writebackMappingsLoadSoftNotice,
  writebackStatusQueryKey,
  writebackIrreversibleHonestyNotice,
  writebackOperatorInfoNotice,
  writebackLimitedRollbackHonesty,
  writebackShopifyMetafieldHonesty,
  writebackApproveWriteConfirmDescription,
  writebackMappingForCheck,
  isWritebackIrreversibleApproveRequired,
  WRITEBACK_REJECTED_BANNER,
  WRITEBACK_DIFF_HASH_MISMATCH_BANNER,
  type WritebackPreviewResult,
  type WritebackApprovalToken,
  type WritebackApproveBlockReason,
  type WritebackExecuteResult,
  WRITEBACK_MAPPINGS_QUERY_KEY,
  WRITEBACK_POSSIBLE_QUERY_KEY,
} from "@/lib/writebacks";
import {
  AUDIT_EVENTS_QUERY_KEY,
  AUDIT_NOTIFICATIONS_QUERY_KEY,
} from "@/lib/audit";
import { getCurrentUser, companyWritebackExecuteEnabled } from "@/lib/auth";
import {
  getCheckIdFromSearch,
  getIssueById,
  isFixtureIssueId,
  fixturesAllowedInBuild,
  parseFixFlowSearch,
  resolveFixTarget,
  fixTargetCheckId,
  isFixTargetWritebackCapable,
  type FixTarget,
} from "@/lib/fix-flow";
import {
  getUseCaseRecommendations,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  resolveFixStudioEligibility,
  workflowStudioFromFix,
  workflowStudioLink,
  workflowStudioFromLegacyWorkflow,
  type WorkflowStudioLink,
} from "@/lib/use-cases";
import {
  writebackChangePreviewIntents,
  writebackChangePreviewSummary,
  writebackDcsImpactLine,
  writebackWorkflowsUnblockedEstimate,
} from "@/lib/fix-change-preview";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FixAiSuggestionBox } from "@/components/klints/FixAiSuggestionBox";
import {
  ArrowRight,
  Download,
  FileSpreadsheet,
  GitCompare,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/fix")({
  validateSearch: parseFixFlowSearch,
  head: () => ({
    meta: [
      { title: "Fix — Klints" },
      {
        name: "description",
        content: "Phase 2 · Approve writebacks that repair stack integrity before Build.",
      },
    ],
  }),
  component: FixPage,
});

function switchIssueSearch(target: FixTarget): { issue: string } | undefined {
  if (target.kind === "fixture") return { issue: target.issueId };
  if (target.kind === "live") return { issue: target.checkId };
  if (target.kind === "sandbox-mapping") return { issue: target.checkId };
  return undefined;
}

function pageIssueTitle(target: FixTarget): string | null {
  if (target.kind === "fixture") return target.issue.title;
  if (target.kind === "live") return target.plan.title;
  if (target.kind === "sandbox-mapping") return target.plan.title;
  return null;
}

function platformLabelFromExecute(result: WritebackExecuteResult): string | null {
  const targets = new Set(
    result.intents
      .filter((row) => row.status === "executed" || row.status === "ready")
      .map((row) => row.target),
  );
  if (targets.has("manago") && targets.has("shopify")) return "Manago.ai / Shopify";
  if (targets.has("manago")) return "Manago.ai";
  if (targets.has("shopify")) return "Shopify";
  return null;
}

function FixPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** True only after successful execute (PRD-WB-02 §6.1). Never on click alone. */
  const [written, setWritten] = useState(false);
  const [rolledBack, setRolledBack] = useState(false);
  const [executeResult, setExecuteResult] = useState<WritebackExecuteResult | null>(
    null,
  );
  const [approvePhase, setApprovePhase] = useState<
    "idle" | "requesting" | "approving" | "writing" | "rejecting"
  >("idle");
  const [previewTab, setPreviewTab] = useState<"evidence" | "writeback">("evidence");
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [approveWriteConfirmOpen, setApproveWriteConfirmOpen] = useState(false);
  const [changePreviewOpen, setChangePreviewOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingApproval, setPendingApproval] = useState<WritebackApprovalToken | null>(
    null,
  );
  const [rejectionNotice, setRejectionNotice] = useState<string | null>(null);
  const [previewStaleNotice, setPreviewStaleNotice] = useState<string | null>(null);
  const [hydratedPreview, setHydratedPreview] = useState<WritebackPreviewResult | null>(
    null,
  );
  /** After mismatch/force-preview: block status hydrate until a fresh local preview. */
  const [requireFreshPreview, setRequireFreshPreview] = useState(false);
  /** C4 — sync flag for preview onError (setState alone races mutate failure). */
  const forcePreviewInFlightRef = useRef(false);

  const prodFixtureBleed =
    !fixturesAllowedInBuild() &&
    Boolean(search.issue && isFixtureIssueId(search.issue));

  useEffect(() => {
    if (!prodFixtureBleed) return;
    void navigate({ to: "/data-consistency", replace: true });
  }, [prodFixtureBleed, navigate]);

  const needsWorklist = useMemo(() => {
    const fixtureId =
      search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;
    const hasFixture =
      fixturesAllowedInBuild() &&
      Boolean(fixtureId) &&
      Boolean(getIssueById(fixtureId)) &&
      Boolean(fixtureId && fixPlans[fixtureId]);
    return Boolean(getCheckIdFromSearch(search) && !hasFixture);
  }, [search]);

  const checkIdFromSearch = getCheckIdFromSearch(search);

  const { data: currentUser } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
  });

  const {
    data: worklist,
    isPending: worklistPending,
    isError: worklistError,
    refetch: refetchWorklist,
    isFetching: worklistFetching,
  } = useQuery({
    queryKey: DCS_WORKLIST_QUERY_KEY,
    queryFn: getDcsWorklist,
    enabled: needsWorklist,
  });

  const {
    data: writebackMappings,
    isPending: writebackMappingsPending,
    isError: writebackMappingsError,
    refetch: refetchWritebackMappings,
  } = useQuery({
    queryKey: WRITEBACK_MAPPINGS_QUERY_KEY,
    queryFn: getWritebackMappings,
    enabled: Boolean(checkIdFromSearch && !isFixtureIssueId(checkIdFromSearch)),
  });

  const {
    data: writebackPossible,
    isPending: writebackPossiblePending,
    isError: writebackPossibleError,
    refetch: refetchWritebackPossible,
  } = useQuery({
    queryKey: WRITEBACK_POSSIBLE_QUERY_KEY,
    queryFn: getWritebackPossible,
    enabled: Boolean(checkIdFromSearch && !isFixtureIssueId(checkIdFromSearch)),
  });

  const writebackMappingsList = writebackMappingsPending
    ? undefined
    : writebackMappings?.mappings ?? [];
  const writebackPossibleRows = writebackPossiblePending
    ? undefined
    : writebackPossibleError
      ? undefined
      : writebackPossible?.rows;

  const preliminaryTarget = useMemo(
    () => resolveFixTarget(search, worklist?.issues, writebackMappingsList),
    [search, worklist?.issues, writebackMappingsList],
  );

  const liveCheckId =
    preliminaryTarget.kind === "live" ? preliminaryTarget.checkId : undefined;

  const {
    data: issueDetail,
    isPending: issueDetailPending,
  } = useQuery({
    queryKey: dcsWorklistIssueQueryKey(liveCheckId ?? ""),
    queryFn: () => getDcsWorklistIssue(liveCheckId!),
    enabled: Boolean(liveCheckId),
  });

  const target = useMemo((): FixTarget => {
    if (preliminaryTarget.kind !== "live") return preliminaryTarget;
    return {
      ...preliminaryTarget,
      plan: buildLiveFixPlan(preliminaryTarget.issue, issueDetail),
    };
  }, [preliminaryTarget, issueDetail]);

  const writebackCheckId = fixTargetCheckId(target);
  const writebackCapable = isFixTargetWritebackCapable(target);
  const writebackStatusRunId =
    worklist?.data_run_id ?? issueDetail?.data_run_id ?? null;

  const writebackStatusEnabled = Boolean(
    writebackCheckId &&
      writebackCapable &&
      !isFixtureIssueId(writebackCheckId),
  );
  const {
    data: writebackStatus,
    isPending: writebackStatusPending,
    isFetching: writebackStatusFetching,
  } = useQuery({
    queryKey: writebackStatusQueryKey(writebackCheckId ?? "", writebackStatusRunId),
    queryFn: () => getWritebackStatus(writebackCheckId!, writebackStatusRunId),
    enabled: writebackStatusEnabled,
  });
  /** Avoid Approve flash before first gate status settles (WB-06). */
  const writebackStatusReady = !writebackStatusEnabled || !writebackStatusPending;

  const {
    data: recommendations,
    isPending: recommendationsPending,
    isSuccess: recommendationsSuccess,
    isError: recommendationsError,
  } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
    enabled:
      target.kind === "fixture" ||
      target.kind === "live" ||
      target.kind === "sandbox-mapping",
  });

  const checkIdForStudio = fixTargetCheckId(target);

  const workflowStudioTarget = useMemo((): WorkflowStudioLink => {
    if (target.kind === "fixture") {
      return workflowStudioFromLegacyWorkflow(target.issue.workflowId);
    }
    return workflowStudioFromFix(recommendations?.pilots, checkIdForStudio);
  }, [target, recommendations?.pilots, checkIdForStudio]);

  const studioEligibility = useMemo(
    () =>
      resolveFixStudioEligibility({
        isFixture: target.kind === "fixture",
        checkId: checkIdForStudio,
        pilots: recommendations?.pilots,
        recommendationsPending,
        recommendationsSuccess,
        recommendationsError,
      }),
    [
      target.kind,
      checkIdForStudio,
      recommendations?.pilots,
      recommendationsPending,
      recommendationsSuccess,
      recommendationsError,
    ],
  );

  const issueKey =
    target.kind === "fixture"
      ? target.issueId
      : target.kind === "live" || target.kind === "sandbox-mapping"
        ? target.checkId
        : target.kind === "loading"
          ? target.checkId
          : target.kind === "missing"
            ? target.checkId
            : null;

  const writebackPreviewMutation = useMutation({
    mutationFn: () => previewWriteback(writebackCheckId!),
    onSuccess: (result) => {
      if (writebackStatus?.gate !== "locked") {
        setWritten(false);
        setRolledBack(false);
        setExecuteResult(null);
      }
      setApprovePhase("idle");
      setPendingApproval(null);
      setRejectionNotice(null);
      setPreviewStaleNotice(null);
      setHydratedPreview(null);
      setRequireFreshPreview(false);
      forcePreviewInFlightRef.current = false;
      setPreviewTab("writeback");
      // C4 — refresh status so a newer dry-run is not shadowed by an older APPROVED grant.
      if (writebackCheckId) {
        void queryClient.invalidateQueries({
          queryKey: writebackStatusQueryKey(writebackCheckId, writebackStatusRunId),
        });
      }
      const ready = result.summary?.ready ?? 0;
      if (ready >= 1) {
        toast.message(`Preview ready · ${ready} change${ready === 1 ? "" : "s"}`);
      }
    },
    onError: (error) => {
      toast.error(writebackPreviewErrorMessage(error));
      // C4: failed force-preview must not permanently hide a still-valid APPROVED grant.
      // C2 mismatch keeps requireFreshPreview until a successful preview.
      if (forcePreviewInFlightRef.current) {
        forcePreviewInFlightRef.current = false;
        setRequireFreshPreview(false);
      }
    },
  });

  useEffect(() => {
    setWritten(false);
    setRolledBack(false);
    setExecuteResult(null);
    setApprovePhase("idle");
    setPreviewTab("evidence");
    setPendingApproval(null);
    setRejectionNotice(null);
    setPreviewStaleNotice(null);
    setHydratedPreview(null);
    setRequireFreshPreview(false);
    forcePreviewInFlightRef.current = false;
    setChangePreviewOpen(false);
    writebackPreviewMutation.reset();
    // Reset only when the selected issue changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation identity changes each render
  }, [issueKey]);

  useEffect(() => {
    if (!writebackStatus || !writebackCheckId) return;
    if (writebackStatus.check_id !== writebackCheckId) return;
    if (writebackStatus.gate === "locked" && writebackStatus.latest_execute) {
      setWritten(true);
      setRolledBack(false);
      setExecuteResult((prev) => {
        if (prev && isWritebackExecuteSuccess(prev)) return prev;
        return executeResultFromWritebackStatus(writebackStatus);
      });
      return;
    }
    if (writebackStatus.gate === "rolled_back") {
      setWritten(false);
      setRolledBack(true);
      setExecuteResult(null);
      return;
    }
    // Gate open (e.g. after re-score) → clear sticky Written so Approve can run again.
    if (writebackStatus.gate === "open" || writebackStatus.gate === "no_dcs_run") {
      setWritten(false);
      setRolledBack(false);
      setExecuteResult(null);
    }
  }, [writebackStatus, writebackCheckId]);

  const writebackEnabled = isWritebackPreviewAvailable(
    writebackMappingsList,
    writebackPossibleRows,
    writebackCheckId,
    {
      mappingsLoadError: writebackMappingsError,
      possibleLoadError: writebackPossibleError,
    },
  );

  const writebackPreview = writebackPreviewMutation.data ?? hydratedPreview;

  const writebackTable = useMemo(() => {
    if (written && executeResult) {
      return writebackPreviewToTable(executeResult, "executed");
    }
    if (writebackPreview) {
      return writebackPreviewToTable(writebackPreview, "preview");
    }
    return null;
  }, [written, executeResult, writebackPreview]);
  const writebackMeta = writebackPreview
    ? writebackPreviewMeta(writebackPreview)
    : null;

  const isLive = writebackCapable;
  const isFixture = target.kind === "fixture";
  const liveExportIssue = target.kind === "live" ? target.issue : null;
  const canExportEvidence = useMemo(() => {
    if (!liveExportIssue) return false;
    return hasExportableEvidence(liveExportIssue, issueDetail ?? null);
  }, [liveExportIssue, issueDetail]);
  const evidenceExportDisabledReason = !liveExportIssue
    ? undefined
    : issueDetailPending && !canExportEvidence
      ? "Loading evidence…"
      : !canExportEvidence
        ? "No row-level evidence on this run"
        : undefined;
  const plan: FixPlan | undefined =
    target.kind === "fixture" ||
    target.kind === "live" ||
    target.kind === "sandbox-mapping"
      ? target.plan
      : undefined;

  // undefined = currentUser not yet loaded (don't block Approve while loading)
  // true/false = server value is known
  const writebackExecuteEnabled = currentUser
    ? companyWritebackExecuteEnabled(currentUser.company)
    : undefined;

  const approvalFlowInput = useMemo(
    () => ({
      checkId: writebackCheckId,
      possibleRows: writebackPossibleRows,
      mappings: writebackMappingsList,
      preview: writebackPreview ?? null,
      role: currentUser?.role,
      writebackExecuteEnabled,
      statusGate: writebackStatus?.gate ?? null,
      possibleLoadError: writebackPossibleError,
      mappingsLoadError: writebackMappingsError,
      pendingApproval,
    }),
    [
      writebackCheckId,
      writebackPossibleRows,
      writebackMappingsList,
      writebackPreview,
      currentUser?.role,
      writebackExecuteEnabled,
      writebackStatus?.gate,
      writebackPossibleError,
      writebackMappingsError,
      pendingApproval,
    ],
  );

  const requestApprovalBlockReason: WritebackApproveBlockReason | "fixture" | null =
    useMemo(() => {
      if (isFixture) return "fixture";
      if (!writebackCapable || !writebackCheckId) return "not_on_allowlist";
      return resolveWritebackRequestApprovalBlockReason(approvalFlowInput);
    }, [isFixture, writebackCapable, writebackCheckId, approvalFlowInput]);

  const approveWriteBlockReason: WritebackApproveBlockReason | "fixture" | null =
    useMemo(() => {
      if (isFixture) return "fixture";
      if (!writebackCapable || !writebackCheckId) return "not_on_allowlist";
      return resolveWritebackApproveWriteBlockReason(approvalFlowInput);
    }, [isFixture, writebackCapable, writebackCheckId, approvalFlowInput]);

  const rejectBlockReason: WritebackApproveBlockReason | "fixture" | null =
    useMemo(() => {
      if (isFixture) return "fixture";
      if (!writebackCapable || !writebackCheckId) return "not_on_allowlist";
      return resolveWritebackRejectBlockReason(approvalFlowInput);
    }, [isFixture, writebackCapable, writebackCheckId, approvalFlowInput]);

  const canRequestApproval =
    !isFixture &&
    writebackStatusReady &&
    (!pendingApproval || isWritebackApprovalExpired(pendingApproval)) &&
    isWritebackRequestApprovalExecutable(approvalFlowInput);

  const canApproveWrite =
    !isFixture &&
    writebackStatusReady &&
    Boolean(pendingApproval) &&
    !isWritebackApprovalExpired(pendingApproval) &&
    isWritebackApproveWriteExecutable(approvalFlowInput);

  const canRejectWriteback =
    !isFixture &&
    writebackStatusReady &&
    Boolean(pendingApproval) &&
    !isWritebackApprovalExpired(pendingApproval) &&
    isWritebackRejectExecutable(approvalFlowInput);

  /** C3 — expired PENDING/APPROVED must not keep Approve UI or hide Request approval. */
  const livePendingApproval =
    pendingApproval && !isWritebackApprovalExpired(pendingApproval)
      ? pendingApproval
      : null;

  const requestApprovalDisabledReason =
    requestApprovalBlockReason === "fixture"
      ? "Demo plan · writebacks off"
      : writebackApproveBlockMessage(requestApprovalBlockReason);

  const approveWriteDisabledReason =
    approveWriteBlockReason === "fixture"
      ? "Demo plan · writebacks off"
      : writebackApproveBlockMessage(approveWriteBlockReason);

  const rejectDisabledReason =
    rejectBlockReason === "fixture"
      ? "Demo plan · writebacks off"
      : writebackApproveBlockMessage(rejectBlockReason);

  const invalidateWritebackQueries = () => {
    void queryClient.invalidateQueries({ queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DCS_WORKLIST_QUERY_KEY });
    if (writebackCheckId) {
      void queryClient.invalidateQueries({
        queryKey: writebackStatusQueryKey(writebackCheckId, writebackStatusRunId),
      });
    }
    if (liveCheckId) {
      void queryClient.invalidateQueries({
        queryKey: dcsWorklistIssueQueryKey(liveCheckId),
      });
    }
  };

  const requestApprovalMutation = useMutation({
    mutationFn: async () => {
      const jobId = writebackPreview?.job_id?.trim();
      if (!jobId) throw { detail: "Run writeback preview first", status: 400 };
      setApprovePhase("requesting");
      return requestWritebackApproval(jobId);
    },
    onSuccess: (token) => {
      setApprovePhase("idle");
      setPendingApproval(token);
      setRejectionNotice(null);
      setPreviewStaleNotice(null);
      toast.success("Approval requested · awaiting admin decision");
      invalidateWritebackQueries();
    },
    onError: (error) => {
      setApprovePhase("idle");
      toast.error(writebackApprovalErrorMessage(error));
    },
  });

  const approveWriteMutation = useMutation({
    mutationFn: async (): Promise<WritebackExecuteResult> => {
      if (!writebackCheckId || !writebackPreview || !pendingApproval) {
        throw { detail: "Request writeback approval first", status: 400 };
      }
      const diffHash = writebackPreview.diff_hash?.trim();
      const approvalId = pendingApproval.approval_id?.trim();
      if (!diffHash || !approvalId) {
        throw { detail: "Request writeback approval first", status: 400 };
      }
      let failureStep: "approval" | "execute" = "approval";
      try {
        // Skip re-approve when token already APPROVED (execute failed after grant).
        if (pendingApproval.status !== "APPROVED") {
          setApprovePhase("approving");
          await approveWritebackApproval(approvalId);
          setPendingApproval((prev) =>
            prev && prev.approval_id === approvalId
              ? { ...prev, status: "APPROVED", approved_at: new Date().toISOString() }
              : prev,
          );
        }
        setApprovePhase("writing");
        failureStep = "execute";
        return await executeWriteback({
          checkId: writebackCheckId,
          diffHash,
          approvalId,
        });
      } catch (error) {
        throw Object.assign(
          error && typeof error === "object" ? error : { detail: String(error) },
          { _wbStep: failureStep },
        );
      }
    },
    onSuccess: (result) => {
      setApprovePhase("idle");
      setPendingApproval(null);
      if (!isWritebackExecuteSuccess(result)) {
        toast.error(
          result.blocked_reason
            ? String(result.blocked_reason)
            : "Writeback did not apply any updates.",
        );
        return;
      }
      setWritten(true);
      setRolledBack(false);
      setExecuteResult(result);
      const platform = platformLabelFromExecute(result);
      toast.success(
        `Writeback applied · ${result.check_id} · ${result.summary.executed} update${
          result.summary.executed === 1 ? "" : "s"
        }${platform ? ` · ${platform}` : ""}`,
      );
      invalidateWritebackQueries();
    },
    onError: (error) => {
      setApprovePhase("idle");
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;
      const step =
        error && typeof error === "object" && "_wbStep" in error
          ? String((error as { _wbStep?: string })._wbStep)
          : undefined;
      if (isWritebackAlreadyExecutedForRunError(error)) {
        toast.message(writebackExecuteErrorMessage(error));
        setWritten(true);
        setRolledBack(false);
        const errRec =
          error && typeof error === "object"
            ? (error as {
                execute_job_id?: string;
                data_run_id?: number;
                check_id?: string;
              })
            : {};
        if (errRec.execute_job_id && writebackCheckId) {
          setExecuteResult((prev) => {
            if (prev && isWritebackExecuteSuccess(prev)) return prev;
            return {
              check_id: errRec.check_id ?? writebackCheckId,
              mode: "execute",
              diff_hash: writebackPreview?.diff_hash ?? "",
              blocked_reason: null,
              job_id: String(errRec.execute_job_id),
              data_run_id:
                typeof errRec.data_run_id === "number"
                  ? errRec.data_run_id
                  : writebackStatusRunId,
              approval_tier: null,
              irreversible: false,
              operator_disclosure: null,
              intents: [],
              summary: { ready: 0, skipped: 0, errors: 0, executed: 1 },
              execute_eligible: { sandbox: true, production: false },
            };
          });
        }
        setPendingApproval(null);
        if (writebackCheckId) {
          void queryClient.invalidateQueries({
            queryKey: writebackStatusQueryKey(writebackCheckId, writebackStatusRunId),
          });
        }
        return;
      }
      // Permission errors before execute-retry: execute-step 403 must not claim
      // "Approval kept · retry" (C1) — retry will not help without role change.
      if (status === 403) {
        toast.error(
          step === "execute"
            ? writebackExecuteErrorMessage(error)
            : writebackApprovalErrorMessage(error),
        );
        invalidateWritebackQueries();
        return;
      }
      // C2 — stale preview hash: unlock re-preview; do not keep Approve & write.
      if (isWritebackDiffHashMismatchError(error)) {
        forcePreviewInFlightRef.current = false;
        setRequireFreshPreview(true);
        setPendingApproval(null);
        setHydratedPreview(null);
        writebackPreviewMutation.reset();
        setPreviewTab("evidence");
        setRejectionNotice(null);
        setPreviewStaleNotice(WRITEBACK_DIFF_HASH_MISMATCH_BANNER);
        invalidateWritebackQueries();
        toast.error(writebackExecuteErrorMessage(error), {
          description: "Run Writeback preview again, then request approval.",
        });
        return;
      }
      // No DCS run — not a retriable execute with kept approval.
      if (isWritebackDcsRunRequiredError(error)) {
        invalidateWritebackQueries();
        toast.error(writebackExecuteErrorMessage(error));
        return;
      }
      if (status === 409 || step === "execute") {
        // Keep APPROVED token so Approve & write can retry execute without re-grant.
        // Do not treat approval-step 501 as "already granted" — that would skip re-approve
        // while the backend token is still PENDING.
        setPendingApproval((prev) =>
          prev ? { ...prev, status: "APPROVED" } : prev,
        );
        invalidateWritebackQueries();
        toast.error(writebackExecuteErrorMessage(error), {
          description: "Approval kept — click Approve & write again to retry the write.",
        });
        return;
      }
      // Approval step failed (expired, not pending, etc.) — refresh status so stale
      // PENDING tokens clear and Request approval can run again.
      invalidateWritebackQueries();
      toast.error(writebackApprovalErrorMessage(error));
    },
  });

  const rejectApprovalMutation = useMutation({
    mutationFn: async () => {
      const approvalId = pendingApproval?.approval_id?.trim();
      if (!approvalId) throw { detail: "No pending approval", status: 400 };
      setApprovePhase("rejecting");
      return rejectWritebackApproval(approvalId, {
        reason: rejectReason.trim() || undefined,
      });
    },
    onSuccess: () => {
      setApprovePhase("idle");
      setRejectConfirmOpen(false);
      setPendingApproval(null);
      setRejectionNotice(
        rejectReason.trim()
          ? `${WRITEBACK_REJECTED_BANNER} Reason: ${rejectReason.trim()}`
          : WRITEBACK_REJECTED_BANNER,
      );
      setPreviewStaleNotice(null);
      setRejectReason("");
      setHydratedPreview(null);
      setRequireFreshPreview(false);
      writebackPreviewMutation.reset();
      setPreviewTab("evidence");
      toast.message(WRITEBACK_REJECTED_BANNER);
      invalidateWritebackQueries();
    },
    onError: (error) => {
      setApprovePhase("idle");
      invalidateWritebackQueries();
      toast.error(writebackApprovalErrorMessage(error));
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: () => {
      const jobId = executeResult?.job_id?.trim();
      if (!jobId) throw { detail: "Missing execute job_id", status: 400 };
      return rollbackWriteback(jobId);
    },
    onSuccess: (result) => {
      setRollbackConfirmOpen(false);
      setRolledBack(true);
      setWritten(false);
      setExecuteResult(null);
      setApprovePhase("idle");
      // PRD §6.7 — re-Approve requires a fresh preview (diff may change).
      writebackPreviewMutation.reset();
      setHydratedPreview(null);
      setPreviewTab("evidence");
      toast.success(
        `Writeback rolled back · ${String(result.job_id).slice(0, 8)}…`,
      );
      void queryClient.invalidateQueries({ queryKey: AUDIT_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: AUDIT_EVENTS_QUERY_KEY });
      if (writebackCheckId) {
        void queryClient.invalidateQueries({
          queryKey: writebackStatusQueryKey(writebackCheckId, writebackStatusRunId),
        });
      }
    },
    onError: (error) => {
      toast.error(writebackRollbackErrorMessage(error));
    },
  });

  useEffect(() => {
    if (!writebackStatusReady || !writebackStatus || !writebackCheckId) return;
    if (writebackStatus.check_id !== writebackCheckId) return;
    // C2 — after diff_hash_mismatch, do not re-hydrate stale grant/preview.
    if (requireFreshPreview) return;

    const fromStatus = writebackStatus.latest_pending_approval;
    const grantedFromStatus = writebackStatus.latest_granted_approval;
    const localPreview = writebackPreviewMutation.data;
    const pendingLive =
      fromStatus?.status === "PENDING" && !isWritebackApprovalExpired(fromStatus);

    if (pendingLive) {
      if (
        localPreview?.job_id &&
        localPreview.job_id !== fromStatus.job_id
      ) {
        setPendingApproval(null);
        return;
      }
      const pendingFromStatus = pendingApprovalFromWritebackStatus(writebackStatus);
      const previewFromStatus = previewResultFromWritebackStatus(writebackStatus);
      if (pendingFromStatus) {
        setPendingApproval(pendingFromStatus);
      }
      if (
        previewFromStatus &&
        (!localPreview || localPreview.job_id === previewFromStatus.job_id)
      ) {
        setHydratedPreview(previewFromStatus);
        setPreviewTab("writeback");
      }
      return;
    }

    if (grantedFromStatus?.status === "APPROVED" && !isWritebackApprovalExpired(grantedFromStatus)) {
      if (
        localPreview?.job_id &&
        localPreview.job_id !== grantedFromStatus.job_id
      ) {
        setPendingApproval(null);
        return;
      }
      const grantedToken = grantedApprovalFromWritebackStatus(writebackStatus);
      const previewFromStatus = previewResultFromWritebackStatus(writebackStatus);
      if (grantedToken) {
        setPendingApproval(grantedToken);
      }
      if (
        previewFromStatus &&
        (!localPreview || localPreview.job_id === previewFromStatus.job_id)
      ) {
        setHydratedPreview(previewFromStatus);
        setPreviewTab("writeback");
      }
      return;
    }

    const approveInFlight =
      approveWriteMutation.isPending ||
      approvePhase === "approving" ||
      approvePhase === "writing" ||
      approvePhase === "requesting";
    if (
      !writebackStatusFetching &&
      !requestApprovalMutation.isPending &&
      !approveInFlight
    ) {
      setPendingApproval(null);
      if (!localPreview) {
        setHydratedPreview(null);
      }
    }
  }, [
    writebackStatus,
    writebackStatusReady,
    writebackStatusFetching,
    writebackCheckId,
    writebackPreviewMutation.data,
    approvePhase,
    requestApprovalMutation.isPending,
    approveWriteMutation.isPending,
    requireFreshPreview,
  ]);

  const nonExecutableHonesty = useMemo(() => {
    if (isFixture || !writebackCapable || !writebackCheckId) return null;
    return writebackNonExecutableHonesty(
      writebackCheckId,
      writebackPossibleRows,
      writebackMappingsList,
      {
        possibleLoadError: writebackPossibleError,
        mappingsLoadError: writebackMappingsError,
      },
    );
  }, [
    isFixture,
    writebackCapable,
    writebackCheckId,
    writebackPossibleRows,
    writebackMappingsList,
    writebackPossibleError,
    writebackMappingsError,
  ]);

  const previewReady =
    (writebackPreview?.summary.ready ?? 0) >= 1 &&
    Boolean(writebackPreview?.job_id) &&
    Boolean(writebackPreview?.diff_hash);

  const changePreviewPhase: "preview" | "executed" = written ? "executed" : "preview";

  const changePreviewSource = useMemo(() => {
    if (written && executeResult?.intents?.length) return executeResult;
    return writebackPreview;
  }, [written, executeResult, writebackPreview]);

  const changePreviewIntentRows = useMemo(
    () => writebackChangePreviewIntents(changePreviewSource, changePreviewPhase),
    [changePreviewSource, changePreviewPhase],
  );

  const changePreviewSummary = useMemo(
    () =>
      writebackChangePreviewSummary(
        changePreviewSource,
        writebackStatus?.data_run_id ?? writebackStatusRunId,
        changePreviewPhase,
      ),
    [
      changePreviewSource,
      writebackStatus?.data_run_id,
      writebackStatusRunId,
      changePreviewPhase,
    ],
  );

  const changePreviewDcsImpact = useMemo(() => {
    if (target.kind !== "live") return null;
    return writebackDcsImpactLine({
      revenueImpact: target.issue.revenue_impact,
      currency: target.issue.currency ?? issueDetail?.currency,
      previewReady: previewReady || written,
    });
  }, [target, issueDetail?.currency, previewReady, written]);

  const changePreviewWorkflowImpact = useMemo(
    () =>
      writebackWorkflowsUnblockedEstimate({
        checkId: writebackCheckId,
        pilots: recommendations?.pilots,
        previewReady,
        written,
        recommendationsPending,
        recommendationsError,
      }),
    [
      writebackCheckId,
      recommendations?.pilots,
      previewReady,
      written,
      recommendationsPending,
      recommendationsError,
    ],
  );

  const showChangePreviewDrawer =
    writebackCapable &&
    !isFixture &&
    (previewReady || written) &&
    changePreviewIntentRows.length > 0;

  const showRollback =
    written &&
    Boolean(executeResult?.job_id) &&
    (executeResult?.rollback?.supported === true ||
      isWritebackSheetRollbackSupported(writebackPossibleRows, writebackCheckId));

  const approveInFlight =
    requestApprovalMutation.isPending ||
    approveWriteMutation.isPending ||
    rejectApprovalMutation.isPending;
  const trustApproveLabel = written
    ? "Approved"
    : approvePhase === "requesting"
      ? "Requesting approval…"
      : approvePhase === "approving" || approvePhase === "writing"
        ? "Approving…"
        : livePendingApproval?.status === "APPROVED"
          ? "Approval granted · retry write"
          : livePendingApproval
            ? "Approval requested · awaiting admin"
            : previewStaleNotice
              ? "Preview changed · re-preview required"
              : rejectionNotice
                ? "Rejected · re-preview required"
                : previewReady
                  ? "Awaiting approval request"
                  : "Awaiting preview";
  const trustAuditLabel = rolledBack
    ? "Rolled back"
    : written
      ? "Written"
      : "Will write on approval";
  const trustTestLabel = previewStaleNotice
    ? "Preview changed · run preview again"
    : rejectionNotice
      ? "Rejected · run preview again"
      : !writebackPreview
        ? "Awaiting preview"
        : previewReady
          ? livePendingApproval
            ? "Test complete · awaiting admin decision"
            : "Test complete · ready for approval request"
          : "Preview empty / blocked";
  const heroStepBadge = written
    ? "Step 04 · Written"
    : livePendingApproval
      ? "Step 03 · Awaiting admin"
      : previewReady
        ? "Step 02 · Test complete"
        : "Step 01 · Review";
  const approveProgressLabel =
    approvePhase === "requesting"
      ? "Requesting approval…"
      : approvePhase === "approving"
        ? "Approving…"
        : approvePhase === "writing"
          ? "Writing to connected systems…"
          : approvePhase === "rejecting"
            ? "Rejecting writeback…"
            : null;
  const isWritebackAdmin =
    (currentUser?.role ?? "").trim().toLowerCase() === "admin";

  const waitingForMappings =
    Boolean(checkIdFromSearch) &&
    !isFixtureIssueId(checkIdFromSearch ?? "") &&
    writebackMappingsPending &&
    preliminaryTarget.kind === "loading";

  const activePreview = useMemo(() => {
    if (!plan) {
      return {
        title: "",
        helper: "",
        columns: [] as string[],
        rows: [] as string[][],
      };
    }
    if (previewTab === "writeback" && writebackTable) {
      const checkLabel =
        (written && executeResult?.check_id) ||
        writebackPreview?.check_id ||
        plan.changeSetId;
      return {
        title: written
          ? `Writeback result · ${checkLabel}`
          : `Writeback preview · ${checkLabel}`,
        helper: writebackTable.helper,
        columns: writebackTable.columns,
        rows: writebackTable.rows,
      };
    }
    return {
      title: plan.previewTitle,
      helper: plan.previewHelper,
      columns: plan.previewColumns,
      rows: plan.previewRows,
    };
  }, [
    plan,
    previewTab,
    writebackPreview?.check_id,
    writebackTable,
    written,
    executeResult?.check_id,
  ]);

  const switchSearch = switchIssueSearch(target);
  const issueTitle = pageIssueTitle(target);

  const displayGov = useMemo(() => {
    if (!plan) return [];
    return plan.gov.map((row) => {
      if (row.k === "Current state") {
        if (written && executeResult?.job_id) {
          return {
            k: row.k,
            v:
              writebackProvenanceLine({
                dataRunId:
                  executeResult.data_run_id ?? writebackStatus?.data_run_id,
                jobId: executeResult.job_id,
              }) ?? `Written · job ${executeResult.job_id.slice(0, 8)}…`,
          };
        }
        if (previewReady) {
          return { k: row.k, v: "Preview ready · awaiting admin approve" };
        }
        return row;
      }
      if (row.k === "Rollback") {
        if (writebackCapable && !isFixture) {
          return {
            k: row.k,
            v: writebackRollbackGovLabel({
              written,
              rolledBack,
              showRollback,
              status: writebackStatus,
            }),
          };
        }
        return row;
      }
      if (row.k === "Audit mode" && written) {
        return { k: row.k, v: "writeback.executed recorded" };
      }
      return row;
    });
  }, [plan, written, executeResult, previewReady, rolledBack, showRollback, writebackStatus, writebackCapable, isFixture]);

  const activityDeepLink = useMemo(
    () =>
      writebackActivityDeepLink({
        checkId: writebackCheckId ?? executeResult?.check_id,
        jobId: executeResult?.job_id,
      }),
    [writebackCheckId, executeResult?.check_id, executeResult?.job_id],
  );

  const writebackRollbackHonesty = useMemo(() => {
    if (isFixture || !writebackCapable || !writebackCheckId) return null;
    return writebackRollbackHonestyNotice(writebackStatus);
  }, [isFixture, writebackCapable, writebackCheckId, writebackStatus]);

  const writebackMappingsSoftNotice = useMemo(() => {
    if (isFixture || !writebackCapable || !writebackCheckId || written) return null;
    return writebackMappingsLoadSoftNotice({
      checkId: writebackCheckId,
      possibleRows: writebackPossibleRows,
      possibleLoadError: writebackPossibleError,
      mappingsLoadError: writebackMappingsError,
    });
  }, [
    isFixture,
    writebackCapable,
    writebackCheckId,
    written,
    writebackPossibleRows,
    writebackPossibleError,
    writebackMappingsError,
  ]);

  const writebackMappingEntry = useMemo(
    () => writebackMappingForCheck(writebackMappingsList, writebackCheckId),
    [writebackMappingsList, writebackCheckId],
  );

  const writebackIrreversibleHonesty = useMemo(() => {
    if (isFixture || !writebackCapable || written) return null;
    return writebackIrreversibleHonestyNotice(writebackPreview, writebackMappingEntry);
  }, [isFixture, writebackCapable, written, writebackPreview, writebackMappingEntry]);

  const writebackOperatorInfo = useMemo(() => {
    if (isFixture || !writebackCapable || written || writebackIrreversibleHonesty) return null;
    return writebackOperatorInfoNotice(writebackPreview, writebackMappingEntry);
  }, [
    isFixture,
    writebackCapable,
    written,
    writebackIrreversibleHonesty,
    writebackPreview,
    writebackMappingEntry,
  ]);

  const writebackLimitedRollbackNotice = useMemo(() => {
    if (isFixture || !writebackCapable || written) return null;
    return writebackLimitedRollbackHonesty(writebackPossibleRows, writebackCheckId);
  }, [isFixture, writebackCapable, written, writebackPossibleRows, writebackCheckId]);

  const writebackShopifyNotice = useMemo(() => {
    if (isFixture || !writebackCapable || written) return null;
    return writebackShopifyMetafieldHonesty(writebackCheckId);
  }, [isFixture, writebackCapable, written, writebackCheckId]);

  const studioNextHelper =
    written
      ? "Data write done — continue to Workflow Studio when ready. Re-score may be needed before Generate unlocks."
      : nonExecutableHonesty || (isLive && !writebackEnabled)
        ? "Complete evidence or manual fix, then re-run the score. When gates clear, build the workflow brief in Studio."
        : "Once the fix is approved and the score re-checks, Klints builds the workflow brief on validated data — what to build, for which segment.";

  function handleRequestApprovalClick() {
    if (isFixture) {
      toast.message("Demo only — does not update Manago.ai");
      return;
    }
    if (!canRequestApproval || approveInFlight || written) return;
    requestApprovalMutation.mutate();
  }

  /** C4 — APPROVED banner promises a new preview; this is the explicit force path. */
  function handleForceWritebackPreview() {
    if (isFixture) {
      toast.message("Demo only — does not update Manago.ai");
      return;
    }
    if (!writebackCheckId || !writebackEnabled || written) return;
    if (writebackPreviewMutation.isPending || approveInFlight) return;
    forcePreviewInFlightRef.current = true;
    setRequireFreshPreview(true);
    setPendingApproval(null);
    setRejectionNotice(null);
    setPreviewStaleNotice(null);
    setHydratedPreview(null);
    writebackPreviewMutation.reset();
    writebackPreviewMutation.mutate();
  }

  function handleApproveWriteClick() {
    if (isFixture) {
      toast.message("Demo only — does not update Manago.ai");
      return;
    }
    if (!canApproveWrite || approveInFlight || written) return;
    if (isWritebackIrreversibleApproveRequired(writebackPreview, writebackMappingEntry)) {
      setApproveWriteConfirmOpen(true);
      return;
    }
    approveWriteMutation.mutate();
  }

  function handleRejectClick() {
    if (!canRejectWriteback || approveInFlight || written) return;
    setRejectConfirmOpen(true);
  }

  function handleRollbackClick() {
    if (!executeResult?.job_id || rollbackMutation.isPending || approveInFlight) return;
    setRollbackConfirmOpen(true);
  }

  function handleDownloadEvidenceClick() {
    if (!liveExportIssue || issueDetailPending || !canExportEvidence) {
      toast.error(
        issueDetailPending ? "Evidence still loading" : "Nothing to download",
      );
      return;
    }
    const filename = downloadFixEvidenceExport({
      issue: liveExportIssue,
      detail: issueDetail ?? null,
    });
    if (!filename) {
      toast.error("Nothing to download");
      return;
    }
    toast.success(`Downloaded · ${filename}`);
  }

  if (prodFixtureBleed) {
    return (
      <AppShell title="Fix" subtitle="Phase 2 · Fix flow">
        <div className="flow-empty">
          <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
          <h2>Demo fixture blocked</h2>
          <p>
            Production builds do not open demo Fix plans. Pick a live issue from Data
            Consistency.
          </p>
          <Link
            to="/data-consistency"
            className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Fix"
      subtitle="Phase 2 · Fix flow"
      issueTitle={issueTitle}
    >
      <div className="fix-page">
        <PageTitle
          variant="design"
          kicker="Phase 2 · Fix"
          title="Review & edit the fix · human-approved"
          description="Klints prepares the fix; a human reviews, edits, and approves before it builds."
          actions={
            switchSearch ? (
              <Link
                to="/data-consistency"
                search={switchSearch}
                hash="dcs-issues"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
              >
                Switch issue
              </Link>
            ) : undefined
          }
        />

        {target.kind === "loading" ||
        (needsWorklist && worklistPending) ||
        waitingForMappings ? (
          <KlintsLoader label="Loading issue…" fullScreen={false} />
        ) : worklistError && needsWorklist ? (
          <div className="fix-empty">
            <h2>Could not load issue</h2>
            <p>
              The Data Consistency worklist could not be loaded. Check your connection
              and try again.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void refetchWorklist()}
                disabled={worklistFetching}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {worklistFetching ? "Retrying…" : "Try again"}
              </button>
              <Link
                to="/data-consistency"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand"
              >
                Go to Data Consistency Score
              </Link>
            </div>
          </div>
        ) : target.kind === "missing" ? (
          <div className="fix-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Issue not found</h2>
            <p>
              {target.checkId
                ? `${target.checkId} is not an open issue on the latest score. It may have been resolved or is no longer FAIL or WARN.`
                : "That issue could not be found. Pick an open issue from Data Consistency Score."}
            </p>
            <Link
              to="/data-consistency"
              search={target.checkId ? { issue: target.checkId } : undefined}
              hash="dcs-issues"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : target.kind === "empty" || !plan ? (
          <div className="fix-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Please select an issue</h2>
            <p>
              The Fix stage shows one change-set at a time. Pick an issue from Data
              Consistency Score to review and approve it here.
            </p>
            <Link
              to="/data-consistency"
              hash="dcs-issues"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="fix-trust">
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
                How Klints handles every customer data update
              </div>
              <h2 className="font-display mt-1 text-lg font-semibold tracking-tight">
                Four governed steps · review, test, approve, audit
              </h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                No production update reaches Manago.ai or Shopify without all four steps
                completed and recorded. Writes require preview, approval request, admin
                approve & write, and Allow writebacks enabled in Settings.
              </p>
              <div className="fix-trust-steps">
                <div className="fix-trust-step is-done">
                  <div className="t-num">01 · REVIEW</div>
                  <div className="t-name">What will change</div>
                  <div className="t-line">Klints shows the exact change and the evidence behind it</div>
                  <div className="t-state done">Reviewed</div>
                </div>
                <div
                  className={`fix-trust-step ${
                    previewReady || written ? "is-done" : "is-current"
                  }`}
                >
                  <div className="t-num">02 · TEST</div>
                  <div className="t-name">Dry-run preview</div>
                  <div className="t-line">Preview shows exact before/after on your connected Manago.ai / Shopify accounts</div>
                  <div
                    className={`t-state ${
                      previewReady || written ? "done" : "current"
                    }`}
                  >
                    {trustTestLabel}
                  </div>
                </div>
                <div
                  className={`fix-trust-step ${
                    written ? "is-done" : livePendingApproval || previewReady ? "is-current" : ""
                  }`}
                >
                  <div className="t-num">03 · APPROVE</div>
                  <div className="t-name">Human sign-off</div>
                  <div className="t-line">Admin approval required before any write</div>
                  <div
                    className={`t-state ${
                      written ? "done" : livePendingApproval || previewReady ? "current" : "pending"
                    }`}
                  >
                    {trustApproveLabel}
                  </div>
                </div>
                <div className={`fix-trust-step ${written || rolledBack ? "is-done" : ""}`}>
                  <div className="t-num">04 · AUDIT</div>
                  <div className="t-name">Append-only record</div>
                  <div className="t-line">Audit entry written for every state change</div>
                  <div
                    className={`t-state ${written || rolledBack ? "done" : "pending"}`}
                  >
                    {trustAuditLabel}
                  </div>
                </div>
              </div>
              {approveProgressLabel ? (
                <p className="mt-3 inline-flex items-center gap-2 text-[12px] font-medium text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {approveProgressLabel}
                </p>
              ) : null}
            </div>

            <div className={`fix-hero ${plan.mode === "build" ? "is-build" : ""}`}>
              <div className="fix-hero-head">
                <div>
                  <div
                    className={`text-[10px] font-medium uppercase tracking-[0.06em] ${
                      plan.mode === "build" ? "text-revenue" : "text-spark"
                    }`}
                  >
                    {plan.eyebrow}
                  </div>
                  <div className="fix-hero-title">{plan.title}</div>
                  <p className="fix-hero-sub">{plan.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium ${
                      plan.mode === "build"
                        ? "bg-revenue-soft text-revenue"
                        : written
                          ? "bg-revenue-soft text-revenue"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {plan.mode === "build" ? "Ready · no fix required" : heroStepBadge}
                  </span>
                  <span className="font-mono text-[11px] text-fog">{plan.changeSetId}</span>
                </div>
              </div>

              <div className="fix-kv-grid">
                {plan.kv.map((row) => (
                  <div key={row.k} className="fix-kv">
                    <div className="k">{row.k}</div>
                    <div className="v">{row.v}</div>
                  </div>
                ))}
              </div>

              <div className="fix-tp-row">
                <span className="fix-tp-label">Touchpoints affected</span>
                {plan.touchpoints.map((tp, i) => (
                  <span key={tp} className={`fix-tp-pill ${i === 0 ? "primary" : ""}`}>
                    {tp}
                  </span>
                ))}
              </div>

              <div className="fix-state-row">
                {plan.states.map((s, i) => (
                  <span key={s.label} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="fix-state-arrow">→</span>}
                    <span className={`fix-state ${s.status}`}>{s.label}</span>
                  </span>
                ))}
              </div>

              <div className="mt-[22px]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                    {activePreview.title}
                  </div>
                  {showChangePreviewDrawer ? (
                    <button
                      type="button"
                      onClick={() => setChangePreviewOpen(true)}
                      data-testid="writeback-change-preview-open"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm hover:bg-sand"
                    >
                      <GitCompare className="h-3 w-3" />
                      Change preview
                    </button>
                  ) : null}
                </div>
                <p className="fix-preview-helper">{activePreview.helper}</p>
                {liveExportIssue ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadEvidenceClick}
                      disabled={
                        issueDetailPending ||
                        !canExportEvidence ||
                        approveInFlight
                      }
                      title={evidenceExportDisabledReason}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      Download evidence (.csv)
                    </button>
                    {issueDetailPending ? (
                      <span className="text-[11px] text-muted-foreground">
                        Loading evidence…
                      </span>
                    ) : !canExportEvidence ? (
                      <span className="text-[11px] text-muted-foreground">
                        No row-level evidence on this run
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        CSV · opens in Excel
                      </span>
                    )}
                  </div>
                ) : isFixture ? (
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Demo data · export off
                  </p>
                ) : null}
                {isLive && writebackEnabled ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                      View
                    </span>
                    <div
                      className="inline-flex rounded-md border border-border bg-sand/50 p-0.5 shadow-sm"
                      role="tablist"
                      aria-label="Evidence and writeback preview"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === "evidence"}
                        onClick={() => setPreviewTab("evidence")}
                        disabled={approveInFlight}
                        className={`inline-flex items-center gap-1.5 rounded-[5px] px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                          previewTab === "evidence"
                            ? "bg-elevated text-foreground shadow-sm ring-1 ring-border/60"
                            : "text-muted-foreground hover:bg-elevated/70 hover:text-foreground"
                        }`}
                      >
                        <FileSpreadsheet className="h-4 w-4 shrink-0" />
                        Evidence
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={previewTab === "writeback"}
                        onClick={() => {
                          const forceNewPreview =
                            requireFreshPreview ||
                            Boolean(previewStaleNotice) ||
                            livePendingApproval?.status === "APPROVED";
                          // C2 / C4 — stale, missing, or APPROVED recovery must re-run.
                          if (writebackPreview && !forceNewPreview) {
                            setPreviewTab("writeback");
                            return;
                          }
                          if (livePendingApproval?.status === "APPROVED") {
                            handleForceWritebackPreview();
                            return;
                          }
                          writebackPreviewMutation.mutate();
                        }}
                        disabled={writebackPreviewMutation.isPending || approveInFlight}
                        className={`inline-flex items-center gap-1.5 rounded-[5px] px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                          previewTab === "writeback"
                            ? "bg-elevated text-foreground shadow-sm ring-1 ring-border/60"
                            : "text-muted-foreground hover:bg-elevated/70 hover:text-foreground"
                        }`}
                        data-testid="writeback-preview-tab"
                      >
                        {writebackPreviewMutation.isPending ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 shrink-0" />
                        )}
                        {writebackPreviewMutation.isPending
                          ? "Loading preview…"
                          : livePendingApproval?.status === "APPROVED"
                            ? "Run new preview"
                            : "Writeback preview"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {isLive && !writebackEnabled && nonExecutableHonesty ? (
                  <p className="mb-3 rounded-md border border-border bg-sand/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    Writeback preview is not available for this check. Download
                    evidence below for manual or integration fix — nothing is
                    written to Manago.ai or Shopify from Approve.
                  </p>
                ) : null}
                {writebackRollbackHonesty && !written ? (
                  <div
                    className="mb-4 rounded-md border border-border bg-sand/50 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-rollback-honesty"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-foreground">
                      {writebackRollbackHonesty.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackRollbackHonesty.detail}
                    </p>
                  </div>
                ) : null}
                {writebackMappingsSoftNotice && !written ? (
                  <div
                    className="mb-4 rounded-md border border-border bg-elevated px-3.5 py-3"
                    role="status"
                    data-testid="writeback-mappings-soft-notice"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-foreground">
                      {writebackMappingsSoftNotice.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackMappingsSoftNotice.detail}
                    </p>
                  </div>
                ) : null}
                {writebackIrreversibleHonesty && !written ? (
                  <div
                    className="mb-4 rounded-md border border-risk/35 bg-risk-soft/50 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-irreversible-honesty"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-risk">
                      {writebackIrreversibleHonesty.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackIrreversibleHonesty.detail}
                    </p>
                  </div>
                ) : null}
                {writebackOperatorInfo && !written ? (
                  <div
                    className="mb-4 rounded-md border border-border bg-elevated px-3.5 py-3"
                    role="status"
                    data-testid="writeback-operator-info"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-foreground">
                      {writebackOperatorInfo.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackOperatorInfo.detail}
                    </p>
                  </div>
                ) : null}
                {writebackShopifyNotice && !written && !writebackOperatorInfo ? (
                  <div
                    className="mb-4 rounded-md border border-border bg-elevated px-3.5 py-3"
                    role="status"
                    data-testid="writeback-shopify-metafield-honesty"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-foreground">
                      {writebackShopifyNotice.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackShopifyNotice.detail}
                    </p>
                  </div>
                ) : null}
                {writebackLimitedRollbackNotice &&
                !written &&
                !writebackIrreversibleHonesty ? (
                  <div
                    className="mb-4 rounded-md border border-border bg-sand/40 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-limited-rollback-honesty"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-foreground">
                      {writebackLimitedRollbackNotice.title}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {writebackLimitedRollbackNotice.detail}
                    </p>
                  </div>
                ) : null}
                {previewStaleNotice && !written ? (
                  <div
                    className="mb-4 rounded-md border border-risk/30 bg-risk-soft/40 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-diff-hash-mismatch-notice"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-risk">
                      Preview changed
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {previewStaleNotice}
                    </p>
                  </div>
                ) : null}
                {rejectionNotice && !written ? (
                  <div
                    className="mb-4 rounded-md border border-risk/30 bg-risk-soft/40 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-rejection-notice"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-risk">
                      Writeback rejected
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {rejectionNotice}
                    </p>
                  </div>
                ) : null}
                {livePendingApproval && !written && !rejectionNotice && !previewStaleNotice ? (
                  <div
                    className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3.5 py-3"
                    role="status"
                    data-testid="writeback-pending-approval"
                  >
                    <div className="text-[11px] font-semibold tracking-tight text-primary">
                      {livePendingApproval.status === "APPROVED"
                        ? "Approval granted · write not finished"
                        : "Approval requested · awaiting admin decision"}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      {livePendingApproval.status === "APPROVED"
                        ? isWritebackAdmin
                          ? "Click Approve & write again to retry the write. Reject is unavailable after grant. If the plan changed, run a new preview — you'll request approval again."
                          : "An admin must retry Approve & write to finish. If the plan changed, run a new preview — approval will be requested again."
                        : isWritebackAdmin
                          ? writebackPreview
                            ? "Review the preview below, then Approve & write or Reject. Reject clears the preview so you can revise evidence and re-preview."
                            : "Restoring writeback preview for this approval request…"
                          : "An admin must Approve & write or Reject before this fix can proceed."}
                    </p>
                    {livePendingApproval.status === "APPROVED" &&
                    isWritebackApprovalRequestRole(currentUser?.role) ? (
                      <button
                        type="button"
                        onClick={handleForceWritebackPreview}
                        disabled={
                          writebackPreviewMutation.isPending ||
                          approveInFlight ||
                          !writebackEnabled
                        }
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid="writeback-force-new-preview"
                      >
                        {writebackPreviewMutation.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading preview…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3 w-3" />
                            Run new preview
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {previewTab === "writeback" && writebackTable ? (
                  <div className="mb-2 space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      {writebackTable.summaryLine}
                      {writebackPreview?.diff_hash
                        ? ` · diff ${writebackPreview.diff_hash.slice(0, 8)}…`
                        : ""}
                      {writebackMeta?.approvalTier
                        ? ` · ${writebackMeta.approvalTier}`
                        : ""}
                    </p>
                    {!written && writebackMeta?.executeNote ? (
                      <p className="text-[11px] text-muted-foreground">
                        {writebackMeta.executeNote}
                      </p>
                    ) : null}
                    {writebackMeta?.irreversibleWarning && !writebackIrreversibleHonesty ? (
                      <p className="rounded-md border border-risk/25 bg-risk-soft px-3 py-2 text-[11px] leading-relaxed text-risk">
                        {writebackMeta.irreversibleWarning}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="fix-preview-table">
                    <thead>
                      <tr>
                        {activePreview.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activePreview.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <WritebackPossibleSurfaces
                checkId={writebackCheckId}
                rows={writebackPossibleRows}
                isPending={writebackPossiblePending}
                isError={writebackPossibleError}
                writebackExecuteEnabled={writebackExecuteEnabled}
                onRetry={() => {
                  void refetchWritebackPossible();
                  void refetchWritebackMappings();
                }}
              />

              {nonExecutableHonesty && !written ? (
                <div
                  className="mt-[18px] rounded-md border border-border bg-elevated px-3.5 py-3"
                  role="status"
                >
                  <div className="text-[11px] font-semibold tracking-tight text-foreground">
                    {nonExecutableHonesty.title}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {nonExecutableHonesty.detail}
                  </p>
                  {nonExecutableHonesty.retry ? (
                    <button
                      type="button"
                      onClick={() => {
                        void refetchWritebackPossible();
                        void refetchWritebackMappings();
                      }}
                      className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="fix-gov">
                <div className="fix-gov-head">
                  <strong className="font-semibold text-foreground">
                    {written
                      ? "Write applied · audit recorded."
                      : nonExecutableHonesty
                        ? "Evidence only · no automated write from this screen."
                        : plan.govHead}
                  </strong>
                </div>
                <div className="fix-gov-grid">
                  {displayGov.map((g) => (
                    <div key={g.k}>
                      <div className="gk">{g.k}</div>
                      <div className="gv">{g.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="fix-test-state">
                <span className="inline-flex items-center gap-1.5 rounded bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {written
                    ? "Write complete · audited"
                    : rolledBack
                      ? "Rolled back · run writeback preview again before approve"
                      : rejectionNotice
                        ? "Rejected · run writeback preview again"
                        : previewStaleNotice
                          ? "Preview changed · run writeback preview again"
                          : livePendingApproval
                          ? "Approval requested · awaiting admin"
                          : nonExecutableHonesty
                            ? "Evidence only · writeback not available"
                            : previewReady
                              ? "Preview ready · request approval"
                              : plan.testBadge}
                </span>
              </div>

              <div className="fix-cta-row">
                {plan.mode === "approve" && !written && !nonExecutableHonesty && !livePendingApproval ? (
                  <button
                    type="button"
                    onClick={handleRequestApprovalClick}
                    disabled={
                      isFixture ||
                      !canRequestApproval ||
                      approveInFlight ||
                      rollbackMutation.isPending
                    }
                    title={
                      isFixture || !canRequestApproval
                        ? (requestApprovalDisabledReason ?? undefined)
                        : undefined
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="writeback-request-approval"
                  >
                    {approvePhase === "requesting" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Requesting…
                      </>
                    ) : (
                      "Request approval"
                    )}
                  </button>
                ) : null}
                {plan.mode === "approve" &&
                !written &&
                !nonExecutableHonesty &&
                !livePendingApproval &&
                (isFixture || !canRequestApproval) ? (
                  <span className="max-w-md text-[11px] text-muted-foreground">
                    {requestApprovalDisabledReason}
                    {requestApprovalBlockReason === "company_execute_disabled" ? (
                      <>
                        {" "}
                        <Link
                          to="/settings"
                          search={{ tab: "workspace" }}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Settings → Workspace
                        </Link>
                      </>
                    ) : null}
                  </span>
                ) : null}
                {plan.mode === "approve" && !written && !nonExecutableHonesty && livePendingApproval ? (
                  <>
                    {isWritebackAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={handleApproveWriteClick}
                          disabled={
                            isFixture ||
                            !canApproveWrite ||
                            approveInFlight ||
                            rollbackMutation.isPending
                          }
                          title={
                            isFixture || !canApproveWrite
                              ? (approveWriteDisabledReason ?? undefined)
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="writeback-approve-write"
                        >
                          {approvePhase === "approving" || approvePhase === "writing" ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Writing…
                            </>
                          ) : (
                            "Approve & write"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleRejectClick}
                          disabled={
                            isFixture ||
                            !canRejectWriteback ||
                            approveInFlight ||
                            rollbackMutation.isPending
                          }
                          title={
                            isFixture || !canRejectWriteback
                              ? (rejectDisabledReason ?? undefined)
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-risk/30 bg-elevated px-3.5 py-2 text-sm font-medium text-risk hover:bg-risk-soft disabled:cursor-not-allowed disabled:opacity-60"
                          data-testid="writeback-reject"
                        >
                          Reject writeback
                        </button>
                      </>
                    ) : (
                      <span className="max-w-md text-[11px] text-muted-foreground">
                        Approval requested · awaiting admin decision
                      </span>
                    )}
                    {isWritebackAdmin && !canApproveWrite && !canRejectWriteback ? (
                      <span className="max-w-md text-[11px] text-muted-foreground">
                        {approveWriteDisabledReason ?? rejectDisabledReason}
                      </span>
                    ) : null}
                  </>
                ) : null}
                {plan.mode === "approve" && !written && nonExecutableHonesty ? (
                  <button
                    type="button"
                    disabled
                    title={nonExecutableHonesty.detail}
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium opacity-60"
                  >
                    Request approval
                  </button>
                ) : null}
                {plan.mode === "approve" && !written && nonExecutableHonesty ? (
                  <span className="max-w-md text-[11px] text-muted-foreground">
                    {requestApprovalDisabledReason ?? nonExecutableHonesty.title}
                  </span>
                ) : null}
                {showRollback ? (
                  <button
                    type="button"
                    onClick={handleRollbackClick}
                    disabled={rollbackMutation.isPending || approveInFlight}
                    className="inline-flex items-center gap-1.5 rounded-md border border-risk/30 bg-elevated px-3.5 py-2 text-sm font-medium text-risk hover:bg-risk-soft disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rollbackMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Rolling back…
                      </>
                    ) : (
                      "Rollback writeback"
                    )}
                  </button>
                ) : null}
                {written ? (
                  <Link
                    to={activityDeepLink.to}
                    search={activityDeepLink.search}
                    className="rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
                  >
                    View in Activity
                  </Link>
                ) : null}
                {studioEligibility.showProceed ? (
                  <Link
                    to={workflowStudioTarget.to}
                    search={workflowStudioTarget.search}
                    className={`fix-cta-primary ${plan.mode === "build" ? "build" : ""}`}
                  >
                    Proceed to Workflow Studio <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : studioEligibility.known && checkIdForStudio ? (
                  <Link
                    to="/data-consistency"
                    search={{ issue: checkIdForStudio }}
                    className="rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
                  >
                    Back to Data Consistency
                  </Link>
                ) : null}
              </div>
            </div>

            {target.kind === "live" && writebackCheckId ? (
              <FixAiSuggestionBox
                checkId={writebackCheckId}
                dcsRunId={worklist?.data_run_id ?? issueDetail?.data_run_id ?? null}
                enabled
              />
            ) : null}

            {studioEligibility.showProceed ? (
              <div className="fix-next-action">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                    Next in the fix flow · phase 3
                  </div>
                  <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
                    Build the workflow brief
                  </div>
                  <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                    {studioNextHelper}
                  </p>
                </div>
                <Link
                  to={workflowStudioTarget.to}
                  search={workflowStudioTarget.search}
                  className="fix-cta-primary"
                >
                  Proceed to Workflow Studio <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AlertDialog
        open={approveWriteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !approveWriteMutation.isPending) setApproveWriteConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve irreversible writeback?</AlertDialogTitle>
            <AlertDialogDescription>
              {writebackApproveWriteConfirmDescription(
                writebackPreview,
                writebackCheckId,
                writebackMappingEntry,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveWriteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={approveWriteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                setApproveWriteConfirmOpen(false);
                approveWriteMutation.mutate();
              }}
            >
              {approveWriteMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Writing…
                </>
              ) : (
                "Approve & write"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !rejectApprovalMutation.isPending) setRejectConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject writeback?</AlertDialogTitle>
            <AlertDialogDescription>
              {WRITEBACK_REJECTED_BANNER} The preview will be cleared so you can revise
              evidence and run preview again before requesting approval.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="mt-2 block text-sm">
            <span className="text-muted-foreground">Reason (optional)</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Why is this writeback being rejected?"
              disabled={rejectApprovalMutation.isPending}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectApprovalMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={rejectApprovalMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                rejectApprovalMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejectApprovalMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Rejecting…
                </>
              ) : (
                "Reject writeback"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rollbackConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !rollbackMutation.isPending) setRollbackConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo writeback?</AlertDialogTitle>
            <AlertDialogDescription>
              {writebackRollbackConfirmDescription(writebackCheckId)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollbackMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={rollbackMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                rollbackMutation.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rollbackMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Rolling back…
                </>
              ) : (
                "Undo writeback"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={changePreviewOpen} onOpenChange={setChangePreviewOpen}>
        <SheetContent
          side="right"
          className="fix-change-preview-sheet w-full overflow-y-auto sm:max-w-lg"
          data-testid="writeback-change-preview-drawer"
        >
          <SheetHeader>
            <SheetTitle>Change preview</SheetTitle>
            <SheetDescription>
              {written
                ? "Applied writeback · before/after from dry-run and execute audit."
                : "Dry-run only · no changes sent until Approve & write."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 text-sm">
            {changePreviewSummary ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {changePreviewSummary}
              </p>
            ) : null}
            {changePreviewDcsImpact ? (
              <div
                className="rounded-md border border-border bg-sand/40 px-3 py-2.5"
                data-testid="writeback-change-preview-dcs-impact"
              >
                <p className="text-[12px] leading-relaxed text-foreground">
                  {changePreviewDcsImpact}
                </p>
              </div>
            ) : null}
            {changePreviewWorkflowImpact ? (
              <div
                className="rounded-md border border-border bg-elevated px-3 py-2.5"
                data-testid="writeback-change-preview-workflows"
              >
                <div className="text-[11px] font-semibold tracking-tight text-foreground">
                  {changePreviewWorkflowImpact.title}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {changePreviewWorkflowImpact.detail}
                </p>
                {changePreviewWorkflowImpact.pilots.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {changePreviewWorkflowImpact.pilots.map((pilot) => (
                      <li
                        key={pilot.uc}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/80 bg-background px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-[10px] text-fog">{pilot.uc}</div>
                          <div className="truncate text-[12px] font-medium">{pilot.title}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`text-[10px] font-medium ${
                              pilot.buildable ? "text-revenue" : "text-fog"
                            }`}
                          >
                            {pilot.status}
                          </span>
                          {pilot.buildable ? (
                            <Link
                              to="/workflow"
                              search={workflowStudioLink({
                                uc: pilot.uc,
                                issue: writebackCheckId,
                              }).search}
                              className="text-[11px] font-medium text-primary hover:underline"
                              onClick={() => setChangePreviewOpen(false)}
                            >
                              Studio
                            </Link>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                Before / after
              </div>
              <div className="hidden rounded-md border border-border bg-sand/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-fog sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                <span>Field</span>
                <span>Before</span>
                <span>After</span>
              </div>
              {changePreviewIntentRows.map((row) => (
                <div
                  key={`${row.index}-${row.entity_key}-${row.operation}`}
                  className="fix-change-preview-intent rounded-md border border-border bg-background"
                >
                  <div className="border-b border-border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-semibold text-foreground">
                        #{row.index} · {row.target}
                      </span>
                      <span className="text-fog">{row.operation}</span>
                      <span className="font-mono text-fog">{row.entity_key}</span>
                      <span className="ml-auto text-fog">{row.status}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {row.fields.map((field) => (
                      <div
                        key={field.key}
                        className={`grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3 ${
                          field.changed ? "bg-warn/5" : ""
                        }`}
                      >
                        <div className="font-mono text-[10px] font-medium uppercase tracking-wide text-fog">
                          {field.key}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          <span className="mr-1 text-[10px] uppercase text-fog sm:hidden">
                            Before
                          </span>
                          {field.before}
                        </div>
                        <div className="text-[12px] text-foreground">
                          <span className="mr-1 text-[10px] uppercase text-fog sm:hidden">
                            After
                          </span>
                          {field.after}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
