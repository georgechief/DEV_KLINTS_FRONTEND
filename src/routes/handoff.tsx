import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Money } from "@/components/klints/primitives";
import {
  formatImpact,
  getHandoffForIssue,
} from "@/lib/klints-data";
import { parseFixFlowSearch } from "@/lib/fix-flow";
import { ArrowRight, Check, ListChecks, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/handoff")({
  validateSearch: parseFixFlowSearch,
  head: () => ({
    meta: [
      { title: "Agent handoff — Klints" },
      {
        name: "description",
        content: "Phase 5 · Deliver validated specs to the agent over MCP/A2A.",
      },
    ],
  }),
  component: HandoffPage,
});

function HandoffPage() {
  const { issue: issueId } = Route.useSearch();
  const pkg = getHandoffForIssue(issueId);
  const [sent, setSent] = useState<Record<string, boolean>>({});

  const sendTarget = (name: string) => {
    setSent((s) => ({ ...s, [name]: true }));
    toast.success("Sent", { description: `${name} · ${pkg?.changeSetId}` });
  };

  const sendAll = () => {
    if (!pkg) return;
    const next = Object.fromEntries(pkg.targets.map((t) => [t.name, true]));
    setSent(next);
    toast.success("Sent to all instances", {
      description: `${pkg.title} · ${pkg.targets.length} targets`,
    });
  };

  return (
    <AppShell title="Agent handoff" subtitle="Phase 5 · Fix flow">
      <div>
        <PageTitle
          kicker="Phase 5 · Agent handoff · MCP/A2A + API delivery"
          title="Agent handoff"
          description="Deliver each validated spec on your command. Activation stays inside Manago.ai."
          actions={
            pkg?.status === "Ready" ? (
              <button
                type="button"
                onClick={sendAll}
                className="inline-flex items-center gap-1.5 rounded-md bg-spark px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
              >
                <Send className="h-3.5 w-3.5" /> Send all to instances
              </button>
            ) : undefined
          }
        />

        {!pkg ? (
          <div className="flow-empty">
            <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
            <h2>Please select an issue</h2>
            <p>
              Handoff delivers one agent package at a time. Clear QA for an issue, then open
              it here.
            </p>
            <Link
              to="/qa"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to QA validation <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            <div className="flow-card anchor-tint">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flow-section-label">Selected workflow</div>
                  <h2 className="font-display text-[1.05rem] font-semibold tracking-tight">
                    {pkg.title}
                  </h2>
                  <div className="mt-1 font-mono text-[12px] text-primary">{pkg.changeSetId}</div>
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
                    {pkg.summary}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {pkg.impactBadge}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded bg-revenue-soft px-2 py-0.5 text-[11px] font-medium text-revenue">
                    <Check className="h-3 w-3" /> QA cleared · ready for handoff
                  </span>
                  <Money
                    value={formatImpact({
                      impact: pkg.impact,
                      impactType: pkg.impactType,
                      cadence: "/q",
                    })}
                    tone={pkg.impactType === "margin" ? "risk" : "revenue"}
                    size="md"
                  />
                </div>
              </div>

              <div className="mt-5">
                <div className="flow-section-label">QA result · cleared for handoff</div>
                <div className="flex flex-wrap gap-2">
                  {pkg.qaMini.map((q) => (
                    <span
                      key={q}
                      className="inline-flex items-center gap-1.5 rounded border border-border bg-[#FDFCF8] px-2.5 py-1 text-[11.5px]"
                    >
                      <Check className="h-3 w-3 text-revenue" /> {q}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flow-card">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flow-section-label !mb-0">Delivery targets</div>
                <span className="text-[12px] text-muted-foreground">
                  Send each instance, or all at once
                </span>
              </div>
              {pkg.targets.map((t) => (
                <div key={t.name} className="flow-target">
                  <div>
                    <div className="t-name">{t.name}</div>
                    <div className="t-desc">
                      {t.desc} · <span className="font-mono text-[11px] text-primary">{t.channel}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendTarget(t.name)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      sent[t.name]
                        ? "bg-revenue-soft text-revenue"
                        : "border border-border bg-elevated hover:bg-sand"
                    }`}
                  >
                    {sent[t.name] ? "Sent" : "Send"}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={sendAll}
                className="flow-cta mt-2 !py-2.5 !text-[13px]"
              >
                <Send className="h-3.5 w-3.5" /> Send all to instances
              </button>
            </div>

            <div className="flow-card ink">
              <div className="flow-section-label">Agent-ready package</div>
              <ul className="flow-package-list mb-3 space-y-1.5">
                {pkg.packageItems.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-spark" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flow-section-label">Machine-readable spec</div>
              <pre className="flow-spec">{JSON.stringify(pkg.machineSpec, null, 2)}</pre>
            </div>

            <div className="flow-next spark">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
                  After handoff
                </div>
                <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
                  Track the outcome
                </div>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
                  Once the agent builds and you activate, results roll into the Opportunity
                  tracker.
                </p>
              </div>
              <Link to="/opportunities" className="flow-cta spark">
                View results <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
