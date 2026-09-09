import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, ListChecks, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { StatusBadge } from "@/components/klints/primitives";
import { getApiErrorMessage } from "@/lib/connectors";
import {
  BUILD_PACKAGE_QUERY_KEY,
  getBuildPackage,
  parseQaSearch,
  UC_STALE_MS,
  workflowStudioLink,
  type BuildPackageResponse,
} from "@/lib/use-cases";
import { PackageRouteHonesty } from "@/components/workflow/PackageRouteHonesty";
import {
  classifyPackageQaGetError,
  countHardPasses,
  failedHardTestIds,
  firstEvidenceForHardTest,
  getLatestPackageQa,
  handoffFromQa,
  hardTestDescription,
  hardTestLabel,
  isQaPass,
  isQaRequirementsMissingError,
  packageQaQueryKey,
  qaFailDeepLink,
  QA_STALE_MS,
  qaScoreChipSummary,
  runPackageQa,
  type QaHardTestRow,
  type QaResultResponse,
} from "@/lib/qa";

export const Route = createFileRoute("/qa")({
  validateSearch: parseQaSearch,
  head: () => ({
    meta: [
      { title: "QA validation — Klints" },
      {
        name: "description",
        content:
          "Phase 4 · Rule-engine hard tests on the build package before staged handoff — not MCP delivery.",
      },
    ],
  }),
  component: QaPage,
});

function touchpointsFromPackage(pkg: BuildPackageResponse): string[] {
  const pills: string[] = [];
  const steps = pkg.human_guide?.steps ?? [];
  for (const step of steps) {
    const label = (step.title || step.node_type || "").trim();
    if (label && !pills.includes(label)) pills.push(label);
    if (pills.length >= 6) break;
  }
  // CAP-01: do not use raw route as a touchpoint pill (route has its own chip).
  return pills.length > 0 ? pills : ["Package"];
}

/**
 * BE strips evidence[].id but keeps hard_tests[].evidence_ids and appends
 * evidence in hard-test order — join via firstEvidenceForHardTest (@/lib/qa).
 */
function evidenceHint(
  result: QaResultResponse,
  row: QaHardTestRow,
): string | null {
  if (row.status === "PASS") return null;
  const hit =
    firstEvidenceForHardTest(result, row) ??
    // Fallback only when evidence_ids missing — match locator to this test_id
    // (never bare "fail", which steals other rows' evidence).
    result.evidence.find((ev) =>
      String(ev.locator ?? "")
        .toLowerCase()
        .includes(row.test_id.toLowerCase()),
    );
  if (!hit) return null;
  const value =
    hit.value == null
      ? ""
      : typeof hit.value === "string"
        ? hit.value
        : JSON.stringify(hit.value);
  const snippet = [hit.locator, value].filter(Boolean).join(" · ");
  return snippet.slice(0, 120) || null;
}

/** Survives Strict Mode remount — ref alone would reset and double-POST. */
const autoStartedPackages = new Set<string>();

function QaPage() {
  const { issue: issueId, uc, package_id: packageId } = Route.useSearch();
  const queryClient = useQueryClient();

  const reviewStudio = workflowStudioLink({
    ...(uc ? { uc } : {}),
    ...(packageId ? { package_id: packageId } : {}),
    ...(issueId ? { issue: issueId } : {}),
  });

  const packageQuery = useQuery({
    queryKey: [...BUILD_PACKAGE_QUERY_KEY, packageId],
    queryFn: () => getBuildPackage(packageId!),
    enabled: Boolean(packageId),
    staleTime: UC_STALE_MS,
  });

  const qaQuery = useQuery({
    queryKey: packageQaQueryKey(packageId ?? ""),
    queryFn: () => getLatestPackageQa(packageId!),
    enabled: Boolean(packageId) && packageQuery.isSuccess,
    staleTime: QA_STALE_MS,
    retry: false,
  });

  const runMutation = useMutation({
    mutationFn: (pid: string) => runPackageQa(pid),
    onSuccess: (data, pid) => {
      queryClient.setQueryData(packageQaQueryKey(pid), data);
      const failed = failedHardTestIds(data);
      if (data.status === "PASS") {
        toast.success("QA cleared", {
          description: `Score ${Math.round(data.score)} · ${data.hard_tests.length} hard tests`,
        });
      } else {
        toast.message("QA blocked", {
          description:
            failed.length > 0
              ? `Score ${Math.round(data.score)} · failed: ${failed.join(", ")}`
              : `Score ${Math.round(data.score)} below gate`,
        });
      }
    },
    onError: (err, pid) => {
      // Allow a later visit / remount to auto-run again after a failed POST.
      autoStartedPackages.delete(pid);
      toast.error("QA run failed", {
        description: isQaRequirementsMissingError(err)
          ? "Package is missing qa_requirements — regenerate in Workflow Studio."
          : getApiErrorMessage(err, "Could not run package QA."),
      });
    },
  });

  const runTargetsCurrent =
    Boolean(packageId) && runMutation.variables === packageId;
  const runPendingForPackage =
    runTargetsCurrent && runMutation.isPending;
  const runErrorForPackage = runTargetsCurrent && runMutation.isError;

  useEffect(() => {
    if (!packageId || !packageQuery.isSuccess) return;
    if (qaQuery.isFetching || qaQuery.isSuccess) return;
    if (!qaQuery.isError) return;
    if (classifyPackageQaGetError(qaQuery.error) !== "never_run") return;
    if (autoStartedPackages.has(packageId)) return;
    // One in-flight POST at a time (avoid writing the wrong package's pending UI).
    if (runMutation.isPending) return;
    autoStartedPackages.add(packageId);
    runMutation.mutate(packageId);
  }, [
    packageId,
    packageQuery.isSuccess,
    qaQuery.isFetching,
    qaQuery.isSuccess,
    qaQuery.isError,
    qaQuery.error,
    runMutation.isPending,
    runMutation.mutate,
  ]);

  const mutationForPackage =
    packageId &&
    runTargetsCurrent &&
    runMutation.isSuccess &&
    runMutation.data
      ? runMutation.data
      : undefined;

  const qaResult: QaResultResponse | undefined =
    mutationForPackage ??
    (qaQuery.isSuccess ? qaQuery.data : undefined);

  const canHandoff = isQaPass(qaResult);
  const handoff = handoffFromQa({
    uc: uc ?? qaResult?.use_case_id ?? packageQuery.data?.use_case_id,
    package_id: packageId,
    qa_run_id: qaResult?.qa_run_id,
    issue: issueId,
  });

  const awaitingFirstAutoRun =
    Boolean(packageId) &&
    packageQuery.isSuccess &&
    qaQuery.isError &&
    classifyPackageQaGetError(qaQuery.error) === "never_run" &&
    !qaResult &&
    !runErrorForPackage &&
    Boolean(packageId && !autoStartedPackages.has(packageId));

  // mutate() sets isPending synchronously — do not treat "in Set" alone as
  // running (that stuck the UI on remount after a failed auto-run).
  const isRunning = runPendingForPackage || awaitingFirstAutoRun;

  const passedCount = qaResult ? countHardPasses(qaResult) : 0;
  const hardTotal = qaResult?.hard_tests.length ?? 0;
  const pkg = packageQuery.data;

  const isLoadingLatest =
    Boolean(pkg) &&
    qaQuery.isPending &&
    !qaResult &&
    !isRunning;

  const showLiveCard =
    Boolean(pkg) &&
    (Boolean(qaResult) || isRunning || isLoadingLatest);

  return (
    <AppShell title="QA validation" subtitle="Phase 4 · Fix flow">
      <div>
        <PageTitle
          kicker="Phase 4 · QA validation"
          title="Is this package safe to stage?"
          description="Hard-test package validation (rule engine) — not MCP delivery. Activation stays with you."
          actions={
            packageId ? (
              <button
                type="button"
                disabled={runMutation.isPending || packageQuery.isPending}
                onClick={() => runMutation.mutate(packageId)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:opacity-60"
              >
                {runPendingForPackage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Re-run QA
              </button>
            ) : undefined
          }
        />

        {!packageId ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Generate a build package in Workflow Studio first</h2>
            <p>
              QA runs against a staged build package. Open Workflow Studio
              {uc ? ` for ${uc}` : ""}, generate a package, then continue here.
            </p>
            <Link
              to={reviewStudio.to}
              search={reviewStudio.search}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Open Workflow Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : packageQuery.isPending ? (
          <div className="flow-empty">
            <Loader2 className="h-8 w-8 animate-spin text-fog" />
            <h2>Loading build package…</h2>
          </div>
        ) : packageQuery.isError ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Build package not found</h2>
            <p>
              {getApiErrorMessage(
                packageQuery.error,
                "This package is missing or belongs to another workspace.",
              )}
            </p>
            <Link
              to={reviewStudio.to}
              search={reviewStudio.search}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Back to Workflow Studio <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : showLiveCard && pkg ? (
          <>
            <div className="flow-card anchor-tint">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                    {pkg.use_case_id} · package
                    {pkg.provisional_supplemental ? " · provisional" : ""}
                  </div>
                  <PackageRouteHonesty
                    className="mt-1.5"
                    route={pkg.route}
                    capabilityResolution={pkg.capability_resolution}
                  />
                  <h2 className="font-display mt-2 text-[1.05rem] font-semibold tracking-tight">
                    {pkg.title}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
                    Validates the staged build package against pack hard tests.
                    This is not an MCP send — handoff stays a separate step.
                  </p>
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] text-fog">
                      Touchpoints from package
                    </div>
                    <div className="flow-tp-pills">
                      {touchpointsFromPackage(pkg).map((tp, i) => (
                        <span
                          key={tp}
                          className={`flow-tp-pill ${i === 0 ? "primary" : ""}`}
                        >
                          {tp}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex min-w-[9.5rem] flex-col items-end gap-2 text-right">
                  {qaResult ? (
                    <>
                      <div
                        className={`font-mono text-[1.65rem] font-semibold leading-none tracking-tight ${
                          canHandoff ? "text-revenue" : "text-risk"
                        }`}
                      >
                        {Math.round(qaResult.score)}
                        <span className="text-[0.95rem] font-medium text-fog">
                          {" "}
                          / 100
                        </span>
                      </div>
                      <StatusBadge
                        status={canHandoff ? "Cleared" : "Blocked"}
                      />
                      <div
                        className={`max-w-[14rem] text-[11px] leading-snug ${
                          canHandoff ? "text-revenue" : "text-risk"
                        }`}
                      >
                        {qaScoreChipSummary(qaResult)}
                      </div>
                      <div className="font-mono text-[11px] text-fog">
                        gate ≥ {Math.round(qaResult.minimum_score)}
                      </div>
                      <span className="font-mono text-[10px] text-fog">
                        {qaResult.qa_run_id.slice(0, 8)}…
                      </span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-fog" />
                      <StatusBadge status="Running" />
                      <div className="text-[11px] text-fog">
                        {isLoadingLatest
                          ? "Loading latest QA…"
                          : "Running package QA…"}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <div className="flow-section-label">
                  Validation gates · {hardTotal || 7} total
                  {qaResult ? ` · ${passedCount} passed` : ""}
                </div>
                  {qaResult
                  ? qaResult.hard_tests.map((row) => {
                      const hint = evidenceHint(qaResult, row);
                      const base = hardTestDescription(row.test_id);
                      const desc = hint ? `${base}${base ? " · " : ""}${hint}` : base;
                      const failLink =
                        row.status === "FAIL"
                          ? qaFailDeepLink({
                              result: qaResult,
                              row,
                              issueId,
                            })
                          : null;
                      return (
                        <div
                          key={row.test_id}
                          className="flow-gate-row"
                          data-qa-fail-route={failLink?.kind}
                        >
                          <div className="min-w-0">
                            <div className="g-name">
                              {hardTestLabel(row.test_id)}
                            </div>
                            <div className="g-desc">{desc}</div>
                            {failLink ? (
                              <Link
                                to={failLink.to}
                                search={
                                  "search" in failLink && failLink.search
                                    ? failLink.search
                                    : undefined
                                }
                                className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-foreground underline-offset-2 hover:underline"
                              >
                                {failLink.label}{" "}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : null}
                          </div>
                          <StatusBadge
                            status={
                              row.status === "PASS" ? "Cleared" : "Blocked"
                            }
                          />
                        </div>
                      );
                    })
                  : Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flow-gate-row opacity-60">
                        <div className="min-w-0">
                          <div className="g-name">Evaluating…</div>
                          <div className="g-desc">Hard test {i + 1} of 7</div>
                        </div>
                        <StatusBadge status="Running" />
                      </div>
                    ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-[12.5px] text-[rgb(22_22_26/0.65)]">
                  {canHandoff
                    ? "All hard tests cleared and score meets the gate — ready for handoff."
                    : qaResult
                      ? "Fix failing hard tests or regenerate the package, then re-run QA."
                      : "Waiting for QA results…"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={reviewStudio.to}
                    search={reviewStudio.search}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-3 py-2 text-xs font-medium hover:bg-sand"
                  >
                    Review workflow
                  </Link>
                  {canHandoff ? (
                    <Link
                      to={handoff.to}
                      search={handoff.search}
                      className="flow-cta !py-2 !text-xs"
                    >
                      Continue to Handoff <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        toast.message("Handoff locked", {
                          description:
                            "Clear QA (all hard tests PASS and score ≥ gate) first.",
                        })
                      }
                      className="flow-cta locked !py-2 !text-xs"
                    >
                      Handoff locked
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flow-next">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                  Next in the fix flow · phase 5
                </div>
                <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
                  Stage for human activation
                </div>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                  Handoff opens the staged package for human activation in Manago.
                  Live MCP/A2A send is a later milestone — this step only unlocks
                  after QA PASS.
                </p>
              </div>
              {canHandoff ? (
                <Link
                  to={handoff.to}
                  search={handoff.search}
                  className="flow-cta"
                >
                  Continue to Handoff <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="flow-cta locked">Continue to Handoff</span>
              )}
            </div>
          </>
        ) : (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>
              {runErrorForPackage ? "QA run failed" : "Could not load QA"}
            </h2>
            <p>
              {runErrorForPackage
                ? getApiErrorMessage(
                    runMutation.error,
                    "Try re-running QA or regenerating the package in Studio.",
                  )
                : qaQuery.isError &&
                    classifyPackageQaGetError(qaQuery.error) ===
                      "package_not_found"
                  ? "Build package not found for this workspace."
                  : getApiErrorMessage(
                      qaQuery.error ?? packageQuery.error,
                      "Try re-running QA or regenerating the package in Studio.",
                    )}
            </p>
            <button
              type="button"
              disabled={!packageId || runMutation.isPending}
              onClick={() => {
                if (packageId) runMutation.mutate(packageId);
              }}
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              Re-run QA <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
