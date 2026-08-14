import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section, StatusBadge, Money } from "@/components/klints/primitives";
import { formatCurrency, opportunities, workflows } from "@/lib/klints-data";
import { getIssueById, parseFixFlowSearch } from "@/lib/fix-flow";
import { ArrowRight, ListChecks } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/workflow/")({
  validateSearch: parseFixFlowSearch,
  head: () => ({
    meta: [
      { title: "Workflow Studio — Klints" },
      {
        name: "description",
        content: "Validated blueprints for the agent — Diagnose → Fix → Build → QA → Handoff.",
      },
    ],
  }),
  component: WorkflowList,
});

function WorkflowList() {
  const { issue: issueId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const issue = getIssueById(issueId);

  useEffect(() => {
    if (issue?.workflowId) {
      void navigate({
        to: "/workflow/$id",
        params: { id: issue.workflowId },
        search: { issue: issue.id },
        replace: true,
      });
    }
  }, [issue, navigate]);

  return (
    <AppShell title="Workflow Studio" subtitle="Phase 3 · Build">
      <PageTitle
        kicker="Phase 3 · Build the workflow"
        title="Workflow Studio"
        description="Each blueprint packages a diagnosed integrity issue into an agent-ready workflow."
      />

      {!issueId ? (
        <>
          <div className="flow-empty mb-6">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Please select an issue</h2>
            <p>
              Open a use-case from Data Consistency Score (or continue from Fix) to load its
              workflow brief here.
            </p>
            <Link
              to="/data-consistency"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <Section title="All blueprints" description="Or open a blueprint and pick its linked issue">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Blueprint</th>
                    <th className="px-3 py-3 font-medium">Stack</th>
                    <th className="px-3 py-3 text-right font-medium">At stake</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {workflows.map((w) => {
                    const items = opportunities.filter((o) => o.workflowId === w.id);
                    const firstIssue = items[0];
                    return (
                      <tr key={w.id} className="group hover:bg-sand/60">
                        <td className="px-5 py-4">
                          <div className="font-medium text-foreground">{w.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{w.description}</div>
                        </td>
                        <td className="px-3 py-4 text-xs text-muted-foreground">{w.source}</td>
                        <td className="px-3 py-4 text-right">
                          <Money
                            value={formatCurrency(w.revenue, { compact: true })}
                            tone="revenue"
                            size="md"
                          />
                        </td>
                        <td className="px-3 py-4">
                          <StatusBadge status={w.status} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to="/workflow/$id"
                            params={{ id: w.id }}
                            search={firstIssue ? { issue: firstIssue.id } : {}}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : (
        <div className="flow-empty">
          <p className="text-sm text-muted-foreground">Opening workflow brief…</p>
        </div>
      )}
    </AppShell>
  );
}
