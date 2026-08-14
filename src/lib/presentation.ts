/**
 * Centralized UI display formatting (presentation only — never mutate backend values).
 */

/** Integer counts: stack status, issue totals, contacts, orders, etc. */
export function formatDisplayCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

/** Generic numeric display (counts, scores, evidence values) with compact K above 999. */
export function formatDisplayNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = abs / 1000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${value < 0 ? "-" : ""}${body}K`;
  }
  return String(Math.round(value));
}

/** DCS headline scores and 0–100 dimension scores. */
export function formatDisplayScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDisplayNumber(value);
}

/** Round a score for chart geometry (bar width, arc) without changing source data. */
export function roundDisplayScore(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Round embedded floats in free-text copy (audit summaries, meta badges).
 * e.g. "DCS score completed · 70.516" → "… · 71"
 */
export function formatDisplayText(text: string): string {
  return text.replace(
    /(^|[^\d.])(\d+\.\d+)(?=[^\d.]|$)/g,
    (full, prefix: string, num: string) => {
      const value = Number(num);
      if (!Number.isFinite(value)) return full;
      if (Math.abs(value) >= 1000) {
        const abs = Math.abs(value);
        const k = abs / 1000;
        const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
        const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
        return `${prefix}${value < 0 ? "-" : ""}${body}K`;
      }
      return `${prefix}${Math.round(value)}`;
    },
  );
}

/** @deprecated Use formatDisplayCount */
export const formatOverviewCount = formatDisplayCount;
/** @deprecated Use formatDisplayScore */
export const formatOverviewScore = formatDisplayScore;
/** @deprecated Use formatDisplayText */
export const formatOverviewDisplayText = formatDisplayText;
