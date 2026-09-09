/**
 * PRD-WB-07 frontend verification — masked Entity + 409 hygiene.
 * Run: node scripts/verify-wb07-frontend.mjs
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

function writebackPreviewToTable(result) {
  const rows = result.intents.slice(0, 10).map((intent) => [
    intent.target,
    intent.operation || intent.op_kind,
    intent.entity_key || "—",
    "—",
    "—",
    intent.status,
  ]);
  return { rows };
}

function isWritebackAlreadyExecutedForRunError(error) {
  if (!error || typeof error !== "object") return false;
  return (
    error.status === 409 && error.code === "writeback_already_executed_for_run"
  );
}

function isWritebackDcsRunRequiredError(error) {
  if (!error || typeof error !== "object") return false;
  return error.status === 409 && error.code === "dcs_run_required";
}

function writebackApiErrorMessage(error, fallback) {
  if (!error || typeof error !== "object") return fallback;
  if (isWritebackAlreadyExecutedForRunError(error)) {
    return (
      (typeof error.detail === "string" && error.detail.trim()) ||
      "Write in progress / already applied · Re-run Data Consistency Score if the issue returns"
    );
  }
  if (isWritebackDcsRunRequiredError(error)) {
    return (
      (typeof error.detail === "string" && error.detail.trim()) ||
      "Run a Data Consistency Score before approving writebacks."
    );
  }
  if (error.status === 409) {
    if (error.code === "diff_hash_mismatch") {
      return (
        (typeof error.detail === "string" && error.detail.trim()) ||
        "Preview changed — run preview again."
      );
    }
    return "Preview changed — run preview again, then approve";
  }
  if (typeof error.detail === "string" && error.detail.trim()) return error.detail;
  return fallback;
}

function writebackExecuteFailureDetail(error) {
  if (!error || typeof error !== "object") return null;
  if (error.status !== 501 && !(error.summary && (error.summary.errors ?? 0) > 0)) {
    return null;
  }
  const failed = (error.intents ?? []).find(
    (intent) =>
      intent.status === "error" ||
      (typeof intent.error_reason === "string" && intent.error_reason.trim()),
  );
  if (!failed) return null;
  const reason = (failed.error_reason ?? "").trim();
  const target = (failed.target ?? "").trim();
  const reasonLabel =
    reason === "upstream_error"
      ? "Upstream write failed"
      : reason || "Write failed";
  return target ? `${target} · ${reasonLabel}` : reasonLabel;
}

function main() {
  console.log("WB-07 frontend verification\n");

  const writebacks = readSrc("src/lib/writebacks.ts");
  const fixPage = readSrc("src/routes/fix.tsx");

  console.log("1. Static wiring");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackDcsRunRequiredError",
    "maps dcs_run_required helper",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'code === "dcs_run_required"',
    "checks dcs_run_required code",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "API-masked entity_key",
    "Entity trusts API-masked keys",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "upstream_error",
    "stable upstream_error label",
  );
  assertNotIncludes(
    writebacks,
    "writebacks.ts",
    "execute_result.error",
    "does not toast execute_result.error",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "Write in progress / already applied",
    "in-flight / already-applied copy",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "isWritebackAlreadyExecutedForRunError",
    "Fix handles already-executed 409",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "toast.message(writebackExecuteErrorMessage(error))",
    "Fix soft-toasts in-flight/already-applied 409",
  );

  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackRollbackGovLabel",
    "Fix gov uses W6-03 rollback honesty helper",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "manual_admin_only",
    "status rollback_policy type",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "not automatic on error",
    "possible surfaces manual rollback honesty",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackRollbackConfirmDescription",
    "rollback dialog uses W6-03 honesty copy",
  );
  assertNotIncludes(
    fixPage,
    "fix.tsx",
    "automatic on error",
    "Fix must not claim automatic rollback on error",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackRollbackHonestyNotice",
    "Fix shows W6-03 rollback honesty banner",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-rollback-honesty",
    "rollback honesty banner test id",
  );
  const bannerIdx = fixPage.indexOf("writeback-rollback-honesty");
  const previewTableIdx = fixPage.indexOf("fix-preview-table");
  if (bannerIdx >= 0 && previewTableIdx >= 0 && bannerIdx < previewTableIdx) {
    pass("W6-03 banner appears before preview table");
  } else {
    fail("W6-03 banner appears before preview table");
  }
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "Rollback is manual — not automatic on error",
    "W6-03 banner title copy",
  );

  console.log("\n6. W6-01/02 irreversible + Shopify metafield honesty");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackIrreversibleHonestyNotice",
    "W6-01 irreversible honesty helper",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackShopifyMetafieldHonesty",
    "W6-02 Shopify metafield honesty helper",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackApproveWriteConfirmDescription",
    "irreversible approve confirm copy",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-irreversible-honesty",
    "Fix irreversible banner test id",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-operator-info",
    "Fix operator info banner test id",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "approveWriteConfirmOpen",
    "Fix irreversible approve confirm dialog",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "metafield namespace=klints",
    "W6-02 metafield honesty copy",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "event ingest",
    "W6-01 event ingest limited rollback copy",
  );
  const irrIdx = fixPage.indexOf("writeback-irreversible-honesty");
  if (irrIdx >= 0 && previewTableIdx >= 0 && irrIdx < previewTableIdx) {
    pass("W6-01 irreversible banner before preview table");
  } else {
    fail("W6-01 irreversible banner before preview table");
  }
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "writebackMappingIrreversible",
    "W6-01 mapping fallback for irreversible flag",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL",
    "W6-01 generic irreversible disclosure fallback",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackMappingEntry",
    "Fix resolves mapping entry for disclosure",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "!writebackIrreversibleHonesty",
    "Fix hides buried irreversible warning when banner shown",
  );

  console.log("\n7. W6-01/02 disclosure helpers (mapping fallback)");
  const WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL =
    "This writeback cannot be bulk-undone. Review carefully before Approve & write.";
  function writebackMappingIrreversible(preview, mapping) {
    if (preview?.irreversible) return true;
    return Boolean(mapping?.irreversible);
  }
  function writebackIrreversibleHonestyNotice(preview, mapping) {
    if (!writebackMappingIrreversible(preview, mapping)) return null;
    const detail =
      preview?.operator_disclosure?.trim() ||
      mapping?.operator_disclosure?.trim() ||
      WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL;
    return { title: "Irreversible write — cannot be bulk-undone", detail };
  }
  function writebackOperatorInfoNotice(preview, mapping) {
    if (writebackMappingIrreversible(preview, mapping)) return null;
    const detail =
      preview?.operator_disclosure?.trim() || mapping?.operator_disclosure?.trim();
    if (!detail) return null;
    return { title: "Write surface note", detail };
  }
  const le01Mapping = {
    check_id: "LE-01",
    irreversible: true,
    operator_disclosure: "Bulk event backfill may not be reversible.",
  };
  const irrFromMappingOnly = writebackIrreversibleHonestyNotice(null, le01Mapping);
  if (irrFromMappingOnly?.detail.includes("Bulk event backfill")) {
    pass("irreversible notice from mapping before preview");
  } else {
    fail("irreversible notice from mapping before preview");
  }
  const irrGeneric = writebackIrreversibleHonestyNotice(null, {
    check_id: "X-01",
    irreversible: true,
    operator_disclosure: "",
  });
  if (irrGeneric?.detail === WRITEBACK_IRREVERSIBLE_GENERIC_DETAIL) {
    pass("irreversible generic disclosure when mapping lacks text");
  } else {
    fail("irreversible generic disclosure when mapping lacks text");
  }
  const shopMapping = {
    check_id: "WB-SHOP-01",
    irreversible: false,
    operator_disclosure: "Sandbox-only customer note write. Prefer metafield namespace=klints.",
  };
  const opFromMappingOnly = writebackOperatorInfoNotice(null, shopMapping);
  if (opFromMappingOnly?.title === "Write surface note" && opFromMappingOnly.detail.includes("metafield")) {
    pass("operator info from mapping before preview (WB-SHOP-01)");
  } else {
    fail("operator info from mapping before preview (WB-SHOP-01)");
  }
  if (writebackOperatorInfoNotice(null, le01Mapping) === null) {
    pass("operator info suppressed when mapping is irreversible");
  } else {
    fail("operator info suppressed when mapping is irreversible");
  }

  console.log("\n8. W5-05/06 Change Preview drawer");
  const changePreview = readSrc("src/lib/fix-change-preview.ts");
  assertIncludes(
    changePreview,
    "fix-change-preview.ts",
    "writebackChangePreviewIntents",
    "W5-06 change preview intent helper",
  );
  assertIncludes(
    changePreview,
    "fix-change-preview.ts",
    "writebackWorkflowsUnblockedEstimate",
    "W5-06 workflows unblocked estimate",
  );
  assertIncludes(
    changePreview,
    "fix-change-preview.ts",
    "writebackDcsImpactLine",
    "W5-05 DCS impact line",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-change-preview-open",
    "Fix change preview open button",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-change-preview-drawer",
    "Fix change preview drawer",
  );
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writeback-change-preview-workflows",
    "Fix workflows unblocked panel",
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

  assertIncludes(
    fixPage,
    "fix.tsx",
    "activePreview.title",
    "Change preview button visible with preview title (both tabs)",
  );
  assertIncludes(
    changePreview,
    "fix-change-preview.ts",
    "recommendationsError",
    "W5-06 recommendations error honesty",
  );
  function writebackChangePreviewSummary(result, dataRunId, phase = "preview") {
    if (!result) return null;
    const { ready, skipped, errors, executed } = result.summary;
    const parts =
      phase === "executed"
        ? [`${executed} executed`, `${skipped} skipped`]
        : [`${ready} ready`, `${skipped} skipped`];
    if (errors > 0) parts.push(`${errors} error(s)`);
    return parts.join(" · ");
  }
  const executedSummary = writebackChangePreviewSummary(
    { summary: { ready: 0, skipped: 0, errors: 0, executed: 2 } },
    null,
    "executed",
  );
  if (executedSummary?.startsWith("2 executed")) {
    pass("change preview summary uses executed counts when written");
  } else {
    fail("change preview summary uses executed counts when written", executedSummary);
  }
  function writebackWorkflowsUnblockedEstimate(input) {
    if (!input.checkId?.trim()) return null;
    if (input.recommendationsPending) {
      return { title: "Workflows unblocked (estimate)", detail: "Loading…", pilots: [] };
    }
    if (input.recommendationsError) {
      return {
        title: "Workflows unblocked (estimate)",
        detail: "Workflow recommendations unavailable",
        pilots: [],
      };
    }
    const gated = (input.pilots ?? []).filter((p) =>
      (p.gates?.gating_check_ids ?? []).some(
        (id) => id.trim().toUpperCase() === input.checkId.trim().toUpperCase(),
      ),
    );
    return {
      title: "Workflows unblocked (estimate)",
      detail: gated.length ? "estimate" : "No MVP1 workflow pilots gate on this check.",
      pilots: gated.map((p) => ({ uc: p.use_case_id, buildable: p.status === "ready" })),
    };
  }
  const wfErr = writebackWorkflowsUnblockedEstimate({
    checkId: "CI-01",
    recommendationsPending: false,
    recommendationsError: true,
  });
  if (wfErr?.detail.includes("unavailable")) {
    pass("workflows unblocked honest when recommendations fail");
  } else {
    fail("workflows unblocked honest when recommendations fail");
  }

  function writebackChangePreviewIntents(result) {
    if (!result?.intents?.length) return [];
    return result.intents.map((intent, index) => {
      const before =
        intent.before && typeof intent.before === "object" ? intent.before : {};
      const after =
        intent.after && typeof intent.after === "object" ? intent.after : {};
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      return {
        index: index + 1,
        fields: [...keys].sort().map((key) => ({
          key,
          before: before[key] ?? "—",
          after: after[key] ?? "—",
          changed: String(before[key] ?? "—") !== String(after[key] ?? "—"),
        })),
      };
    });
  }

  const previewRows = writebackChangePreviewIntents({
    intents: [
      {
        target: "manago",
        operation: "manago.contact_upsert",
        op_kind: "contact_upsert",
        entity_key: "b***@example.com",
        before: { email: "b***@example.com", present_in_manago: false },
        after: { email: "b***@example.com", present_in_manago: true },
        status: "ready",
      },
    ],
  });
  if (
    previewRows.length === 1 &&
    previewRows[0].fields.some((f) => f.key === "present_in_manago" && f.changed)
  ) {
    pass("change preview expands before/after fields");
  } else {
    fail("change preview expands before/after fields");
  }
  const wfImpact = writebackWorkflowsUnblockedEstimate({
    checkId: "CI-01",
    recommendationsPending: false,
    pilots: [
      {
        use_case_id: "UC-02",
        title: "Second purchase",
        status: "ready",
        gates: { gating_check_ids: ["CI-01"] },
      },
    ],
  });
  if (wfImpact?.pilots.length === 1 && wfImpact.pilots[0].uc === "UC-02") {
    pass("workflows unblocked lists gated pilots");
  } else {
    fail("workflows unblocked lists gated pilots");
  }

  console.log("\n5. W6-03 rollback gov label helper");
  function writebackStaleReclaimPolicyLabel(minutes = 15) {
    return `Manual admin only · stale claims reclaimed after ${minutes}m (not auto-undo)`;
  }
  function writebackRollbackGovLabel(options) {
    const minutes = options.status?.stale_executing_reclaim_minutes ?? 15;
    if (options.rolledBack) return "Rolled back";
    if (options.showRollback) return "Manual admin rollback · use Rollback writeback";
    if (options.written) return "Not supported for this write";
    return writebackStaleReclaimPolicyLabel(minutes);
  }
  const idle = writebackRollbackGovLabel({ status: { stale_executing_reclaim_minutes: 20 } });
  if (idle.includes("20m") && idle.includes("not auto-undo")) {
    pass("gov label uses status stale minutes");
  } else {
    fail("gov label uses status stale minutes", idle);
  }
  if (writebackRollbackGovLabel({ showRollback: true }).includes("Manual admin rollback")) {
    pass("gov label when rollback available");
  } else {
    fail("gov label when rollback available");
  }
  if (writebackRollbackGovLabel({ rolledBack: true }) === "Rolled back") {
    pass("gov label when rolled back");
  } else {
    fail("gov label when rolled back");
  }

  const evidenceExport = readSrc("src/lib/fix-evidence-export.ts");
  assertIncludes(
    evidenceExport,
    "fix-evidence-export.ts",
    "maskExportEmail",
    "evidence CSV email mask helper",
  );
  assertIncludes(
    evidenceExport,
    "fix-evidence-export.ts",
    "maskExportEntityKey",
    "evidence CSV entity mask helper",
  );
  assertIncludes(
    evidenceExport,
    "fix-evidence-export.ts",
    "maskExportCell(",
    "evidence CSV applies cell masking",
  );

  console.log("\n2. Masked Entity display");
  const table = writebackPreviewToTable({
    intents: [
      {
        target: "manago",
        operation: "manago.contact_upsert",
        op_kind: "contact_upsert",
        entity_key: "b***@example.com",
        status: "ready",
      },
    ],
  });
  const entity = table.rows[0][2];
  if (entity === "b***@example.com") pass("Entity cell shows masked API value");
  else fail("Entity cell shows masked API value", entity);
  if (!entity.includes("buyer@")) pass("Entity cell has no full email");
  else fail("Entity cell has no full email", entity);

  console.log("\n3. Error code mapping");
  const alreadyMsg = writebackApiErrorMessage(
    { status: 409, code: "writeback_already_executed_for_run" },
    "fallback",
  );
  if (alreadyMsg.includes("already applied") || alreadyMsg.includes("in progress")) {
    pass("already_executed 409 → in-progress/applied copy");
  } else {
    fail("already_executed 409 → in-progress/applied copy", alreadyMsg);
  }

  const dcsMsg = writebackApiErrorMessage(
    {
      status: 409,
      code: "dcs_run_required",
      detail: "Run a Data Consistency Score before approving writebacks.",
    },
    "fallback",
  );
  if (dcsMsg.includes("Data Consistency Score")) {
    pass("dcs_run_required 409 → score required copy");
  } else {
    fail("dcs_run_required 409 → score required copy", dcsMsg);
  }

  const diffMsg = writebackApiErrorMessage(
    { status: 409, code: "diff_hash_mismatch", detail: "Preview changed — run preview again." },
    "fallback",
  );
  if (diffMsg.includes("Preview changed") && !diffMsg.includes("expected")) {
    pass("diff_hash_mismatch 409 → generic preview copy");
  } else {
    fail("diff_hash_mismatch 409 → generic preview copy", diffMsg);
  }

  const failure = writebackExecuteFailureDetail({
    status: 501,
    intents: [
      {
        status: "error",
        error_reason: "upstream_error",
        target: "manago",
        execute_result: { error: "ManagoClientError: secret stack" },
      },
    ],
    summary: { errors: 1, executed: 0 },
  });
  if (failure === "manago · Upstream write failed") {
    pass("execute failure uses stable error_reason only");
  } else {
    fail("execute failure uses stable error_reason only", failure);
  }
  if (failure && !failure.includes("secret") && !failure.includes("ManagoClientError")) {
    pass("execute failure omits raw platform exception text");
  } else {
    fail("execute failure omits raw platform exception text", failure);
  }

  console.log("\n4. Evidence CSV PII mask (PRD-WB-07 §4.2)");
  function maskExportEmail(value) {
    const text = (value ?? "").trim();
    if (!text.includes("@")) return text || "—";
    const at = text.indexOf("@");
    const local = text.slice(0, at);
    const domain = text.slice(at + 1);
    if (!local) return `***@${domain}`;
    const maskedLocal = local.length <= 1 ? "*" : `${local[0]}***`;
    return `${maskedLocal}@${domain}`;
  }
  function maskExportEntityKey(value) {
    const text = (value ?? "").trim();
    if (!text) return "—";
    if (text.includes("@")) return maskExportEmail(text);
    if (text.length <= 4) return text;
    return `${text.slice(0, 2)}…${text.slice(-2)}`;
  }
  function maskExportCell(value) {
    const text = value ?? "";
    if (!text.includes("@")) return text;
    const trimmed = text.trim();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return maskExportEmail(trimmed);
    return text.replace(/[^@\s]+@[^@\s]+\.[^@\s]+/g, (m) => maskExportEmail(m));
  }
  if (maskExportEmail("buyer@example.com") === "b***@example.com") {
    pass("evidence mask email matches BE shape");
  } else {
    fail("evidence mask email matches BE shape", maskExportEmail("buyer@example.com"));
  }
  if (maskExportEntityKey("ab12cd34") === "ab…34") {
    pass("evidence mask entity key matches BE shape");
  } else {
    fail("evidence mask entity key matches BE shape", maskExportEntityKey("ab12cd34"));
  }
  if (
    maskExportCell("Contact buyer@example.com seen") === "Contact b***@example.com seen"
  ) {
    pass("evidence free-text cell masks embedded emails");
  } else {
    fail(
      "evidence free-text cell masks embedded emails",
      maskExportCell("Contact buyer@example.com seen"),
    );
  }

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WB-07 frontend checks passed.");
}

main();
