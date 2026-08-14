import {
  formatCustomerSuggestedFix,
  formatDcsRevenue,
  formatExecutiveIssueCard,
  formatFriendlyEvidenceRows,
  friendlyEvidenceSystem,
  type DcsEvidenceItem,
  type DcsIssue,
  type DcsWorklistIssueDetail,
} from "@/lib/dcs";
import type { FixPlan } from "@/lib/klints-data";

const FRIENDLY_PREVIEW_COLUMNS = [
  "Where it came from",
  "What we found",
  "Details",
  "Elements",
  "Checked",
] as const;

function touchpointsForIssue(issue: DcsIssue): string[] {
  const dim = issue.dimension?.trim();
  if (dim) {
    const parts = dim.split(/[·,/&]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts.slice(0, 6);
    return [dim].slice(0, 6);
  }
  return ["Manago.ai", "Shopify"];
}

function previewItems(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): DcsEvidenceItem[] {
  if (detail?.mismatches?.length) return detail.mismatches;
  if (detail?.evidence?.length) return detail.evidence;
  if (issue.evidence_preview?.length) return issue.evidence_preview;
  return [];
}

function buildFriendlyPreview(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): { previewColumns: string[]; previewRows: string[][] } {
  const items = previewItems(issue, detail);
  if (!items.length) {
    return {
      previewColumns: [...FRIENDLY_PREVIEW_COLUMNS],
      previewRows: [["—", "—", "—", "—", "No row-level preview yet"]],
    };
  }

  const { columns, rows } = formatFriendlyEvidenceRows(items, {
    currency: issue.currency ?? detail?.currency ?? null,
  });

  if (!rows.length) {
    return {
      previewColumns: [...FRIENDLY_PREVIEW_COLUMNS],
      previewRows: [["—", "—", "—", "—", "No row-level preview yet"]],
    };
  }

  return {
    previewColumns: columns.map((column) => column.label),
    previewRows: rows
      .slice(0, 5)
      .map((row) => [row.system, row.what, row.detail, row.element, row.when]),
  };
}

function connectorsLabel(issue: DcsIssue, detail?: DcsWorklistIssueDetail | null): string {
  const items = previewItems(issue, detail);
  const labels = new Set<string>();

  for (const item of items) {
    const label = friendlyEvidenceSystem(item.source, item.value, item.locator).trim();
    if (!label) continue;
    if (/^klints$/i.test(label)) continue;
    if (label === "Connected systems") continue;
    labels.add(label);
  }

  if (labels.size) return [...labels].slice(0, 4).join(" · ");
  if (!items.length) return "Connected stack (see evidence)";
  return "Shopify · Manago.ai";
}

function evidenceSummary(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): string {
  const items = previewItems(issue, detail);
  if (!items.length) return "No samples on latest score";
  const mismatchCount = detail?.mismatches?.length ?? 0;
  if (mismatchCount > 0) {
    return `${mismatchCount} mismatch sample${mismatchCount === 1 ? "" : "s"}`;
  }
  return `${items.length} sample${items.length === 1 ? "" : "s"} from latest score`;
}

/** Map a live DCS worklist issue into the FixPlan shape used by the Fix page chrome. */
export function buildLiveFixPlan(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): FixPlan {
  const checkId = (issue.check_id ?? detail?.check_id ?? "").trim() || "—";
  const card = formatExecutiveIssueCard(issue);
  const dimensionLabel = issue.dimension?.trim() || card.areaBadge || "Data consistency";
  const suggestedFix = formatCustomerSuggestedFix({
    title: issue.title,
    detail: issue.detail,
    suggested_fix: issue.suggested_fix,
    status: issue.status,
    severity: issue.severity,
    dimension: issue.dimension,
    is_optional: issue.is_optional,
    revenue_impact: issue.revenue_impact,
  });
  const preview = buildFriendlyPreview(issue, detail);

  return {
    eyebrow: `${dimensionLabel} · ${issue.status}`,
    title: card.title,
    summary: card.summary || suggestedFix,
    changeSetId: checkId === "—" ? "—" : `chg_pending_${checkId}`,
    mode: "approve",
    kv: [
      { k: "What changes", v: suggestedFix || "See suggested fix in Data Center." },
      { k: "Where it changes", v: connectorsLabel(issue, detail) },
      {
        k: "Scope",
        v: `${checkId} · ${dimensionLabel}`,
      },
      { k: "Evidence", v: evidenceSummary(issue, detail) },
      {
        k: "Revenue at stake",
        v: formatDcsRevenue(issue.revenue_impact, issue.currency ?? detail?.currency),
      },
      { k: "Status", v: `${issue.status} · ${card.severityBadge}` },
      { k: "Check ID", v: checkId },
    ],
    touchpoints: touchpointsForIssue(issue),
    states: [
      { label: "Diagnosed", status: "done" },
      { label: "Evidenced", status: "done" },
      { label: "Plan ready", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewTitle: `Evidence · ${checkId}`,
    previewHelper:
      "Evidence from the latest score. Use Writeback preview when a mapping exists to see before/after changes (dry-run only).",
    previewColumns: preview.previewColumns,
    previewRows: preview.previewRows,
    govHead:
      "Klints does not write to Manago until human approval is granted and execute is enabled.",
    gov: [
      { k: "Approval owner", v: "Workspace admin (pending)" },
      { k: "Production target", v: "Not enabled" },
      { k: "Audit mode", v: "Will attach on approval" },
      { k: "Source evidence", v: checkId },
      { k: "Current state", v: "Plan ready · preview available · execute not enabled" },
      { k: "Rollback", v: "Available when writebacks ship" },
    ],
    testBadge: "Sandbox writeback · Coming soon",
    ctaLabel: "Build · Coming soon",
  };
}
