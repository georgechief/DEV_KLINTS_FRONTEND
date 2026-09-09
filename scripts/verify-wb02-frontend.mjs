/**
 * WB-02 Phase 1 frontend verification — writeback Approve client helpers.
 * Run: npm run verify:wb02
 *
 * Phase 2: Fix Approve mutation chain + eligibility + trust + rollback.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
let failed = 0;

function pass(label, detail = "") {
  results.push({ ok: true, label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  failed += 1;
  results.push({ ok: false, label, detail });
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function readSrc(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    fail(`file exists: ${rel}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function assertIncludes(src, rel, needle, label) {
  if (src.includes(needle)) pass(label);
  else fail(label, `missing in ${rel}: ${needle.slice(0, 90)}`);
}

function assertNotIncludes(src, rel, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden in ${rel}: ${needle.slice(0, 90)}`);
}

const WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS = ["LE-04"];
const WRITEBACK_APPROVE_EXECUTABLE_CHECK_IDS = ["CI-01", "CC-03", "WB-SHOP-01"];
const EXECUTE_WRITE_STATES = new Set(["yes", "sandbox_only"]);

function normalizeWritebackCheckId(checkId) {
  const id = checkId?.trim().toUpperCase();
  return id || null;
}

function isWritebackPreviewBlocked(checkId) {
  if (!checkId?.trim()) return false;
  const id = checkId.trim().toUpperCase();
  return WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS.some(
    (blocked) => blocked.toUpperCase() === id,
  );
}

function isWritebackApproveAllowlisted(checkId) {
  const id = normalizeWritebackCheckId(checkId);
  if (!id) return false;
  return WRITEBACK_APPROVE_EXECUTABLE_CHECK_IDS.some(
    (allowed) => allowed.toUpperCase() === id,
  );
}

function writebackPossibleRowsForCheck(rows, checkId) {
  if (!checkId?.trim() || !rows?.length) return [];
  const id = checkId.trim().toUpperCase();
  return rows.filter((row) => row.check_id.toUpperCase() === id);
}

function isWritebackSheetExecuteAdvertised(rows, checkId) {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (!match.length) return false;
  return match.some((row) =>
    EXECUTE_WRITE_STATES.has(row.write_possible_today.trim().toLowerCase()),
  );
}

function isWritebackMappingEnabled(mappings, checkId) {
  if (isWritebackPreviewBlocked(checkId)) return false;
  if (!checkId?.trim() || !mappings?.length) return false;
  const id = checkId.trim().toUpperCase();
  const row = mappings.find((m) => m.check_id.toUpperCase() === id);
  return Boolean(row?.enabled);
}

function isWritebackDiffHashValid(diffHash) {
  return typeof diffHash === "string" && /^[a-fA-F0-9]{64}$/.test(diffHash.trim());
}

function isWritebackAdminRole(role) {
  return (role ?? "").trim().toLowerCase() === "admin";
}

function isWritebackApprovalRequestRole(role) {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "analyst";
}

function isWritebackAllowlistSheetExecutable(checkId, possibleRows, possibleLoadError) {
  const id = normalizeWritebackCheckId(checkId);
  if (!id || possibleLoadError) return false;
  if (isWritebackPreviewBlocked(id)) return false;
  if (!isWritebackApproveAllowlisted(id)) return false;
  return isWritebackSheetExecuteAdvertised(possibleRows, id);
}

function writebackMappingGateBlockReason(input, checkId) {
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

function resolveWritebackPreviewExecutionBlockReason(input) {
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

function isWritebackApprovalExpired(token) {
  if (!token) return false;
  // C3: APPROVED also respects expires_at (same TTL window as PENDING).
  const raw = typeof token.expires_at === "string" ? token.expires_at.trim() : "";
  if (!raw) return false;
  const exp = Date.parse(raw);
  if (!Number.isFinite(exp)) return false;
  return Date.now() >= exp;
}

function resolveWritebackRequestApprovalBlockReason(input) {
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

function isWritebackApprovalReadyForExecute(token) {
  if (!token) return false;
  if (isWritebackApprovalExpired(token)) return false;
  return token.status === "PENDING" || token.status === "APPROVED";
}

function resolveWritebackApproveWriteBlockReason(input) {
  const base = resolveWritebackPreviewExecutionBlockReason(input);
  if (base) return base;
  if (!isWritebackAdminRole(input.role)) return "not_admin";
  const pending = input.pendingApproval;
  if (!isWritebackApprovalReadyForExecute(pending)) return "approval_not_pending";
  if (pending.diff_hash !== input.preview?.diff_hash) return "approval_preview_mismatch";
  if (pending.job_id !== input.preview?.job_id) return "approval_preview_mismatch";
  return null;
}

function resolveWritebackRejectBlockReason(input) {
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

function resolveWritebackApproveBlockReason(input) {
  return resolveWritebackApproveWriteBlockReason(input);
}

function isWritebackApproveExecutable(input) {
  return resolveWritebackApproveBlockReason(input) === null;
}

function isWritebackRequestApprovalExecutable(input) {
  return resolveWritebackRequestApprovalBlockReason(input) === null;
}

function isWritebackApproveWriteExecutable(input) {
  return resolveWritebackApproveWriteBlockReason(input) === null;
}

function isWritebackRejectExecutable(input) {
  return resolveWritebackRejectBlockReason(input) === null;
}

function isWritebackExecuteSuccess(result) {
  if (!result) return false;
  if (result.blocked_reason) return false;
  return (result.summary?.executed ?? 0) >= 1;
}

const VALID_HASH = "a".repeat(64);

function readyPreview(overrides = {}) {
  return {
    check_id: "CC-03",
    job_id: "11111111-1111-1111-1111-111111111111",
    diff_hash: VALID_HASH,
    summary: { ready: 1, skipped: 0, errors: 0, executed: 0 },
    execute_eligible: { sandbox: true, production: false },
    blocked_reason: null,
    ...overrides,
  };
}

const SHEET_ROWS = [
  { check_id: "CI-01", write_possible_today: "sandbox_only", rollback_possible_today: "yes" },
  { check_id: "CC-03", write_possible_today: "sandbox_only", rollback_possible_today: "yes" },
  { check_id: "WB-SHOP-01", write_possible_today: "sandbox_only", rollback_possible_today: "yes" },
  { check_id: "LE-04", write_possible_today: "disabled", rollback_possible_today: "n/a" },
  { check_id: "CI-03", write_possible_today: "disabled", rollback_possible_today: "n/a" },
  { check_id: "LE-01", write_possible_today: "disabled", rollback_possible_today: "no" },
  { check_id: "SHOPIFY-ORDER", write_possible_today: "no", rollback_possible_today: "n/a" },
];

const MAPPINGS = [
  { check_id: "CI-01", enabled: true },
  { check_id: "CC-03", enabled: true },
  { check_id: "WB-SHOP-01", enabled: true },
  { check_id: "LE-04", enabled: false },
];

function testAllowlist() {
  console.log("\n1. Excel/sheet allowlist (CI-01, CC-03, WB-SHOP-01 only)");
  for (const id of ["CI-01", "CC-03", "WB-SHOP-01"]) {
    if (isWritebackApproveAllowlisted(id)) pass(`${id} allowlisted`);
    else fail(`${id} allowlisted`);
  }
  for (const id of ["LE-04", "CI-03", "LE-01", "PT-04", "SHOPIFY-ORDER"]) {
    if (!isWritebackApproveAllowlisted(id)) pass(`${id} not allowlisted`);
    else fail(`${id} not allowlisted`);
  }
}

function testEligibility() {
  console.log("\n2. Approve eligibility gates (PRD §3.3)");

  const base = {
    checkId: "CC-03",
    possibleRows: SHEET_ROWS,
    mappings: MAPPINGS,
    preview: readyPreview(),
    role: "admin",
    writebackExecuteEnabled: true,
  };

  const pendingToken = {
    approval_id: "22222222-2222-2222-2222-222222222222",
    status: "PENDING",
    diff_hash: VALID_HASH,
    job_id: readyPreview().job_id,
  };

  if (isWritebackApproveExecutable({ ...base, pendingApproval: pendingToken })) {
    pass("CC-03 admin + pending approval → approve-write executable");
  } else {
    fail(
      "CC-03 admin + pending approval → approve-write executable",
      resolveWritebackApproveBlockReason({ ...base, pendingApproval: pendingToken }),
    );
  }

  const grantedToken = { ...pendingToken, status: "APPROVED" };
  if (isWritebackApproveWriteExecutable({ ...base, pendingApproval: grantedToken })) {
    pass("APPROVED token still allows Approve & write (retry execute)");
  } else {
    fail("APPROVED token still allows Approve & write (retry execute)");
  }
  if (
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      pendingApproval: grantedToken,
    }) === "approval_already_pending"
  ) {
    pass("request blocked while APPROVED unconsumed matches preview");
  } else {
    fail("request blocked while APPROVED unconsumed matches preview");
  }
  if (
    resolveWritebackRejectBlockReason({ ...base, pendingApproval: grantedToken }) ===
    "approval_not_pending"
  ) {
    pass("reject blocked after grant (APPROVED)");
  } else {
    fail("reject blocked after grant (APPROVED)");
  }

  const expiredGranted = {
    ...grantedToken,
    expires_at: "2000-01-01T00:00:00.000Z",
  };
  if (
    resolveWritebackApproveWriteBlockReason({
      ...base,
      pendingApproval: expiredGranted,
    }) === "approval_not_pending" &&
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      pendingApproval: expiredGranted,
    }) === null
  ) {
    pass("C3: expired APPROVED unlocks re-request (no approve-write)");
  } else {
    fail(
      "C3: expired APPROVED unlocks re-request (no approve-write)",
      resolveWritebackApproveWriteBlockReason({
        ...base,
        pendingApproval: expiredGranted,
      }),
    );
  }

  const expiredPending = {
    ...pendingToken,
    expires_at: "2000-01-01T00:00:00.000Z",
  };
  if (
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      pendingApproval: expiredPending,
    }) === null &&
    !isWritebackApprovalReadyForExecute(expiredPending) &&
    resolveWritebackRejectBlockReason({
      ...base,
      pendingApproval: expiredPending,
    }) === "approval_not_pending"
  ) {
    pass("expired PENDING unlocks re-request (no approve/reject)");
  } else {
    fail("expired PENDING unlocks re-request (no approve/reject)");
  }

  if (isWritebackRequestApprovalExecutable({ ...base, role: "analyst" })) {
    pass("analyst can request approval");
  } else {
    fail("analyst can request approval", resolveWritebackRequestApprovalBlockReason({ ...base, role: "analyst" }));
  }

  if (resolveWritebackApproveWriteBlockReason({ ...base, role: "analyst", pendingApproval: pendingToken }) === "not_admin") {
    pass("analyst blocked from approve-write");
  } else {
    fail("analyst blocked from approve-write");
  }

  if (resolveWritebackRequestApprovalBlockReason({ ...base, role: "viewer" }) === "not_analyst_or_admin") {
    pass("viewer blocked from request approval");
  } else {
    fail("viewer blocked from request approval");
  }

  if (
    resolveWritebackApproveWriteBlockReason({ ...base, pendingApproval: null }) ===
    "approval_not_pending"
  ) {
    pass("approve-write without pending → approval_not_pending");
  } else {
    fail("approve-write without pending → approval_not_pending");
  }

  if (
    isWritebackApproveWriteExecutable({
      ...base,
      checkId: "CI-01",
      preview: readyPreview({ check_id: "CI-01" }),
      pendingApproval: pendingToken,
    })
  ) {
    pass("CI-01 approve-write executable with pending");
  } else {
    fail("CI-01 approve-write executable with pending");
  }

  if (
    isWritebackRequestApprovalExecutable({
      ...base,
      checkId: "WB-SHOP-01",
      preview: readyPreview({ check_id: "WB-SHOP-01" }),
    })
  ) {
    pass("WB-SHOP-01 request approval executable");
  } else {
    fail("WB-SHOP-01 request approval executable");
  }

  if (resolveWritebackApproveWriteBlockReason({ ...base, role: "analyst", pendingApproval: pendingToken }) === "not_admin") {
    pass("analyst blocked from approve-write (duplicate guard)");
  } else {
    fail("analyst blocked");
  }

  if (resolveWritebackApproveBlockReason({ ...base, checkId: "LE-04" }) === "preview_blocked") {
    pass("LE-04 blocked");
  } else {
    fail("LE-04 blocked", resolveWritebackApproveBlockReason({ ...base, checkId: "LE-04" }));
  }

  if (resolveWritebackApproveBlockReason({ ...base, checkId: "CI-03" }) === "not_on_allowlist") {
    pass("CI-03 (Excel automated, not built) blocked");
  } else {
    fail("CI-03 blocked");
  }

  if (resolveWritebackApproveBlockReason({ ...base, preview: null }) === "no_preview") {
    pass("no preview → blocked");
  } else {
    fail("no preview → blocked");
  }

  if (
    resolveWritebackApproveBlockReason({
      ...base,
      preview: readyPreview({ summary: { ready: 0, skipped: 1, errors: 0, executed: 0 } }),
    }) === "preview_not_ready"
  ) {
    pass("ready=0 → blocked");
  } else {
    fail("ready=0 → blocked");
  }

  if (
    resolveWritebackApproveBlockReason({
      ...base,
      writebackExecuteEnabled: false,
    }) === "company_execute_disabled"
  ) {
    pass("writebacks off → company_execute_disabled");
  } else {
    fail("writebacks off → company_execute_disabled");
  }

  if (
    resolveWritebackApproveBlockReason({
      ...base,
      statusGate: "locked",
    }) === "already_executed_for_run"
  ) {
    pass("status gate locked → already_executed_for_run");
  } else {
    fail("status gate locked → already_executed_for_run");
  }

  if (
    resolveWritebackApproveBlockReason({
      ...base,
      statusGate: "no_dcs_run",
    }) === "dcs_run_required"
  ) {
    pass("WB-04/B-04: status gate no_dcs_run → dcs_run_required");
  } else {
    fail("WB-04/B-04: status gate no_dcs_run → dcs_run_required");
  }

  if (
    isWritebackRejectExecutable({
      ...base,
      pendingApproval: pendingToken,
    })
  ) {
    pass("admin can reject pending approval");
  } else {
    fail("admin can reject pending approval");
  }

  if (
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      pendingApproval: pendingToken,
    }) === "approval_already_pending"
  ) {
    pass("request blocked when approval already pending");
  } else {
    fail("request blocked when approval already pending");
  }

  if (
    isWritebackApproveWriteExecutable({
      ...base,
      writebackExecuteEnabled: true,
      preview: readyPreview({
        execute_eligible: { sandbox: false, production: false },
      }),
      pendingApproval: pendingToken,
    })
  ) {
    pass("company on → Approve & write allowed with pending (BE validates on execute)");
  } else {
    fail(
      "company on → Approve & write allowed with pending (BE validates on execute)",
      resolveWritebackApproveWriteBlockReason({
        ...base,
        writebackExecuteEnabled: true,
        preview: readyPreview({
          execute_eligible: { sandbox: false, production: false },
        }),
        pendingApproval: pendingToken,
      }),
    );
  }

  if (
    resolveWritebackApproveBlockReason({
      ...base,
      preview: readyPreview({ diff_hash: "short" }),
    }) === "invalid_diff_hash"
  ) {
    pass("bad diff_hash → blocked");
  } else {
    fail("bad diff_hash → blocked");
  }

  if (
    !isWritebackSheetExecuteAdvertised(SHEET_ROWS, "LE-01") &&
    !isWritebackApproveExecutable({
      ...base,
      checkId: "LE-01",
      preview: readyPreview({ check_id: "LE-01" }),
    })
  ) {
    pass("LE-01 sheet disabled → not executable");
  } else {
    fail("LE-01 sheet disabled → not executable");
  }

  if (
    isWritebackRequestApprovalExecutable({
      ...base,
      checkId: "CI-01",
      mappings: [],
      mappingsLoadError: true,
      preview: readyPreview({ check_id: "CI-01" }),
    })
  ) {
    pass("Slice C: mappings 500 + allowlist+sheet → request still executable");
  } else {
    fail(
      "Slice C: mappings 500 + allowlist+sheet → request still executable",
      resolveWritebackRequestApprovalBlockReason({
        ...base,
        checkId: "CI-01",
        mappings: [],
        mappingsLoadError: true,
        preview: readyPreview({ check_id: "CI-01" }),
      }),
    );
  }

  if (
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      checkId: "LE-04",
      mappings: [],
      mappingsLoadError: true,
      preview: readyPreview({ check_id: "LE-04" }),
    }) === "preview_blocked"
  ) {
    pass("Slice C: mappings 500 + LE-04 → still blocked (preview_blocked)");
  } else {
    fail("Slice C: mappings 500 + LE-04 → still blocked (preview_blocked)");
  }

  if (
    resolveWritebackRequestApprovalBlockReason({
      ...base,
      checkId: "CI-01",
      mappings: [],
      mappingsLoadError: true,
      possibleLoadError: true,
      preview: readyPreview({ check_id: "CI-01" }),
    }) === "sheet_load_error"
  ) {
    pass("Slice C: sheet + mappings both fail → sheet_load_error (no fallback)");
  } else {
    fail("Slice C: sheet + mappings both fail → sheet_load_error (no fallback)");
  }
}

function testExecuteSuccess() {
  console.log("\n3. Written only when summary.executed >= 1");
  if (
    isWritebackExecuteSuccess({
      summary: { ready: 0, skipped: 0, errors: 0, executed: 1 },
      blocked_reason: null,
    })
  ) {
    pass("executed=1 → success");
  } else {
    fail("executed=1 → success");
  }
  if (
    !isWritebackExecuteSuccess({
      summary: { ready: 1, skipped: 0, errors: 0, executed: 0 },
      blocked_reason: null,
    })
  ) {
    pass("executed=0 → not success");
  } else {
    fail("executed=0 → not success");
  }
  if (
    !isWritebackExecuteSuccess({
      summary: { ready: 0, skipped: 0, errors: 0, executed: 2 },
      blocked_reason: "writebacks_disabled",
    })
  ) {
    pass("blocked_reason → not success");
  } else {
    fail("blocked_reason → not success");
  }
}

function testStaticWiring() {
  console.log("\n4. Static wiring (Phase 2 Fix Approve chain)");

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "WRITEBACK_APPROVE_EXECUTABLE_CHECK_IDS",
    "approve allowlist constant",
  );
  assertIncludes(writebacks, "writebacks.ts", "requestWritebackApproval", "requestApproval helper");
  assertIncludes(writebacks, "writebacks.ts", "approveWritebackApproval", "approveApproval helper");
  assertIncludes(writebacks, "writebacks.ts", "executeWriteback", "executeWriteback helper");
  assertIncludes(writebacks, "writebacks.ts", "rollbackWriteback", "rollbackWriteback helper");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    '"/api/v1/writebacks/approvals/"',
    "approvals API path",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'action: "execute" satisfies WritebackRunAction',
    "execute via unified /run/",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'action: "rollback" satisfies WritebackRunAction',
    "rollback via unified /run/",
  );
  assertIncludes(writebacks, "writebacks.ts", "approval_id:", "execute sends approval_id");
  assertNotIncludes(
    writebacks,
    "writebacks.ts",
    "/writebacks/execute/",
    "no execute alias URL",
  );
  assertNotIncludes(
    writebacks,
    "writebacks.ts",
    "/writebacks/rollback/",
    "no rollback alias URL",
  );

  const fixPage = readSrc("src/routes/fix.tsx");
  assertIncludes(fixPage, "fix.tsx", "executeWriteback", "Fix wired to execute");
  assertIncludes(fixPage, "fix.tsx", "requestWritebackApproval", "Fix wired to approvals");
  assertIncludes(fixPage, "fix.tsx", "approveWritebackApproval", "Fix grants approval token");
  assertIncludes(fixPage, "fix.tsx", "rejectWritebackApproval", "Fix wired to reject approval");
  assertIncludes(
    fixPage,
    "fix.tsx",
    "grantedApprovalFromWritebackStatus",
    "Fix hydrates APPROVED unconsumed token for retry execute",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'pendingApproval.status !== "APPROVED"',
    "Fix skips re-approve when token already APPROVED",
  );
  // C1: execute-step 403 must not hit "Approval kept · retry" (ordered before execute branch).
  {
    const idx403 = fixPage.indexOf("if (status === 403)");
    const idxKept = fixPage.indexOf("Approval kept — click Approve & write again");
    const idxExecuteRetry = fixPage.indexOf('if (status === 409 || step === "execute")');
    if (idx403 >= 0 && idxKept >= 0 && idxExecuteRetry >= 0 && idx403 < idxExecuteRetry) {
      pass("C1: status===403 handled before execute-retry / Approval-kept branch");
    } else {
      fail(
        "C1: status===403 handled before execute-retry / Approval-kept branch",
        `403@${idx403} executeRetry@${idxExecuteRetry} kept@${idxKept}`,
      );
    }
    const block403 = idx403 >= 0 ? fixPage.slice(idx403, idx403 + 280) : "";
    if (
      block403.includes("writebackExecuteErrorMessage(error)") &&
      block403.includes("writebackApprovalErrorMessage(error)") &&
      block403.includes('step === "execute"')
    ) {
      pass("C1: 403 uses execute vs approval permission copy by step");
    } else {
      fail("C1: 403 uses execute vs approval permission copy by step", block403.slice(0, 120));
    }
  }
  // C2: diff_hash_mismatch unlocks re-preview (not Approval-kept retry).
  {
    const idxMismatch = fixPage.indexOf("isWritebackDiffHashMismatchError(error)");
    const idxKept = fixPage.indexOf("Approval kept — click Approve & write again");
    const idxExecuteRetry = fixPage.indexOf('if (status === 409 || step === "execute")');
    if (
      idxMismatch >= 0 &&
      idxKept >= 0 &&
      idxExecuteRetry >= 0 &&
      idxMismatch < idxExecuteRetry
    ) {
      pass("C2: diff_hash_mismatch handled before Approval-kept execute-retry");
    } else {
      fail(
        "C2: diff_hash_mismatch handled before Approval-kept execute-retry",
        `mismatch@${idxMismatch} executeRetry@${idxExecuteRetry}`,
      );
    }
    assertIncludes(
      fixPage,
      "fix.tsx",
      "requireFreshPreview",
      "C2: Fix blocks status hydrate until fresh preview",
    );
    assertIncludes(
      fixPage,
      "fix.tsx",
      "WRITEBACK_DIFF_HASH_MISMATCH_BANNER",
      "C2: Fix shows diff-hash mismatch re-preview banner",
    );
    assertIncludes(
      fixPage,
      "fix.tsx",
      'data-testid="writeback-diff-hash-mismatch-notice"',
      "C2: mismatch notice is not labeled Writeback rejected",
    );
    assertIncludes(
      fixPage,
      "fix.tsx",
      "previewStaleNotice",
      "C2: mismatch uses previewStaleNotice (not rejectionNotice)",
    );
    assertIncludes(
      fixPage,
      "fix.tsx",
      "isWritebackDcsRunRequiredError(error)",
      "C2 hygiene: dcs_run_required 409 is not Approval-kept retry",
    );
    assertIncludes(
      writebacks,
      "writebacks.ts",
      "isWritebackDiffHashMismatchError",
      "C2: diff_hash_mismatch error helper",
    );
    assertIncludes(
      writebacks,
      "writebacks.ts",
      "WRITEBACK_DIFF_HASH_MISMATCH_BANNER",
      "C2: mismatch banner copy exported",
    );
  }
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "previewResultFromWritebackStatus",
    "hydrate preview from status for cross-session admin",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "pendingApprovalFromWritebackStatus",
    "hydrate pending approval from status",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "grantedApprovalFromWritebackStatus",
    "hydrate granted approval from status",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackApprovalReadyForExecute",
    "PENDING|APPROVED ready-for-execute helper",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackApprovalExpired",
    "TTL helper for stale PENDING unlock",
  );
  assertNotIncludes(
    writebacks,
    "writebacks.ts",
    'if (token.status === "APPROVED") return false;',
    "C3: APPROVED must not bypass expires_at TTL",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackApprovalExpired(token)",
    "C3: grantedApprovalFromWritebackStatus refuses expired grants",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "livePendingApproval",
    "C3: Fix UI uses livePendingApproval (hides expired grant)",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "grantedFromStatus?.status === \"APPROVED\" && !isWritebackApprovalExpired(grantedFromStatus)",
    "C3: Fix hydrate skips expired granted status",
  );
  // C4: APPROVED recovery can force a new preview (banner CTA + tab).
  assertIncludes(
    fixPage,
    "fix.tsx",
    "handleForceWritebackPreview",
    "C4: force new preview handler while APPROVED",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'data-testid="writeback-force-new-preview"',
    "C4: APPROVED banner exposes Run new preview CTA",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'livePendingApproval?.status === "APPROVED"',
    "C4: Writeback preview tab forces re-run when APPROVED",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "you'll request approval again",
    "C4: APPROVED banner copy matches force-preview path",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "forcePreviewInFlightRef",
    "C4: force-preview failure unlocks hydrate via ref (no setState race)",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackStatusQueryKey(writebackCheckId, writebackStatusRunId)",
    "C4: preview success invalidates status (newer dry-run vs old grant)",
  );
  assertIncludes(fixPage, "fix.tsx", "hydratedPreview", "Fix restores preview from status");
  assertIncludes(fixPage, "fix.tsx", "previewResultFromWritebackStatus", "Fix uses status preview helper");
  assertIncludes(
    fixPage,
    "fix.tsx",
    'data-testid="writeback-request-approval"',
    "Request approval CTA test id",
  );
  assertIncludes(fixPage, "fix.tsx", "Approve & write", "Fix shows Approve & write CTA");
  assertIncludes(fixPage, "fix.tsx", "Reject writeback", "Fix shows Reject writeback CTA");
  assertIncludes(fixPage, "fix.tsx", "writeback-pending-approval", "Fix shows pending approval banner");
  assertIncludes(fixPage, "fix.tsx", "writeback-rejection-notice", "Fix shows rejection notice");
  assertIncludes(fixPage, "fix.tsx", "WRITEBACK_REJECTED_BANNER", "Fix uses rejection banner copy");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "resolveWritebackRequestApprovalBlockReason",
    "split request approval eligibility",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "resolveWritebackApproveWriteBlockReason",
    "split approve-write eligibility",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "resolveWritebackRejectBlockReason",
    "split reject eligibility",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackAllowlistSheetExecutable",
    "Slice C allowlist+sheet fallback when mappings fail",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackMappingsLoadSoftNotice",
    "Slice C mappings soft notice helper",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-mappings-soft-notice",
    "Fix mappings soft notice banner",
  );
  assertIncludes(fixPage, "fix.tsx", "rollbackWriteback", "Fix wired to rollback");
  assertIncludes(fixPage, "fix.tsx", "isWritebackExecuteSuccess", "Written gated on execute success");
  assertIncludes(fixPage, "fix.tsx", "AUDIT_NOTIFICATIONS_QUERY_KEY", "invalidates audit bell");
  assertIncludes(fixPage, "fix.tsx", "Demo plan · writebacks off", "fixture honest copy");
  assertNotIncludes(fixPage, "fix.tsx", "setApproved(true)", "no fake setApproved(true)");
  assertNotIncludes(
    fixPage,
    "fix.tsx",
    "Writebacks are not enabled yet",
    "removed fake not-enabled toast path",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "DCS_WORKLIST_QUERY_KEY",
    "invalidates worklist after execute",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'writebackPreviewToTable(executeResult, "executed")',
    "post-execute table uses executed phase",
  );
}

function testPostExecutePolish() {
  console.log("\n6. Post-execute polish (helper, status, summary)");

  function formatIntentStatus(status, errorReason, phase = "preview") {
    if (phase === "executed" && (status === "ready" || status === "executed")) {
      return "Executed";
    }
    if (status === "ready") return "Ready";
    if (status === "executed") return "Executed";
    return status;
  }

  function writebackPreviewToTable(result, phase = "preview") {
    const rows = result.intents.map((intent) =>
      formatIntentStatus(intent.status, intent.error_reason, phase),
    );
    const { ready, skipped, errors, executed } = result.summary;
    const summaryLine =
      phase === "executed"
        ? `${executed} executed · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`
        : `${ready} ready · ${skipped} skipped · ${errors} error${errors === 1 ? "" : "s"}`;
    let helper =
      "Dry-run preview from the writeback service. No changes were sent to Manago or Shopify.";
    if (phase === "executed") {
      helper = "Write applied · updates sent to Manago.ai.";
    }
    return { rows, helper, summaryLine };
  }

  const previewSample = {
    intents: [{ status: "ready", error_reason: null, target: "manago" }],
    summary: { ready: 1, skipped: 0, errors: 0, executed: 0 },
  };
  const previewTable = writebackPreviewToTable(previewSample, "preview");
  if (previewTable.helper.includes("Dry-run preview")) pass("preview helper is dry-run");
  else fail("preview helper is dry-run", previewTable.helper);
  if (previewTable.rows[0] === "Ready") pass("preview status Ready");
  else fail("preview status Ready", previewTable.rows[0]);

  const executeSample = {
    intents: [{ status: "ready", error_reason: null, target: "manago" }],
    summary: { ready: 0, skipped: 0, errors: 0, executed: 1 },
  };
  const executedTable = writebackPreviewToTable(executeSample, "executed");
  if (executedTable.helper.includes("Write applied")) {
    pass("executed helper says write applied");
  } else {
    fail("executed helper says write applied", executedTable.helper);
  }
  if (executedTable.rows[0] === "Executed") pass("executed status Executed");
  else fail("executed status Executed", executedTable.rows[0]);
  if (executedTable.summaryLine.startsWith("1 executed")) {
    pass("executed summary line uses executed count");
  } else {
    fail("executed summary line uses executed count", executedTable.summaryLine);
  }

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'WritebackTablePhase = "preview" | "executed"',
    "WritebackTablePhase exported",
  );
}

function testRollbackAndHonesty() {
  console.log("\n5. Phase 3 rollback + Phase 4 non-writable honesty");

  // Mirror helpers from writebacks.ts for LE-04 / CI-03 honesty
  function resolveWritebackStructuralBlockReason(input) {
    const checkId = input.checkId?.trim().toUpperCase() || null;
    if (!checkId) return "missing_check";
    if (input.possibleLoadError) return "sheet_load_error";
    if (WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS.includes(checkId)) return "preview_blocked";
    if (!isWritebackApproveAllowlisted(checkId)) return "not_on_allowlist";
    if (!isWritebackSheetExecuteAdvertised(input.possibleRows, checkId)) {
      return "sheet_not_executable";
    }
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

  function writebackNonExecutableHonesty(checkId, possibleRows) {
    const reason = resolveWritebackStructuralBlockReason({ checkId, possibleRows });
    if (!reason) return null;
    if (reason === "preview_blocked" || checkId === "LE-04") {
      return {
        title: "No automated writeback for this check",
        detail: "LE-04 blocked",
      };
    }
    if (reason === "not_on_allowlist" || reason === "sheet_not_executable") {
      return {
        title: "No automated writeback for this check yet",
        detail: "evidence only",
      };
    }
    return { title: "Writeback not available", detail: reason };
  }

  const le04 = writebackNonExecutableHonesty("LE-04", SHEET_ROWS);
  if (le04?.title.includes("No automated writeback")) pass("LE-04 honesty title");
  else fail("LE-04 honesty title", le04?.title);

  const ci03 = writebackNonExecutableHonesty("CI-03", SHEET_ROWS);
  if (ci03?.title.includes("No automated writeback for this check yet")) {
    pass("CI-03 Excel-rest honesty");
  } else {
    fail("CI-03 Excel-rest honesty", ci03?.title);
  }

  const cc03 = writebackNonExecutableHonesty("CC-03", SHEET_ROWS);
  if (cc03 == null) pass("CC-03 has no structural honesty banner");
  else fail("CC-03 has no structural honesty banner", JSON.stringify(cc03));

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackNonExecutableHonesty",
    "Phase 4 honesty helper exported",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "resolveWritebackStructuralBlockReason",
    "structural block helper",
  );

  const fixPage = readSrc("src/routes/fix.tsx");
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackPreviewMutation.reset()",
    "Phase 3: rollback clears preview",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "Rolled back · run writeback preview again before approve",
    "Phase 3: re-preview required copy",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackNonExecutableHonesty",
    "Phase 4: Fix uses honesty helper",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "Evidence only · no automated write from this screen.",
    "Phase 4: gov honesty for non-writable",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "Writeback preview is not available for this check",
    "Phase 4: preview hidden honesty",
  );
  assertNotIncludes(
    fixPage,
    "fix.tsx",
    "Download Excel",
    "Phase 4: no misleading Download Excel label",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "companyWritebackExecuteEnabled",
    "WB-03: Fix gates Approve on company writeback flag",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackExecuteEnabled",
    "WB-03: passes writebackExecuteEnabled to eligibility",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'search={{ tab: "workspace" }}',
    "WB-03: Settings deep-link when writebacks off",
  );
  assertNotIncludes(
    fixPage,
    "fix.tsx",
    "Writing to sandbox",
    "WB-03: removed sandbox approve copy",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "company_execute_disabled",
    "WB-03: company execute block reason",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "already_executed_for_run",
    "WB-04: already_executed_for_run block reason",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "getWritebackStatus",
    "WB-06: getWritebackStatus client",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "/api/v1/writebacks/status/",
    "WB-06: status endpoint path",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writeback_already_executed_for_run",
    "WB-04: maps 409 writeback_already_executed_for_run",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "getWritebackStatus",
    "WB-06: Fix fetches writeback status",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackStatusQueryKey",
    "WB-06: Fix status query key",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "statusGate",
    "WB-04: eligibility uses statusGate",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackProvenanceLine",
    "WB-06: provenance line on Written state",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "isWritebackAlreadyExecutedForRunError",
    "WB-04: 409 already-executed hydrates locked UI",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "executeResultFromWritebackStatus",
    "WB-06: hydrate execute result from status",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackActivityDeepLink",
    "WB-06: Activity deep-link helper",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackActivityDeepLink",
    "WB-06: Fix View in Activity uses deep-link",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "executeResultFromWritebackStatus",
    "WB-06: Fix hydrates Written from status",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    'gate === "open"',
    "WB-06: Fix clears Written when gate opens",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackStatusReady",
    "WB-06: Approve waits for status gate",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "setWritten(true)",
    "WB-04: 409 optimistically locks Written",
  );

  const activityPage = readSrc("src/routes/activity.tsx");
  assertIncludes(
    activityPage,
    "activity.tsx",
    "validateSearch",
    "WB-06: Activity accepts search focus params",
  );
  assertIncludes(
    activityPage,
    "activity.tsx",
    "eventMatchesActivityFocus",
    "WB-06: Activity highlights writeback focus",
  );

  // Optional FE unit: hydrate Written fields from status fixture (PRD-WB-06 §6).
  function executeResultFromWritebackStatus(status) {
    const latest = status.latest_execute;
    if (!latest?.job_id) return null;
    return {
      check_id: status.check_id,
      mode: "execute",
      diff_hash: latest.diff_hash,
      blocked_reason: null,
      job_id: latest.job_id,
      data_run_id: latest.data_run_id ?? status.data_run_id,
      intents: latest.intents ?? [],
      summary: latest.summary ?? {
        ready: 0,
        skipped: 0,
        errors: 0,
        executed: 0,
      },
    };
  }

  const lockedStatus = {
    check_id: "CI-01",
    data_run_id: 128,
    gate: "locked",
    latest_execute: {
      job_id: "a1b2c3d4-5678-90ab-cdef-111111111111",
      status: "executed",
      diff_hash: "abc123",
      summary: { ready: 0, skipped: 0, errors: 0, executed: 2 },
      intents: [
        {
          operation: "upsert",
          target: "manago",
          namespace: "contact",
          entity_key: "mc-1",
          before: null,
          after: { email: "a@example.com" },
          status: "executed",
          error_reason: null,
          execute_result: null,
        },
      ],
      data_run_id: 128,
      rolled_back_at: null,
    },
    latest_preview: null,
  };
  const hydrated = executeResultFromWritebackStatus(lockedStatus);
  if (
    hydrated &&
    hydrated.job_id === lockedStatus.latest_execute.job_id &&
    hydrated.check_id === "CI-01" &&
    hydrated.data_run_id === 128 &&
    hydrated.diff_hash === "abc123" &&
    hydrated.summary.executed === 2 &&
    hydrated.intents.length === 1 &&
    hydrated.intents[0].entity_key === "mc-1"
  ) {
    pass("WB-06: hydrate Written from locked status fixture");
  } else {
    fail("WB-06: hydrate Written from locked status fixture", JSON.stringify(hydrated));
  }
  if (executeResultFromWritebackStatus({ ...lockedStatus, latest_execute: null }) === null) {
    pass("WB-06: open status does not hydrate execute result");
  } else {
    fail("WB-06: open status does not hydrate execute result");
  }

  function writebackActivityDeepLink(options) {
    const check = options.checkId?.trim();
    const job = options.jobId?.trim();
    const search = { action: "writeback.executed" };
    if (check) search.check = check;
    if (job) search.job = job;
    return { to: "/activity", search };
  }
  const deep = writebackActivityDeepLink({
    checkId: "CI-01",
    jobId: "a1b2c3d4-5678",
  });
  if (
    deep.to === "/activity" &&
    deep.search.check === "CI-01" &&
    deep.search.action === "writeback.executed" &&
    deep.search.job === "a1b2c3d4-5678"
  ) {
    pass("WB-06: Activity deep-link includes check + action + job");
  } else {
    fail("WB-06: Activity deep-link includes check + action + job", JSON.stringify(deep));
  }
}

function testPreviewHydrationFromStatus() {
  console.log("\n7. W5-01 cross-session preview hydration");

  function previewResultFromWritebackStatus(status) {
    const latest = status.latest_preview;
    if (!latest?.job_id) return null;
    return {
      check_id: latest.check_id ?? status.check_id,
      mode: latest.mode ?? "dry_run",
      diff_hash: latest.diff_hash ?? null,
      job_id: latest.job_id,
      summary: latest.summary ?? { ready: 0, skipped: 0, errors: 0, executed: 0 },
      intents: latest.intents ?? [],
    };
  }

  const statusFixture = {
    check_id: "CI-01",
    latest_preview: {
      job_id: "11111111-1111-1111-1111-111111111111",
      check_id: "CI-01",
      mode: "dry_run",
      diff_hash: VALID_HASH,
      summary: { ready: 2, skipped: 0, errors: 0, executed: 0 },
      intents: [{ status: "ready", target: "manago" }],
    },
    latest_pending_approval: {
      approval_id: "22222222-2222-2222-2222-222222222222",
      status: "PENDING",
      diff_hash: VALID_HASH,
      job_id: "11111111-1111-1111-1111-111111111111",
      object_id: "CI-01",
    },
  };

  const hydrated = previewResultFromWritebackStatus(statusFixture);
  if (
    hydrated &&
    hydrated.job_id === statusFixture.latest_pending_approval.job_id &&
    hydrated.summary.ready === 2 &&
    hydrated.intents.length === 1
  ) {
    pass("status hydrates preview for pending approval job");
  } else {
    fail("status hydrates preview for pending approval job", JSON.stringify(hydrated));
  }
}

function main() {
  console.log("WB-02 Phase 2–4 frontend verification");
  testAllowlist();
  testEligibility();
  testExecuteSuccess();
  testStaticWiring();
  testRollbackAndHonesty();
  testPostExecutePolish();
  testPreviewHydrationFromStatus();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WB-02 Phase 2–4 frontend checks passed.");
}

main();
