import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section } from "@/components/klints/primitives";
import {
  AUDIT_EVENTS_QUERY_KEY,
  listAuditEvents,
  resolveAuditDeepLink,
  resolveAuditEventMeta,
  formatAuditEventSummary,
  type AuditEvent,
  type AuditTone,
} from "@/lib/audit";
import {
  DCS_STATUS_QUERY_KEY,
  DCS_STATUS_STALE_MS,
} from "@/lib/app-access";
import { getDcsStatus, isNavRouteAllowed } from "@/lib/dcs";
import { getApiErrorMessage } from "@/lib/connectors";
import { formatDisplayText } from "@/lib/presentation";
import { formatDisplayWhen } from "@/lib/datetime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ActivitySearch = {
  check?: string;
  action?: string;
  job?: string;
};

const ACTIVITY_PAGE_LIMIT = 50;
/** Cap deep-link auto-pagination (50 × 20 = 1000 events). */
const ACTIVITY_FOCUS_AUTO_PAGES_MAX = 20;

function parseActivitySearch(search: Record<string, unknown>): ActivitySearch {
  const out: ActivitySearch = {};
  if (typeof search.check === "string" && search.check.trim()) {
    out.check = search.check.trim();
  }
  if (typeof search.action === "string" && search.action.trim()) {
    out.action = search.action.trim();
  }
  if (typeof search.job === "string" && search.job.trim()) {
    out.job = search.job.trim();
  }
  return out;
}

export const Route = createFileRoute("/activity")({
  validateSearch: (search: Record<string, unknown>): ActivitySearch =>
    parseActivitySearch(search),
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

function eventMatchesActivityFocus(
  event: AuditEvent,
  focus: ActivitySearch,
): boolean {
  const check = focus.check?.trim().toUpperCase();
  const action = focus.action?.trim().toLowerCase();
  const job = focus.job?.trim().toLowerCase();
  if (!check && !action && !job) return false;

  if (check) {
    const eventCheck = (event.check_id ?? "").trim().toUpperCase();
    if (eventCheck !== check) {
      const haystack = `${event.summary} ${event.meta ?? ""}`.toUpperCase();
      if (!haystack.includes(check)) return false;
    }
  }
  if (action) {
    const eventAction = (event.action ?? "").trim().toLowerCase();
    if (eventAction !== action && !eventAction.startsWith(action)) {
      return false;
    }
  }
  if (job) {
    const eventJob = (event.job_id ?? "").trim().toLowerCase();
    if (eventJob) {
      // Full UUID or shared prefix (Activity deep-link may pass full job id).
      if (eventJob !== job && !eventJob.startsWith(job.slice(0, 8)) && !job.startsWith(eventJob.slice(0, 8))) {
        return false;
      }
    } else {
      const haystack = `${event.summary} ${event.meta ?? ""} ${event.id}`.toLowerCase();
      if (!haystack.includes(job.slice(0, 8))) return false;
    }
  }
  return true;
}

function ActivityRow({
  event,
  onOpen,
  highlighted,
  rowRef,
}: {
  event: AuditEvent;
  onOpen: (event: AuditEvent) => void;
  highlighted?: boolean;
  rowRef?: (node: HTMLLIElement | null) => void;
}) {
  const tone = normalizeTone(event.tone);
  const actor = event.actor || event.performed_by;
  const summary = formatAuditEventSummary(event);
  const meta = resolveAuditEventMeta(event);
  const metaDisplay = meta ? formatDisplayText(meta) : null;

  return (
    <li ref={rowRef}>
      <button
        type="button"
        onClick={() => onOpen(event)}
        className={`flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-sand/60 ${
          highlighted ? "bg-info-soft/40 ring-1 ring-inset ring-info/30" : ""
        }`}
      >
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
      </button>
    </li>
  );
}

function ActivityPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [extraEvents, setExtraEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoFocusPages, setAutoFocusPages] = useState(0);
  const [focusSearchExhausted, setFocusSearchExhausted] = useState(false);
  const focusRowRef = useRef<HTMLLIElement | null>(null);
  const didScrollFocus = useRef(false);
  const loadingMoreRef = useRef(false);

  const hasFocus =
    Boolean(search.check?.trim()) ||
    Boolean(search.action?.trim()) ||
    Boolean(search.job?.trim());

  const focusSearchKey = `${search.check ?? ""}|${search.action ?? ""}|${search.job ?? ""}`;

  const { data: dcsStatus } = useQuery({
    queryKey: DCS_STATUS_QUERY_KEY,
    queryFn: getDcsStatus,
    staleTime: DCS_STATUS_STALE_MS,
  });

  const { data, isPending, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: AUDIT_EVENTS_QUERY_KEY,
    queryFn: () => listAuditEvents({ limit: ACTIVITY_PAGE_LIMIT }),
  });

  useEffect(() => {
    if (!data) return;
    setExtraEvents([]);
    setNextCursor(data.next_cursor);
    setAutoFocusPages(0);
    setFocusSearchExhausted(false);
    didScrollFocus.current = false;
  }, [data, dataUpdatedAt, focusSearchKey]);

  const events = [...(data?.results ?? []), ...extraEvents];
  const canLoadMore = Boolean(nextCursor);

  const focusEventId = useMemo(() => {
    if (!hasFocus) return null;
    const match = events.find((event) => eventMatchesActivityFocus(event, search));
    return match?.id ?? null;
  }, [events, hasFocus, search]);

  useEffect(() => {
    if (!focusEventId || didScrollFocus.current) return;
    const node = focusRowRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    didScrollFocus.current = true;
  }, [focusEventId, events.length]);

  const fetchMoreEvents = useCallback(async (cursor: string) => {
    const page = await listAuditEvents({
      limit: ACTIVITY_PAGE_LIMIT,
      before: cursor,
    });
    setExtraEvents((prev) => [...prev, ...page.results]);
    setNextCursor(page.next_cursor);
    return page;
  }, []);

  useEffect(() => {
    if (!hasFocus || focusEventId || isPending || focusSearchExhausted) return;
    if (!nextCursor || loadingMoreRef.current) {
      if (!nextCursor && events.length > 0) {
        setFocusSearchExhausted(true);
      }
      return;
    }
    if (autoFocusPages >= ACTIVITY_FOCUS_AUTO_PAGES_MAX) {
      setFocusSearchExhausted(true);
      return;
    }

    let cancelled = false;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    void fetchMoreEvents(nextCursor)
      .then((page) => {
        if (cancelled) return;
        setAutoFocusPages((count) => count + 1);
        if (!page.next_cursor) {
          setFocusSearchExhausted(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFocusSearchExhausted(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    hasFocus,
    focusEventId,
    isPending,
    focusSearchExhausted,
    nextCursor,
    autoFocusPages,
    events.length,
    fetchMoreEvents,
  ]);

  function openEvent(event: AuditEvent) {
    const link = resolveAuditDeepLink(event, {
      fixAllowed: isNavRouteAllowed(dcsStatus, "/fix"),
    });
    void navigate({
      to: link.to,
      search: link.search,
      hash: link.hash,
    } as never);
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchMoreEvents(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  const focusSearchActive =
    hasFocus && !focusEventId && !focusSearchExhausted && (loadingMore || autoFocusPages > 0);

  return (
    <AppShell title="Activity" subtitle="Governance timeline">
      <PageTitle
        kicker="Reference"
        title="What changed in the stack"
        description="Writebacks approved, drift detected, QA failed, handoffs sent — governance verbs, not a revenue BI feed."
      />

      <Section title="Timeline" description="Newest first · click a row to open the related surface">
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
          <>
            {focusSearchActive ? (
              <p className="flex items-center gap-2 border-b border-border px-5 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching timeline for matching activity…
              </p>
            ) : null}
            {hasFocus && !focusEventId && focusSearchExhausted ? (
              <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
                No matching writeback event in the loaded timeline
                {search.check ? ` for ${search.check}` : ""}. Showing all activity.
              </p>
            ) : null}
            <ol className="relative divide-y divide-border">
              {events.map((event) => {
                const highlighted = focusEventId === event.id;
                return (
                  <ActivityRow
                    key={event.id}
                    event={event}
                    onOpen={openEvent}
                    highlighted={highlighted}
                    rowRef={
                      highlighted
                        ? (node) => {
                            focusRowRef.current = node;
                          }
                        : undefined
                    }
                  />
                );
              })}
            </ol>
            {canLoadMore ? (
              <div className="border-t border-border px-5 py-4">
                <button
                  type="button"
                  disabled={loadingMore || isFetching}
                  onClick={() => void loadMore()}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand disabled:pointer-events-none disabled:opacity-60"
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Load more
                </button>
              </div>
            ) : null}
          </>
        )}
      </Section>
    </AppShell>
  );
}
