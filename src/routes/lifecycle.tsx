import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { KlintsLoader } from "@/components/klints/KlintsLoader";
import {
  AF_COVERAGE_QUERY_KEY,
  AF_LATEST_QUERY_KEY,
  AF_LATEST_STALE_MS,
  FE_PHASE_META,
  getArchitectureCoverage,
  getArchitectureLatest,
  isAfUpdating,
  type AfCoverageStage,
  type AfFePhaseCard,
  type AfVerdictCounts,
  type FePhaseKey,
  verdictUiLabel,
} from "@/lib/architecture";
import { formatDisplayWhen } from "@/lib/datetime";

export const Route = createFileRoute("/lifecycle")({
  head: () => ({
    meta: [
      { title: "Lifecycle cockpit — Klints" },
      {
        name: "description",
        content:
          "Architecture assessment across the lifecycle — recommendations only, never auto-retire.",
      },
    ],
  }),
  component: LifecyclePage,
});

const PHASE_ORDER: FePhaseKey[] = ["acq", "act", "exp", "loy", "ret"];

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "live" | "updating" | "warn" | "muted" | "risk";
}) {
  const toneClass =
    tone === "live"
      ? "bg-revenue-soft text-revenue"
      : tone === "updating"
        ? "bg-primary/10 text-primary"
        : tone === "warn"
          ? "bg-risk/15 text-risk"
          : tone === "risk"
            ? "bg-loss/15 text-loss"
            : "bg-muted text-muted-foreground";

  const dotClass =
    tone === "live"
      ? "bg-revenue"
      : tone === "updating"
        ? "bg-primary animate-pulse"
        : tone === "warn"
          ? "bg-risk"
          : tone === "risk"
            ? "bg-loss"
            : "bg-fog";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium ${toneClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function statusTone(
  uiStatus: string | undefined,
): "live" | "updating" | "warn" | "muted" | "risk" {
  switch (uiStatus) {
    case "up_to_date":
      return "live";
    case "updating":
      return "updating";
    case "incomplete_map":
      return "warn";
    case "failed":
      return "risk";
    default:
      return "muted";
  }
}

function substageStat(stage: AfCoverageStage): {
  stat: "full" | "partial" | "gap";
  label: string;
} {
  if (stage.gap || stage.asset_count === 0) {
    return { stat: "gap", label: "gap" };
  }
  const vc = stage.verdict_counts;
  if ((vc.FIX_FIRST ?? 0) > 0) {
    return { stat: "partial", label: "fix-first" };
  }
  if ((vc.CONSOLIDATE ?? 0) > 0 || (vc.KEEP_IMPROVE ?? 0) > 0) {
    return { stat: "partial", label: "improve" };
  }
  return { stat: "full", label: "covered" };
}

function gapToneForCard(
  vc: AfVerdictCounts,
  gapStages: number,
): "spark" | "good" | "warn" | "muted" {
  if ((vc.FIX_FIRST ?? 0) > 0) return "spark";
  if ((vc.CONSOLIDATE ?? 0) > 0) return "warn";
  if (gapStages > 0) return "muted";
  return "good";
}

function LifecyclePage() {
  const [period, setPeriod] = useState<"q" | "y">("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const horizon = period === "q" ? "quarter" : "year";

  const {
    data: latest,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: AF_LATEST_QUERY_KEY,
    queryFn: getArchitectureLatest,
    staleTime: AF_LATEST_STALE_MS,
    refetchInterval: (query) =>
      isAfUpdating(query.state.data?.ui_status) ? AF_LATEST_STALE_MS : false,
  });

  const assessmentId = latest?.assessment?.assessment_id;

  const { data: coverage, isPending: coveragePending } = useQuery({
    queryKey: [...AF_COVERAGE_QUERY_KEY, assessmentId, horizon] as const,
    queryFn: () => getArchitectureCoverage(assessmentId!, horizon),
    enabled: Boolean(assessmentId),
    staleTime: AF_LATEST_STALE_MS,
  });

  const cardsByKey = useMemo(() => {
    const map = new Map<string, AfFePhaseCard>();
    for (const card of coverage?.fe_phase_cards ?? []) {
      map.set(card.fe_phase_key, card);
    }
    return map;
  }, [coverage?.fe_phase_cards]);

  const stagesByPhase = useMemo(() => {
    const map = new Map<string, AfCoverageStage[]>();
    for (const stage of coverage?.stages ?? []) {
      const key = stage.fe_phase_key ?? "other";
      const list = map.get(key) ?? [];
      list.push(stage);
      map.set(key, list);
    }
    return map;
  }, [coverage?.stages]);

  if (isPending) {
    return (
      <AppShell title="Lifecycle cockpit" subtitle="Architecture assessment">
        <div className="flex min-h-[40vh] items-center justify-center">
          <KlintsLoader label="Loading architecture…" />
        </div>
      </AppShell>
    );
  }

  if (isError || !latest) {
    return (
      <AppShell title="Lifecycle cockpit" subtitle="Architecture assessment">
        <PageTitle
          kicker="Architecture"
          title="Lifecycle cockpit"
          description="Could not load architecture assessment."
        />
        <div className="rounded-xl border border-border bg-elevated p-6">
          <p className="text-sm text-muted-foreground">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      </AppShell>
    );
  }

  const hasAssessment = Boolean(latest.assessment);
  const lifecycle = latest.lifecycle;
  const gaps = lifecycle?.gaps;
  const asOfLabel = lifecycle?.as_of
    ? formatDisplayWhen(lifecycle.as_of)
    : null;

  return (
    <AppShell title="Lifecycle cockpit" subtitle="Architecture assessment">
      <div className="lc-page">
        <PageTitle
          kicker="Architecture · lifecycle cockpit"
          title="Lifecycle revenue cockpit"
          description="What is already running in Manago — Klints recommends; it never auto-retires or edits live assets."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                label={latest.ui_status_label}
                tone={statusTone(latest.ui_status)}
              />
              {asOfLabel ? (
                <span className="text-[11px] text-muted-foreground">
                  As of {asOfLabel}
                </span>
              ) : null}
            </div>
          }
        />

        {!hasAssessment ? (
          <div className="rounded-xl border border-border bg-elevated p-[22px]">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Architecture not ready yet
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {latest.message ??
                "Architecture updates automatically after your Data Consistency Score finishes."}
            </p>
            <Link
              to="/data-consistency"
              className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Open Data Center →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-elevated p-[22px]">
            <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-primary">
                  Mode · {latest.assessment?.mode?.replaceAll("_", " ") ?? "—"}
                </div>
                <h2 className="font-display mt-1 text-lg font-semibold tracking-tight">
                  Acquisition → Reactivation
                </h2>
                <span className="text-xs text-muted-foreground">
                  Tap a card to expand sheet-07 sub-stages
                  {coveragePending ? " · loading coverage…" : ""}
                </span>
              </div>
              <div className="lc-period">
                <button
                  type="button"
                  className={period === "q" ? "active" : ""}
                  onClick={() => setPeriod("q")}
                >
                  Quarter
                </button>
                <button
                  type="button"
                  className={period === "y" ? "active" : ""}
                  onClick={() => setPeriod("y")}
                >
                  Year
                </button>
              </div>
            </div>

            <div className="lc-gaps-band">
              <div>
                <span className="gb-lead">
                  Lifecycle gaps Klints is surfacing right now
                </span>
                <span className="gb-figs">
                  <span className="gb-rev">
                    {gaps?.fix_first ?? 0} fix-first
                  </span>
                  <span className="gb-plus">·</span>
                  <span className="gb-mar">
                    {gaps?.consolidate ?? 0} consolidate
                  </span>
                  <span className="gb-sep">·</span>
                  <span className="gb-count">
                    {gaps?.coverage_gaps ??
                      coverage?.coverage_gap_count ??
                      "—"}{" "}
                    stage gaps
                  </span>
                </span>
              </div>
              <div className="gb-caption">
                {(latest.assessment?.asset_count ?? 0) === 0
                  ? "Assessment finished — Manago returned no workflows/tags/properties in this run · "
                  : ""}
                Counts only in v1 — no invented € from architecture probes ·{" "}
                {lifecycle?.workflow_line ?? "—"}
                {!lifecycle?.graph_complete
                  ? " · Retire/Consolidate gated until the map is complete"
                  : ""}
              </div>
            </div>

            <div className="lc-cockpit">
              {PHASE_ORDER.map((key) => {
                const meta = FE_PHASE_META[key];
                const card = cardsByKey.get(key);
                const vc = card?.verdict_counts ?? {
                  KEEP: 0,
                  KEEP_IMPROVE: 0,
                  FIX_FIRST: 0,
                  CONSOLIDATE: 0,
                  RETIRE_CANDIDATE: 0,
                };
                const stages = stagesByPhase.get(key) ?? [];
                const open = openId === key;
                const fixFirst = vc.FIX_FIRST ?? 0;
                const improve = vc.KEEP_IMPROVE ?? 0;
                const keep = vc.KEEP ?? 0;
                const gapStages = card?.gap_stages ?? stages.filter((s) => s.gap).length;
                const tone = gapToneForCard(vc, gapStages);
                const blocked = fixFirst > 0;

                return (
                  <div key={key} className={`lc-card ${open ? "open" : ""}`}>
                    <div className={`lc-top ${meta.tone}`} />
                    <div className="lc-body">
                      <div className="lc-num">{meta.num}</div>
                      <div className="lc-name">{meta.name}</div>
                      <div className="lc-impact">
                        {card?.asset_count ?? 0} assets{" "}
                        <span
                          className={`ci-type ${
                            blocked ? "risk" : tone === "good" ? "mar" : "rev"
                          }`}
                        >
                          {keep} keep · {improve} improve · {fixFirst} fix-first
                        </span>
                      </div>
                      <div className="lc-wf">
                        <span className={`wf-dot ${blocked ? "blocked" : ""}`} />
                        {blocked
                          ? `${fixFirst} blocked (Fix-first)`
                          : gapStages > 0
                            ? `${gapStages} stage gaps`
                            : "Coverage healthy"}
                      </div>
                      <p className="lc-desc">{meta.desc}</p>

                      <div className={`lc-gap ${fixFirst > 0 ? "has-issue" : ""}`}>
                        <div className="cg-row">
                          <span className="cg-label">Architecture gaps</span>
                          <span
                            className="cg-val"
                            style={
                              tone === "good"
                                ? { color: "var(--color-revenue, #2e8857)" }
                                : tone === "warn"
                                  ? { color: "var(--color-risk, #d97706)" }
                                  : tone === "muted"
                                    ? { color: "var(--color-fog, #9c9a92)" }
                                    : undefined
                            }
                          >
                            {fixFirst + (vc.CONSOLIDATE ?? 0) + gapStages}
                          </span>
                        </div>
                        {fixFirst > 0 ? (
                          <Link
                            to="/data-consistency"
                            className="cg-link"
                          >
                            Fix data first · open Data Center →
                          </Link>
                        ) : (
                          <div className="cg-muted">
                            {gapStages > 0
                              ? `${gapStages} uncovered stages (WF-12)`
                              : "No open architecture gaps"}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="lc-toggle"
                        onClick={() => setOpenId(open ? null : key)}
                      >
                        {stages.length || card?.stage_count || 0} sub-stages{" "}
                        {open ? "▴" : "▾"}
                      </button>

                      {open && (
                        <div className="lc-substages">
                          {stages.length === 0 ? (
                            <div className="lc-substage">
                              <span className="ss-name">Coverage loading…</span>
                              <span className="ss-stat gap">—</span>
                            </div>
                          ) : (
                            stages.map((s) => {
                              const { stat, label } = substageStat(s);
                              const topVerdict =
                                (s.verdict_counts.FIX_FIRST ?? 0) > 0
                                  ? "FIX_FIRST"
                                  : (s.verdict_counts.CONSOLIDATE ?? 0) > 0
                                    ? "CONSOLIDATE"
                                    : (s.verdict_counts.KEEP_IMPROVE ?? 0) > 0
                                      ? "KEEP_IMPROVE"
                                      : (s.verdict_counts.KEEP ?? 0) > 0
                                        ? "KEEP"
                                        : null;
                              return (
                                <div key={s.stage_id} className="lc-substage">
                                  <span className="ss-name">
                                    {s.stage}. {s.customer_state}
                                    {s.asset_count > 0 ? (
                                      <span className="ml-1 text-fog">
                                        · {s.asset_count} ·{" "}
                                        {verdictUiLabel(topVerdict)}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className={`ss-stat ${stat}`}>{label}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lc-foot">
              <span>Verdict chips:</span>
              <span className="cf-item">Keep</span>
              <span className="cf-item">Improve</span>
              <span className="cf-item">Fix data first</span>
              <span className="cf-item">Consolidate</span>
              <span className="cf-item">Retire candidate</span>
              <span className="sm:ml-auto">
                Quarter/Year is display-only — same architecture snapshot
              </span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
