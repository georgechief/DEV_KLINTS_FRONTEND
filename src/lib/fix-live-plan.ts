import {
  formatCustomerSuggestedFix,
  formatDcsRevenue,
  formatExecutiveIssueCard,
  formatFriendlyEvidenceRows,
  friendlyEvidenceSystem,
  type DcsIssue,
  type DcsWorklistIssueDetail,
} from "@/lib/dcs";
import { collectFixEvidenceItems } from "@/lib/fix-evidence-source";
import type { FixPlan } from "@/lib/klints-data";
import {
  writebackMappingTargets,
  writebackStaleReclaimPolicyLabel,
  type WritebackMappingEntry,
} from "@/lib/writebacks";

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

function buildFriendlyPreview(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): { previewColumns: string[]; previewRows: string[][] } {
  const items = collectFixEvidenceItems(issue, detail)?.items ?? [];
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
  const items = collectFixEvidenceItems(issue, detail)?.items ?? [];
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
  const items = collectFixEvidenceItems(issue, detail)?.items ?? [];
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
    previewTitle: `Consistency check · ${preview.previewRows.length} element${
      preview.previewRows.length === 1 ? "" : "s"
    }`,
    previewHelper:
      "dry-run only — every evidenced row is checked before approval is requested.",
    previewColumns: preview.previewColumns,
    previewRows: preview.previewRows,
    govHead:
      "Writebacks require preview, approval request, then admin Approve & write when Allow writebacks is on in Settings → Workspace.",
    gov: [
      { k: "Approval owner", v: "Workspace admin" },
      { k: "Write target", v: "Connected Manago / Shopify when writebacks on" },
      { k: "Audit mode", v: "Will attach on approve / execute" },
      { k: "Source evidence", v: checkId },
      { k: "Current state", v: "Plan ready · run writeback preview first" },
      {
        k: "Rollback",
        v: writebackStaleReclaimPolicyLabel(),
      },
    ],
    testBadge: "Run writeback preview before requesting approval",
    ctaLabel: "Proceed to Workflow Studio",
  };
}

/** Minimal Fix plan for writeback mappings (e.g. WB-SHOP-01). */
export function buildSandboxWritebackFixPlan(
  mapping: WritebackMappingEntry,
): FixPlan {
  const checkId = mapping.check_id.trim();
  const title = mapping.title?.trim() || `${checkId} writeback`;
  const targets = writebackMappingTargets(mapping);
  const isShopify = targets.includes("Shopify") && !targets.includes("Manago.ai");
  const scopeNote = isShopify
    ? "Shopify customer field only · order/transaction writes not supported"
    : "Manago contact/details/tags · event ingest is separate from Shopify orders";

  return {
    eyebrow: `Writeback · ${checkId}`,
    title,
    summary:
      mapping.title?.trim() ||
      "Automated writeback mapping. Run Writeback preview, request approval, then admin Approve & write to your connected accounts.",
    changeSetId: `chg_pending_${checkId}`,
    mode: "approve",
    kv: [
      {
        k: "What changes",
        v: title,
      },
      { k: "Where it changes", v: targets.join(" · ") },
      { k: "Scope", v: `${checkId} · writeback mapping` },
      {
        k: "Evidence",
        v: isShopify
          ? "Shopify customer from connected store"
          : "Manago contact from connected stack",
      },
      { k: "Status", v: "Preview then approve" },
      { k: "Check ID", v: checkId },
      { k: "Write surface", v: scopeNote },
    ],
    touchpoints: targets,
    states: [
      { label: "Diagnosed", status: "done" },
      { label: "Evidenced", status: "done" },
      { label: "Plan ready", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewTitle: `Consistency check · ${checkId}`,
    previewHelper:
      "Every step is checked for consistency before the change is approved.",
    previewColumns: [...FRIENDLY_PREVIEW_COLUMNS],
    previewRows: [["—", "—", "—", "—", "Use Writeback preview for row-level before/after"]],
    govHead:
      "Request approval after preview; admin Approve & write runs execute when writebacks are enabled in Settings.",
    gov: [
      { k: "Approval owner", v: "Workspace admin" },
      { k: "Write target", v: targets.join(" · ") },
      { k: "Audit mode", v: "Will attach on approve / execute" },
      { k: "Source mapping", v: checkId },
      { k: "Current state", v: "Run writeback preview first" },
      {
        k: "Rollback",
        v: writebackStaleReclaimPolicyLabel(),
      },
    ],
    testBadge: "Run writeback preview before requesting approval",
    ctaLabel: "Proceed to Workflow Studio",
  };
}
