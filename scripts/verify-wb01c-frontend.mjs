/**
 * WB-01C frontend verification — possible/not sheet + unified /run/ preview.
 * Run: npm run verify:wb01c
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

const WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS = ["LE-04"];
const ADVERTISED_WRITE_STATES = new Set(["yes", "sandbox_only", "preview_only"]);
const WRITEBACK_POSSIBLE_COLUMNS = [
  "Field",
  "Write today",
  "Update existing",
  "Rollback",
  "Why",
];

function isWritebackPreviewBlocked(checkId) {
  if (!checkId?.trim()) return false;
  const id = checkId.trim().toUpperCase();
  return WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS.some(
    (blocked) => blocked.toUpperCase() === id,
  );
}

function findWritebackMapping(mappings, checkId) {
  if (!checkId?.trim() || !mappings?.length) return undefined;
  const id = checkId.trim().toUpperCase();
  return mappings.find((row) => row.check_id.toUpperCase() === id);
}

function isWritebackMappingEnabled(mappings, checkId) {
  if (isWritebackPreviewBlocked(checkId)) return false;
  const row = findWritebackMapping(mappings, checkId);
  return Boolean(row?.enabled);
}

function writebackPossibleRowsForCheck(rows, checkId) {
  if (!checkId?.trim() || !rows?.length) return [];
  const id = checkId.trim().toUpperCase();
  return rows.filter((row) => row.check_id.toUpperCase() === id);
}

function formatWritePossibleLabel(value) {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  if (v === "preview_only") return "Preview only";
  if (v === "disabled") return "Disabled";
  if (v === "partial") return "Partial";
  if (v === "n/a" || v === "—" || v === "-") return "n/a";
  return value?.trim() || "—";
}

const EXECUTABLE_WRITE_TODAY = new Set(["yes", "sandbox_only"]);

function formatWritePossibleTodayLabel(value, writebackExecuteEnabled) {
  const v = (value ?? "").trim().toLowerCase();
  if (!EXECUTABLE_WRITE_TODAY.has(v)) {
    return formatWritePossibleLabel(value);
  }
  if (writebackExecuteEnabled === true) return "Yes";
  if (writebackExecuteEnabled === false) return "Yes · Settings off";
  return "Yes · Settings gated";
}

function writebackPossibleToTable(rows, options = {}) {
  const writebackExecuteEnabled = options.writebackExecuteEnabled;
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
      "Honest write surfaces from the possible/not sheet. CI-01, CC-03, and WB-SHOP-01 can Approve on Fix after preview when writebacks are enabled in Settings.",
  };
}

function isWritebackSheetPreviewAdvertised(rows, checkId) {
  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (!match.length) return undefined;
  return match.some((row) =>
    ADVERTISED_WRITE_STATES.has(row.write_possible_today.trim().toLowerCase()),
  );
}

function isWritebackPreviewAvailable(mappings, possibleRows, checkId) {
  if (!isWritebackMappingEnabled(mappings, checkId)) return false;
  return isWritebackSheetPreviewAdvertised(possibleRows, checkId) !== false;
}

function testSheetFormatter() {
  console.log("\n1. Possible/not table (PRD §2 / §3.2)");

  const cc03 = {
    check_id: "CC-03",
    field_or_key: "klints_consent_evidence",
    write_possible_today: "sandbox_only",
    updates_existing: "yes",
    rollback_possible_today: "yes",
    blocker: "",
  };
  const table = writebackPossibleToTable([cc03]);
  if (table.columns.length === 5) pass("possible table has 5 columns");
  else fail("possible table has 5 columns", String(table.columns.length));

  if (table.rows[0][0] === "klints_consent_evidence") {
    pass("CC-03 field shown");
  } else {
    fail("CC-03 field shown", table.rows[0][0]);
  }
  const tableOff = writebackPossibleToTable([cc03], {
    writebackExecuteEnabled: false,
  });
  if (tableOff.rows[0][1] === "Yes · Settings off") {
    pass("yes/sandbox_only shows Settings off when toggle off");
  } else {
    fail("yes/sandbox_only shows Settings off when toggle off", tableOff.rows[0][1]);
  }

  const tableOn = writebackPossibleToTable(
    [{ ...cc03, write_possible_today: "yes" }],
    { writebackExecuteEnabled: true },
  );
  if (tableOn.rows[0][1] === "Yes") pass("yes shows plain Yes when toggle on");
  else fail("yes shows plain Yes when toggle on", tableOn.rows[0][1]);

  const tableUnknown = writebackPossibleToTable([cc03]);
  if (tableUnknown.rows[0][1] === "Yes · Settings gated") {
    pass("executable write shows Settings gated when toggle unknown");
  } else {
    fail(
      "executable write shows Settings gated when toggle unknown",
      tableUnknown.rows[0][1],
    );
  }
  if (table.rows[0][2] === "Yes") pass("updates_existing yes");
  else fail("updates_existing yes", table.rows[0][2]);
  if (table.rows[0][3] === "Yes") pass("rollback yes");
  else fail("rollback yes", table.rows[0][3]);

  const le04 = writebackPossibleToTable([
    {
      check_id: "LE-04",
      field_or_key: "tag:klints:duplicate_review",
      write_possible_today: "disabled",
      updates_existing: "n/a",
      rollback_possible_today: "n/a",
      blocker: "pack_fix_type=Integration+Manual",
    },
  ]);
  if (le04.rows[0][1] === "Disabled") pass("LE-04 write=disabled");
  else fail("LE-04 write=disabled", le04.rows[0][1]);
  if (le04.rows[0][4].includes("Integration+Manual")) pass("LE-04 blocker shown");
  else fail("LE-04 blocker shown", le04.rows[0][4]);

  const order = writebackPossibleToTable([
    {
      check_id: "SHOPIFY-ORDER",
      field_or_key: "—",
      entity: "order",
      write_possible_today: "no",
      updates_existing: "n/a",
      rollback_possible_today: "n/a",
      blocker: "orders_not_supported",
    },
  ]);
  if (order.rows[0][0] === "order") pass("SHOPIFY-ORDER uses entity when field is em-dash");
  else fail("SHOPIFY-ORDER uses entity when field is em-dash", order.rows[0][0]);
  if (order.rows[0][1] === "No") pass("SHOPIFY-ORDER write=no");
  else fail("SHOPIFY-ORDER write=no", order.rows[0][1]);
}

function testPreviewGate() {
  console.log("\n2. Preview advertised only when mapping + sheet allow it");

  const mappings = [
    { check_id: "CC-03", enabled: true },
    { check_id: "LE-04", enabled: true },
    { check_id: "CI-01", enabled: true },
  ];
  const rows = [
    { check_id: "CC-03", write_possible_today: "sandbox_only" },
    { check_id: "LE-04", write_possible_today: "disabled" },
    { check_id: "SHOPIFY-ORDER", write_possible_today: "no" },
  ];

  if (isWritebackPreviewAvailable(mappings, rows, "CC-03")) {
    pass("CC-03 preview advertised");
  } else {
    fail("CC-03 preview advertised");
  }
  if (!isWritebackPreviewAvailable(mappings, rows, "LE-04")) {
    pass("LE-04 preview blocked");
  } else {
    fail("LE-04 preview blocked");
  }
  if (!isWritebackPreviewAvailable(mappings, rows, "SHOPIFY-ORDER")) {
    pass("SHOPIFY-ORDER preview not advertised");
  } else {
    fail("SHOPIFY-ORDER preview not advertised");
  }
  if (isWritebackPreviewAvailable(mappings, undefined, "CI-01")) {
    pass("unknown sheet still uses mapping gate");
  } else {
    fail("unknown sheet still uses mapping gate");
  }
}

function testStaticWiring() {
  console.log("\n3. Static wiring (PRD-WB-01C §3–4 / §7)");

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    '"/api/v1/writebacks/possible/"',
    "possible API wired",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    '"/api/v1/writebacks/run/"',
    "unified /run/ wired",
  );
  assertIncludes(writebacks, "writebacks.ts", 'action: "preview"', "FE sends action=preview");
  assertIncludes(writebacks, "writebacks.ts", "getWritebackPossible", "possible getter exported");
  assertIncludes(writebacks, "writebacks.ts", "writebackPossibleToTable", "possible table helper");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "formatWritePossibleTodayLabel",
    "Settings-gated write-today label",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackPreviewAvailable",
    "sheet-aware preview gate",
  );
  // Prefer unified /run/ — never wire the alias paths from FE.
  assertNotIncludes(writebacks, "writebacks.ts", "/writebacks/execute/", "no execute alias URL on FE");
  assertNotIncludes(writebacks, "writebacks.ts", "/writebacks/rollback/", "no rollback alias URL on FE");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'action: "execute" satisfies WritebackRunAction',
    "WB-02 execute goes through unified /run/",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'action: "rollback" satisfies WritebackRunAction',
    "WB-02 rollback goes through unified /run/",
  );
  assertIncludes(
    writebacks,
    "writebacks.ts",
    "isWritebackApproveExecutable",
    "WB-02 approve eligibility helper",
  );

  const surfaces = readSrc("src/components/klints/WritebackPossibleSurfaces.tsx");
  assertIncludes(
    surfaces,
    "WritebackPossibleSurfaces.tsx",
    "Write surfaces",
    "disclosure title present",
  );
  assertIncludes(
    surfaces,
    "WritebackPossibleSurfaces.tsx",
    "writebackPossibleToTable",
    "disclosure uses possible table",
  );
  assertIncludes(
    surfaces,
    "WritebackPossibleSurfaces.tsx",
    "writebackExecuteEnabled",
    "disclosure passes Settings gate state",
  );

  const fixPage = readSrc("src/routes/fix.tsx");
  assertIncludes(fixPage, "fix.tsx", "getWritebackPossible", "Fix loads possible sheet");
  assertIncludes(fixPage, "fix.tsx", "WritebackPossibleSurfaces", "Fix shows write surfaces");
  assertIncludes(
    fixPage,
    "fix.tsx",
    "writebackExecuteEnabled={writebackExecuteEnabled}",
    "Fix passes writeback toggle to surfaces",
  );
  assertIncludes(fixPage, "fix.tsx", "isWritebackPreviewAvailable", "Fix uses sheet-aware preview gate");
  // Phase 2: Fix Approve chain is wired (still no alias URLs).
  assertIncludes(fixPage, "fix.tsx", "executeWriteback", "Fix calls executeWriteback");
  assertIncludes(fixPage, "fix.tsx", "requestWritebackApproval", "Fix requests approval");
  assertIncludes(fixPage, "fix.tsx", "approveWritebackApproval", "Fix grants approval");
  assertIncludes(fixPage, "fix.tsx", "rollbackWriteback", "Fix can rollback");
  assertIncludes(fixPage, "fix.tsx", "isWritebackApproveExecutable", "Fix uses eligibility gate");
  assertIncludes(fixPage, "fix.tsx", "isWritebackExecuteSuccess", "Written only after execute success");
  assertNotIncludes(fixPage, "fix.tsx", "setApproved(true)", "no fake local Written");
  assertNotIncludes(fixPage, "fix.tsx", "/writebacks/execute/", "no execute alias on Fix page");
  assertNotIncludes(fixPage, "fix.tsx", "/writebacks/rollback/", "no rollback alias on Fix page");
}

function main() {
  console.log("WB-01C frontend verification");
  testSheetFormatter();
  testPreviewGate();
  testStaticWiring();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WB-01C frontend checks passed.");
}

main();
