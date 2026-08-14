import type { ReactNode } from "react";
import { issueEvidence, formatImpact, type GovernanceIssue } from "@/lib/klints-data";
import {
  formatCustomerIssueExplanation,
  formatCustomerSuggestedFix,
  formatDcsRevenue,
  formatFriendlyEvidenceRows,
  formatFriendlyProvenanceRows,
  friendlyEvidenceSectionTitle,
  type DcsEvidenceItem,
  type DcsWorklistIssueDetail,
} from "@/lib/dcs";
import { Link2 } from "lucide-react";

function SectionLabel({
  num,
  children,
  tone = "default",
}: {
  num: string;
  children: ReactNode;
  tone?: "default" | "cause" | "klints";
}) {
  const numClass =
    tone === "cause"
      ? "bg-risk-soft text-risk"
      : tone === "klints"
        ? "bg-spark/10 text-spark"
        : "bg-stone text-fog";
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">
      <span
        className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${numClass}`}
      >
        {num}
      </span>
      {children}
    </div>
  );
}

function EvidenceTable({
  items,
  kind,
  currency,
}: {
  items: DcsEvidenceItem[];
  kind: "mismatches" | "matches" | "evidence";
  currency?: string | null;
}) {
  if (!items.length) return null;
  const { columns, rows } = formatFriendlyEvidenceRows(items, { currency });
  if (!rows.length) return null;

  return (
    <section>
      <SectionLabel num="·">{friendlyEvidenceSectionTitle(kind)}</SectionLabel>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-sand/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2.5 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.key === "system"
                        ? "px-3 py-2.5 text-[12px] font-medium text-foreground"
                        : col.key === "when"
                          ? "px-3 py-2.5 text-[11px] text-muted-foreground"
                          : col.key === "detail"
                            ? "px-3 py-2.5 text-[12px] text-muted-foreground"
                            : "px-3 py-2.5 text-[12px] text-foreground"
                    }
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvenanceTable({
  rows,
}: {
  rows: ReturnType<typeof formatFriendlyProvenanceRows>;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <SectionLabel num="·">Why this matters</SectionLabel>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-sand/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Detail</th>
              <th className="px-3 py-2.5 font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                  {row.label}
                </td>
                <td className="px-3 py-2.5 text-[12px] font-medium text-foreground">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ApiDiagnoseEvidence({
  detail,
  compact = false,
}: {
  detail: DcsWorklistIssueDetail;
  compact?: boolean;
}) {
  const customerCopy = {
    title: detail.title,
    detail: detail.detail,
    suggested_fix: detail.suggested_fix,
    status: detail.status,
    severity: detail.severity,
    dimension: detail.dimension,
    is_optional: detail.is_optional,
    revenue_impact: detail.revenue_impact,
  };
  const explanation = formatCustomerIssueExplanation(customerCopy);
  const suggestedFix = formatCustomerSuggestedFix(customerCopy);
  const currency = detail.currency;
  const provenanceRows = formatFriendlyProvenanceRows(detail.provenance || {}, {
    currency,
  });
  // Use renderable provenance (not raw key count) so skipped technical keys
  // don't suppress the empty-state message when no tables actually show.
  const hasTables =
    detail.mismatches.length > 0 ||
    detail.matches.length > 0 ||
    detail.evidence.length > 0 ||
    provenanceRows.length > 0;

  if (compact) {
    return (
      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Detail
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {explanation || "No detail provided."}
          </p>
        </div>
        {suggestedFix ? (
          <div className="rounded-lg border border-border bg-sand/50 px-3 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Suggested fix
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {suggestedFix}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const statusLabel =
    detail.status === "FAIL"
      ? "Needs attention"
      : detail.status === "WARN"
        ? "Needs review"
        : detail.status;

  return (
    <div className="dcc-evidence space-y-5">
      <div className="border-b border-border pb-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-fog">
          {statusLabel}
          {detail.dimension
            ? ` · ${detail.dimension.replace(/^\d+\s+/, "").trim()}`
            : ""}
        </div>
        <h4 className="font-display mt-1 text-[15px] font-semibold tracking-tight text-foreground">
          {detail.title.replace(/\bparity\b/gi, "mismatch")}
        </h4>
      </div>

      {explanation ? (
        <section>
          <SectionLabel num="1">Problem</SectionLabel>
          <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">
            {explanation}
          </p>
        </section>
      ) : null}

      <EvidenceTable
        items={detail.mismatches}
        kind="mismatches"
        currency={currency}
      />
      <EvidenceTable items={detail.matches} kind="matches" currency={currency} />
      <EvidenceTable
        items={detail.evidence}
        kind="evidence"
        currency={currency}
      />
      <ProvenanceTable rows={provenanceRows} />

      {!hasTables ? (
        <p className="rounded-lg border border-border bg-sand/40 px-3 py-2.5 text-xs text-muted-foreground">
          No row-level evidence was stored for this check on the latest run.
          Re-run checks to refresh evidence from Manago.ai and Shopify.
        </p>
      ) : null}

      {suggestedFix ? (
        <section>
          <SectionLabel num="4">Suggested fix</SectionLabel>
          <p className="rounded-lg border border-border bg-sand/50 px-3 py-2.5 text-sm leading-relaxed text-foreground">
            {suggestedFix}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function ImpactRibbon({
  issue,
  worklistDetail,
}: {
  issue?: Pick<GovernanceIssue, "id" | "impact" | "impactType" | "cadence">;
  worklistDetail?: DcsWorklistIssueDetail;
}) {
  if (worklistDetail) {
    const windowDays = worklistDetail.provenance?.revenue_window_days;
    const windowNote =
      typeof windowDays === "number" && windowDays > 0
        ? `Last ${windowDays} days`
        : null;
    return (
      <div className="dcc-impact-ribbon">
        <div className="dcc-ir-cell">
          <div className="dcc-ir-k">Revenue at stake</div>
          <div className="dcc-ir-v">
            <span className="big">
              {formatDcsRevenue(
                worklistDetail.revenue_impact,
                worklistDetail.currency,
              )}
            </span>
            {windowNote ? <div className="dcc-ir-note">{windowNote}</div> : null}
          </div>
        </div>
        <div className="dcc-ir-cell">
          <div className="dcc-ir-k">Check status</div>
          <div className="dcc-ir-v">
            {worklistDetail.status === "FAIL"
              ? "Needs attention"
              : worklistDetail.status === "WARN"
                ? "Needs review"
                : worklistDetail.status}
            <div className="dcc-ir-note">
              {worklistDetail.severity
                ? `${worklistDetail.severity.charAt(0).toUpperCase()}${worklistDetail.severity.slice(1)} priority`
                : "—"}
            </div>
          </div>
        </div>
        {worklistDetail.dimension ? (
          <div className="dcc-ir-cell">
            <div className="dcc-ir-k">Area</div>
            <div className="dcc-ir-v">
              {worklistDetail.dimension.replace(/^\d+\s+/, "").trim()}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!issue) return null;
  const ev = issueEvidence[issue.id];
  if (!ev) return null;
  const r = ev.impactRibbon;
  return (
    <div className="dcc-impact-ribbon">
      <div className="dcc-ir-cell">
        <div className="dcc-ir-k">{r.impactLabel}</div>
        <div className="dcc-ir-v">
          <span className="big">{formatImpact(issue)}</span>
          <div className="dcc-ir-note">{r.impactNote}</div>
        </div>
      </div>
      <div className="dcc-ir-cell">
        <div className="dcc-ir-k">Lifecycle dependency</div>
        <div className="dcc-ir-v">
          {r.lifecycle}
          <div className="dcc-ir-note">{r.lifecycleNote}</div>
        </div>
      </div>
      <div className="dcc-ir-cell">
        <div className="dcc-ir-k">DCS sub-score impact</div>
        <div className="dcc-ir-v">
          <span className="sub-from">{r.dcsFrom}</span>
          <span className="arrow">→</span>
          <span className="sub-to">{r.dcsTo}</span>
        </div>
      </div>
    </div>
  );
}

export function DiagnoseEvidence({
  issueId,
  detail,
  compact = false,
}: {
  issueId?: string;
  detail?: DcsWorklistIssueDetail;
  compact?: boolean;
}) {
  if (detail) {
    return <ApiDiagnoseEvidence detail={detail} compact={compact} />;
  }

  if (!issueId) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a check to view evidence from the latest DCS run.
      </p>
    );
  }

  const ev = issueEvidence[issueId];
  if (!ev) {
    return (
      <p className="text-xs text-muted-foreground">
        No locked evidence for this issue yet — open Diagnose in the fix flow.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Problem
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{ev.problem}</p>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Cause
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{ev.cause}</p>
        </div>
        <div className="rounded-lg border border-border bg-sand/50 px-3 py-2.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Suggested writeback
          </div>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{ev.writeback}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dcc-evidence space-y-5">
      <div className="border-b border-border pb-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-fog">
          Provenance · how this inconsistency arose
        </div>
        <h4 className="font-display mt-1 text-[15px] font-semibold tracking-tight text-foreground">
          {ev.provenanceTitle}
        </h4>
      </div>

      <section>
        <SectionLabel num="1">Problem</SectionLabel>
        <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">{ev.problem}</p>
        {ev.mismatches.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {ev.mismatches.map((m) => (
              <li
                key={m}
                className="rounded-md border border-loss/25 bg-loss-soft px-2 py-1 text-[11px] font-medium text-loss"
              >
                {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-[#FDFCF8] px-4 py-3.5">
        <SectionLabel num="2" tone="cause">
          Cause / context
        </SectionLabel>
        <p className="text-[13px] leading-relaxed text-[rgb(22_22_26/0.72)]">{ev.cause}</p>
      </section>

      <section>
        <SectionLabel num="3">
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="h-3 w-3" /> Data source · {ev.runId}
          </span>
        </SectionLabel>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-sand/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Element</th>
                <th className="px-3 py-2.5 font-medium">Read from</th>
                <th className="px-3 py-2.5 font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ev.sources.map((s) => (
                <tr key={s.element}>
                  <td className="px-3 py-2.5 font-medium text-foreground">{s.element}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.connector}</td>
                  <td className="px-3 py-2.5 text-[11px] text-foreground">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionLabel num="4" tone="klints">
          Suggested writeback
        </SectionLabel>
        <p className="rounded-lg border border-border bg-sand/50 px-3 py-2.5 text-sm leading-relaxed text-foreground">
          {ev.writeback}
        </p>
      </section>
    </div>
  );
}
