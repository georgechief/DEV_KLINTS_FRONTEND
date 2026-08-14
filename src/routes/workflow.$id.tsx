import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import {
  getStudioBlueprint,
  workflows,
} from "@/lib/klints-data";
import { getIssueById } from "@/lib/fix-flow";
import { ArrowRight, GitBranch, ListChecks } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/workflow/$id")({
  validateSearch: (search: Record<string, unknown>): { issue?: string } =>
    typeof search.issue === "string" ? { issue: search.issue } : {},
  loader: ({ params }) => {
    const wf = workflows.find((w) => w.id === params.id);
    if (!wf) throw notFound();
    return { wf };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.wf.name} — Klints Workflow` : "Workflow — Klints" },
      {
        name: "description",
        content: loaderData?.wf.description ?? "Workflow detail",
      },
    ],
  }),
  component: WorkflowDetail,
  notFoundComponent: () => (
    <AppShell title="Workflow">
      <div className="flow-empty">
        <p className="text-sm text-muted-foreground">Workflow not found.</p>
        <Link to="/workflow" className="mt-4 text-sm text-primary hover:underline">
          Back to workflows
        </Link>
      </div>
    </AppShell>
  ),
});

function WorkflowDetail() {
  const { wf } = Route.useLoaderData();
  const { issue: issueId } = Route.useSearch();
  const issue = getIssueById(issueId);
  const brief = getStudioBlueprint(issueId);

  return (
    <AppShell title="Workflow Studio" subtitle="Phase 3 · Build">
      <div>
        <PageTitle
          kicker="Phase 3 · Build the workflow"
          title={brief?.headTitle ?? wf.name}
          description={
            brief?.headSub ??
            "Pick an issue from Data Consistency or Fix to open the agent-ready brief."
          }
          actions={
            issue ? (
              <Link
                to="/fix"
                search={{ issue: issue.id }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
              >
                Open approved fix
              </Link>
            ) : undefined
          }
        />

        {!issue || !brief ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Please select an issue</h2>
            <p>
              Workflow Studio shows one agent-ready brief at a time. Select an issue from
              Data Consistency Score or approve a fix first.
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
              <div className="flow-section-label">Built from your approved fix</div>
              <p className="text-[13px] leading-relaxed text-foreground">{brief.builtFrom}</p>
              <div className="mt-4">
                <div className="flow-section-label">Touchpoints</div>
                <div className="flow-tp-pills">
                  {brief.touchpoints.map((tp, i) => (
                    <span key={tp} className={`flow-tp-pill ${i === 0 ? "primary" : ""}`}>
                      {tp}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <div className="flow-section-label">Connected instances</div>
                <div className="flow-tp-pills">
                  {brief.connected.map((c) => (
                    <span key={c} className="flow-tp-pill">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flow-card">
              <div className="flow-section-label">Workflow identity</div>
              <div className="flow-kv-grid">
                {brief.identity.map((row) => (
                  <div key={row.k} className="flow-kv">
                    <div className="k">{row.k}</div>
                    <div className="v">{row.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flow-card">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <div className="flow-section-label !mb-0">
                  Workflow Klints assembled — {brief.steps.length} steps
                </div>
              </div>
              {brief.steps.map((step) => (
                <div key={step.title} className="flow-step">
                  <div className="flow-step-title">{step.title}</div>
                  <div className="flow-step-desc">{step.desc}</div>
                  {step.fields && step.fields.length > 0 && (
                    <div className="flow-step-fields">
                      {step.fields.map((f) => (
                        <span key={f}>{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flow-card">
              <div className="flow-section-label">Required fields</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Field</th>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {brief.requiredFields.map((f) => (
                      <tr key={f.field}>
                        <td className="py-2.5 pr-3 font-mono text-[11px]">{f.field}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{f.source}</td>
                        <td className="py-2.5 font-medium">{f.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flow-next">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                  Next in the fix flow · phase 4
                </div>
                <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
                  Validate the workflow
                </div>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                  Approving sends the assembled workflow to QA validation — every gate runs
                  before anything is handed to the agent.
                </p>
              </div>
              <Link
                to="/qa"
                search={{ issue: issue.id }}
                onClick={() =>
                  toast.success("Sent to QA", {
                    description: `${brief.headTitle} · gate suite queued`,
                  })
                }
                className="flow-cta"
              >
                Approve workflow → send to QA <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
