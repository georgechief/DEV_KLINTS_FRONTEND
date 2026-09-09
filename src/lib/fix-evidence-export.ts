import {
  formatCustomerSuggestedFix,
  formatFriendlyEvidenceRows,
  type DcsIssue,
  type DcsWorklistIssueDetail,
} from "@/lib/dcs";
import {
  collectFixEvidenceItems,
  type FixEvidenceRowKind,
} from "@/lib/fix-evidence-source";

/** PRD-FE-12 §4.4 — column order (extended with entity/issue context for user actionability). */
export const EVIDENCE_EXPORT_COLUMNS = [
  "check_id",
  "check_name",
  "severity",
  "systems_compared",
  "row_kind",
  "entity_type",
  "entity_id",
  "element",
  "element_label",
  "locator",
  "source",
  "value",
  "observed_at",
  "suggested_fix",
] as const;

export type EvidenceExportColumn = (typeof EVIDENCE_EXPORT_COLUMNS)[number];

export type EvidenceExportRow = Record<EvidenceExportColumn, string>;

export type BuildEvidenceExportInput = {
  issue: DcsIssue;
  detail?: DcsWorklistIssueDetail | null;
};

function resolveCheckId(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): string {
  return (issue.check_id ?? detail?.check_id ?? "").trim().toUpperCase();
}

function resolveCheckName(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): string {
  return (detail?.title ?? issue.title ?? "").trim() || "Data consistency issue";
}

function resolveSuggestedFix(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): string {
  return formatCustomerSuggestedFix({
    title: issue.title,
    detail: issue.detail ?? detail?.detail ?? "",
    suggested_fix: issue.suggested_fix ?? detail?.suggested_fix ?? "",
    status: issue.status ?? detail?.status ?? "FAIL",
    severity: issue.severity ?? detail?.severity ?? "",
    dimension: issue.dimension ?? detail?.dimension ?? null,
    is_optional: issue.is_optional ?? detail?.is_optional ?? false,
    revenue_impact: issue.revenue_impact ?? detail?.revenue_impact ?? 0,
  });
}

function resolveLocator(locator: string | undefined): string {
  const trimmed = (locator ?? "").trim();
  return trimmed || "—";
}

function resolveObservedAt(iso: string | null | undefined): string {
  const trimmed = (iso ?? "").trim();
  if (!trimmed) return "";
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString();
}

function friendlyValueCell(what: string, detail: string): string {
  const w = what.trim();
  const d = detail.trim();
  if (w && d && d !== "—") return `${w} · ${d}`;
  if (w) return w;
  if (d && d !== "—") return d;
  return "—";
}

/**
 * Extract the primary entity identifier from the value dict.
 * Checks known keys in priority order: order.id → person.email → manago_contact_id → contact_id → id
 */
function extractEntityId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  const rec = value as Record<string, unknown>;
  const PRIORITY_KEYS = [
    "order.id",
    "person.email",
    "manago_contact_id",
    "contact_id",
    "customer_id",
    "contact.id",
    "id",
  ];
  for (const key of PRIORITY_KEYS) {
    const v = rec[key];
    if (v !== undefined && v !== null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return "—";
}

/** Never emit raw JSON blobs in export cells (PRD-FE-12 §4.4). */
function assertNoRawJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    JSON.parse(trimmed);
    return "—";
  } catch {
    return value;
  }
}

/** PRD-WB-07 §4.2 — same shape as backend `dataruns.writebacks.pii.mask_email`. */
export function maskExportEmail(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text.includes("@")) return text || "—";
  const at = text.indexOf("@");
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (!local) return `***@${domain}`;
  const maskedLocal = local.length <= 1 ? "*" : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/** PRD-WB-07 §4.2 — same shape as backend `mask_entity_key`. */
export function maskExportEntityKey(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "—";
  if (text.includes("@")) return maskExportEmail(text);
  if (text.length <= 4) return text;
  return `${text.slice(0, 2)}…${text.slice(-2)}`;
}

const EMAIL_LIKE_RE = /[^@\s]+@[^@\s]+\.[^@\s]+/g;

/** Mask email-shaped substrings in free-text export cells; leave non-email text alone. */
export function maskExportCell(value: string | null | undefined): string {
  const text = value ?? "";
  if (!text.includes("@")) return text;
  const trimmed = text.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return maskExportEmail(trimmed);
  }
  return text.replace(EMAIL_LIKE_RE, (match) => maskExportEmail(match));
}

export function evidenceExportFilename(
  checkId: string,
  now: Date = new Date(),
): string {
  const id = checkId.trim().toUpperCase() || "UNKNOWN";
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `klints-evidence-${id}-${y}${m}${d}-${h}${min}.csv`;
}

export function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function buildEvidenceExportRows(
  input: BuildEvidenceExportInput,
): EvidenceExportRow[] {
  const { issue, detail } = input;
  const source = collectFixEvidenceItems(issue, detail);
  if (!source?.items.length) return [];

  const checkId = resolveCheckId(issue, detail);
  const checkName = resolveCheckName(issue, detail);
  const suggestedFix = resolveSuggestedFix(issue, detail);
  const currency = issue.currency ?? detail?.currency ?? null;
  const severity = (issue.severity ?? detail?.severity ?? "").trim() || "—";
  const systemsCompared = (issue.systems_compared ?? detail?.systems_compared ?? "").trim() || "—";
  const rows: EvidenceExportRow[] = [];

  for (const item of source.items) {
    const { rows: friendlyRows } = formatFriendlyEvidenceRows([item], { currency });
    if (!friendlyRows.length) continue;

    const entityId = extractEntityId(item.value);
    const entityType = (item.entity ?? "").trim() || "—";
    const elementLabel = (item.element_label ?? "").trim() || "—";

    for (const friendly of friendlyRows) {
      rows.push({
        check_id: checkId,
        check_name: checkName,
        severity,
        systems_compared: systemsCompared,
        row_kind: source.rowKind,
        entity_type: entityType,
        // PRD-WB-07 §4.2 — evidence CSV masked (emails / entity keys).
        entity_id: maskExportEntityKey(entityId),
        element: maskExportCell(friendly.element.trim() || "—"),
        element_label: maskExportCell(elementLabel),
        locator: maskExportCell(resolveLocator(item.locator)),
        source: friendly.system.trim() || "—",
        value: maskExportCell(
          assertNoRawJson(friendlyValueCell(friendly.what, friendly.detail)),
        ),
        observed_at: resolveObservedAt(item.observed_at),
        suggested_fix: suggestedFix,
      });
    }
  }

  return rows;
}

export function buildEvidenceCsv(rows: EvidenceExportRow[]): string {
  const header = EVIDENCE_EXPORT_COLUMNS.join(",");
  if (!rows.length) {
    return `\uFEFF${header}\n`;
  }
  const body = rows
    .map((row) =>
      EVIDENCE_EXPORT_COLUMNS.map((column) => escapeCsvCell(row[column] ?? "")).join(
        ",",
      ),
    )
    .join("\n");
  return `\uFEFF${header}\n${body}\n`;
}

export function buildEvidenceExportBlob(input: BuildEvidenceExportInput): {
  blob: Blob;
  filename: string;
  rowCount: number;
} | null {
  const rows = buildEvidenceExportRows(input);
  if (!rows.length) return null;
  const checkId = resolveCheckId(input.issue, input.detail);
  const csv = buildEvidenceCsv(rows);
  return {
    blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
    filename: evidenceExportFilename(checkId),
    rowCount: rows.length,
  };
}

function sanitizeExportFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.+$/, "");
  if (!cleaned) return "klints-evidence.csv";
  return /\.csv$/i.test(cleaned) ? cleaned : `${cleaned}.csv`;
}

/** Browser download for evidence CSV (does not force .pdf like assessment brief). */
export function triggerEvidenceDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeExportFilename(filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadFixEvidenceExport(input: BuildEvidenceExportInput): string | null {
  const payload = buildEvidenceExportBlob(input);
  if (!payload) return null;
  triggerEvidenceDownload(payload.blob, payload.filename);
  return payload.filename;
}

export function hasExportableEvidence(
  issue: DcsIssue,
  detail?: DcsWorklistIssueDetail | null,
): boolean {
  return buildEvidenceExportRows({ issue, detail }).length > 0;
}

export { type FixEvidenceRowKind };
