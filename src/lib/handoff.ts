/**
 * PRD-HO-01 Steps 7–10 + PRD-HO-02 §7 — Handoff package API client + activation.
 *
 * Pack body + FE siblings from GET serialize_handoff.
 * HO-02: approve / reject / confirm-activated (human Manago path — no MCP Send).
 */

import { apiRequest } from "@/lib/api";
import { packageRouteSummary } from "@/lib/capability-route";

export const HANDOFF_QUERY_KEY = ["handoffs"] as const;
export const HANDOFF_STALE_MS = 8_000;

/** PRD-HO-01 §6.3 — tooltip when Send is locked (non-admin or terminal status). */
export const HANDOFF_SEND_DISABLED_TITLE =
  "Handoff Send is not live yet — activation stays human in Manago";

/** PRD-HO-02 §6.3 — Viewer / Analyst cannot approve for activation. */
export const HANDOFF_ADMIN_REQUIRED_TITLE =
  "Admin approval is required to send for activation";

/** PRD-HO-02 §7.1 — ACTIVATED terminal state. */
export const HANDOFF_ALREADY_ACTIVATED_TITLE =
  "Already activated — no further Send action";

/** Delivery card honesty copy (no fake Sent toast). */
export const HANDOFF_SEND_LOCKED_HINT =
  "Klints will not toast “Sent” or auto-deliver via MCP in this release.";

/** PRD-HO-02 §7.1 — post-approve banner / toast body. */
export const HANDOFF_APPROVED_BANNER =
  "Approved for activation. Open Manago and build/activate this workflow using the steps below. When live in Manago, click Confirm activated.";

/** PRD-HO-02 §7.1 — ACTIVATED success banner. */
export const HANDOFF_ACTIVATED_BANNER =
  "Activated — workflow confirmed live in Manago.";

/** PRD-HO-02 §7.1 — REJECTED honest copy. */
export const HANDOFF_REJECTED_BANNER =
  "Handoff rejected — return to QA or Studio to fix and re-stage.";

function requireNonEmptyId(id: string, label: string): string {
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

export type HandoffStatus =
  | "STAGED"
  | "APPROVED_FOR_ACTIVATION"
  | "REJECTED"
  | "ACTIVATED";

/** Pack schema body + FE siblings (API envelope). */
export type HandoffPackageResponse = {
  schema_version: string;
  handoff_id: string;
  tenant_id: string;
  package_version: string;
  artifact_refs: string[];
  qa_ref: string;
  approval_ref: string;
  manifest_hash: string;
  status: HandoffStatus | string;
  created_at: string;
  provenance: {
    source_versions: Record<string, string>;
    created_at: string;
    created_by: string;
  };
  // FE siblings
  use_case_id: string;
  package_id: string;
  qa_run_id: string;
  title?: string;
  route?: string;
  qa_score?: number;
  qa_status?: string;
  /** PRD-HO-02 §6 GET — persisted activation audit block. */
  activation_meta?: HandoffActivationMeta;
  /** PRD-HO-02 §6 GET — present when APPROVED_FOR_ACTIVATION or ACTIVATED. */
  activation_guide?: HandoffActivationGuide;
  /** PRD-HO-02 §6 GET — honest MCP publish status at send. */
  capability?: HandoffCapabilityHonesty;
};

export type HandoffActivationMeta = {
  path?: string | null;
  capability_checked?: string | null;
  capability_status_at_send?: string | null;
  approved_at?: string | null;
  approved_by_user_id?: string | null;
  approval_token_id?: string | null;
  activated_at?: string | null;
  activated_by_user_id?: string | null;
  activation_ref?: string | null;
  manago_workflow_external_id?: string | null;
  notes?: string | null;
  rejected_at?: string | null;
  rejected_by_user_id?: string | null;
  rejection_reason?: string | null;
};

export type HandoffHumanGuideStep = {
  node_id?: string | null;
  node_type?: string | null;
  title?: string | null;
  description?: string | null;
  fields?: string[];
};

export type HandoffActivationGuide = {
  path?: string;
  summary?: string;
  human_guide?: {
    steps?: HandoffHumanGuideStep[];
    brand_dna_required?: boolean;
    localisation_required?: boolean;
    human_signoff?: boolean;
  };
  use_case_id?: string;
  package_id?: string;
  manago_hint?: string;
};

export type HandoffCapabilityHonesty = {
  mcp_publish_status?: string;
  route?: string;
};

/** POST approve / confirm / reject envelope (partial — merge onto GET row). */
export type HandoffActivationActionResponse = {
  handoff_id: string;
  status: HandoffStatus | string;
  activation_meta?: HandoffActivationMeta;
  activation_guide?: HandoffActivationGuide;
  capability?: HandoffCapabilityHonesty;
};

export type HandoffListResponse = {
  count: number;
  results: HandoffPackageResponse[];
};

export function packageHandoffQueryKey(packageId: string, qaRunId?: string) {
  return [
    ...HANDOFF_QUERY_KEY,
    "package",
    packageId,
    qaRunId?.trim() ? qaRunId.trim() : "latest",
  ] as const;
}

export function handoffDetailQueryKey(handoffId: string) {
  return [...HANDOFF_QUERY_KEY, "detail", handoffId] as const;
}

/** GET /api/v1/build-packages/{id}/handoff/ — latest; 404 if none. */
export function getLatestPackageHandoff(
  packageId: string,
): Promise<HandoffPackageResponse> {
  const id = requireNonEmptyId(packageId, "packageId");
  return apiRequest(
    `/api/v1/build-packages/${encodeURIComponent(id)}/handoff/`,
  ) as Promise<HandoffPackageResponse>;
}

/**
 * Deep-link fetch (PRD §6.2): optional qa_run_id selects that handoff;
 * otherwise latest for the package.
 */
export async function fetchHandoffForDeepLink(input: {
  package_id: string;
  qa_run_id?: string;
}): Promise<HandoffPackageResponse> {
  const packageId = requireNonEmptyId(input.package_id, "packageId");
  const qaRunId = input.qa_run_id?.trim();
  if (!qaRunId) {
    return getLatestPackageHandoff(packageId);
  }
  const listed = await listHandoffs({
    package_id: packageId,
    qa_run_id: qaRunId,
  });
  if (!Array.isArray(listed.results)) {
    const err: HandoffApiError = {
      status: 500,
      detail: "Handoff list response was invalid.",
    };
    throw err;
  }
  const hit = listed.results[0];
  if (hit) return hit;
  // Same never_staged signal as GET latest — triggers auto POST with qa_run_id.
  const err: HandoffApiError = {
    status: 404,
    detail: "Handoff has not been staged for this package.",
  };
  throw err;
}

/** POST /api/v1/build-packages/{id}/handoff/ — stage; 201 create / 200 idempotent. */
export function stagePackageHandoff(
  packageId: string,
  opts?: { qa_run_id?: string },
): Promise<HandoffPackageResponse> {
  const id = requireNonEmptyId(packageId, "packageId");
  const body: Record<string, string> = {};
  const qaRunId = opts?.qa_run_id?.trim();
  if (qaRunId) body.qa_run_id = qaRunId;
  return apiRequest(
    `/api/v1/build-packages/${encodeURIComponent(id)}/handoff/`,
    { method: "POST", body: JSON.stringify(body) },
  ) as Promise<HandoffPackageResponse>;
}

/** GET /api/v1/handoffs/{handoff_id}/ */
export function getHandoff(handoffId: string): Promise<HandoffPackageResponse> {
  const id = requireNonEmptyId(handoffId, "handoffId");
  return apiRequest(
    `/api/v1/handoffs/${encodeURIComponent(id)}/`,
  ) as Promise<HandoffPackageResponse>;
}

/** GET /api/v1/handoffs/?package_id=&qa_run_id= */
export function listHandoffs(filters?: {
  package_id?: string;
  qa_run_id?: string;
}): Promise<HandoffListResponse> {
  const params = new URLSearchParams();
  if (filters?.package_id?.trim()) {
    params.set("package_id", filters.package_id.trim());
  }
  if (filters?.qa_run_id?.trim()) {
    params.set("qa_run_id", filters.qa_run_id.trim());
  }
  const qs = params.toString();
  const path = qs ? `/api/v1/handoffs/?${qs}` : "/api/v1/handoffs/";
  return apiRequest(path) as Promise<HandoffListResponse>;
}

function requireManifestHash(record: HandoffPackageResponse): string {
  const hash = String(record.manifest_hash ?? "").trim();
  if (!hash) {
    throw new Error("manifest_hash is required for handoff activation");
  }
  return hash;
}

/** POST /api/v1/handoffs/{handoff_id}/approve/ — STAGED → APPROVED_FOR_ACTIVATION. */
export function approveHandoffForActivation(
  handoffId: string,
  body: {
    manifest_hash: string;
    approval_id?: string | null;
    notes?: string | null;
  },
): Promise<HandoffActivationActionResponse> {
  const id = requireNonEmptyId(handoffId, "handoffId");
  const manifest_hash = requireNonEmptyId(body.manifest_hash, "manifest_hash");
  const payload: Record<string, string> = { manifest_hash };
  const approvalId = body.approval_id?.trim();
  if (approvalId) payload.approval_id = approvalId;
  const notes = body.notes?.trim();
  if (notes) payload.notes = notes;
  return apiRequest(`/api/v1/handoffs/${encodeURIComponent(id)}/approve/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<HandoffActivationActionResponse>;
}

/** POST /api/v1/handoffs/{handoff_id}/reject/ — → REJECTED. */
export function rejectHandoff(
  handoffId: string,
  body: {
    manifest_hash: string;
    reason?: string | null;
  },
): Promise<HandoffActivationActionResponse> {
  const id = requireNonEmptyId(handoffId, "handoffId");
  const manifest_hash = requireNonEmptyId(body.manifest_hash, "manifest_hash");
  const payload: Record<string, string> = { manifest_hash };
  const reason = body.reason?.trim();
  if (reason) payload.reason = reason;
  return apiRequest(`/api/v1/handoffs/${encodeURIComponent(id)}/reject/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<HandoffActivationActionResponse>;
}

/** POST /api/v1/handoffs/{handoff_id}/confirm-activated/ — APPROVED → ACTIVATED. */
export function confirmHandoffActivated(
  handoffId: string,
  body: {
    manifest_hash: string;
    manago_workflow_external_id?: string | null;
    notes?: string | null;
  },
): Promise<HandoffActivationActionResponse> {
  const id = requireNonEmptyId(handoffId, "handoffId");
  const manifest_hash = requireNonEmptyId(body.manifest_hash, "manifest_hash");
  const payload: Record<string, string> = { manifest_hash };
  const externalId = body.manago_workflow_external_id?.trim();
  if (externalId) payload.manago_workflow_external_id = externalId;
  const notes = body.notes?.trim();
  if (notes) payload.notes = notes;
  return apiRequest(
    `/api/v1/handoffs/${encodeURIComponent(id)}/confirm-activated/`,
    { method: "POST", body: JSON.stringify(payload) },
  ) as Promise<HandoffActivationActionResponse>;
}

/** Merge activation POST response onto a live GET row for cache updates. */
export function mergeHandoffActivationResponse(
  existing: HandoffPackageResponse,
  action: HandoffActivationActionResponse,
): HandoffPackageResponse {
  return {
    ...existing,
    status: action.status ?? existing.status,
    activation_meta: action.activation_meta ?? existing.activation_meta,
    activation_guide: action.activation_guide ?? existing.activation_guide,
    capability: action.capability ?? existing.capability,
  };
}

export function handoffManifestHash(
  record: HandoffPackageResponse | null | undefined,
): string {
  return String(record?.manifest_hash ?? "").trim();
}

export function handoffActivationBody(
  record: HandoffPackageResponse,
): { manifest_hash: string } {
  return { manifest_hash: requireManifestHash(record) };
}

export type HandoffApiError = {
  status: number;
  detail?: string;
  code?: string;
};

export function isHandoffApiError(err: unknown): err is HandoffApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

function handoffErrorDetail(err: HandoffApiError): string {
  return typeof err.detail === "string" ? err.detail.toLowerCase() : "";
}

/** GET 404 — handoff has not been staged for this package. */
export function isHandoffNeverStagedError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 404) return false;
  const detail = handoffErrorDetail(err);
  return (
    detail.includes("has not been staged") ||
    detail.includes("handoff has not been staged")
  );
}

/** Package missing / wrong company. */
export function isHandoffPackageNotFoundError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 404) return false;
  if (isHandoffNeverStagedError(err)) return false;
  return handoffErrorDetail(err).includes("build package not found");
}

/** GET /handoffs/{id}/ — missing or wrong company. */
export function isHandoffNotFoundError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 404) return false;
  if (isHandoffNeverStagedError(err) || isHandoffPackageNotFoundError(err)) {
    return false;
  }
  return handoffErrorDetail(err).includes("handoff not found");
}

export function classifyPackageHandoffGetError(
  err: unknown,
): "never_staged" | "package_not_found" | "other" {
  if (isHandoffNeverStagedError(err)) return "never_staged";
  if (isHandoffPackageNotFoundError(err)) return "package_not_found";
  return "other";
}

/** POST 403 — Viewer (or other) cannot stage. */
export function isHandoffForbiddenError(err: unknown): boolean {
  return isHandoffApiError(err) && err.status === 403;
}

/** POST 409 — QA missing / not PASS / mismatch. */
export function isHandoffStageBlockedError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 409) return false;
  const code = typeof err.code === "string" ? err.code : "";
  return (
    code === "qa_missing" ||
    code === "qa_not_pass" ||
    code === "qa_package_mismatch" ||
    code === "qa_company_mismatch" ||
    code === "use_case_missing" ||
    handoffErrorDetail(err).includes("clear qa") ||
    handoffErrorDetail(err).includes("qa has not been run")
  );
}

export function isHandoffStaged(
  record: HandoffPackageResponse | null | undefined,
): boolean {
  return String(record?.status ?? "").toUpperCase() === "STAGED";
}

export function isHandoffApprovedForActivation(
  record: HandoffPackageResponse | null | undefined,
): boolean {
  return (
    String(record?.status ?? "").toUpperCase() === "APPROVED_FOR_ACTIVATION"
  );
}

export function isHandoffActivated(
  record: HandoffPackageResponse | null | undefined,
): boolean {
  return String(record?.status ?? "").toUpperCase() === "ACTIVATED";
}

export function isHandoffRejected(
  record: HandoffPackageResponse | null | undefined,
): boolean {
  return String(record?.status ?? "").toUpperCase() === "REJECTED";
}

/** Post-STAGE statuses bypass the QA PASS gate for display (HO-02 §7.1). */
export function handoffBypassesQaGate(
  record: HandoffPackageResponse | null | undefined,
): boolean {
  if (!record) return false;
  return (
    isHandoffApprovedForActivation(record) ||
    isHandoffActivated(record) ||
    isHandoffRejected(record)
  );
}

/** PRD-HO-02 §6.3 — approve / reject / confirm locked to Admin. */
export function canApproveHandoffActivation(role: string | undefined | null): boolean {
  return String(role ?? "").trim().toLowerCase() === "admin";
}

/** POST 403 — Viewer / Analyst cannot approve, reject, or confirm. */
export function isHandoffActivationForbiddenError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 403) return false;
  const code = typeof err.code === "string" ? err.code : "";
  return code === "forbidden" || handoffErrorDetail(err).includes("admin");
}

/** POST 409 — wrong status for activation action. */
export function isHandoffActivationStatusError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 409) return false;
  const code = typeof err.code === "string" ? err.code : "";
  return (
    code === "handoff_not_staged" ||
    code === "handoff_not_approved" ||
    code === "handoff_already_activated"
  );
}

/** POST 409 — manifest_hash mismatch (tamper detect). */
export function isHandoffManifestMismatchError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 409) return false;
  const code = typeof err.code === "string" ? err.code : "";
  return code === "manifest_mismatch";
}

/** POST 409 — QA no longer PASS at approve/confirm time. */
export function isHandoffActivationQaBlockedError(err: unknown): boolean {
  if (!isHandoffApiError(err) || err.status !== 409) return false;
  const code = typeof err.code === "string" ? err.code : "";
  return code === "qa_not_pass";
}

export function handoffRejectionReason(
  record: HandoffPackageResponse | null | undefined,
): string | null {
  const reason = String(record?.activation_meta?.rejection_reason ?? "").trim();
  return reason || null;
}

export function handoffActivationGuideSteps(
  record: HandoffPackageResponse | null | undefined,
): HandoffHumanGuideStep[] {
  const fromGuide = record?.activation_guide?.human_guide?.steps;
  if (Array.isArray(fromGuide) && fromGuide.length > 0) return fromGuide;
  return [];
}

/** Staged row matches the QA run that opened the gate (avoids showing an older handoff). */
export function handoffMatchesGateQa(
  handoff: HandoffPackageResponse | null | undefined,
  gateQa: { qa_run_id?: string | null } | null | undefined,
): boolean {
  if (!handoff || !gateQa) return false;
  const expected = String(gateQa.qa_run_id ?? "").trim();
  if (!expected) return false;
  const actual = String(handoff.qa_run_id || handoff.qa_ref || "").trim();
  return actual === expected;
}

/** Display title for live handoff (never fixture). */
export function handoffDisplayTitle(
  record: HandoffPackageResponse,
  packageTitle?: string | null,
): string {
  const fromHandoff = String(record.title ?? "").trim();
  if (fromHandoff) return fromHandoff;
  const fromPackage = String(packageTitle ?? "").trim();
  if (fromPackage) return fromPackage;
  const uc = String(record.use_case_id ?? "").trim().toUpperCase();
  return uc ? `${uc} · staged handoff` : "Staged handoff package";
}

/**
 * Route / capability line for live UI (PRD-HO-01 §6.3 + CAP-01 §7).
 * HUMAN_FALLBACK is an honest, supported path — not an error.
 * Copy SoT: `packageRouteSummary` (CAP-01).
 */
export function handoffRouteSummary(route: string | undefined | null): {
  code: string;
  label: string;
} {
  return packageRouteSummary(route);
}

/** First N human-guide step titles for the staged brief excerpt. */
export function humanGuideStepTitles(
  steps:
    | Array<{ title?: string | null; node_type?: string | null }>
    | null
    | undefined,
  limit = 4,
): string[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const out: string[] = [];
  for (const step of steps) {
    const label = String(step?.title || step?.node_type || "").trim();
    if (!label || out.includes(label)) continue;
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

/** Short QA chip line for the live handoff card. */
export function handoffQaSummary(record: HandoffPackageResponse): string {
  const status = String(record.qa_status || "").trim().toUpperCase();
  const score =
    record.qa_score != null && Number.isFinite(Number(record.qa_score))
      ? Math.round(Number(record.qa_score))
      : null;
  if (status && score != null) return `${status} · score ${score}`;
  if (status) return status;
  if (score != null) return `score ${score}`;
  return "QA not loaded";
}
