/**
 * Centralized date/time presentation (never mutate backend timestamps).
 */
import {
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  differenceInHours,
} from "date-fns";

export function parseDisplayDate(
  value: string | Date | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date only — e.g. "6 Aug 2026", "Today", "Yesterday". */
export function formatDisplayDate(
  value: string | Date | null | undefined,
): string {
  const date = parseDisplayDate(value);
  if (!date) {
    return typeof value === "string" && value.trim() ? value : "—";
  }
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM yyyy");
}

/** Date + time — e.g. "Today, 10:43 AM", "6 Aug 2026 • 10:43 AM". */
export function formatDisplayDateTime(
  value: string | Date | null | undefined,
): string {
  const date = parseDisplayDate(value);
  if (!date) {
    return typeof value === "string" && value.trim() ? value : "—";
  }
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${time}`;
  if (isYesterday(date)) return `Yesterday, ${time}`;
  return `${format(date, "d MMM yyyy")} • ${time}`;
}

/**
 * Activity / audit timestamps — relative when recent, otherwise friendly date+time.
 * e.g. "2 hours ago", "Yesterday, 4:15 PM".
 */
export function formatDisplayWhen(
  value: string | Date | null | undefined,
): string {
  const date = parseDisplayDate(value);
  if (!date) {
    return typeof value === "string" && value.trim() ? value : "—";
  }
  const hoursAgo = differenceInHours(new Date(), date);
  if (hoursAgo >= 0 && hoursAgo < 48) {
    return formatDistanceToNow(date, { addSuffix: true });
  }
  return formatDisplayDateTime(date);
}

/** ISO string for tooltip `title` attributes — preserves full backend value. */
export function formatDisplayIsoTitle(
  value: string | Date | null | undefined,
): string | undefined {
  const date = parseDisplayDate(value);
  if (!date) return typeof value === "string" ? value : undefined;
  return date.toISOString();
}
