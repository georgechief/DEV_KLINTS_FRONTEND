import { apiRequest } from "@/lib/api";
import { formatDisplayText } from "@/lib/presentation";

const DCS_SCORE_COMPLETED_SUMMARY_RE =
  /^DCS score completed · (\d+(?:\.\d+)?)(?: \(([+-]?\d+(?:\.\d+)?)\))? · (.+)$/;

export const AUDIT_EVENTS_QUERY_KEY = ["audit", "events"] as const;
export const AUDIT_NOTIFICATIONS_QUERY_KEY = ["audit", "notifications"] as const;

export type AuditTone = "info" | "risk" | "loss" | "revenue";

export type AuditEvent = {
  id: string;
  action: string;
  tone: AuditTone;
  summary: string;
  performed_by: string;
  actor: string;
  meta: string | null;
  created_at: string;
  run_id: string | null;
  audit_read: boolean;
  /** PRD-FE-13 — deep-link fields from audit API (optional for older payloads). */
  check_id?: string | null;
  package_id?: string | null;
  use_case_id?: string | null;
  report_id?: string | null;
  /** M2-OPS-01 / WB-06 — writeback job id for Activity focus. */
  job_id?: string | null;
  /** PRD-HO-02 §7.3 — handoff activation audit deep-link. */
  handoff_id?: string | null;
  qa_run_id?: string | null;
  href?: string | null;
};

/** Same-origin deep-link target for bell / Activity / Overview rows (PRD-FE-13 §5). */
export type AuditDeepLink = {
  to: string;
  search?: Record<string, string>;
  hash?: string;
};

function isSameOriginPath(href: string): boolean {
  const candidate = href.trim();
  return candidate.startsWith("/") && !candidate.startsWith("//");
}

function parseHrefToDeepLink(href: string): AuditDeepLink | null {
  if (!isSameOriginPath(href)) return null;
  try {
    const url = new URL(href, "https://klints.local");
    const search: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      search[key] = value;
    });
    const hash = url.hash.replace(/^#/, "") || undefined;
    return {
      to: url.pathname,
      search: Object.keys(search).length > 0 ? search : undefined,
      hash,
    };
  } catch {
    return null;
  }
}

function rewriteFixWhenLocked(
  link: AuditDeepLink,
  fixAllowed: boolean,
): AuditDeepLink {
  if (fixAllowed) return link;
  if (link.to !== "/fix") return link;
  const checkId =
    link.search?.issue?.trim() || link.search?.check?.trim() || "";
  if (!checkId) {
    return { to: "/data-consistency" };
  }
  return { to: "/data-consistency", search: { check: checkId } };
}

/**
 * Resolve navigation for an audit event.
 * Prefer API `href` when same-origin; else compute from link fields / action.
 */
export function resolveAuditDeepLink(
  event: Pick<
    AuditEvent,
    | "action"
    | "href"
    | "check_id"
    | "package_id"
    | "use_case_id"
    | "report_id"
    | "run_id"
    | "handoff_id"
    | "qa_run_id"
  >,
  options?: { fixAllowed?: boolean },
): AuditDeepLink {
  const fixAllowed = options?.fixAllowed !== false;

  const action = (event.action || "").trim();
  if (action.startsWith("workflow.handoff")) {
    const packageId = event.package_id?.trim();
    const useCaseId = event.use_case_id?.trim();
    const handoffId = event.handoff_id?.trim();
    const qaRunId = event.qa_run_id?.trim();
    if (packageId || handoffId) {
      return {
        to: "/handoff",
        search: {
          ...(useCaseId ? { uc: useCaseId } : {}),
          ...(packageId ? { package_id: packageId } : {}),
          ...(handoffId ? { handoff_id: handoffId } : {}),
          ...(qaRunId ? { qa_run_id: qaRunId } : {}),
        },
      };
    }
  }

  const apiHref = event.href?.trim();
  if (apiHref) {
    const parsed = parseHrefToDeepLink(apiHref);
    if (parsed) return rewriteFixWhenLocked(parsed, fixAllowed);
  }

  const checkId = event.check_id?.trim();
  if (checkId) {
    return rewriteFixWhenLocked(
      { to: "/fix", search: { issue: checkId } },
      fixAllowed,
    );
  }

  const packageId = event.package_id?.trim();
  const useCaseId = event.use_case_id?.trim();
  if (packageId && useCaseId) {
    const action = (event.action || "").trim();
    if (action.startsWith("qa.") || action.includes(".qa_")) {
      return {
        to: "/qa",
        search: { uc: useCaseId, package_id: packageId },
      };
    }
    return {
      to: "/workflow",
      search: { uc: useCaseId, package_id: packageId },
    };
  }

  if (event.report_id?.trim() || (event.action || "").startsWith("report.")) {
    return { to: "/activity" };
  }

  if (event.run_id || event.action === "dcs.score_completed" || event.action === "dcs.score_failed") {
    return { to: "/data-consistency", hash: "dcs-score" };
  }

  if ((event.action || "").startsWith("connector.")) {
    return { to: "/integrations" };
  }

  return { to: "/activity" };
}

export type AuditEventsResponse = {
  results: AuditEvent[];
  next_cursor: string | null;
};

export type AuditNotificationsResponse = {
  unread_count: number;
  results: AuditEvent[];
};

export type MarkAllAuditReadResponse = {
  updated: number;
  unread_count: number;
};

export type MarkAuditEventReadResponse = {
  id: string;
  audit_read: true;
  unread_count: number;
};

export type ListAuditEventsParams = {
  limit?: number;
  before?: string;
  unread_only?: boolean;
};

export async function listAuditEvents(
  params: ListAuditEventsParams = {},
): Promise<AuditEventsResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.before) search.set("before", params.before);
  if (params.unread_only) search.set("unread_only", "true");
  const qs = search.toString();
  const endpoint = qs ? `/api/v1/audit/events/?${qs}` : "/api/v1/audit/events/";
  return apiRequest(endpoint) as Promise<AuditEventsResponse>;
}

export async function listAuditNotifications(
  params: { limit?: number } = {},
): Promise<AuditNotificationsResponse> {
  const limit = params.limit ?? 5;
  return apiRequest(
    `/api/v1/audit/notifications/?limit=${limit}`,
  ) as Promise<AuditNotificationsResponse>;
}

export async function markAllAuditRead(): Promise<MarkAllAuditReadResponse> {
  return apiRequest("/api/v1/audit/notifications/mark-all-read/", {
    method: "POST",
  }) as Promise<MarkAllAuditReadResponse>;
}

export async function markAuditEventRead(
  eventId: string,
): Promise<MarkAuditEventReadResponse> {
  return apiRequest(`/api/v1/audit/events/${eventId}/mark-read/`, {
    method: "POST",
  }) as Promise<MarkAuditEventReadResponse>;
}

/** Hide meta when it duplicates the audit summary tail (e.g. run_state). */
export function resolveAuditEventMeta(event: AuditEvent): string | null {
  const meta = event.meta?.trim();
  if (!meta) return null;

  if (event.action === "dcs.score_completed") {
    const parts = event.summary.split("·").map((part) => part.trim());
    const tail = parts[parts.length - 1]?.toLowerCase();
    if (tail && meta.toLowerCase() === tail) {
      return null;
    }
  }

  return meta;
}

/** DCS audit rows: delta = round(current) − round(previous), not round(raw delta). */
export function formatAuditEventSummary(
  event: Pick<AuditEvent, "action" | "summary">,
): string {
  const summary = event.summary?.trim() ?? "";
  if (event.action !== "dcs.score_completed") {
    return formatDisplayText(summary);
  }

  const match = summary.match(DCS_SCORE_COMPLETED_SUMMARY_RE);
  if (!match) {
    return formatDisplayText(summary);
  }

  const [, currentRaw, deltaRaw, state] = match;
  const current = Number(currentRaw);
  const currentDisplay = Math.round(current);
  if (!deltaRaw) {
    return `DCS score completed · ${currentDisplay} · ${state}`;
  }

  const delta = Number(deltaRaw);
  const displayDelta = currentDisplay - Math.round(current - delta);
  if (displayDelta === 0) {
    return `DCS score completed · ${currentDisplay} · ${state}`;
  }

  const deltaLabel =
    displayDelta > 0 ? `(+${displayDelta})` : `(${displayDelta})`;
  return `DCS score completed · ${currentDisplay} ${deltaLabel} · ${state}`;
}
