import { Link } from "@tanstack/react-router";
import { formatDisplayWhen } from "@/lib/datetime";
import { ArrowRight, Loader2 } from "lucide-react";
import { formatAuditEventSummary, resolveAuditEventMeta, type AuditEvent, type AuditTone } from "@/lib/audit";

function formatEventTime(createdAt: string): string {
  return formatDisplayWhen(createdAt);
}

function toneDotClass(tone: AuditTone): string {
  switch (tone) {
    case "revenue":
      return "bg-revenue";
    case "risk":
      return "bg-risk";
    case "loss":
      return "bg-loss";
    default:
      return "bg-info";
  }
}

function normalizeTone(tone: string): AuditTone {
  if (tone === "revenue" || tone === "risk" || tone === "loss" || tone === "info") {
    return tone;
  }
  return "info";
}

export function NotificationsPanel({
  events,
  unreadCount,
  isPending,
  isMarkingAll,
  onClose,
  onMarkAll,
  onItemClick,
}: {
  events: AuditEvent[];
  unreadCount: number;
  isPending?: boolean;
  isMarkingAll?: boolean;
  onClose: () => void;
  onMarkAll: () => void;
  onItemClick?: (event: AuditEvent) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-elevated shadow-elevated"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Notifications</div>
          <div className="text-[11px] text-muted-foreground">Governance activity</div>
        </div>
        <button
          type="button"
          onClick={onMarkAll}
          disabled={isMarkingAll || unreadCount === 0}
          className="text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isMarkingAll ? "Marking…" : "Mark all read"}
        </button>
      </div>
      {isPending ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notifications…
        </div>
      ) : events.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">You&apos;re all caught up.</div>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {events.map((event) => {
            const tone = normalizeTone(event.tone);
            const actor = event.actor || event.performed_by;
            const meta = resolveAuditEventMeta(event);

            return (
              <li key={event.id}>
                {onItemClick ? (
                  <button
                    type="button"
                    onClick={() => onItemClick(event)}
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sand/60"
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(tone)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug text-foreground">
                        {formatAuditEventSummary(event)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatEventTime(event.created_at)}
                        {actor ? ` · ${actor}` : ""}
                        {meta ? ` · ${meta}` : ""}
                      </div>
                    </div>
                  </button>
                ) : (
                  <Link
                    to="/activity"
                    onClick={onClose}
                    className="flex gap-3 px-4 py-3 text-left hover:bg-sand/60"
                  >
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(tone)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug text-foreground">
                        {formatAuditEventSummary(event)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatEventTime(event.created_at)}
                        {actor ? ` · ${actor}` : ""}
                        {meta ? ` · ${meta}` : ""}
                      </div>
                    </div>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-border px-4 py-2.5">
        <Link
          to="/activity"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View full timeline <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
