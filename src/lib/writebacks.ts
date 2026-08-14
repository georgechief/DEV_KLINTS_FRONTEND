import { apiRequest } from "@/lib/api";

export const WRITEBACK_MAPPINGS_QUERY_KEY = ["writebacks", "mappings"] as const;

export function writebackPreviewQueryKey(checkId: string) {
  return ["writebacks", "preview", checkId] as const;
}

export type WritebackMappingEntry = {
  check_id: string;
  enabled: boolean;
  schema_version: string | null;
  title: string | null;
  template_id: string | null;
  op_kinds: string[];
  approval_tier: string | null;
};

export type WritebackMappingsResponse = {
  count: number;
  mappings: WritebackMappingEntry[];
};

export type WritebackIntent = {
  op_kind: string;
  operation: string;
  target: string;
  namespace: string;
  entity_key: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: string;
  error_reason: string | null;
  execute_result: unknown;
};

export type WritebackPreviewResult = {
  check_id: string;
  mode: string;
  diff_hash: string | null;
  blocked_reason: string | null;
  job_id: string | null;
  approval_tier: string | null;
  irreversible: boolean;
  operator_disclosure: string | null;
  intents: WritebackIntent[];
  summary: {
    ready: number;
    skipped: number;
    errors: number;
    executed: number;
  };
  execute_eligible: {
    sandbox: boolean;
    production: boolean;
  };
};

export const WRITEBACK_PREVIEW_COLUMNS = [
  "Target",
  "Operation",
  "Entity",
  "Before",
  "After",
  "Status",
] as const;

function friendlyTarget(target: string): string {
  if (target === "manago") return "Manago.ai";
  if (target === "shopify") return "Shopify";
  return target;
}

function formatPatchCell(value: Record<string, unknown> | null | undefined): string {
  if (!value || typeof value !== "object") return "—";
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (!entries.length) return "—";
  return entries
    .map(([key, val]) => {
      if (val === null) return `${key}: —`;
      if (typeof val === "object") return `${key}: ${JSON.stringify(val)}`;
      return `${key}: ${String(val)}`;
    })
    .join(" · ");
}

function formatIntentStatus(status: string, errorReason: string | null): string {
  if (status === "ready") return "Ready";
  if (status === "error" && errorReason) return `Error · ${errorReason}`;
  if (status === "skipped") return "Skipped";
  if (status === "executed") return "Executed";
  return status;
}

export function formatApprovalTierLabel(tier: string | null | undefined): string | null {
  if (!tier?.trim()) return null;
  if (tier === "batch") return "Batch approval";
  if (tier === "individual") return "Individual approval";
  return tier.replace(/_/g, " ");
}

export function writebackExecuteEligibilityNote(
  eligible: WritebackPreviewResult["execute_eligible"],
): string {
  if (eligible.production) return "Production execute may be available after approval.";
  if (eligible.sandbox) return "Sandbox execute only · production writes disabled.";
  return "Execute disabled · preview is dry-run only.";
}

export function writebackPreviewMeta(result: WritebackPreviewResult): {
  approvalTier: string | null;
  executeNote: string;
  irreversibleWarning: string | null;
} {
  return {
    approvalTier: formatApprovalTierLabel(result.approval_tier),
    executeNote: writebackExecuteEligibilityNote(result.execute_eligible),
    irreversibleWarning:
      result.irreversible && result.operator_disclosure
        ? result.operator_disclosure
        : null,
  };
}

export function writebackPreviewToTable(result: WritebackPreviewResult): {
  columns: string[];
  rows: string[][];
  helper: string;
  summaryLine: string;
} {
  const rows = result.intents.slice(0, 10).map((intent) => [
    friendlyTarget(intent.target),
    intent.operation || intent.op_kind,
    intent.entity_key || "—",
    formatPatchCell(intent.before),
    formatPatchCell(intent.after),
    formatIntentStatus(intent.status, intent.error_reason),
  ]);

  if (!rows.length) {
    rows.push(["—", "—", "—", "—", "—", "No writeback rows for this check"]);
  }

  const { ready, skipped, errors } = result.summary;
  const summaryLine = `${ready} ready · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`;

  let helper =
    "Dry-run preview from the writeback service. No changes were sent to Manago or Shopify.";
  if (result.blocked_reason) {
    helper = `${result.blocked_reason} Preview is read-only.`;
  }
  if (result.irreversible && result.operator_disclosure) {
    helper = `${helper} ${result.operator_disclosure}`;
  }

  return {
    columns: [...WRITEBACK_PREVIEW_COLUMNS],
    rows,
    helper,
    summaryLine,
  };
}

export function isWritebackMappingEnabled(
  mappings: WritebackMappingEntry[] | undefined,
  checkId: string | undefined,
): boolean {
  if (!checkId?.trim() || !mappings?.length) return false;
  const id = checkId.trim().toUpperCase();
  return mappings.some(
    (row) => row.check_id.toUpperCase() === id && row.enabled,
  );
}

export async function getWritebackMappings(): Promise<WritebackMappingsResponse> {
  return apiRequest("/api/v1/writebacks/mappings/");
}

export async function previewWriteback(
  checkId: string,
  options?: { batch_size?: number; max_rows?: number },
): Promise<WritebackPreviewResult> {
  return apiRequest("/api/v1/writebacks/preview/", {
    method: "POST",
    body: JSON.stringify({
      check_id: checkId,
      ...(options?.batch_size != null ? { batch_size: options.batch_size } : {}),
      ...(options?.max_rows != null ? { max_rows: options.max_rows } : {}),
    }),
  });
}

export function writebackPreviewErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Could not load writeback preview.";
  }
  const rec = error as { detail?: string; status?: number };
  if (rec.status === 403) {
    return "You do not have permission to preview writebacks.";
  }
  if (rec.status === 404) {
    return "No writeback mapping exists for this check.";
  }
  if (typeof rec.detail === "string" && rec.detail.trim()) {
    return rec.detail;
  }
  return "Could not load writeback preview.";
}
