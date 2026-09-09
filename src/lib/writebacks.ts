import { apiRequest } from "@/lib/api";

/** PRD-WB-01B: pack Fix Type is Integration build + Manual — never advertise preview. */
export const WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS = ["LE-04"] as const;

/**
 * PRD-WB-02 §3.1 — Approve may write only these checks (sheet sandbox_only + registry).
 * Safety net matching WRITEBACK_POSSIBLE_NOT_SHEET.csv / WRITEBACK_CHECK_ALLOWLIST.
 */
export const WRITEBACK_APPROVE_EXECUTABLE_CHECK_IDS = [
  "CI-01",
  "CC-03",
  "WB-SHOP-01",
] as const;

export const WRITEBACK_MAPPINGS_QUERY_KEY = ["writebacks", "mappings"] as const;
export const WRITEBACK_POSSIBLE_QUERY_KEY = ["writebacks", "possible"] as const;

export function writebackStatusQueryKey(
  checkId: string,
  dataRunId?: number | null,
) {
  return ["writebacks", "status", checkId, dataRunId ?? "latest"] as const;
}

/** PRD-WB-01C / WB-02 — unified POST /writebacks/run/ actions. */
export const WRITEBACK_RUN_ACTIONS = ["preview", "execute", "rollback"] as const;
export type WritebackRunAction = (typeof WRITEBACK_RUN_ACTIONS)[number];

const ADVERTISED_WRITE_STATES = new Set(["yes", "sandbox_only", "preview_only"]);
/** Sheet states that allow sandbox Approve → execute (not preview_only). */
const EXECUTE_WRITE_STATES = new Set(["yes", "sandbox_only"]);

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
  irreversible?: boolean;
  operator_disclosure?: string | null;
};

export type WritebackMappingsResponse = {
  count: number;
  mappings: WritebackMappingEntry[];
};

export type WritebackPossibleRow = {
  check_id: string;
  check_name: string;
  pack_fix_type: string;
  pack_fix_owner: string;
  pack_suggested_fix_summary: string;
  platform: string;
  op_kind: string;
  entity: string;
  field_or_key: string;
  namespace: string;
  creates_new: string;
  updates_existing: string;
  write_possible_today: string;
  rollback_possible_today: string;
  mapping_file: string;
  registry_enabled: boolean;
  blocker: string;
  evidence_note: string;
  last_verified: string;
};

export type WritebackPossibleResponse = {
  schema_version: number;
  source: string;
  generated_from: string[];
  count: number;
  rows: WritebackPossibleRow[];
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

export type WritebackRunSummary = {
  ready: number;
  skipped: number;
  errors: number;
  executed: number;
};

export type WritebackPreviewResult = {
  action?: string;
  check_id: string;
  mode: string;
  diff_hash: string | null;
  blocked_reason: string | null;
  job_id: string | null;
  data_run_id?: number | null;
  approval_tier: string | null;
  irreversible: boolean;
  operator_disclosure: string | null;
  intents: WritebackIntent[];
  summary: WritebackRunSummary;
  execute_eligible: {
    sandbox: boolean;
    production: boolean;
  };
};

export type WritebackGate = "open" | "locked" | "rolled_back" | "no_dcs_run";

export type WritebackStatusExecute = {
  job_id: string;
  status: string;
  diff_hash: string | null;
  summary: WritebackRunSummary;
  /** WB-06 — masked intents for Written restore after page refresh. */
  intents?: WritebackIntent[];
  created_at: string | null;
  rolled_back_at: string | null;
  actor_email: string | null;
  data_run_id: number | null;
};

export type WritebackStatusPreview = {
  job_id: string;
  check_id?: string;
  mode?: string;
  created_at: string | null;
  data_run_id: number | null;
  diff_hash?: string | null;
  blocked_reason?: string | null;
  approval_tier?: string | null;
  irreversible?: boolean;
  operator_disclosure?: string | null;
  intents?: WritebackIntent[];
  summary?: WritebackRunSummary;
  execute_eligible?: {
    sandbox: boolean;
    production: boolean;
  };
};

export type WritebackStatusPendingApproval = {
  approval_id: string;
  status: WritebackApprovalStatus;
  diff_hash: string;
  job_id: string;
  object_id: string;
  issued_at: string | null;
  expires_at: string | null;
  rejection_reason?: string | null;
};

export type WritebackRollbackPolicy = "manual_admin_only";

export type WritebackStatusResponse = {
  check_id: string;
  data_run_id: number | null;
  gate: WritebackGate;
  /** WB-07 §3.4 / B-04 — execute denied until a terminal DCS score exists. */
  execute_blocked_reason?: "dcs_run_required" | null;
  latest_execute: WritebackStatusExecute | null;
  latest_preview: WritebackStatusPreview | null;
  /** GAP-01 Slice C / W5-01 — pending approval for Fix reject loop hydration. */
  latest_pending_approval?: WritebackStatusPendingApproval | null;
  /**
   * APPROVED + unconsumed — recovery when Approve succeeded but execute failed
   * (retry write without re-requesting approval).
   */
  latest_granted_approval?: WritebackStatusPendingApproval | null;
  /** GAP-01 Slice C / W6-03 — undo is manual admin rollback, not automatic on error. */
  rollback_policy?: WritebackRollbackPolicy;
  rollback_auto_on_error?: boolean;
  stale_executing_reclaim_minutes?: number;
  rollback_window_minutes?: number;
  rollback_window_minutes_purpose?: "metadata_only";
};

/** Execute response — same run payload plus rollback support flag (WB-01C). */
export type WritebackExecuteResult = WritebackPreviewResult & {
  rollback?: {
    supported: boolean;
  };
};

export type WritebackApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CONSUMED"
  | string;

/** POST /writebacks/approvals/ (+ approve) — serialize_token shape. */
export type WritebackApprovalToken = {
  schema_version: string;
  approval_id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_role: string | null;
  scope: string;
  object_id: string;
  object_version: string | null;
  diff_hash: string;
  issued_at: string;
  expires_at: string;
  status: WritebackApprovalStatus;
  approved_at: string | null;
  consumed_at: string | null;
  job_id: string;
  approval_tier: string | null;
};

/** POST /writebacks/run/ action=rollback — execute job_id only. */
export type WritebackRollbackResult = {
  action?: string;
  job_id: string;
  check_id: string;
  status: string;
  rolled_back: number;
  errors: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
};

/** Why Approve is disabled (PRD-WB-02 §3.3 / §6.2). */
export type WritebackApproveBlockReason =
  | "missing_check"
  | "preview_blocked"
  | "not_on_allowlist"
  | "sheet_not_executable"
  | "sheet_load_error"
  | "mapping_load_error"
  | "mapping_disabled"
  | "not_admin"
  | "no_preview"
  | "preview_not_ready"
  | "missing_job_id"
  | "invalid_diff_hash"
  | "company_execute_disabled"
  | "sandbox_not_eligible"
  | "already_executed_for_run"
  | "dcs_run_required"
  | "not_analyst_or_admin"
  | "approval_not_pending"
  | "approval_preview_mismatch"
  | "approval_already_pending";

export const WRITEBACK_POSSIBLE_COLUMNS = [
  "Field",
  "Write today",
  "Update existing",
  "Rollback",
  "Why",
] as const;

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

export type WritebackTablePhase = "preview" | "executed";

function formatIntentStatus(
  status: string,
  errorReason: string | null,
  phase: WritebackTablePhase = "preview",
): string {
  if (phase === "executed" && (status === "ready" || status === "executed")) {
    return "Executed";
  }
  if (status === "ready") return "Ready";
  if (status === "error" && errorReason) return `Error · ${errorReason}`;
  if (status === "skipped") {
    if (errorReason === "already_at_target") return "Already applied";
    return errorReason ? `Skipped · ${errorReason}` : "Skipped";
  }
  if (status === "executed") return "Executed";
  return status;
}

function platformsLabelFromIntents(intents: WritebackIntent[]): string | null {
  const targets = new Set(
    intents
      .filter((row) => row.status === "executed" || row.status === "ready")
      .map((row) => row.target),
  );
  if (targets.has("manago") && targets.has("shopify")) return "Manago.ai / Shopify";
  if (targets.has("manago")) return "Manago.ai";
  if (targets.has("shopify")) return "Shopify";
  return null;
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
  if (eligible.production) return "Execute available after approval.";
  if (eligible.sandbox) return "Execute available after admin approval.";
  return "Enable writebacks in Settings → Workspace to approve.";
}

export function writebackPreviewMeta(result: WritebackPreviewResult): {
  approvalTier: string | null;
  executeNote: string;
  irreversibleWarning: string | null;
} {
  return {
    approvalTier: formatApprovalTierLabel(result.approval_tier),
    executeNote: writebackExecuteEligibilityNote(result.execute_eligible),
    irreversibleWarning: writebackMappingIrreversible(result, null)
      ? result.operator_disclosure?.trim() ||
        WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL
      : null,
  };
}

export function writebackPreviewToTable(
  result: WritebackPreviewResult,
  phase: WritebackTablePhase = "preview",
): {
  columns: string[];
  rows: string[][];
  helper: string;
  summaryLine: string;
} {
  // PRD-WB-07 §6 — Entity column trusts API-masked entity_key (no client unmask).
  const rows = result.intents.slice(0, 10).map((intent) => [
    friendlyTarget(intent.target),
    intent.operation || intent.op_kind,
    intent.entity_key || "—",
    formatPatchCell(intent.before),
    formatPatchCell(intent.after),
    formatIntentStatus(intent.status, intent.error_reason, phase),
  ]);

  if (!rows.length) {
    rows.push(["—", "—", "—", "—", "—", "No writeback rows for this check"]);
  }

  const { ready, skipped, errors, executed } = result.summary;
  const summaryLine =
    phase === "executed"
      ? `${executed} executed · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`
      : `${ready} ready · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`;

  let helper =
    "Dry-run preview from the writeback service. No changes were sent to Manago or Shopify.";
  if (phase === "executed") {
    const platforms = platformsLabelFromIntents(result.intents);
    helper = platforms
      ? `Write applied · updates sent to ${platforms}.`
      : "Write applied · audit recorded.";
  } else if (result.blocked_reason) {
    helper = `${result.blocked_reason} Preview is read-only.`;
  }
  if (phase === "preview" && writebackMappingIrreversible(result, null)) {
    const disclosure =
      result.operator_disclosure?.trim() || WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL;
    helper = `${helper} ${disclosure}`;
  }

  return {
    columns: [...WRITEBACK_PREVIEW_COLUMNS],
    rows,
    helper,
    summaryLine,
  };
}

export function isWritebackPreviewBlocked(checkId: string | undefined): boolean {
  if (!checkId?.trim()) return false;
  const id = checkId.trim().toUpperCase();
  return WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS.some(
    (blocked) => blocked.toUpperCase() === id,
  );
}

export function findWritebackMapping(
  mappings: WritebackMappingEntry[] | undefined,
  checkId: string | undefined,
): WritebackMappingEntry | undefined {
  if (!checkId?.trim() || !mappings?.length) return undefined;
  const id = checkId.trim().toUpperCase();
  return mappings.find((row) => row.check_id.toUpperCase() === id);
}

export function isWritebackMappingEnabled(
  mappings: WritebackMappingEntry[] | undefined,
  checkId: string | undefined,
): boolean {
  if (isWritebackPreviewBlocked(checkId)) return false;
  const row = findWritebackMapping(mappings, checkId);
  return Boolean(row?.enabled);
}

export function writebackMappingTargets(
  mapping: WritebackMappingEntry | undefined,
): string[] {
  if (!mapping?.op_kinds?.length) return ["Manago.ai", "Shopify"];
  const labels = new Set<string>();
  for (const kind of mapping.op_kinds) {
    if (kind.startsWith("shopify")) labels.add("Shopify");
    else if (
      kind.includes("contact") ||
      kind.includes("detail") ||
      kind.includes("tag") ||
      kind.includes("event") ||
      kind.includes("consent") ||
      kind.includes("merge")
    ) {
      labels.add("Manago.ai");
    }
  }
  return labels.size ? [...labels] : ["Manago.ai", "Shopify"];
}

export function writebackPossibleRowsForCheck(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): WritebackPossibleRow[] {
  if (!checkId?.trim() || !rows?.length) return [];
  const id = checkId.trim().toUpperCase();
  return rows.filter((row) => row.check_id.toUpperCase() === id);
}

export function formatWritePossibleLabel(value: string | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  if (v === "preview_only") return "Preview only";
  if (v === "disabled") return "Disabled";
  if (v === "partial") return "Partial";
  if (v === "n/a" || v === "—" || v === "-") return "n/a";
  return value?.trim() || "—";
}

const _EXECUTABLE_WRITE_TODAY = new Set(["yes", "sandbox_only"]);

/**
 * POLISH-01 §4 / F-02 — Write-today column must not hide the Settings gate.
 */
export function formatWritePossibleTodayLabel(
  value: string | undefined,
  writebackExecuteEnabled?: boolean | null,
): string {
  const v = (value ?? "").trim().toLowerCase();
  if (!_EXECUTABLE_WRITE_TODAY.has(v)) {
    return formatWritePossibleLabel(value);
  }
  if (writebackExecuteEnabled === true) return "Yes";
  if (writebackExecuteEnabled === false) return "Yes · Settings off";
  return "Yes · Settings gated";
}

/** undefined = sheet has no rows yet / unknown — keep mapping-based preview. */
export function isWritebackSheetPreviewAdvertised(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): boolean | undefined {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (!match.length) return undefined;
  return match.some((row) =>
    ADVERTISED_WRITE_STATES.has(row.write_possible_today.trim().toLowerCase()),
  );
}

export function isWritebackPreviewAvailable(
  mappings: WritebackMappingEntry[] | undefined,
  possibleRows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
  options?: { mappingsLoadError?: boolean; possibleLoadError?: boolean },
): boolean {
  if (
    options?.mappingsLoadError &&
    isWritebackAllowlistSheetPreviewable(
      checkId,
      possibleRows,
      options.possibleLoadError,
    )
  ) {
    return true;
  }
  if (!isWritebackMappingEnabled(mappings, checkId)) return false;
  return isWritebackSheetPreviewAdvertised(possibleRows, checkId) !== false;
}

export function normalizeWritebackCheckId(
  checkId: string | undefined | null,
): string | null {
  const id = checkId?.trim().toUpperCase();
  return id || null;
}

export function isWritebackApproveAllowlisted(
  checkId: string | undefined,
): boolean {
  const id = normalizeWritebackCheckId(checkId);
  if (!id) return false;
  return WRITEBACK_APPROVE_EXECUTABLE_CHECK_IDS.some(
    (allowed) => allowed.toUpperCase() === id,
  );
}

/**
 * Sheet SoT for Approve: at least one row must be sandbox_only or yes.
 * preview_only / disabled / no → not executable.
 */
export function isWritebackSheetExecuteAdvertised(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): boolean {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (!match.length) return false;
  return match.some((row) =>
    EXECUTE_WRITE_STATES.has(row.write_possible_today.trim().toLowerCase()),
  );
}

/**
 * PRD-WB-02 allowlist + possible sheet are SoT when registry mappings API fails (Slice C).
 * Used to avoid blocking CI-01/CC-03/WB-SHOP-01 on transient /writebacks/mappings/ 500.
 */
export function isWritebackAllowlistSheetExecutable(
  checkId: string | undefined,
  possibleRows: WritebackPossibleRow[] | undefined,
  possibleLoadError?: boolean,
): boolean {
  const id = normalizeWritebackCheckId(checkId);
  if (!id || possibleLoadError) return false;
  if (isWritebackPreviewBlocked(id)) return false;
  if (!isWritebackApproveAllowlisted(id)) return false;
  return isWritebackSheetExecuteAdvertised(possibleRows, id);
}

export function isWritebackAllowlistSheetPreviewable(
  checkId: string | undefined,
  possibleRows: WritebackPossibleRow[] | undefined,
  possibleLoadError?: boolean,
): boolean {
  const id = normalizeWritebackCheckId(checkId);
  if (!id || possibleLoadError) return false;
  if (isWritebackPreviewBlocked(id)) return false;
  if (!isWritebackApproveAllowlisted(id)) return false;
  return isWritebackSheetPreviewAdvertised(possibleRows, id) !== false;
}

function writebackMappingGateBlockReason(
  input: WritebackApproveEligibilityInput,
  checkId: string,
): WritebackApproveBlockReason | null {
  if (input.mappingsLoadError) {
    if (isWritebackAllowlistSheetExecutable(checkId, input.possibleRows, input.possibleLoadError)) {
      return null;
    }
    return "mapping_load_error";
  }
  if (
    input.mappings != null &&
    !isWritebackMappingEnabled(input.mappings, checkId)
  ) {
    return "mapping_disabled";
  }
  return null;
}

export function isWritebackDiffHashValid(
  diffHash: string | null | undefined,
): boolean {
  return typeof diffHash === "string" && /^[a-fA-F0-9]{64}$/.test(diffHash.trim());
}

export function isWritebackAdminRole(role: string | null | undefined): boolean {
  return (role ?? "").trim().toLowerCase() === "admin";
}

export function isWritebackApprovalRequestRole(
  role: string | null | undefined,
): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "analyst";
}

export const WRITEBACK_REJECTED_BANNER =
  "Writeback rejected — revise evidence and run preview again before approval.";

/** C2 — execute 409 diff_hash_mismatch: stale grant/preview must not keep Approve & write. */
export const WRITEBACK_DIFF_HASH_MISMATCH_BANNER =
  "Preview changed — run Writeback preview again, then request approval.";

function resolveWritebackPreviewExecutionBlockReason(
  input: WritebackApproveEligibilityInput,
): WritebackApproveBlockReason | null {
  const checkId = normalizeWritebackCheckId(input.checkId);
  if (!checkId) return "missing_check";
  if (input.possibleLoadError) return "sheet_load_error";
  if (isWritebackPreviewBlocked(checkId)) return "preview_blocked";
  if (!isWritebackApproveAllowlisted(checkId)) return "not_on_allowlist";
  if (!isWritebackSheetExecuteAdvertised(input.possibleRows, checkId)) {
    return "sheet_not_executable";
  }
  const mappingBlock = writebackMappingGateBlockReason(input, checkId);
  if (mappingBlock) return mappingBlock;
  if (input.writebackExecuteEnabled === false) return "company_execute_disabled";
  if (input.statusGate === "no_dcs_run") return "dcs_run_required";
  if (input.statusGate === "locked") return "already_executed_for_run";

  const preview = input.preview;
  if (!preview) return "no_preview";
  if ((preview.summary?.ready ?? 0) < 1) return "preview_not_ready";
  if (!preview.job_id?.trim()) return "missing_job_id";
  if (!isWritebackDiffHashValid(preview.diff_hash)) return "invalid_diff_hash";
  if (
    input.writebackExecuteEnabled !== true &&
    !preview.execute_eligible?.sandbox &&
    !preview.execute_eligible?.production
  ) {
    return "company_execute_disabled";
  }
  return null;
}

export type WritebackApprovalFlowInput = WritebackApproveEligibilityInput & {
  pendingApproval?: WritebackApprovalToken | WritebackStatusPendingApproval | null;
};

/** PENDING/APPROVED TTL elapsed — unlock re-request; block approve-write (C3). */
export function isWritebackApprovalExpired(
  token:
    | Pick<WritebackApprovalToken, "status" | "expires_at">
    | Pick<WritebackStatusPendingApproval, "status" | "expires_at">
    | null
    | undefined,
): boolean {
  if (!token) return false;
  const raw = token.expires_at?.trim();
  if (!raw) return false;
  const exp = Date.parse(raw);
  if (!Number.isFinite(exp)) return false;
  return Date.now() >= exp;
}

export function resolveWritebackRequestApprovalBlockReason(
  input: WritebackApprovalFlowInput,
): WritebackApproveBlockReason | null {
  const base = resolveWritebackPreviewExecutionBlockReason(input);
  if (base) return base;
  if (!isWritebackApprovalRequestRole(input.role)) return "not_analyst_or_admin";
  const pending = input.pendingApproval;
  if (
    pending &&
    !isWritebackApprovalExpired(pending) &&
    (pending.status === "PENDING" || pending.status === "APPROVED") &&
    pending.diff_hash === input.preview?.diff_hash &&
    pending.job_id === input.preview?.job_id
  ) {
    return "approval_already_pending";
  }
  return null;
}

export function isWritebackRequestApprovalExecutable(
  input: WritebackApprovalFlowInput,
): boolean {
  return resolveWritebackRequestApprovalBlockReason(input) === null;
}

/** PENDING (grant) or APPROVED unconsumed (retry execute after partial failure). */
export function isWritebackApprovalReadyForExecute(
  token: WritebackApprovalToken | WritebackStatusPendingApproval | null | undefined,
): boolean {
  if (!token) return false;
  if (isWritebackApprovalExpired(token)) return false;
  return token.status === "PENDING" || token.status === "APPROVED";
}

export function resolveWritebackApproveWriteBlockReason(
  input: WritebackApprovalFlowInput,
): WritebackApproveBlockReason | null {
  const base = resolveWritebackPreviewExecutionBlockReason(input);
  if (base) return base;
  if (!isWritebackAdminRole(input.role)) return "not_admin";
  const pending = input.pendingApproval;
  if (!isWritebackApprovalReadyForExecute(pending)) return "approval_not_pending";
  if (pending!.diff_hash !== input.preview?.diff_hash) return "approval_preview_mismatch";
  if (pending!.job_id !== input.preview?.job_id) return "approval_preview_mismatch";
  return null;
}

export function isWritebackApproveWriteExecutable(
  input: WritebackApprovalFlowInput,
): boolean {
  return resolveWritebackApproveWriteBlockReason(input) === null;
}

export function resolveWritebackRejectBlockReason(
  input: WritebackApprovalFlowInput,
): WritebackApproveBlockReason | null {
  if (!isWritebackAdminRole(input.role)) return "not_admin";
  const pending = input.pendingApproval;
  if (
    !pending ||
    pending.status !== "PENDING" ||
    isWritebackApprovalExpired(pending)
  ) {
    return "approval_not_pending";
  }
  if (input.preview?.diff_hash && pending.diff_hash !== input.preview.diff_hash) {
    return "approval_preview_mismatch";
  }
  if (input.preview?.job_id && pending.job_id !== input.preview.job_id) {
    return "approval_preview_mismatch";
  }
  return null;
}

export function isWritebackRejectExecutable(input: WritebackApprovalFlowInput): boolean {
  return resolveWritebackRejectBlockReason(input) === null;
}

export type WritebackApproveEligibilityInput = {
  checkId: string | undefined;
  possibleRows?: WritebackPossibleRow[];
  mappings?: WritebackMappingEntry[];
  preview?: WritebackPreviewResult | null;
  role?: string | null;
  /** Workspace flag from /auth/me/ company (PRD-WB-03). Omit only in unit tests. */
  writebackExecuteEnabled?: boolean;
  /** PRD-WB-04 / WB-06 — GET /writebacks/status/ gate. */
  statusGate?: WritebackGate | null;
  /** POLISH-01 P0-2 — sheet/mapping fetch failed; do not treat as empty honesty. */
  possibleLoadError?: boolean;
  mappingsLoadError?: boolean;
};

/**
 * PRD-WB-02 §3.3 — first failing gate for Approve (null = executable).
 * Prefer /possible/ + preview over hardcoding; allowlist is the safety net.
 */
export function resolveWritebackApproveBlockReason(
  input: WritebackApproveEligibilityInput,
): WritebackApproveBlockReason | null {
  return resolveWritebackApproveWriteBlockReason(input);
}

export function isWritebackApproveExecutable(
  input: WritebackApproveEligibilityInput,
): boolean {
  return resolveWritebackApproveBlockReason(input) === null;
}

/** User-facing copy for disabled Approve (PRD-WB-02 §6.2). */
export function writebackApproveBlockMessage(
  reason: WritebackApproveBlockReason | null,
): string | null {
  if (!reason) return null;
  switch (reason) {
    case "missing_check":
      return "Writeback not available for this check";
    case "preview_blocked":
      return "Writeback not available for this check";
    case "not_on_allowlist":
      return "No automated writeback for this check yet — use evidence and suggested fix.";
    case "sheet_not_executable":
      return "Writeback not available for this check";
    case "sheet_load_error":
    case "mapping_load_error":
      return "Writeback availability could not be loaded — retry";
    case "mapping_disabled":
      return "Writeback not available for this check";
    case "not_admin":
      return "Admin required to approve writebacks";
    case "no_preview":
      return "Run writeback preview first";
    case "preview_not_ready":
      return "Nothing ready to write";
    case "missing_job_id":
      return "Run writeback preview first";
    case "invalid_diff_hash":
      return "Preview changed — run preview again, then approve";
    case "company_execute_disabled":
      return "Writebacks are off for this workspace — enable Allow writebacks in Settings → Workspace (Admin).";
    case "sandbox_not_eligible":
      return "Writebacks are off for this workspace — enable Allow writebacks in Settings → Workspace (Admin).";
    case "already_executed_for_run":
      return "Write in progress / already applied · Re-run Data Consistency Score if the issue returns";
    case "dcs_run_required":
      return "Run a Data Consistency Score before approving writebacks.";
    case "not_analyst_or_admin":
      return "Analyst or admin required to request writeback approval";
    case "approval_not_pending":
      return "Request writeback approval first";
    case "approval_preview_mismatch":
      return "Preview changed — run preview again, then request approval";
    case "approval_already_pending":
      return "Approval already requested — finish Approve & write, or reject and re-preview";
    default:
      return "Writeback not available for this check";
  }
}

/**
 * PRD-WB-02 §6.4 — structural (check/sheet/mapping) blocks only.
 * Ignores preview readiness and role so Fix can show honesty before Approve is attempted.
 */
export function resolveWritebackStructuralBlockReason(input: {
  checkId: string | undefined;
  possibleRows?: WritebackPossibleRow[];
  mappings?: WritebackMappingEntry[];
  possibleLoadError?: boolean;
  mappingsLoadError?: boolean;
}): WritebackApproveBlockReason | null {
  const checkId = normalizeWritebackCheckId(input.checkId);
  if (!checkId) return "missing_check";
  if (input.possibleLoadError) return "sheet_load_error";
  if (isWritebackPreviewBlocked(checkId)) return "preview_blocked";
  if (!isWritebackApproveAllowlisted(checkId)) return "not_on_allowlist";
  if (!isWritebackSheetExecuteAdvertised(input.possibleRows, checkId)) {
    return "sheet_not_executable";
  }
  return writebackMappingGateBlockReason(input, checkId);
}

export function isWritebackStructurallyExecutable(input: {
  checkId: string | undefined;
  possibleRows?: WritebackPossibleRow[];
  mappings?: WritebackMappingEntry[];
}): boolean {
  return resolveWritebackStructuralBlockReason(input) === null;
}

/** First non-empty sheet blocker for this check (e.g. LE-04 pack_fix_type). */
export function writebackSheetBlockerNote(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): string | null {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  for (const row of match) {
    const blocker = row.blocker?.trim();
    if (blocker) return blocker;
  }
  return null;
}

/**
 * PRD-WB-02 §6.4 honesty copy for live issues that cannot Approve/write.
 * Evidence stays; do not claim data was written.
 */
export function writebackNonExecutableHonesty(
  checkId: string | undefined,
  possibleRows?: WritebackPossibleRow[],
  mappings?: WritebackMappingEntry[],
  loadErrors?: {
    possibleLoadError?: boolean;
    mappingsLoadError?: boolean;
  },
): { title: string; detail: string; retry?: boolean } | null {
  const reason = resolveWritebackStructuralBlockReason({
    checkId,
    possibleRows,
    mappings,
    possibleLoadError: loadErrors?.possibleLoadError,
    mappingsLoadError: loadErrors?.mappingsLoadError,
  });
  if (!reason) return null;

  const id = normalizeWritebackCheckId(checkId) ?? "this check";
  const blocker = writebackSheetBlockerNote(possibleRows, checkId);

  if (reason === "sheet_load_error" || reason === "mapping_load_error") {
    return {
      title: "Writeback availability unknown",
      detail:
        reason === "mapping_load_error"
          ? "Could not load writeback registry mappings. Retry to confirm Approve availability for this check."
          : "Could not load writeback sheet data. Retry to see whether Approve is available for this check.",
      retry: true,
    };
  }

  if (reason === "preview_blocked" || id === "LE-04") {
    return {
      title: "No automated writeback for this check",
      detail: blocker
        ? `${id} is blocked for writeback (${blocker}). Download evidence for manual or integration fix — Approve will not write to Manago.ai or Shopify.`
        : `${id} has no automated writeback. Download evidence for manual or integration fix — Approve will not write to Manago.ai or Shopify.`,
    };
  }

  if (reason === "not_on_allowlist" || reason === "sheet_not_executable") {
    return {
      title: "No automated writeback for this check yet",
      detail: blocker
        ? `${id}: ${blocker}. Automated writeback is not available for this check. Download evidence for manual or integration fix.`
        : "Automated writeback is not available for this check yet. Download evidence for manual or integration fix.",
    };
  }

  if (reason === "mapping_disabled") {
    return {
      title: "Writeback mapping disabled",
      detail: `${id} mapping is not enabled. Download evidence for manual or integration fix — Approve will not write.`,
    };
  }

  return {
    title: "Writeback not available",
    detail:
      writebackApproveBlockMessage(reason) ??
      "Download evidence for manual or integration fix. Approve will not write.",
  };
}

/** Sheet says rollback yes for any row of this check. */
export function isWritebackSheetRollbackSupported(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): boolean {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  return match.some(
    (row) => row.rollback_possible_today.trim().toLowerCase() === "yes",
  );
}

export function writebackMappingForCheck(
  mappings: WritebackMappingEntry[] | undefined,
  checkId: string | undefined,
): WritebackMappingEntry | undefined {
  if (!checkId?.trim() || !mappings?.length) return undefined;
  const id = checkId.trim().toUpperCase();
  return mappings.find((m) => m.check_id.toUpperCase() === id);
}

const WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL =
  "This writeback cannot be bulk-undone. Review carefully before Approve & write.";

export function writebackMappingIrreversible(
  preview: WritebackPreviewResult | null | undefined,
  mapping?: WritebackMappingEntry | null,
): boolean {
  if (preview?.irreversible) return true;
  return Boolean(mapping?.irreversible);
}

/** GAP-01 W6-01/02 — prominent irreversible disclosure before Approve & write. */
export function writebackIrreversibleHonestyNotice(
  preview: WritebackPreviewResult | null | undefined,
  mapping?: WritebackMappingEntry | null,
): { title: string; detail: string } | null {
  if (!writebackMappingIrreversible(preview, mapping)) return null;
  const detail =
    preview?.operator_disclosure?.trim() ||
    mapping?.operator_disclosure?.trim() ||
    WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL;
  return {
    title: "Irreversible write — cannot be bulk-undone",
    detail,
  };
}

/** Non-blocking operator note (e.g. WB-SHOP-01 note vs metafield). */
export function writebackOperatorInfoNotice(
  preview: WritebackPreviewResult | null | undefined,
  mapping?: WritebackMappingEntry | null,
): { title: string; detail: string } | null {
  if (writebackMappingIrreversible(preview, mapping)) return null;
  const detail =
    preview?.operator_disclosure?.trim() || mapping?.operator_disclosure?.trim();
  if (!detail) return null;
  return {
    title: "Write surface note",
    detail,
  };
}

/** W6-01 — event ingest / limited rollback honesty from possible sheet. */
export function writebackLimitedRollbackHonesty(
  rows: WritebackPossibleRow[] | undefined,
  checkId: string | undefined,
): { title: string; detail: string } | null {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (!match.length) return null;
  const limitedRollback = match.some((row) => {
    const value = row.rollback_possible_today.trim().toLowerCase();
    return value === "no" || value === "disabled" || value === "limited" || value === "n/a";
  });
  const eventIngest = match.some((row) => row.op_kind === "event_ingest");
  if (!limitedRollback && !eventIngest) return null;
  if (eventIngest) {
    return {
      title: "Limited rollback for event writes",
      detail:
        "Manago event ingest (e.g. LE-01) is not bulk-undoable. Request approval only when the preview matches your intent.",
    };
  }
  return {
    title: "Limited rollback for this write surface",
    detail:
      "Rollback may not restore all fields. Review the possible sheet before Approve & write.",
  };
}

/** W6-02 — Shopify metafield adapter stub; WB-SHOP-01 uses customer note. */
export function writebackShopifyMetafieldHonesty(
  checkId: string | undefined,
): { title: string; detail: string } | null {
  const id = normalizeWritebackCheckId(checkId);
  if (id !== "WB-SHOP-01") return null;
  return {
    title: "Shopify note write — metafield not live yet",
    detail:
      "WB-SHOP-01 uses customer note for sandbox proof. Hygienic prod path is metafield namespace=klints — execute adapter not shipped yet.",
  };
}

export function writebackApproveWriteConfirmDescription(
  preview: WritebackPreviewResult | null | undefined,
  checkId?: string | null,
  mapping?: WritebackMappingEntry | null,
): string {
  const target = checkId?.trim() || preview?.check_id?.trim() || "this check";
  if (writebackMappingIrreversible(preview, mapping)) {
    const disclosure =
      preview?.operator_disclosure?.trim() ||
      mapping?.operator_disclosure?.trim() ||
      WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL;
    return `${disclosure} Proceed with Approve & write for ${target}?`;
  }
  return `Apply writeback for ${target}? Updates will be sent to connected systems after approval.`;
}

export function isWritebackIrreversibleApproveRequired(
  preview: WritebackPreviewResult | null | undefined,
  mapping?: WritebackMappingEntry | null,
): boolean {
  return writebackMappingIrreversible(preview, mapping);
}

export function writebackPossibleToTable(
  rows: WritebackPossibleRow[],
  options?: { writebackExecuteEnabled?: boolean | null },
): {
  columns: string[];
  rows: string[][];
  helper: string;
} {
  const writebackExecuteEnabled = options?.writebackExecuteEnabled;
  const tableRows = rows.map((row) => [
    row.field_or_key && row.field_or_key !== "—"
      ? row.field_or_key
      : row.entity || row.check_id,
    formatWritePossibleTodayLabel(
      row.write_possible_today,
      writebackExecuteEnabled,
    ),
    formatWritePossibleLabel(row.updates_existing),
    formatWritePossibleLabel(row.rollback_possible_today),
    row.blocker?.trim() || "—",
  ]);
  if (!tableRows.length) {
    tableRows.push(["—", "—", "—", "—", "No write-surface rows for this check"]);
  }
  return {
    columns: [...WRITEBACK_POSSIBLE_COLUMNS],
    rows: tableRows,
    helper:
      "Honest write surfaces from the possible/not sheet. Rollback = manual admin undo when supported — not automatic on error. Shopify metafield (namespace=klints) is documented but not execute yet; WB-SHOP-01 uses customer note. Event ingest (LE-01) has limited rollback.",
  };
}

export async function getWritebackMappings(): Promise<WritebackMappingsResponse> {
  return apiRequest("/api/v1/writebacks/mappings/");
}

export async function getWritebackPossible(): Promise<WritebackPossibleResponse> {
  return apiRequest("/api/v1/writebacks/possible/");
}

const DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES = 15;

/** Default stale-executing reclaim window (matches BE settings default). */
export const WRITEBACK_DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES =
  DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES;

export function writebackStaleReclaimPolicyLabel(
  minutes: number = WRITEBACK_DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES,
): string {
  return `Manual admin only · stale claims reclaimed after ${minutes}m (not auto-undo)`;
}

/** Soft banner when registry API failed but allowlist+sheet still permit writeback (Slice C). */
export function writebackMappingsLoadSoftNotice(input: {
  checkId: string | undefined;
  possibleRows?: WritebackPossibleRow[];
  possibleLoadError?: boolean;
  mappingsLoadError?: boolean;
}): { title: string; detail: string } | null {
  if (!input.mappingsLoadError) return null;
  if (
    !isWritebackAllowlistSheetExecutable(
      input.checkId,
      input.possibleRows,
      input.possibleLoadError,
    )
  ) {
    return null;
  }
  return {
    title: "Registry mappings unavailable",
    detail:
      "Allowlist and sheet still permit preview and approval. Retry to restore mapping-based disclosure (irreversible notes, operator info).",
  };
}

/** Visible Fix banner copy (GAP-01 Slice C / W6-03). */
export function writebackRollbackHonestyNotice(
  status?: WritebackStatusResponse | null,
): { title: string; detail: string } {
  const minutes =
    status?.stale_executing_reclaim_minutes ??
    WRITEBACK_DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES;
  return {
    title: "Rollback is manual — not automatic on error",
    detail: `After a writeback applies, undo requires admin Rollback on this screen. Stale execute claims older than ${minutes} minutes are reclaimed so you can retry — successful writes are not auto-undone.`,
  };
}

/** GAP-01 Slice C / W6-03 — gov grid + rollback dialog honesty copy. */
export function writebackRollbackGovLabel(options: {
  written?: boolean;
  rolledBack?: boolean;
  showRollback?: boolean;
  status?: WritebackStatusResponse | null;
}): string {
  const minutes =
    options.status?.stale_executing_reclaim_minutes ??
    WRITEBACK_DEFAULT_STALE_EXECUTING_RECLAIM_MINUTES;
  if (options.rolledBack) return "Rolled back";
  if (options.showRollback) {
    return "Manual admin rollback · use Rollback writeback";
  }
  if (options.written) return "Not supported for this write";
  return writebackStaleReclaimPolicyLabel(minutes);
}

export function writebackRollbackConfirmDescription(
  checkId: string | undefined,
): string {
  const target = checkId?.trim() || "this check";
  return `Undo writeback for ${target}? This calls Manago/Shopify reverse ops manually — Klints does not roll back automatically on error.`;
}

/** GET /writebacks/status/ — once-per-run gate + provenance (PRD-WB-04 / WB-06). */
export async function getWritebackStatus(
  checkId: string,
  dataRunId?: number | null,
): Promise<WritebackStatusResponse> {
  const params = new URLSearchParams({ check_id: checkId });
  if (dataRunId != null && Number.isFinite(dataRunId)) {
    params.set("data_run_id", String(dataRunId));
  }
  return apiRequest(`/api/v1/writebacks/status/?${params.toString()}`);
}

/** Preview via unified POST /writebacks/run/ (ADMIN|ANALYST). */
export async function previewWriteback(
  checkId: string,
  options?: { batch_size?: number; max_rows?: number },
): Promise<WritebackPreviewResult> {
  return apiRequest("/api/v1/writebacks/run/", {
    method: "POST",
    body: JSON.stringify({
      action: "preview" satisfies WritebackRunAction,
      check_id: checkId,
      ...(options?.batch_size != null ? { batch_size: options.batch_size } : {}),
      ...(options?.max_rows != null ? { max_rows: options.max_rows } : {}),
    }),
  });
}

/**
 * PRD-WB-02 §5.1 step 2 — bind approval to a preview job.
 * Body: { job_id } from preview. Roles: ADMIN|ANALYST.
 */
export async function requestWritebackApproval(
  jobId: string,
): Promise<WritebackApprovalToken> {
  return apiRequest("/api/v1/writebacks/approvals/", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId }),
  });
}

/**
 * PRD-WB-02 §5.1 step 3 — grant approval token.
 * ADMIN only (matches BE WritebackApprovalApproveView).
 */
export async function approveWritebackApproval(
  approvalId: string,
): Promise<WritebackApprovalToken> {
  return apiRequest(
    `/api/v1/writebacks/approvals/${encodeURIComponent(approvalId)}/approve/`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/**
 * PRD-WB-02 / GAP-01 W5-01 — reject pending approval (ADMIN only).
 */
export async function rejectWritebackApproval(
  approvalId: string,
  options?: { reason?: string },
): Promise<WritebackApprovalToken> {
  const reason = options?.reason?.trim();
  return apiRequest(
    `/api/v1/writebacks/approvals/${encodeURIComponent(approvalId)}/reject/`,
    {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    },
  );
}

/**
 * PRD-WB-02 §5.1 step 4 — sandbox/prod execute via unified /run/.
 * Always send approval_id so Activity shows the full chain.
 * ADMIN only. Prefer unified /run/ (do not call the execute alias path).
 */
export async function executeWriteback(options: {
  checkId: string;
  diffHash: string;
  approvalId: string;
  batch_size?: number;
  max_rows?: number;
}): Promise<WritebackExecuteResult> {
  return apiRequest("/api/v1/writebacks/run/", {
    method: "POST",
    body: JSON.stringify({
      action: "execute" satisfies WritebackRunAction,
      check_id: options.checkId,
      diff_hash: options.diffHash,
      approval_id: options.approvalId,
      ...(options.batch_size != null ? { batch_size: options.batch_size } : {}),
      ...(options.max_rows != null ? { max_rows: options.max_rows } : {}),
    }),
  });
}

/**
 * PRD-WB-02 §5.1 step 5 — rollback using the **execute** job_id (never preview).
 * ADMIN only.
 */
export async function rollbackWriteback(
  jobId: string,
): Promise<WritebackRollbackResult> {
  return apiRequest("/api/v1/writebacks/run/", {
    method: "POST",
    body: JSON.stringify({
      action: "rollback" satisfies WritebackRunAction,
      job_id: jobId,
    }),
  });
}

function writebackApiErrorMessage(
  error: unknown,
  fallback: string,
  permissionMessage: string,
): string {
  if (!error || typeof error !== "object") return fallback;
  const rec = error as {
    detail?: string;
    status?: number;
    reason?: string;
    code?: string;
  };
  if (rec.status === 403) {
    if (typeof rec.detail === "string" && rec.detail.trim()) {
      return rec.detail;
    }
    if (typeof rec.reason === "string" && rec.reason.trim()) {
      return `Writebacks are disabled · ${rec.reason}`;
    }
    return permissionMessage;
  }
  if (isWritebackAlreadyExecutedForRunError(error)) {
    return (
      (typeof rec.detail === "string" && rec.detail.trim()) ||
      "Write in progress / already applied · Re-run Data Consistency Score if the issue returns"
    );
  }
  if (isWritebackDcsRunRequiredError(error)) {
    return (
      (typeof rec.detail === "string" && rec.detail.trim()) ||
      "Run a Data Consistency Score before approving writebacks."
    );
  }
  if (rec.status === 409) {
    // Remaining 409s are typically diff_hash_mismatch (hashes not returned to client).
    if (rec.code === "diff_hash_mismatch") {
      return (
        (typeof rec.detail === "string" && rec.detail.trim()) ||
        "Preview changed — run preview again."
      );
    }
    return "Preview changed — run preview again, then approve";
  }
  if (rec.status === 404) {
    if (typeof rec.detail === "string" && rec.detail.trim()) {
      return rec.detail;
    }
    return fallback;
  }
  if (typeof rec.detail === "string" && rec.detail.trim()) {
    return rec.detail;
  }
  return fallback;
}

/**
 * Prefer stable intent-level error_reason codes (PRD-WB-07 §5 / §6).
 * Never surface raw platform exception strings from execute payloads.
 */
function writebackExecuteFailureDetail(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const rec = error as {
    status?: number;
    intents?: Array<{
      status?: string;
      error_reason?: string | null;
      target?: string;
    }>;
    summary?: { errors?: number; executed?: number };
  };
  if (rec.status !== 501 && !(rec.summary && (rec.summary.errors ?? 0) > 0)) {
    return null;
  }
  const failed = (rec.intents ?? []).find(
    (intent) =>
      intent.status === "error" ||
      (typeof intent.error_reason === "string" && intent.error_reason.trim()),
  );
  if (!failed) {
    if ((rec.summary?.errors ?? 0) > 0 && (rec.summary?.executed ?? 0) === 0) {
      return "Writeback execute failed · no rows written";
    }
    return null;
  }
  const reason = (failed.error_reason ?? "").trim();
  const target = (failed.target ?? "").trim();

  const reasonLabel =
    reason === "shopify_write_failed"
      ? "Shopify write failed"
      : reason === "capability_not_confirmed"
        ? "Write capability not confirmed"
        : reason.startsWith("shopify_context_failed")
          ? "Shopify connection failed"
          : reason === "invalid_payload"
            ? "Invalid write payload"
            : reason === "upstream_error"
              ? "Upstream write failed"
              : reason === "timeout"
                ? "Upstream timed out"
                : reason === "adapter_not_implemented"
                  ? "Write not implemented"
                  : reason || "Write failed";

  return target ? `${target} · ${reasonLabel}` : reasonLabel;
}

export function isWritebackAlreadyExecutedForRunError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { status?: number; code?: string };
  return rec.status === 409 && rec.code === "writeback_already_executed_for_run";
}

/** Execute 409 — live intents no longer match the approved preview hash. */
export function isWritebackDiffHashMismatchError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { status?: number; code?: string };
  return rec.status === 409 && rec.code === "diff_hash_mismatch";
}

/** PRD-WB-07 §3.4 — execute denied when no terminal DCS score run exists. */
export function isWritebackDcsRunRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { status?: number; code?: string };
  return rec.status === 409 && rec.code === "dcs_run_required";
}

export function executeResultFromWritebackStatus(
  status: WritebackStatusResponse,
): WritebackExecuteResult | null {
  const latest = status.latest_execute;
  if (!latest?.job_id) return null;
  return {
    check_id: status.check_id,
    mode: "execute",
    diff_hash: latest.diff_hash,
    blocked_reason: null,
    job_id: latest.job_id,
    data_run_id: latest.data_run_id ?? status.data_run_id,
    approval_tier: null,
    irreversible: false,
    operator_disclosure: null,
    intents: latest.intents ?? [],
    summary: latest.summary ?? {
      ready: 0,
      skipped: 0,
      errors: 0,
      executed: 0,
    },
    execute_eligible: { sandbox: true, production: false },
  };
}

/** GAP-01 W5-01 — restore dry-run preview from status for cross-session admin approval. */
export function previewResultFromWritebackStatus(
  status: WritebackStatusResponse,
): WritebackPreviewResult | null {
  const latest = status.latest_preview;
  if (!latest?.job_id) return null;
  const summary = latest.summary ?? {
    ready: 0,
    skipped: 0,
    errors: 0,
    executed: 0,
  };
  return {
    check_id: latest.check_id ?? status.check_id,
    mode: latest.mode ?? "dry_run",
    diff_hash: latest.diff_hash ?? null,
    blocked_reason: latest.blocked_reason ?? null,
    job_id: latest.job_id,
    data_run_id: latest.data_run_id ?? status.data_run_id,
    approval_tier: latest.approval_tier ?? null,
    irreversible: latest.irreversible ?? false,
    operator_disclosure: latest.operator_disclosure ?? null,
    intents: latest.intents ?? [],
    summary,
    execute_eligible: latest.execute_eligible ?? {
      sandbox: true,
      production: false,
    },
  };
}

export function pendingApprovalFromWritebackStatus(
  status: WritebackStatusResponse,
): WritebackApprovalToken | null {
  const pending = status.latest_pending_approval;
  if (!pending || pending.status !== "PENDING") return null;
  if (isWritebackApprovalExpired(pending)) return null;
  return {
    schema_version: "1.0.0",
    approval_id: pending.approval_id,
    tenant_id: "",
    actor_id: "",
    actor_role: "",
    scope: "writeback:execute",
    object_id: pending.object_id,
    object_version: "1.0.0",
    diff_hash: pending.diff_hash,
    issued_at: pending.issued_at ?? "",
    expires_at: pending.expires_at ?? "",
    status: "PENDING",
    approved_at: null,
    consumed_at: null,
    job_id: pending.job_id,
    approval_tier: null,
  };
}

/** Restore APPROVED+unconsumed token after approve-then-execute partial failure. */
export function grantedApprovalFromWritebackStatus(
  status: WritebackStatusResponse,
): WritebackApprovalToken | null {
  const granted = status.latest_granted_approval;
  if (!granted || granted.status !== "APPROVED") return null;
  const token: WritebackApprovalToken = {
    schema_version: "1.0.0",
    approval_id: granted.approval_id,
    tenant_id: "",
    actor_id: "",
    actor_role: "",
    scope: "writeback:execute",
    object_id: granted.object_id,
    object_version: "1.0.0",
    diff_hash: granted.diff_hash,
    issued_at: granted.issued_at ?? "",
    expires_at: granted.expires_at ?? "",
    status: "APPROVED",
    approved_at: granted.issued_at ?? "",
    consumed_at: null,
    job_id: granted.job_id,
    approval_tier: null,
  };
  // C3 defense — BE should omit expired grants; still refuse local hydrate.
  if (isWritebackApprovalExpired(token)) return null;
  return token;
}

/** Prefer pending; else granted (retry-execute recovery). */
export function activeApprovalFromWritebackStatus(
  status: WritebackStatusResponse,
): WritebackApprovalToken | null {
  return (
    pendingApprovalFromWritebackStatus(status) ??
    grantedApprovalFromWritebackStatus(status)
  );
}

export function writebackProvenanceLine(options: {
  dataRunId?: number | null;
  jobId?: string | null;
}): string | null {
  const job = options.jobId?.trim();
  if (!job) return null;
  const shortJob = job.slice(0, 8);
  if (options.dataRunId != null) {
    return `Written on DCS run #${options.dataRunId} · job ${shortJob}…`;
  }
  return `Written · job ${shortJob}…`;
}

/** Activity deep-link for Fix provenance (PRD-WB-06 §4.2). */
export function writebackActivityDeepLink(options: {
  checkId?: string | null;
  jobId?: string | null;
}): { to: "/activity"; search?: { check?: string; action?: string; job?: string } } {
  const check = options.checkId?.trim();
  const job = options.jobId?.trim();
  const search: { check?: string; action?: string; job?: string } = {
    action: "writeback.executed",
  };
  if (check) search.check = check;
  if (job) search.job = job;
  return { to: "/activity", search };
}

export function writebackPreviewErrorMessage(error: unknown): string {
  return writebackApiErrorMessage(
    error,
    "Could not load writeback preview.",
    "You do not have permission to preview writebacks.",
  );
}

export function writebackApprovalErrorMessage(error: unknown): string {
  return writebackApiErrorMessage(
    error,
    "Could not complete writeback approval.",
    "You do not have permission to approve writebacks.",
  );
}

export function writebackExecuteErrorMessage(error: unknown): string {
  const intentDetail = writebackExecuteFailureDetail(error);
  if (intentDetail) return intentDetail;
  return writebackApiErrorMessage(
    error,
    "Could not execute writeback.",
    "Only admins can execute writebacks.",
  );
}

const WRITEBACK_ROLLBACK_ERROR_MESSAGES: Record<string, string> = {
  writeback_job_not_found: "Writeback job not found.",
  writeback_job_already_rolled_back: "This writeback was already rolled back.",
  writeback_job_not_rollbackable_failed:
    "That execute wrote nothing. Preview until ready, execute, then roll back that job.",
  writeback_job_not_rollbackable:
    "Use the job_id from a successful write, not the preview job_id.",
};

export function writebackRollbackErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const rec = error as { code?: string; detail?: string };
    const code = typeof rec.code === "string" ? rec.code.trim() : "";
    if (code && WRITEBACK_ROLLBACK_ERROR_MESSAGES[code]) {
      return WRITEBACK_ROLLBACK_ERROR_MESSAGES[code];
    }
  }
  return writebackApiErrorMessage(
    error,
    "Could not roll back writeback.",
    "Only admins can rollback writebacks.",
  );
}

/** True when execute response counts as Written (PRD-WB-02 §6.1). */
export function isWritebackExecuteSuccess(
  result: WritebackExecuteResult | null | undefined,
): boolean {
  if (!result) return false;
  if (result.blocked_reason) return false;
  return (result.summary?.executed ?? 0) >= 1;
}
