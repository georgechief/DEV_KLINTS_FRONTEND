import type { DcsDimensionCheck, DcsDimensionScore } from "@/lib/dcs";
import {
  formatDcsScore,
  resolveDimensionScoreDelta,
  sortDimensionEntries,
} from "@/lib/dcs";
import { formatDisplayCount, roundDisplayScore } from "@/lib/presentation";
import { StatusBadge } from "@/components/klints/primitives";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

function barClass(score: number) {
  if (score < 60) return "bg-loss";
  if (score < 70) return "bg-risk";
  return "bg-revenue";
}

function statusBadgeTone(status: string): "Completed" | "In Progress" | "Blocked" {
  const normalized = status.toUpperCase();
  if (normalized === "PASS") return "Completed";
  if (normalized === "WARN") return "In Progress";
  return "Blocked";
}

function displayCheckStatus(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "PASS") return "Passed";
  if (normalized === "WARN") return "Warning";
  if (normalized === "FAIL") return "Failed";
  if (normalized === "NOT_CONNECTED") return "Not connected";
  if (normalized === "NOT_APPLICABLE") return "N/A";
  if (normalized === "UNKNOWN") return "Unknown";
  return status;
}

export type LiveDimensionTile = {
  id: string;
  name: string;
  score: number;
  delta: number | null;
  issues: number;
  checks: Array<{ check_id?: string; name: string; status: string }>;
};

function mapLiveDimensions(
  dimensions: Record<string, DcsDimensionScore>,
  dimensionChecks?: Record<string, DcsDimensionCheck[]> | null,
  dimensionDeltas?: Record<string, number | null> | null,
): LiveDimensionTile[] {
  return sortDimensionEntries(dimensions).map(([name, dim], index) => {
    const checks = (dimensionChecks?.[name] ?? []).map((check) => ({
      check_id: check.check_id,
      name: check.name,
      status: check.status,
    }));
    const issues = checks.filter((check) => {
      const status = check.status.toUpperCase();
      return status === "FAIL" || status === "WARN";
    }).length;
    return {
      id: `dim-${index}`,
      name,
      score: Math.round(dim.score),
      delta: resolveDimensionScoreDelta(dim, dimensionDeltas?.[name] ?? null),
      issues,
      checks,
    };
  });
}

/**
 * All 7 DCS sub-scores from live API dimensions.
 * - bars (Overview): weakest first
 * - tiles (Data Center): canonical product order, weakest marked
 */
export function DcsSubScores({
  variant = "bars",
  expandable = false,
  linkToDataCenter = false,
  liveDimensions,
  dimensionChecks,
  dimensionDeltas,
}: {
  variant?: "bars" | "tiles";
  expandable?: boolean;
  linkToDataCenter?: boolean;
  liveDimensions: Record<string, DcsDimensionScore>;
  dimensionChecks?: Record<string, DcsDimensionCheck[]> | null;
  dimensionDeltas?: Record<string, number | null> | null;
}) {
  const liveTiles = mapLiveDimensions(
    liveDimensions,
    dimensionChecks,
    dimensionDeltas,
  );
  const ranked = [...liveTiles].sort((a, b) => a.score - b.score);
  const weakestId = ranked[0]?.id;
  const dims: LiveDimensionTile[] = variant === "tiles" ? liveTiles : ranked;
  const [openId, setOpenId] = useState<string | null>(null);
  const openDim = openId ? dims.find((d) => d.id === openId) : null;

  if (variant === "tiles") {
    return (
      <div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {dims.map((d) => {
            const weak = d.id === weakestId;
            const open = openId === d.id;
            const tileClassName = `relative rounded-xl border bg-elevated p-4 text-left shadow-card transition-colors ${
              weak
                ? "border-loss/30 bg-loss-soft/40 pt-6"
                : "border-border hover:border-primary/30"
            } ${open ? "ring-1 ring-primary" : ""} ${expandable ? "cursor-pointer" : "cursor-default"}`;

            const tileBody = (
              <>
                {weak && (
                  <span className="absolute left-3 top-0 rounded-b bg-loss px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                    Weakest
                  </span>
                )}
                <div className="min-h-[2.5rem] text-[11px] font-medium leading-snug text-muted-foreground">
                  {d.name}
                </div>
                <div
                  className={`font-display mt-1.5 text-2xl tabular ${
                    weak ? "text-loss" : "text-foreground"
                  }`}
                >
                  {formatDcsScore(d.score)}
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${barClass(d.score)}`}
                    style={{ width: `${roundDisplayScore(d.score)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {d.issues} issue{d.issues === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`tabular ${
                      d.delta == null
                        ? "text-muted-foreground"
                        : d.delta >= 0
                          ? "text-revenue"
                          : "text-loss"
                    }`}
                  >
                    {d.delta == null
                      ? "—"
                      : `${d.delta >= 0 ? "+" : ""}${formatDisplayCount(d.delta)}`}
                  </span>
                </div>
              </>
            );

            if (expandable) {
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setOpenId(open ? null : d.id)}
                  className={tileClassName}
                >
                  {tileBody}
                </button>
              );
            }

            return (
              <div key={d.id} className={tileClassName}>
                {tileBody}
              </div>
            );
          })}
        </div>
        {expandable && openDim ? <DimensionChecks dim={openDim} /> : null}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {dims.map((d, i) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 shrink-0 text-[10px] tabular text-fog">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate font-medium">{d.name}</span>
                {i === 0 && (
                  <span className="shrink-0 rounded bg-loss-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-loss">
                    Weakest
                  </span>
                )}
              </span>
              <span className="tabular text-muted-foreground">{formatDcsScore(d.score)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${barClass(d.score)}`}
                style={{ width: `${roundDisplayScore(d.score)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>
                {d.issues} open
              </span>
              <span
                className={
                  d.delta == null
                    ? "text-muted-foreground"
                    : d.delta >= 0
                      ? "text-revenue"
                      : "text-loss"
                }
              >
                {d.delta == null
                  ? "—"
                  : `${d.delta >= 0 ? "+" : ""}${formatDisplayCount(d.delta)} pts`}
              </span>
            </div>
          </>
        );
        return (
          <li key={d.id}>
            {linkToDataCenter ? (
              <Link to="/data-consistency" className="block px-5 py-3 transition-colors hover:bg-sand/40">
                {body}
              </Link>
            ) : (
              <div className="px-5 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DimensionChecks({ dim }: { dim: LiveDimensionTile }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-sand/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{dim.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {dim.checks.length} checks · score {dim.score}
        </div>
      </div>
      {dim.checks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No check results are available for this dimension on the latest run.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dim.checks.map((c) => (
            <li
              key={c.check_id || c.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-elevated px-3 py-2 text-xs"
            >
              <span className="min-w-0">
                <span className="font-medium text-foreground">{c.name}</span>
                {c.check_id ? (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {c.check_id}
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {displayCheckStatus(c.status)}
                </span>
                <StatusBadge status={statusBadgeTone(c.status)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
