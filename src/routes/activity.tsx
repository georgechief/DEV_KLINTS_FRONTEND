import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section } from "@/components/klints/primitives";
import {
  AUDIT_EVENTS_QUERY_KEY,
  listAuditEvents,
  resolveAuditEventMeta,
  formatAuditEventSummary,
  type AuditEvent,
  type AuditTone,
} from "@/lib/audit";
import { getApiErrorMessage } from "@/lib/connectors";
import { formatDisplayText } from "@/lib/presentation";
import { formatDisplayWhen } from "@/lib/datetime";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Klints" },
      { name: "description", content: "Writebacks, drift, QA, and agent handoffs." },
    ],
  }),
  component: ActivityPage,
});

function formatEventTime(createdAt: string): string {
  return formatDisplayWhen(createdAt);
}

function normalizeTone(tone: string): AuditTone {
  if (tone === "revenue" || tone === "risk" || tone === "loss" || tone === "info") {
    return tone;
  }
  return "info";
}

function ActivityRow({ event }: { event: AuditEvent }) {
  const tone = normalizeTone(event.tone);
  const actor = event.actor || event.performed_by;
  const summary = formatAuditEventSummary(event);
  const meta = resolveAuditEventMeta(event);
  const metaDisplay = meta ? formatDisplayText(meta) : null;

  return (
    <li className="flex gap-4 px-5 py-4">
      <div
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
          tone === "revenue"
            ? "bg-revenue"
            : tone === "risk"
              ? "bg-risk"
              : tone === "loss"
                ? "bg-loss"
                : "bg-info"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">{summary}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {formatEventTime(event.created_at)}
          {actor ? ` · ${actor}` : ""}
          {metaDisplay ? ` · ${metaDisplay}` : ""}
        </div>
      </div>
      <span
        className={`self-start rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
          tone === "revenue"
            ? "bg-revenue-soft text-revenue"
            : tone === "risk"
              ? "bg-risk-soft text-risk"
              : tone === "loss"
                ? "bg-loss-soft text-loss"
                : "bg-info-soft text-info"
        }`}
      >
        {tone === "revenue" ? "fix" : tone}
      </span>
    </li>
  );
}

function ActivityPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: AUDIT_EVENTS_QUERY_KEY,
    queryFn: () => listAuditEvents(),
  });

  const events = data?.results ?? [];

  return (
    <AppShell title="Activity" subtitle="Governance timeline">
      <PageTitle
        kicker="Reference"
        title="What changed in the stack"
        description="Writebacks approved, drift detected, QA failed, handoffs sent — governance verbs, not a revenue BI feed."
      />

      <Section title="Timeline" description="Newest first">
        {isPending ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading governance activity…
          </div>
        ) : isError ? (
          <div className="px-5 py-8">
            <p className="text-sm text-destructive">
              {getApiErrorMessage(error, "Could not load governance activity.")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No governance activity yet.</p>
        ) : (
          <ol className="relative divide-y divide-border">
            {events.map((event) => <ActivityRow key={event.id} event={event} />)}
          </ol>
        )}
      </Section>
    </AppShell>
  );
}
