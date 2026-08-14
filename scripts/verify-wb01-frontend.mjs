/**
 * WB-01 frontend verification — PRD §9 optional FE acceptance.
 * Run: npm run verify:wb01
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
  else fail(label, `missing in ${rel}: ${needle.slice(0, 80)}`);
}

function assertNotIncludes(src, rel, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden in ${rel}: ${needle.slice(0, 80)}`);
}

// --- Mirror helpers (keep in sync with src/lib/writebacks.ts) ---
const WRITEBACK_PREVIEW_COLUMNS = [
  "Target",
  "Operation",
  "Entity",
  "Before",
  "After",
  "Status",
];

function friendlyTarget(target) {
  if (target === "manago") return "Manago.ai";
  if (target === "shopify") return "Shopify";
  return target;
}

function formatPatchCell(value) {
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

function formatIntentStatus(status, errorReason) {
  if (status === "ready") return "Ready";
  if (status === "error" && errorReason) return `Error · ${errorReason}`;
  if (status === "skipped") return "Skipped";
  if (status === "executed") return "Executed";
  return status;
}

function writebackPreviewToTable(result) {
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

  return { columns: [...WRITEBACK_PREVIEW_COLUMNS], rows, helper, summaryLine };
}

function isWritebackMappingEnabled(mappings, checkId) {
  if (!checkId?.trim() || !mappings?.length) return false;
  const id = checkId.trim().toUpperCase();
  return mappings.some((row) => row.check_id.toUpperCase() === id && row.enabled);
}

function testPreviewFormatter() {
  console.log("\n1. Preview table formatter (PRD §9)");

  const sample = {
    check_id: "LE-04",
    mode: "dry_run",
    diff_hash: "a".repeat(64),
    blocked_reason: null,
    irreversible: true,
    operator_disclosure: "Duplicate event cleanup may not be reversible in bulk.",
    intents: [
      {
        op_kind: "tag_add",
        operation: "manago.tag_add.duplicate_review",
        target: "manago",
        namespace: "klints:",
        entity_key: "a***@example.com",
        before: { tag: null },
        after: { tag: "klints:duplicate_review" },
        status: "ready",
        error_reason: null,
      },
    ],
    summary: { ready: 1, skipped: 0, errors: 0, executed: 0 },
    execute_eligible: { sandbox: true, production: false },
    approval_tier: "batch",
  };

  const table = writebackPreviewToTable(sample);
  if (table.columns.length === 6) pass("preview table has 6 columns");
  else fail("preview table has 6 columns", `got ${table.columns.length}`);

  const cellBlob = table.rows.flat().join(" ");
  if (!cellBlob.includes("{")) pass("preview rows avoid raw JSON object dumps");
  else fail("preview rows avoid raw JSON object dumps");

  if (table.rows[0][0] === "Manago.ai") pass("target label is customer-friendly");
  else fail("target label is customer-friendly", table.rows[0][0]);

  if (table.helper.includes("Dry-run preview")) pass("helper mentions dry-run");
  else fail("helper mentions dry-run");

  if (table.helper.includes("not be reversible")) pass("irreversible disclosure in helper");
  else fail("irreversible disclosure in helper");

  if (table.summaryLine === "1 ready · 0 skipped · 0 errors") {
    pass("summary line counts intents");
  } else {
    fail("summary line counts intents", table.summaryLine);
  }
}

function testMappingGate() {
  console.log("\n2. Mapping enabled gate");

  const mappings = [
    { check_id: "LE-04", enabled: true },
    { check_id: "CI-01", enabled: true },
    { check_id: "SP-01", enabled: false },
  ];

  if (isWritebackMappingEnabled(mappings, "le-04")) pass("enabled mapping detected case-insensitively");
  else fail("enabled mapping detected case-insensitively");

  if (!isWritebackMappingEnabled(mappings, "SP-01")) pass("disabled mapping rejected");
  else fail("disabled mapping rejected");

  if (!isWritebackMappingEnabled(mappings, "ZZ-99")) pass("unknown mapping rejected");
  else fail("unknown mapping rejected");
}

function testStaticWiring() {
  console.log("\n3. Static wiring (PRD §9)");

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(writebacks, "writebacks.ts", '"/api/v1/writebacks/mappings/"', "mappings API wired");
  assertIncludes(writebacks, "writebacks.ts", '"/api/v1/writebacks/preview/"', "preview API wired");
  assertIncludes(writebacks, "writebacks.ts", "writebackPreviewToTable", "preview table formatter exported");
  assertIncludes(writebacks, "writebacks.ts", "writebackPreviewMeta", "preview meta helper exported");
  assertIncludes(writebacks, "writebacks.ts", "isWritebackMappingEnabled", "mapping gate exported");
  assertNotIncludes(writebacks, "writebacks.ts", "/writebacks/execute/", "no execute API on FE yet");

  const fixPage = readSrc("src/routes/fix.tsx");
  assertIncludes(fixPage, "fix.tsx", "getWritebackMappings", "Fix loads mappings");
  assertIncludes(fixPage, "fix.tsx", "previewWriteback", "Fix calls preview API");
  assertIncludes(fixPage, "fix.tsx", "Writeback preview", "preview button label present");
  assertIncludes(fixPage, "fix.tsx", 'previewTab === "writeback"', "writeback tab state");
  assertIncludes(fixPage, "fix.tsx", "Approve writeback · Coming soon", "approve stays coming soon");
  assertNotIncludes(fixPage, "fix.tsx", "queued for Manago", "no fake Manago queued toast");
  assertNotIncludes(fixPage, "fix.tsx", "/writebacks/execute/", "no execute call in Fix page");

  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  assertIncludes(livePlan, "fix-live-plan.ts", "dry-run only", "live plan mentions dry-run preview path");
}

function main() {
  console.log("WB-01 frontend verification");
  testPreviewFormatter();
  testMappingGate();
  testStaticWiring();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WB-01 frontend checks passed.");
}

main();
