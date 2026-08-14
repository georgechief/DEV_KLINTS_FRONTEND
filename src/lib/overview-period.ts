/** Map Executive Overview period labels to date windows and chart granularity. */

export const overviewPeriods = [
  "This quarter",
  "Last 30 days",
  "This month",
  "Last quarter",
  "Last 14 days",
] as const;

export type OverviewPeriod = (typeof overviewPeriods)[number];

export type TrendGranularity = "day" | "month";

export type OverviewPeriodWindow = {
  since: Date;
  until: Date;
  granularity: TrendGranularity;
  spanDays: number;
  periodLabel: string;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}

function startOfPreviousQuarter(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3);
  const year = q === 0 ? date.getFullYear() - 1 : date.getFullYear();
  const month = q === 0 ? 9 : (q - 1) * 3;
  return new Date(year, month, 1);
}

function endOfPreviousQuarter(date: Date): Date {
  const start = startOfQuarter(date);
  return new Date(start.getTime() - 1);
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = endOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function chooseGranularity(spanDays: number): TrendGranularity {
  return spanDays > 31 ? "month" : "day";
}

export function resolveOverviewPeriodWindow(
  period: OverviewPeriod,
  now = new Date(),
): OverviewPeriodWindow {
  const until = endOfDay(now);
  let since: Date;

  switch (period) {
    case "Last 14 days":
      since = startOfDay(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
      break;
    case "Last 30 days":
      since = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
      break;
    case "This month":
      since = startOfDay(startOfMonth(now));
      break;
    case "This quarter":
      since = startOfDay(startOfQuarter(now));
      break;
    case "Last quarter":
      since = startOfDay(startOfPreviousQuarter(now));
      return {
        since,
        until: endOfDay(endOfPreviousQuarter(now)),
        granularity: "month",
        spanDays: daysBetweenInclusive(since, endOfPreviousQuarter(now)),
        periodLabel: period.toLowerCase(),
      };
    default:
      since = startOfDay(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
  }

  const spanDays = daysBetweenInclusive(since, until);
  return {
    since,
    until,
    granularity: chooseGranularity(spanDays),
    spanDays,
    periodLabel: period.toLowerCase(),
  };
}

export type DcsTrendPoint = {
  at: string;
  score: number;
};

export type DcsTrendChartRow = {
  run: string;
  score: number;
};

function bucketKey(date: Date, granularity: TrendGranularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  if (granularity === "month") return `${y}-${m}`;
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatBucketLabel(key: string, granularity: TrendGranularity): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  if (granularity === "month") {
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Aggregate raw score runs into chart rows (last score per day or month). */
export function aggregateDcsTrendPoints(
  points: DcsTrendPoint[],
  granularity: TrendGranularity,
): DcsTrendChartRow[] {
  const buckets = new Map<string, { at: string; score: number }>();
  for (const point of points) {
    const at = new Date(point.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = bucketKey(at, granularity);
    const existing = buckets.get(key);
    if (!existing || at >= new Date(existing.at)) {
      buckets.set(key, { at: point.at, score: point.score });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      run: formatBucketLabel(key, granularity),
      score: value.score,
    }));
}

export type TrendDeltaResult = {
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
};

/**
 * Period-over-period headline score change inside the selected window.
 * Compares the oldest history point to the live headline (when provided).
 */
export function computeTrendDelta(
  points: DcsTrendPoint[],
  currentScore?: number | null,
): TrendDeltaResult {
  const sorted = [...points].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  const comparisonScore =
    sorted.length > 0 ? Math.round(sorted[0]!.score) : null;
  const lastHistoryScore =
    sorted.length > 0 ? Math.round(sorted[sorted.length - 1]!.score) : null;
  const resolvedCurrent =
    currentScore != null ? Math.round(currentScore) : lastHistoryScore;

  if (resolvedCurrent == null || comparisonScore == null) {
    return { delta: null, direction: null };
  }

  const delta = Math.round(resolvedCurrent - comparisonScore);
  if (delta === 0) return { delta: 0, direction: "flat" };
  return { delta, direction: delta > 0 ? "up" : "down" };
}

export type ValueCaptureTrendPoint = {
  at: string;
  value: number;
};

export type ValueCaptureSparkRow = {
  week: string;
  label: string;
  value: number;
};

/** Aggregate captured value history into spark-chart rows (same bucketing as DCS trend). */
export function aggregateValueCapturePoints(
  points: ValueCaptureTrendPoint[],
  granularity: TrendGranularity,
): ValueCaptureSparkRow[] {
  const buckets = new Map<string, { at: string; value: number }>();
  for (const point of points) {
    const at = new Date(point.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = bucketKey(at, granularity);
    const existing = buckets.get(key);
    if (!existing || at >= new Date(existing.at)) {
      buckets.set(key, { at: point.at, value: point.value });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      week: key,
      label: formatBucketLabel(key, granularity),
      value: value.value,
    }));
}
