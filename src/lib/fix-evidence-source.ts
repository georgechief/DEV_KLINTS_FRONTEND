import type { DcsEvidenceItem, DcsIssue, DcsWorklistIssueDetail } from "@/lib/dcs";

/** PRD-FE-12 §4.1 / FE-09 — same priority as Fix evidence table. */
export type FixEvidenceRowKind = "mismatch" | "evidence" | "match";

export type FixEvidenceSource = {
  items: DcsEvidenceItem[];
  rowKind: FixEvidenceRowKind;
};

/**
 * Collect row-level evidence for Fix preview and CSV export.
 * Priority: mismatches → evidence → list evidence_preview.
 */
export function collectFixEvidenceItems(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): FixEvidenceSource | null {
  if (detail?.mismatches?.length) {
    return { items: detail.mismatches, rowKind: "mismatch" };
  }
  if (detail?.evidence?.length) {
    return { items: detail.evidence, rowKind: "evidence" };
  }
  if (issue.evidence_preview?.length) {
    return { items: issue.evidence_preview, rowKind: "evidence" };
  }
  return null;
}

export function hasExportableFixEvidence(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): boolean {
  return Boolean(collectFixEvidenceItems(issue, detail)?.items.length);
}
