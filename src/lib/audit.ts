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
};

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
