/**
 * PRD-HO-01 Steps 7–10 + PRD-HO-02 §7 — live `/handoff` bind + human activation UI.
 *
 * Primary path: package_id → QA gate → GET latest handoff (POST stage if missing).
 * HO-02: Admin approve → activation guide → confirm activated (no MCP Send toast).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  ListChecks,
  Loader2,
  RotateCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { HandoffSendLockedButton } from "@/components/klints/HandoffSendLocked";
import { StatusBadge } from "@/components/klints/primitives";
import { PackageRouteHonesty } from "@/components/workflow/PackageRouteHonesty";
import { getApiErrorMessage } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/auth";
import {
  approveHandoffForActivation,
  canApproveHandoffActivation,
  classifyPackageHandoffGetError,
  confirmHandoffActivated,
  fetchHandoffForDeepLink,
  getHandoff,
  HANDOFF_ACTIVATED_BANNER,
  HANDOFF_ADMIN_REQUIRED_TITLE,
  HANDOFF_ALREADY_ACTIVATED_TITLE,
  HANDOFF_APPROVED_BANNER,
  HANDOFF_REJECTED_BANNER,
  HANDOFF_SEND_LOCKED_HINT,
  handoffActivationBody,
  handoffActivationGuideSteps,
  handoffBypassesQaGate,
  handoffDetailQueryKey,
  handoffDisplayTitle,
  handoffQaSummary,
  handoffRejectionReason,
  humanGuideStepTitles,
  handoffMatchesGateQa,
  isHandoffActivated,
  isHandoffActivationForbiddenError,
  isHandoffActivationQaBlockedError,
  isHandoffActivationStatusError,
  isHandoffApprovedForActivation,
  isHandoffForbiddenError,
  isHandoffManifestMismatchError,
  isHandoffNotFoundError,
  isHandoffRejected,
  isHandoffStageBlockedError,
  isHandoffStaged,
  mergeHandoffActivationResponse,
  packageHandoffQueryKey,
  stagePackageHandoff,
  HANDOFF_STALE_MS,
  type HandoffPackageResponse,
} from "@/lib/handoff";
import {
  classifyPackageQaGetError,
  getLatestPackageQa,
  getQaRun,
  isQaPass,
  isQaRunNotFoundError,
  packageQaQueryKey,
  QA_STALE_MS,
  qaResultMatchesPackage,
  qaRunQueryKey,
  qaScoreChipSummary,
  type QaResultResponse,
} from "@/lib/qa";
import {
  BUILD_PACKAGE_QUERY_KEY,
  FLOW_STEPPER_TOOLTIPS,
  getBuildPackage,
  getUseCaseRecommendations,
  isHandoffQaRequired,
  parseHandoffSearch,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  workflowStudioLink,
  type BuildPackageResponse,
} from "@/lib/use-cases";

export const Route = createFileRoute("/handoff")({
  validateSearch: parseHandoffSearch,
  head: () => ({
    meta: [
      { title: "Handoff — Klints" },
      {
        name: "description",
        content:
          "Staged handoff package for human activation in Manago — no MCP auto-send.",
      },
    ],
  }),
  component: HandoffPage,
});

/** Survives Strict Mode remount — avoid double POST stage. */
const autoStagedPackages = new Set<string>();

function autoStageKey(packageId: string, qaRunId?: string): string {
  return `${packageId}:${qaRunId?.trim() || "latest"}`;
}

function HandoffPage() {
  const {
    issue: issueId,
    check: checkId,
    uc,
    package_id: packageIdFromSearch,
    qa_run_id: qaRunIdFromSearch,
    handoff_id: handoffIdFromSearch,
  } = Route.useSearch();
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
  });
  /** undefined while auth loads — avoid flashing admin-locked Send for admins. */
  const canApproveHandoff: boolean | undefined = currentUser
    ? canApproveHandoffActivation(currentUser.role)
    : undefined;

  const handoffByIdQuery = useQuery({
    queryKey: handoffDetailQueryKey(handoffIdFromSearch ?? ""),
    queryFn: () => getHandoff(handoffIdFromSearch!),
    enabled: Boolean(handoffIdFromSearch),
    staleTime: HANDOFF_STALE_MS,
    retry: false,
  });

  const handoffFromId =
    handoffByIdQuery.isSuccess && handoffByIdQuery.data
      ? handoffByIdQuery.data
      : undefined;

  const packageId =
    packageIdFromSearch?.trim() ||
    handoffFromId?.package_id?.trim() ||
    undefined;
  const qaRunId =
    qaRunIdFromSearch?.trim() ||
    handoffFromId?.qa_run_id?.trim() ||
    undefined;

  const journeySearch = {
    ...(uc ? { uc } : {}),
    ...(packageId ? { package_id: packageId } : {}),
    ...(issueId ? { issue: issueId } : {}),
    ...(checkId ? { check: checkId } : {}),
  };

  const studioLink = workflowStudioLink(journeySearch);

  const qaLinkSearch = journeySearch;

  const handoffQueryKey = packageHandoffQueryKey(packageId ?? "", qaRunId);

  /** Latest (or deep-linked) QA — proactive §6.4 gate before stage. */
  const qaQuery = useQuery({
    queryKey: qaRunId
      ? qaRunQueryKey(qaRunId)
      : packageQaQueryKey(packageId ?? ""),
    queryFn: () =>
      qaRunId
        ? getQaRun(qaRunId)
        : getLatestPackageQa(packageId!),
    enabled: Boolean(packageId),
    staleTime: QA_STALE_MS,
    retry: false,
  });

  const { data: recommendations } = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  /** Build package for human_guide / title / richer route (PRD §6.3). */
  const packageQuery = useQuery({
    queryKey: [...BUILD_PACKAGE_QUERY_KEY, packageId],
    queryFn: () => getBuildPackage(packageId!),
    enabled: Boolean(packageId),
    staleTime: UC_STALE_MS,
    retry: false,
  });

  const stageMutation = useMutation({
    mutationFn: (pid: string) =>
      stagePackageHandoff(pid, qaRunId ? { qa_run_id: qaRunId } : undefined),
    onSuccess: (data, pid) => {
      queryClient.setQueryData(packageHandoffQueryKey(pid, qaRunId), data);
      queryClient.setQueryData(packageHandoffQueryKey(pid), data);
    },
    onError: (err, pid) => {
      autoStagedPackages.delete(autoStageKey(pid, qaRunId));
      if (isHandoffStageBlockedError(err)) return;
      const description = isHandoffForbiddenError(err)
        ? "Analyst or Admin role is required to stage handoff."
        : getApiErrorMessage(err, "Handoff stage failed.");
      toast.error("Could not stage handoff", { description });
    },
  });

  const qaNeverRun =
    Boolean(packageId) &&
    qaQuery.isError &&
    classifyPackageQaGetError(qaQuery.error) === "never_run";
  const qaRunNotFound =
    Boolean(packageId) &&
    Boolean(qaRunId) &&
    qaQuery.isError &&
    isQaRunNotFoundError(qaQuery.error);
  const qaResult: QaResultResponse | undefined = qaQuery.isSuccess
    ? qaQuery.data
    : undefined;
  const handoffQaRequired = isHandoffQaRequired(
    qaResult,
    recommendations?.summary,
  );
  const qaMatchesPackage = qaResultMatchesPackage(qaResult, packageId ?? "");
  const qaPass = isQaPass(qaResult);
  const qaGateResolved =
    Boolean(packageId) &&
    (qaQuery.isSuccess || qaNeverRun || qaRunNotFound);
  /** Demo: REQUIRE_HANDOFF_QA_PASS=False opens gate with any QA result for the package. */
  const qaGateOpen =
    qaQuery.isSuccess &&
    qaMatchesPackage &&
    (qaPass || !handoffQaRequired);
  const qaPackageMismatch =
    qaQuery.isSuccess && Boolean(qaResult) && !qaMatchesPackage;
  const qaGateBlocked =
    qaGateResolved &&
    (qaNeverRun ||
      qaRunNotFound ||
      qaPackageMismatch ||
      (qaQuery.isSuccess && !qaPass && handoffQaRequired));
  const qaQueryFailed =
    Boolean(packageId) &&
    qaQuery.isError &&
    !qaNeverRun &&
    !qaRunNotFound &&
    !qaQuery.isFetching;

  const handoffQuery = useQuery({
    queryKey: handoffQueryKey,
    queryFn: () =>
      fetchHandoffForDeepLink({
        package_id: packageId!,
        ...(qaRunId ? { qa_run_id: qaRunId } : {}),
      }),
    enabled: Boolean(packageId) && !handoffIdFromSearch && qaGateResolved,
    staleTime: HANDOFF_STALE_MS,
    retry: false,
  });

  const gateQa = qaMatchesPackage ? qaResult : undefined;

  const fetchedHandoff =
    handoffQuery.isSuccess && handoffQuery.data ? handoffQuery.data : undefined;

  const handoffStaleForGate =
    Boolean(fetchedHandoff) &&
    Boolean(gateQa) &&
    !handoffMatchesGateQa(fetchedHandoff, gateQa) &&
    !handoffBypassesQaGate(fetchedHandoff);

  const stageTargetsCurrent =
    Boolean(packageId) && stageMutation.variables === packageId;
  const stagePendingForPackage =
    stageTargetsCurrent && stageMutation.isPending;
  const stageKey = packageId ? autoStageKey(packageId, qaRunId) : "";

  function retryStage() {
    if (!packageId) return;
    autoStagedPackages.delete(stageKey);
    stageMutation.reset();
    void qaQuery.refetch();
    void handoffQuery.refetch();
  }

  useEffect(() => {
    if (!packageId || handoffIdFromSearch) return;
    if (!qaGateOpen) return;
    if (handoffQuery.isFetching || handoffQuery.isSuccess) {
      if (!handoffStaleForGate) return;
    }
    if (!handoffQuery.isError && !handoffStaleForGate) return;
    if (
      handoffQuery.isError &&
      classifyPackageHandoffGetError(handoffQuery.error) !== "never_staged"
    ) {
      return;
    }
    if (autoStagedPackages.has(stageKey)) return;
    if (stageMutation.isPending) return;
    autoStagedPackages.add(stageKey);
    stageMutation.mutate(packageId);
  }, [
    packageId,
    handoffIdFromSearch,
    qaGateOpen,
    stageKey,
    handoffQuery.isFetching,
    handoffQuery.isSuccess,
    handoffQuery.isError,
    handoffQuery.error,
    handoffStaleForGate,
    stageMutation.isPending,
    stageMutation.mutate,
  ]);

  /** Strict Mode / remount: drop stale auto-stage guard so POST can retry. */
  useEffect(() => {
    if (!packageId || handoffIdFromSearch || !qaGateOpen) return;
    if (!autoStagedPackages.has(stageKey)) return;
    if (stageMutation.isPending || stageMutation.isSuccess) return;
    if (handoffQuery.isSuccess && !handoffStaleForGate) return;
    if (
      (handoffQuery.isError &&
        classifyPackageHandoffGetError(handoffQuery.error) === "never_staged") ||
      handoffStaleForGate
    ) {
      autoStagedPackages.delete(stageKey);
    }
  }, [
    packageId,
    handoffIdFromSearch,
    qaGateOpen,
    stageKey,
    handoffQuery.isSuccess,
    handoffQuery.isError,
    handoffQuery.error,
    handoffStaleForGate,
    stageMutation.isPending,
    stageMutation.isSuccess,
  ]);

  const liveFromMutation =
    packageId &&
    stageTargetsCurrent &&
    stageMutation.isSuccess &&
    stageMutation.data &&
    (!gateQa || handoffMatchesGateQa(stageMutation.data, gateQa))
      ? stageMutation.data
      : undefined;

  const fetchedPostStage = handoffBypassesQaGate(fetchedHandoff);
  const fetchedMatchesGate =
    fetchedHandoff && gateQa
      ? handoffMatchesGateQa(fetchedHandoff, gateQa) || fetchedPostStage
      : Boolean(fetchedHandoff);

  const liveFromPackageFlow: HandoffPackageResponse | undefined =
    liveFromMutation ??
    (fetchedMatchesGate ? fetchedHandoff : undefined);

  const liveFromPackageWhenAllowed =
    liveFromPackageFlow &&
    (qaGateOpen || handoffBypassesQaGate(liveFromPackageFlow))
      ? liveFromPackageFlow
      : undefined;

  /** handoff_id deep-link wins; else package flow when QA allows or post-STAGE. */
  const live: HandoffPackageResponse | undefined =
    handoffFromId ?? liveFromPackageWhenAllowed;

  const showLiveHandoff = Boolean(live);
  const qaBlockedForStagedOnly =
    qaGateBlocked && !(live && handoffBypassesQaGate(live));

  const getClass = handoffQuery.isError
    ? classifyPackageHandoffGetError(handoffQuery.error)
    : null;

  const loadingHandoffById =
    Boolean(handoffIdFromSearch) &&
    (handoffByIdQuery.isLoading || handoffByIdQuery.isFetching) &&
    !handoffFromId;

  const autoStageActive =
    Boolean(stageKey) &&
    autoStagedPackages.has(stageKey) &&
    (stageMutation.isPending || stageMutation.isSuccess);

  const preparing =
    Boolean(packageId) &&
    qaGateOpen &&
    !live &&
    (stagePendingForPackage ||
      handoffStaleForGate ||
      (handoffQuery.isError &&
        getClass === "never_staged" &&
        autoStageActive &&
        !stageMutation.isError));

  const checkingQa =
    Boolean(packageId) && !qaGateResolved && (qaQuery.isLoading || qaQuery.isFetching);

  const loading =
    loadingHandoffById ||
    (Boolean(packageId) &&
      !showLiveHandoff &&
      !qaBlockedForStagedOnly &&
      !qaQueryFailed &&
      (checkingQa ||
        handoffQuery.isLoading ||
        handoffQuery.isFetching ||
        stagePendingForPackage ||
        preparing));

  const stageBlockedError =
    stageTargetsCurrent &&
    stageMutation.isError &&
    isHandoffStageBlockedError(stageMutation.error);
  const stageForbiddenError =
    stageTargetsCurrent &&
    stageMutation.isError &&
    isHandoffForbiddenError(stageMutation.error);
  const stageRetryableError =
    stageTargetsCurrent &&
    stageMutation.isError &&
    !stageBlockedError &&
    !stageForbiddenError;

  return (
    <AppShell title="Handoff" subtitle="Phase 5 · Fix flow">
      <div>
        <PageTitle
          kicker="Phase 5 · Handoff · staged package"
          title="Handoff"
          description="Approve for human activation in Manago.ai. Klints does not auto-send via MCP."
          actions={
            showLiveHandoff && live ? (
              <HandoffHeaderActions
                live={live}
                canApprove={canApproveHandoff}
                handoffQueryKey={handoffQueryKey}
                packageId={packageId ?? ""}
                qaRunId={qaRunId}
              />
            ) : undefined
          }
        />

        {!handoffQaRequired && Boolean(packageId) && !qaPass ? (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-[rgb(22_22_26/0.8)]">
            Demo bypass: Handoff is open while QA is not PASS (PT-04 / Fix
            story can stay FAIL). Production keeps{" "}
            <code className="text-[11px]">REQUIRE_HANDOFF_QA_PASS=True</code>.
          </div>
        ) : null}

        {!packageId && !handoffIdFromSearch ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Generate a package and pass QA first</h2>
            <p>
              Open Workflow Studio, build a package, clear QA (≥80, all hard
              tests), then continue here with a live staged handoff — not a demo
              fixture.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={studioLink.to}
                search={studioLink.search}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Open Workflow Studio <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/qa"
                search={qaLinkSearch}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand/60"
              >
                Go to QA
              </Link>
            </div>
          </div>
        ) : loadingHandoffById ? (
          <div className="flow-empty">
            <Loader2
              className="h-10 w-10 animate-spin text-primary"
              strokeWidth={1.5}
            />
            <h2>Loading handoff…</h2>
            <p>Fetching handoff record from audit deep-link.</p>
          </div>
        ) : handoffIdFromSearch && handoffByIdQuery.isError ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>{isHandoffNotFoundError(handoffByIdQuery.error) ? "Handoff not found" : "Could not load handoff"}</h2>
            <p>
              {getApiErrorMessage(
                handoffByIdQuery.error,
                "This handoff id is missing or belongs to another workspace.",
              )}
            </p>
          </div>
        ) : qaQueryFailed ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Could not load QA</h2>
            <p>
              {getApiErrorMessage(
                qaQuery.error,
                "Could not verify the QA gate for this package.",
              )}
            </p>
            <button
              type="button"
              onClick={() => void qaQuery.refetch()}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <RotateCw className="h-4 w-4" /> Retry QA check
            </button>
          </div>
        ) : loading ? (
          <div className="flow-empty">
            <Loader2
              className="h-10 w-10 animate-spin text-primary"
              strokeWidth={1.5}
            />
            <h2>
              {checkingQa
                ? "Checking QA gate…"
                : preparing || stagePendingForPackage
                  ? "Preparing staged handoff…"
                  : "Loading staged handoff…"}
            </h2>
            <p>
              {checkingQa
                ? handoffQaRequired
                  ? "Handoff unlocks after QA PASS (≥80, all hard tests)."
                  : "Demo: checking QA — Handoff can open without PASS."
                : preparing || stagePendingForPackage
                  ? qaPass
                    ? "QA passed — creating the staged package for this build."
                    : "Demo: staging handoff while QA is not PASS…"
                  : "Fetching the live package for this build."}
            </p>
          </div>
        ) : qaBlockedForStagedOnly || stageBlockedError ? (
          <HandoffQaBlockedEmpty
            qaResult={qaMatchesPackage ? qaResult : undefined}
            qaNeverRun={qaNeverRun}
            qaRunNotFound={qaRunNotFound}
            qaPackageMismatch={qaPackageMismatch}
            qaLinkSearch={qaLinkSearch}
            stageDetail={
              stageBlockedError && stageMutation.error
                ? qaGateOpen
                  ? "QA gate changed since this page loaded — refresh or return to QA."
                  : getApiErrorMessage(
                      stageMutation.error,
                      FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
                    )
                : undefined
            }
          />
        ) : showLiveHandoff && live ? (
          <LiveHandoffBody
            live={live}
            gateQa={qaMatchesPackage ? qaResult : undefined}
            buildPackage={packageQuery.data}
            packageLoading={packageQuery.isPending || packageQuery.isFetching}
            packageFailed={packageQuery.isError}
            studioLink={studioLink}
            qaLinkSearch={qaLinkSearch}
            canApproveHandoff={canApproveHandoff}
            handoffQueryKey={handoffQueryKey}
            packageId={packageId ?? ""}
            qaRunId={qaRunId}
            handoffIdFromSearch={handoffIdFromSearch}
          />
        ) : getClass === "package_not_found" ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Build package not found</h2>
            <p>
              This package id is missing or belongs to another workspace.
              Generate a package in Studio, then return from QA.
            </p>
            <Link
              to={studioLink.to}
              search={studioLink.search}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Open Workflow Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : stageForbiddenError ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Staging not allowed</h2>
            <p>
              Analyst or Admin role is required to stage handoff. Ask a teammate,
              or open QA after an Analyst has cleared the gate.
            </p>
            <Link
              to="/qa"
              search={qaLinkSearch}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to QA <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : stageRetryableError ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Could not stage handoff</h2>
            <p>
              {getApiErrorMessage(
                stageMutation.error,
                "Staging failed after QA PASS. Retry or return to QA.",
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={stageMutation.isPending}
                onClick={() => {
                  autoStagedPackages.delete(stageKey);
                  stageMutation.mutate(packageId!);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {stageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                Retry staging
              </button>
              <button
                type="button"
                onClick={retryStage}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand/60"
              >
                Refresh
              </button>
              <Link
                to="/qa"
                search={qaLinkSearch}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand/60"
              >
                Go to QA
              </Link>
            </div>
          </div>
        ) : (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Handoff unavailable</h2>
            <p>
              {handoffQuery.isError
                ? getApiErrorMessage(
                    handoffQuery.error,
                    "Could not load staged handoff.",
                  )
                : "Could not load staged handoff for this package."}
            </p>
            <Link
              to="/qa"
              search={qaLinkSearch}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to QA <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function HandoffQaBlockedEmpty({
  qaResult,
  qaNeverRun,
  qaRunNotFound,
  qaPackageMismatch,
  qaLinkSearch,
  stageDetail,
}: {
  qaResult?: QaResultResponse;
  qaNeverRun: boolean;
  qaRunNotFound: boolean;
  qaPackageMismatch: boolean;
  qaLinkSearch: {
    uc?: string;
    package_id?: string;
    issue?: string;
  };
  stageDetail?: string;
}) {
  const summary = qaResult ? qaScoreChipSummary(qaResult) : null;
  const body =
    stageDetail ||
    (qaRunNotFound
      ? "This QA run was not found or belongs to another workspace. Open QA to run or pick a valid run."
      : qaPackageMismatch
        ? "This QA run does not match the package in the URL. Return to QA for the latest result."
        : qaNeverRun
          ? "QA has not been run for this package yet. Run QA in Workflow Studio, then return here."
          : FLOW_STEPPER_TOOLTIPS.handoffQaLocked);

  return (
    <div className="flow-empty">
      <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
      <h2>Clear QA first</h2>
      <p>{body}</p>
      {summary ? (
        <p className="mt-2 text-[13px] font-medium text-risk">{summary}</p>
      ) : null}
      <Link
        to="/qa"
        search={qaLinkSearch}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Go to QA <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function LiveHandoffBody({
  live,
  gateQa,
  buildPackage,
  packageLoading,
  packageFailed,
  studioLink,
  qaLinkSearch,
  canApproveHandoff,
  handoffQueryKey,
  packageId,
  qaRunId,
  handoffIdFromSearch,
}: {
  live: HandoffPackageResponse;
  gateQa?: QaResultResponse;
  buildPackage?: BuildPackageResponse;
  packageLoading: boolean;
  packageFailed: boolean;
  studioLink: ReturnType<typeof workflowStudioLink>;
  qaLinkSearch: {
    uc?: string;
    package_id?: string;
    issue?: string;
    check?: string;
  };
  canApproveHandoff: boolean | undefined;
  handoffQueryKey: ReturnType<typeof packageHandoffQueryKey>;
  packageId: string;
  qaRunId?: string;
  handoffIdFromSearch?: string;
}) {
  const queryClient = useQueryClient();
  const [managoWorkflowId, setManagoWorkflowId] = useState("");
  const title = handoffDisplayTitle(live, buildPackage?.title);
  const useCaseId = String(
    live.use_case_id || buildPackage?.use_case_id || "",
  )
    .trim()
    .toUpperCase();
  const status = String(live.status || "STAGED").toUpperCase();
  const staged = isHandoffStaged(live);
  const approved = isHandoffApprovedForActivation(live);
  const activated = isHandoffActivated(live);
  const rejected = isHandoffRejected(live);
  const qaStatus = String(
    live.qa_status || gateQa?.status || "",
  ).toUpperCase();
  const qaPass = qaStatus === "PASS";
  const qaScoreRaw = live.qa_score ?? gateQa?.score;
  const qaScore =
    qaScoreRaw != null && Number.isFinite(Number(qaScoreRaw))
      ? Math.round(Number(qaScoreRaw))
      : null;
  const routeRaw =
    String(live.capability?.route ?? live.route ?? "").trim() ||
    String(buildPackage?.route ?? "").trim();
  const qaRunShown = String(
    live.qa_run_id || live.qa_ref || gateQa?.qa_run_id || "",
  ).trim();
  const excerptSteps = humanGuideStepTitles(buildPackage?.human_guide?.steps, 4);
  const activationSteps = handoffActivationGuideSteps(live);
  const fallbackActivationSteps =
    activationSteps.length > 0
      ? activationSteps
      : buildPackage?.human_guide?.steps ?? [];
  const qaLine = handoffQaSummary({
    ...live,
    qa_status: live.qa_status || gateQa?.status,
    qa_score: live.qa_score ?? gateQa?.score,
  });
  const manifest = String(live.manifest_hash || "").trim();
  const manifestPreview =
    manifest.length > 12 ? `${manifest.slice(0, 12)}…` : manifest || "—";
  const qaChipIconClass = qaPass ? "text-revenue" : "text-fog";
  const rejectionReason = handoffRejectionReason(live);
  const activationSummary =
    String(live.activation_guide?.summary ?? "").trim() ||
    HANDOFF_APPROVED_BANNER;
  const managoHint = String(live.activation_guide?.manago_hint ?? "").trim();

  function patchHandoffCache(
    updater: (
      prev: HandoffPackageResponse | undefined,
    ) => HandoffPackageResponse | undefined,
  ) {
    queryClient.setQueryData(handoffQueryKey, updater);
    if (packageId) {
      queryClient.setQueryData(packageHandoffQueryKey(packageId, qaRunId), updater);
      queryClient.setQueryData(packageHandoffQueryKey(packageId), updater);
    }
    if (handoffIdFromSearch) {
      queryClient.setQueryData(
        handoffDetailQueryKey(handoffIdFromSearch),
        updater,
      );
    }
  }

  function handleActivationError(err: unknown, actionLabel: string) {
    if (isHandoffActivationForbiddenError(err)) {
      toast.error(`${actionLabel} not allowed`, {
        description: "Only admins can approve or confirm handoff activation.",
      });
      return;
    }
    if (isHandoffManifestMismatchError(err)) {
      toast.error("Handoff changed", {
        description:
          "The package manifest no longer matches. Refresh and try again.",
      });
      void queryClient.invalidateQueries({ queryKey: handoffQueryKey });
      return;
    }
    if (isHandoffActivationQaBlockedError(err)) {
      toast.error("QA gate closed", {
        description:
          "QA is no longer PASS for this package. Return to QA and re-stage.",
      });
      return;
    }
    if (isHandoffActivationStatusError(err)) {
      toast.error(`${actionLabel} unavailable`, {
        description: getApiErrorMessage(
          err,
          "Handoff status changed. Refresh and try again.",
        ),
      });
      void queryClient.invalidateQueries({ queryKey: handoffQueryKey });
      return;
    }
    toast.error(`${actionLabel} failed`, {
      description: getApiErrorMessage(err, `${actionLabel} failed.`),
    });
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      approveHandoffForActivation(live.handoff_id, handoffActivationBody(live)),
    onSuccess: (data) => {
      patchHandoffCache((prev) =>
        prev ? mergeHandoffActivationResponse(prev, data) : prev,
      );
      toast.success("Approved for activation", {
        description: HANDOFF_APPROVED_BANNER,
      });
    },
    onError: (err) => handleActivationError(err, "Approval"),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmHandoffActivated(live.handoff_id, {
        ...handoffActivationBody(live),
        manago_workflow_external_id: managoWorkflowId.trim() || null,
      }),
    onSuccess: (data) => {
      patchHandoffCache((prev) =>
        prev ? mergeHandoffActivationResponse(prev, data) : prev,
      );
      toast.success("Activation confirmed", {
        description: HANDOFF_ACTIVATED_BANNER,
      });
    },
    onError: (err) => handleActivationError(err, "Confirm activated"),
  });

  const packPreview = {
    schema_version: live.schema_version,
    handoff_id: live.handoff_id,
    tenant_id: live.tenant_id,
    package_version: live.package_version,
    artifact_refs: live.artifact_refs,
    qa_ref: live.qa_ref,
    approval_ref: live.approval_ref,
    manifest_hash: live.manifest_hash,
    status: live.status,
    created_at: live.created_at,
    provenance: live.provenance,
    activation_meta: live.activation_meta,
  };

  const statusChip =
    activated
      ? "Activated · human in Manago"
      : approved
        ? "Approved · activate in Manago"
        : rejected
          ? "Rejected"
          : "Ready for admin approval";

  return (
    <>
      <HandoffStatusBanner status={status} rejectionReason={rejectionReason} />

      {rejected ? (
        <div className="mb-4 flex flex-wrap gap-3">
          <Link
            to="/qa"
            search={qaLinkSearch}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Go to QA <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to={studioLink.to}
            search={studioLink.search}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand/60"
          >
            Open Workflow Studio
          </Link>
        </div>
      ) : null}

      <div className="flow-card anchor-tint">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flow-section-label">Live staged package</div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">
              {title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[12px] text-primary">
              <span>{useCaseId || "UC"}</span>
              <span className="text-fog">·</span>
              <span className="truncate" title={live.handoff_id}>
                {live.handoff_id}
              </span>
            </div>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
              Package{" "}
              <span className="font-mono text-[12px]">{live.package_id}</span>
              {qaRunShown ? (
                <>
                  {" "}
                  · QA ref{" "}
                  <span className="font-mono text-[12px]">{qaRunShown}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {status}
            </span>
            {qaPass ? (
              <StatusBadge status="Cleared" />
            ) : qaStatus ? (
              <StatusBadge status="Blocked" />
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded bg-sand px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {statusChip}
            </span>
            {qaScore != null ? (
              <span
                className={`text-[13px] font-semibold tabular-nums ${
                  qaPass ? "text-revenue" : "text-muted-foreground"
                }`}
              >
                Score {qaScore}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flow-section-label">Route / capability</div>
            <PackageRouteHonesty
              className="mt-1"
              route={routeRaw}
              capabilityResolution={buildPackage?.capability_resolution}
            />
            {live.capability?.mcp_publish_status ? (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                MCP publish: {live.capability.mcp_publish_status}
              </p>
            ) : null}
          </div>
          <div>
            <div className="flow-section-label">Approval ref</div>
            <div className="font-mono text-[12.5px]">
              {live.approval_ref || "—"}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[rgb(22_22_26/0.72)]">
              {approved || activated
                ? "Approved for human activation in Manago."
                : "Locked at stage time · awaiting admin approval."}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flow-section-label">QA result · staged for handoff</div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded border border-border bg-[#FDFCF8] px-2.5 py-1 text-[11.5px]">
              <Check className={`h-3 w-3 ${qaChipIconClass}`} /> {qaLine}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-border bg-[#FDFCF8] px-2.5 py-1 text-[11.5px]">
              <Check className="h-3 w-3 text-revenue" /> Handoff {status}
            </span>
            <Link
              to="/qa"
              search={qaLinkSearch}
              className="inline-flex items-center gap-1 rounded border border-transparent px-2.5 py-1 text-[11.5px] font-medium text-primary hover:underline"
            >
              Review QA <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {approved || activated ? (
        <div className="flow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flow-section-label !mb-0">Activation guide</div>
            <Link
              to={studioLink.to}
              search={studioLink.search}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Open in Workflow Studio
            </Link>
          </div>
          <p className="mb-3 text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
            {activationSummary}
          </p>
          {managoHint ? (
            <p className="mb-3 rounded-md border border-border bg-sand/40 px-3 py-2 font-mono text-[11.5px] text-[rgb(22_22_26/0.78)]">
              {managoHint}
            </p>
          ) : null}
          {fallbackActivationSteps.length > 0 ? (
            <ul className="flow-package-list space-y-3">
              {fallbackActivationSteps.map((step, index) => {
                const stepTitle = String(
                  step.title || step.node_type || `Step ${index + 1}`,
                ).trim();
                const stepDescription = String(step.description ?? "").trim();
                return (
                  <li key={`${index}-${stepTitle}`} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
                    <div>
                      <div className="font-medium">{stepTitle}</div>
                      {stepDescription ? (
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-[rgb(22_22_26/0.72)]">
                          {stepDescription}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
              No human-guide steps on this package yet. Open Workflow Studio to
              review the full blueprint before activating in Manago.
            </p>
          )}
        </div>
      ) : (
        <div className="flow-card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flow-section-label !mb-0">Human guide excerpt</div>
            <Link
              to={studioLink.to}
              search={studioLink.search}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Open in Workflow Studio
            </Link>
          </div>
          {packageLoading && !buildPackage ? (
            <p className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading human guide from build package…
            </p>
          ) : packageFailed && !buildPackage ? (
            <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
              Could not load the build package human guide. Open Workflow Studio
              to review the blueprint before activating in Manago.
            </p>
          ) : excerptSteps.length > 0 ? (
            <ul className="flow-package-list space-y-1.5">
              {excerptSteps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
                  {step}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
              No human-guide steps on this package yet. Open Workflow Studio to
              review the full blueprint before activating in Manago.
            </p>
          )}
        </div>
      )}

      {!rejected ? (
        <div className="flow-card">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flow-section-label !mb-0">Delivery</div>
            <span className="text-[12px] text-muted-foreground">
              Human Manago path · no MCP auto-send
            </span>
          </div>
          <p className="mb-3 text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
            {staged
              ? "Admin approves this staged package for human activation in Manago. "
              : approved
                ? "Build and activate in Manago using the guide above, then confirm here. "
                : activated
                  ? "This handoff is activated. "
                  : ""}
            {HANDOFF_SEND_LOCKED_HINT}
          </p>
          {staged ? (
            canApproveHandoff === true ? (
              <>
                <HandoffApproveButton
                  variant="inline"
                  pending={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                />
                <HandoffApproveButton
                  variant="cta"
                  pending={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                />
              </>
            ) : canApproveHandoff === false ? (
              <>
                <HandoffSendLockedButton
                  variant="inline"
                  label="Approve for activation"
                  lockedTitle={HANDOFF_ADMIN_REQUIRED_TITLE}
                >
                  Approve for activation
                </HandoffSendLockedButton>
                <HandoffSendLockedButton
                  variant="cta"
                  label="Approve for activation"
                  lockedTitle={HANDOFF_ADMIN_REQUIRED_TITLE}
                >
                  <Send className="h-3.5 w-3.5" /> Approve for activation
                </HandoffSendLockedButton>
              </>
            ) : (
              <p className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking approval permissions…
              </p>
            )
          ) : approved ? (
            canApproveHandoff === true ? (
              <div className="space-y-3">
                <label className="block text-[12px] font-medium text-muted-foreground">
                  Manago workflow id (optional)
                  <input
                    type="text"
                    value={managoWorkflowId}
                    onChange={(event) => setManagoWorkflowId(event.target.value)}
                    placeholder="Paste workflow UUID from Manago after activation"
                    className="mt-1 w-full max-w-md rounded-md border border-border bg-elevated px-3 py-2 font-mono text-[12px]"
                  />
                </label>
                <HandoffConfirmButton
                  pending={confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                />
              </div>
            ) : canApproveHandoff === false ? (
              <p className="text-[13px] text-muted-foreground">
                Only an admin can confirm activation after the workflow is live
                in Manago.
              </p>
            ) : (
              <p className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking approval permissions…
              </p>
            )
          ) : activated ? (
            <>
              <HandoffSendLockedButton
                variant="inline"
                label="Approve for activation"
                lockedTitle={HANDOFF_ALREADY_ACTIVATED_TITLE}
              >
                Approve for activation
              </HandoffSendLockedButton>
              <HandoffSendLockedButton
                variant="cta"
                label="Approve for activation"
                lockedTitle={HANDOFF_ALREADY_ACTIVATED_TITLE}
              >
                <Send className="h-3.5 w-3.5" /> Approve for activation
              </HandoffSendLockedButton>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flow-card ink">
        <div className="flow-section-label">Staged package · machine spec</div>
        <ul className="flow-package-list mb-3 space-y-1.5">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
            Status {status} · schema {live.schema_version}
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
            Approval {live.approval_ref || "—"}
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
            Manifest {manifestPreview}
          </li>
        </ul>
        <pre className="flow-spec">{JSON.stringify(packPreview, null, 2)}</pre>
      </div>

      <div className="flow-next spark">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
            {activated ? "After activation" : "After staging"}
          </div>
          <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
            {activated ? "Track results" : "Activate in Manago"}
          </div>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
            {activated
              ? "Workflow confirmed live in Manago. Results can roll into the Opportunity tracker."
              : "Build from this staged package in Manago. Confirm here once live."}
          </p>
        </div>
        <Link to="/opportunities" className="flow-cta spark">
          View results <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
}

type HandoffActionVariant = "header" | "inline" | "cta";

const APPROVE_BUTTON_CLASS: Record<HandoffActionVariant, string> = {
  header:
    "inline-flex items-center gap-1.5 rounded-md bg-spark px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60",
  inline:
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium hover:bg-sand/60 disabled:opacity-60",
  cta: "flow-cta spark !py-2.5 !text-[13px] mt-2 disabled:opacity-60",
};

function HandoffApproveButton({
  variant,
  pending,
  onClick,
}: {
  variant: HandoffActionVariant;
  pending: boolean;
  onClick: () => void;
}) {
  const label = "Approve for activation";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      aria-label={label}
      data-handoff-approve="true"
      className={APPROVE_BUTTON_CLASS[variant]}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : variant === "cta" ? (
        <>
          <Send className="h-3.5 w-3.5" /> {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function HandoffConfirmButton({
  pending,
  onClick,
}: {
  pending: boolean;
  onClick: () => void;
}) {
  const label = "Confirm activated";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      aria-label={label}
      data-handoff-confirm="true"
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <CircleCheck className="h-4 w-4" /> {label}
        </>
      )}
    </button>
  );
}

function HandoffHeaderActions({
  live,
  canApprove,
  handoffQueryKey,
  packageId,
  qaRunId,
}: {
  live: HandoffPackageResponse;
  canApprove: boolean | undefined;
  handoffQueryKey: ReturnType<typeof packageHandoffQueryKey>;
  packageId: string;
  qaRunId?: string;
}) {
  const queryClient = useQueryClient();
  const staged = isHandoffStaged(live);
  const activated = isHandoffActivated(live);
  const rejected = isHandoffRejected(live);

  const approveMutation = useMutation({
    mutationFn: () =>
      approveHandoffForActivation(live.handoff_id, handoffActivationBody(live)),
    onSuccess: (data) => {
      const merge = (prev: HandoffPackageResponse | undefined) =>
        prev ? mergeHandoffActivationResponse(prev, data) : prev;
      queryClient.setQueryData(handoffQueryKey, merge);
      if (packageId) {
        queryClient.setQueryData(packageHandoffQueryKey(packageId, qaRunId), merge);
        queryClient.setQueryData(packageHandoffQueryKey(packageId), merge);
      }
      queryClient.setQueryData(handoffDetailQueryKey(live.handoff_id), merge);
      toast.success("Approved for activation", {
        description: HANDOFF_APPROVED_BANNER,
      });
    },
    onError: (err) => {
      toast.error("Approval failed", {
        description: getApiErrorMessage(err, "Could not approve handoff."),
      });
    },
  });

  if (rejected || activated) return null;

  if (staged && canApprove === true) {
    return (
      <HandoffApproveButton
        variant="header"
        pending={approveMutation.isPending}
        onClick={() => approveMutation.mutate()}
      />
    );
  }

  if (staged && canApprove === false) {
    return (
      <HandoffSendLockedButton
        variant="header"
        label="Approve for activation"
        lockedTitle={HANDOFF_ADMIN_REQUIRED_TITLE}
      >
        <Send className="h-3.5 w-3.5" /> Approve for activation
      </HandoffSendLockedButton>
    );
  }

  if (staged && canApprove === undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-spark/60 px-3 py-1.5 text-[12.5px] font-semibold text-white">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </span>
    );
  }

  return null;
}

function HandoffStatusBanner({
  status,
  rejectionReason,
}: {
  status: string;
  rejectionReason: string | null;
}) {
  if (status === "ACTIVATED") {
    return (
      <div className="mb-4 rounded-md border border-revenue/30 bg-revenue/10 px-4 py-3 text-[13px] text-[rgb(22_22_26/0.78)]">
        <strong className="font-semibold text-revenue">Activated</strong> —{" "}
        {HANDOFF_ACTIVATED_BANNER}
      </div>
    );
  }
  if (status === "APPROVED_FOR_ACTIVATION") {
    return (
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-[13px] text-[rgb(22_22_26/0.78)]">
        <strong className="font-semibold text-primary">Approved</strong> —{" "}
        {HANDOFF_APPROVED_BANNER}
      </div>
    );
  }
  if (status === "REJECTED") {
    return (
      <div className="mb-4 rounded-md border border-risk/30 bg-risk/10 px-4 py-3 text-[13px] text-[rgb(22_22_26/0.78)]">
        <strong className="font-semibold text-risk">Rejected</strong> —{" "}
        {HANDOFF_REJECTED_BANNER}
        {rejectionReason ? (
          <span className="mt-1 block text-[12.5px]">
            Reason: {rejectionReason}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-md border border-border bg-sand/50 px-4 py-3 text-[13px] text-[rgb(22_22_26/0.72)]">
      <strong className="font-semibold text-[rgb(22_22_26/0.85)]">
        {status}
      </strong>{" "}
      — Staged for human activation in Manago. Admin approval unlocks the
      activation guide; Klints does not auto-send via MCP.
    </div>
  );
}
