import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { StatusBadge, Money } from "@/components/klints/primitives";
import {
  formatImpact,
  getQaRunForIssue,
} from "@/lib/klints-data";
import { parseFixFlowSearch } from "@/lib/fix-flow";
import { ArrowRight, ListChecks, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/qa")({
  validateSearch: parseFixFlowSearch,
  head: () => ({
    meta: [
      { title: "QA validation — Klints" },
      {
        name: "description",
        content: "Phase 4 · Nothing reaches the agent until every gate clears.",
      },
    ],
  }),
  component: QaPage,
});

function QaPage() {
  const { issue: issueId } = Route.useSearch();
  const run = getQaRunForIssue(issueId);
  const [cleared, setCleared] = useState(true);

  const passed = run?.gates.filter((g) => g.status === "Passed").length ?? 0;
  const warn = run?.gates.filter((g) => g.status === "Warning").length ?? 0;
  const failed = run?.gates.filter((g) => g.status === "Failed" || g.status === "Running").length ?? 0;
  const canHandoff =
    cleared && run && (run.status === "Ready" || run.status === "Passed") && failed === 0;

  return (
    <AppShell title="QA validation" subtitle="Phase 4 · Fix flow">
      <div>
        <PageTitle
          kicker="Phase 4 · QA validation"
          title="Is it safe to hand to the agent?"
          description="Nothing reaches the agent until every gate clears. Delivery runs over MCP/A2A."
          actions={
            run ? (
              <button
                type="button"
                onClick={() => {
                  setCleared(true);
                  toast.success("QA re-run complete", {
                    description: `${run.runId} · ${run.gates.length} gates`,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Re-run QA
              </button>
            ) : undefined
          }
        />

        {!run ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Please select an issue</h2>
            <p>
              QA validates one workflow at a time. Approve a brief in Workflow Studio, or
              pick an issue from Data Consistency Score.
            </p>
            <Link
              to="/data-consistency"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="flow-card anchor-tint">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                  <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                    {run.eyebrow}
                  </div>
                  <h2 className="font-display mt-1 text-[1.05rem] font-semibold tracking-tight">
                    {run.title}
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
                    {run.summary}
                  </p>
                  <div className="mt-4">
                    <div className="mb-2 text-[11px] text-fog">Touchpoints validated</div>
                    <div className="flow-tp-pills">
                      {run.touchpoints.map((tp, i) => (
                        <span key={tp} className={`flow-tp-pill ${i === 0 ? "primary" : ""}`}>
                          {tp}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge
                    status={
                      canHandoff ? "Completed" : failed > 0 ? "Blocked" : "In Progress"
                    }
                  />
                  <Money
                    value={formatImpact({
                      impact: run.impact,
                      impactType: run.impactType,
                      cadence: "/q",
                    })}
                    tone={run.impactType === "margin" ? "risk" : "revenue"}
                    size="md"
                  />
                  <span className="font-mono text-[11px] text-fog">{run.runId}</span>
                </div>
              </div>

              <div className="mt-6">
                <div className="flow-section-label">
                  Validation gates · {run.gates.length} total · {passed} passed
                  {warn ? ` · ${warn} warn` : ""}
                </div>
                {run.gates.map((g) => (
                  <div key={g.name} className="flow-gate-row">
                    <div className="min-w-0">
                      <div className="g-name">{g.name}</div>
                      <div className="g-desc">{g.desc}</div>
                    </div>
                    <StatusBadge
                      status={
                        g.status === "Passed"
                          ? "Completed"
                          : g.status === "Warning" || g.status === "Running"
                            ? "In Progress"
                            : "Blocked"
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-[12.5px] text-[rgb(22_22_26/0.65)]">
                  {canHandoff
                    ? "All critical gates cleared — package ready for the agent."
                    : "Clear failed gates before packaging for the agent."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/workflow/$id"
                    params={{ id: run.workflowId }}
                    search={{ issue: run.issueId }}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-3 py-2 text-xs font-medium hover:bg-sand"
                  >
                    Review workflow
                  </Link>
                  {canHandoff ? (
                    <Link
                      to="/handoff"
                      search={{ issue: run.issueId }}
                      className="flow-cta !py-2 !text-xs"
                    >
                      View agent package <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        toast.message("Handoff locked", {
                          description: "Clear failed gates before packaging.",
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
                  Deliver to the agent
                </div>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                  Once every gate clears, Klints packages the validated spec for MCP/A2A
                  delivery. Activation stays with you in Manago.ai.
                </p>
              </div>
              {canHandoff ? (
                <Link to="/handoff" search={{ issue: run.issueId }} className="flow-cta">
                  Continue to Handoff <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="flow-cta locked">Continue to Handoff</span>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
