import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { KlintsLoader } from "@/components/klints/KlintsLoader";
import type { FixPlan } from "@/lib/klints-data";
import {
  DCS_WORKLIST_QUERY_KEY,
  dcsWorklistIssueQueryKey,
  getDcsWorklist,
  getDcsWorklistIssue,
} from "@/lib/dcs";
import { buildLiveFixPlan } from "@/lib/fix-live-plan";
import {
  getWritebackMappings,
  isWritebackMappingEnabled,
  previewWriteback,
  writebackPreviewErrorMessage,
  writebackPreviewMeta,
  writebackPreviewToTable,
  WRITEBACK_MAPPINGS_QUERY_KEY,
} from "@/lib/writebacks";
import {
  getCheckIdFromSearch,
  getIssueById,
  isFixtureIssueId,
  parseFixFlowSearch,
  resolveFixTarget,
  type FixTarget,
} from "@/lib/fix-flow";
import { fixPlans } from "@/lib/klints-data";
import { ArrowRight, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";

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
  return undefined;
}

function pageIssueTitle(target: FixTarget): string | null {
  if (target.kind === "fixture") return target.issue.title;
  if (target.kind === "live") return target.plan.title;
  return null;
}

function FixPage() {
  const search = Route.useSearch();
  const [approved, setApproved] = useState(false);
  const [previewTab, setPreviewTab] = useState<"evidence" | "writeback">("evidence");

  const needsWorklist = useMemo(() => {
    const fixtureId =
      search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;
    const hasFixture =
      Boolean(fixtureId) &&
      Boolean(getIssueById(fixtureId)) &&
      Boolean(fixtureId && fixPlans[fixtureId]);
    return Boolean(getCheckIdFromSearch(search) && !hasFixture);
  }, [search]);

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

  const preliminaryTarget = useMemo(
    () => resolveFixTarget(search, worklist?.issues),
    [search, worklist?.issues],
  );

  const liveCheckId =
    preliminaryTarget.kind === "live" ? preliminaryTarget.checkId : undefined;

  const { data: issueDetail } = useQuery({
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

  const issueKey =
    target.kind === "fixture"
      ? target.issueId
      : target.kind === "live"
        ? target.checkId
        : target.kind === "loading"
          ? target.checkId
          : target.kind === "missing"
            ? target.checkId
            : null;

  useEffect(() => {
    setApproved(false);
    setPreviewTab("evidence");
  }, [issueKey]);

  const liveCheckIdForWriteback =
    target.kind === "live" ? target.checkId : undefined;

  const { data: writebackMappings } = useQuery({
    queryKey: WRITEBACK_MAPPINGS_QUERY_KEY,
    queryFn: getWritebackMappings,
    enabled: Boolean(liveCheckIdForWriteback),
  });

  const writebackEnabled = isWritebackMappingEnabled(
    writebackMappings?.mappings,
    liveCheckIdForWriteback,
  );

  const writebackPreviewMutation = useMutation({
    mutationFn: () => previewWriteback(liveCheckIdForWriteback!),
    onSuccess: () => {
      setPreviewTab("writeback");
    },
    onError: (error) => {
      toast.error(writebackPreviewErrorMessage(error));
    },
  });

  const writebackPreview = writebackPreviewMutation.data;
  const writebackTable = writebackPreview
    ? writebackPreviewToTable(writebackPreview)
    : null;
  const writebackMeta = writebackPreview
    ? writebackPreviewMeta(writebackPreview)
    : null;

  const isLive = target.kind === "live";
  const isFixture = target.kind === "fixture";
  const plan: FixPlan | undefined =
    target.kind === "fixture" || target.kind === "live" ? target.plan : undefined;

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
      return {
        title: `Writeback preview · ${writebackPreview?.check_id ?? plan.changeSetId}`,
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
  }, [plan, previewTab, writebackPreview?.check_id, writebackTable]);

  const switchSearch = switchIssueSearch(target);
  const issueTitle = pageIssueTitle(target);

  const showTrustApproved = approved && isFixture;

  function notifyWritebackNotEnabled() {
    toast.message("Writebacks are not enabled yet", {
      description: "This does not update Manago.ai.",
    });
  }

  return (
    <AppShell
      title="Fix"
      subtitle="Phase 2 · Fix flow"
      issueTitle={issueTitle}
    >
      <div className="fix-page">
        <PageTitle
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

        {target.kind === "loading" || (needsWorklist && worklistPending) ? (
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
                No production update reaches Manago.ai without all four steps completed
                and recorded.
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
                    isLive ? "is-current" : showTrustApproved ? "is-done" : "is-current"
                  }`}
                >
                  <div className="t-num">02 · TEST</div>
                  <div className="t-name">Sandboxed test</div>
                  <div className="t-line">Tried against a sandboxed Manago.ai target first</div>
                  <div className={`t-state ${isLive ? "current" : showTrustApproved ? "done" : "current"}`}>
                    {isLive && writebackPreview
                      ? "Preview ready · dry-run only"
                      : isLive
                        ? writebackEnabled
                          ? "Mapping ready · preview available"
                          : "Plan ready · preview not mapped"
                        : showTrustApproved
                          ? "Test complete"
                          : "Test complete · ready for approval"}
                  </div>
                </div>
                <div
                  className={`fix-trust-step ${
                    showTrustApproved ? "is-done" : isLive ? "" : ""
                  } ${!isLive && !showTrustApproved ? "" : ""}`}
                >
                  <div className="t-num">03 · APPROVE</div>
                  <div className="t-name">Human sign-off</div>
                  <div className="t-line">Production change requires explicit human approval</div>
                  <div
                    className={`t-state ${
                      showTrustApproved ? "done" : "pending"
                    }`}
                  >
                    {isLive
                      ? "Coming soon"
                      : showTrustApproved
                        ? "Approved"
                        : "Awaiting approval"}
                  </div>
                </div>
                <div className="fix-trust-step">
                  <div className="t-num">04 · AUDIT</div>
                  <div className="t-name">Append-only record</div>
                  <div className="t-line">Audit entry written for every state change</div>
                  <div className={`t-state ${showTrustApproved ? "done" : "pending"}`}>
                    {isLive
                      ? "Will write on approval"
                      : showTrustApproved
                        ? "Written"
                        : "Will write on approval"}
                  </div>
                </div>
              </div>
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
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {isLive
                      ? "Plan ready · writeback not enabled"
                      : plan.mode === "build"
                        ? "Ready · no fix required"
                        : "Step 02 · Test complete"}
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                    {activePreview.title}
                  </div>
                  {isLive && writebackEnabled ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTab("evidence")}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                          previewTab === "evidence"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-elevated text-muted-foreground hover:bg-sand"
                        }`}
                      >
                        Evidence
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (writebackPreview) {
                            setPreviewTab("writeback");
                            return;
                          }
                          writebackPreviewMutation.mutate();
                        }}
                        disabled={writebackPreviewMutation.isPending}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium disabled:cursor-wait disabled:opacity-60 ${
                          previewTab === "writeback"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-elevated text-muted-foreground hover:bg-sand"
                        }`}
                      >
                        {writebackPreviewMutation.isPending
                          ? "Loading preview…"
                          : "Writeback preview"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="fix-preview-helper">{activePreview.helper}</p>
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
                    {writebackMeta?.executeNote ? (
                      <p className="text-[11px] text-muted-foreground">
                        {writebackMeta.executeNote}
                      </p>
                    ) : null}
                    {writebackMeta?.irreversibleWarning ? (
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

              <div className="fix-gov">
                <div className="fix-gov-head">
                  <strong className="font-semibold text-foreground">{plan.govHead}</strong>
                </div>
                <div className="fix-gov-grid">
                  {plan.gov.map((g) => (
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
                  {isLive && writebackPreview
                    ? "Writeback preview · dry-run only"
                    : isLive && writebackEnabled
                      ? "Writeback mapping available · preview to see before/after"
                      : plan.testBadge}
                </span>
              </div>

              <div className="fix-cta-row">
                {plan.mode === "approve" && !showTrustApproved && (
                  <button
                    type="button"
                    disabled
                    title="Writebacks are not enabled yet — this does not update Manago"
                    onClick={notifyWritebackNotEnabled}
                    className="rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve writeback · Coming soon
                  </button>
                )}
                {isFixture && target.kind === "fixture" ? (
                  <Link
                    to="/workflow/$id"
                    params={{ id: target.issue.workflowId }}
                    search={{ issue: target.issueId }}
                    onClick={() => {
                      if (plan.mode === "approve" && !showTrustApproved) {
                        setApproved(true);
                        toast.message("Demo workflow preview", {
                          description: "Writebacks are not enabled yet — this does not update Manago.ai.",
                        });
                      }
                    }}
                    className={`fix-cta-primary ${plan.mode === "build" ? "build" : ""}`}
                  >
                    {plan.ctaLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    to="/data-consistency"
                    search={switchSearch}
                    hash="dcs-issues"
                    className={`fix-cta-primary ${plan.mode === "build" ? "build" : ""} opacity-80`}
                  >
                    {plan.ctaLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>

            <div className="fix-next-action">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                  Next in the fix flow · phase 3
                </div>
                <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
                  Build the workflow brief
                </div>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                  Once the fix is approved and the score re-checks, Klints builds the
                  workflow brief on validated data — what to build, for which segment.
                </p>
              </div>
              {isFixture && target.kind === "fixture" ? (
                <Link
                  to="/workflow/$id"
                  params={{ id: target.issue.workflowId }}
                  search={{ issue: target.issueId }}
                  className="fix-cta-primary"
                >
                  Proceed to Workflow Studio <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="fix-cta-primary cursor-not-allowed opacity-60">
                  Build · Coming soon
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
