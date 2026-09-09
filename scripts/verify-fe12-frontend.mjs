/**
 * FE-12 frontend verification — export module + Fix download (Phases 1–3).
 * Run: npm run verify:fe12
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

// --- Mirror helpers (keep in sync with fix-evidence-export.ts) ---
const EVIDENCE_EXPORT_COLUMNS = [
  "check_id",
  "check_name",
  "row_kind",
  "element",
  "locator",
  "source",
  "value",
  "observed_at",
  "suggested_fix",
];

function escapeCsvCell(value) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function evidenceExportFilename(checkId, now = new Date("2026-08-14T21:30:00")) {
  const id = checkId.trim().toUpperCase() || "UNKNOWN";
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `klints-evidence-${id}-${y}${m}${d}-${h}${min}.csv`;
}

function buildEvidenceCsv(rows) {
  const header = EVIDENCE_EXPORT_COLUMNS.join(",");
  if (!rows.length) return `\uFEFF${header}\n`;
  const body = rows
    .map((row) =>
      EVIDENCE_EXPORT_COLUMNS.map((col) => escapeCsvCell(row[col] ?? "")).join(","),
    )
    .join("\n");
  return `\uFEFF${header}\n${body}\n`;
}

function collectFixEvidenceItems(issue, detail) {
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

function testCsvHelpers() {
  console.log("\n1. CSV helpers + filename (PRD §4.3–4.4)");

  const filename = evidenceExportFilename("LE-05");
  if (filename === "klints-evidence-LE-05-20260814-2130.csv") {
    pass("filename format");
  } else {
    fail("filename format", filename);
  }

  const csv = buildEvidenceCsv([
    {
      check_id: "CI-03",
      check_name: "Dup contacts",
      row_kind: "mismatch",
      element: "contact.email",
      locator: "buyer@example.com",
      source: "Manago.ai",
      value: 'Says "duplicate", count 2',
      observed_at: "2026-08-14T12:00:00.000Z",
      suggested_fix: "Merge plan",
    },
  ]);
  if (csv.startsWith("\uFEFFcheck_id,")) pass("UTF-8 BOM + header");
  else fail("UTF-8 BOM + header");
  if (csv.includes('"Says ""duplicate"", count 2"')) pass("CSV quote escaping");
  else fail("CSV quote escaping", csv.split("\n")[1]);
  if (EVIDENCE_EXPORT_COLUMNS.length === 9) pass("locked column count");
  else fail("locked column count");

  const multiline = buildEvidenceCsv([
    {
      check_id: "LE-05",
      check_name: "Missing purchases",
      row_kind: "mismatch",
      element: "order.id",
      locator: "ord-1",
      source: "Shopify",
      value: "line one\nline two",
      observed_at: "",
      suggested_fix: "Backfill",
    },
  ]);
  if (multiline.includes('"line one\nline two"')) pass("CSV newline escaping");
  else fail("CSV newline escaping");
}

function hasExportableEvidence(issue, detail) {
  const source = collectFixEvidenceItems(issue, detail);
  return Boolean(source?.items?.length);
}

function testExportEligibility() {
  console.log("\n3. Export eligibility + full detail (PRD §4.1 / §9)");

  const issue = {
    check_id: "LE-05",
    title: "Missing purchase events",
    evidence_preview: [{ source: "p", locator: "preview-only", value: "x", observed_at: "" }],
  };
  const detail = {
    title: "Missing purchase events",
    mismatches: Array.from({ length: 8 }, (_, i) => ({
      source: "shopify",
      locator: `order-${i}`,
      value: { side: "missing_purchase", "order.id": `ord-${i}` },
      observed_at: "2026-08-14T12:00:00.000Z",
      entity: "order",
      api_key: "id",
    })),
    evidence: [],
  };

  if (hasExportableEvidence(issue, detail)) pass("exportable when mismatches present");
  else fail("exportable when mismatches present");

  const empty = hasExportableEvidence({ evidence_preview: [] }, { mismatches: [], evidence: [] });
  if (!empty) pass("not exportable when no samples");
  else fail("not exportable when no samples");

  const picked = collectFixEvidenceItems(issue, detail);
  if (picked?.items.length === 8) pass("export uses full detail (8 rows), not UI cap");
  else fail("export uses full detail", String(picked?.items.length));

  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  if (livePlan.includes(".slice(0, 5)")) pass("UI preview still capped at 5 rows");
  else fail("UI preview cap missing");

  const exportMod = readSrc("src/lib/fix-evidence-export.ts");
  if (!exportMod.includes(".slice(0, 5)")) pass("export module does not slice to 5");
  else fail("export module must not slice to 5");
}

function testPrdAcceptance() {
  console.log("\n6. PRD §9 acceptance (static)");

  const fixPage = readSrc("src/routes/fix.tsx");
  const exportMod = readSrc("src/lib/fix-evidence-export.ts");

  assertIncludes(fixPage, "fix.tsx", "Approve writeback", "Approve unchanged for writable checks");
  assertIncludes(fixPage, "fix.tsx", "Download evidence (.csv)", "download on live Fix");
  assertNotIncludes(fixPage, "fix.tsx", "Download Excel", "label is CSV-honest not fake Excel");
  assertNotIncludes(exportMod, "fix-evidence-export.ts", "before", "no writeback before column");
  assertNotIncludes(exportMod, "fix-evidence-export.ts", "after", "no writeback after column");
  assertIncludes(exportMod, "fix-evidence-export.ts", "row_kind", "locked row_kind column");
  assertIncludes(exportMod, "fix-evidence-export.ts", "suggested_fix", "locked suggested_fix column");
  assertNotIncludes(fixPage, "fix.tsx", "/handoff", "no Handoff changes");
  assertNotIncludes(exportMod, "fix-evidence-export.ts", "previewWriteback", "export does not call writeback preview");
  assertNotIncludes(exportMod, "fix-evidence-export.ts", "executeWriteback", "export does not execute writebacks");
}

function testEvidenceSourcePriority() {
  console.log("\n2. Evidence source priority (PRD §4.1)");

  const issue = { evidence_preview: [{ source: "p", locator: "a", value: 1, observed_at: "" }] };
  const detail = {
    mismatches: [{ source: "m", locator: "b", value: 2, observed_at: "" }],
    evidence: [{ source: "e", locator: "c", value: 3, observed_at: "" }],
  };

  const picked = collectFixEvidenceItems(issue, detail);
  if (picked?.rowKind === "mismatch" && picked.items[0].locator === "b") {
    pass("mismatches win over evidence + preview");
  } else {
    fail("mismatches win", JSON.stringify(picked));
  }

  const evidenceOnly = collectFixEvidenceItems(issue, {
    mismatches: [],
    evidence: detail.evidence,
  });
  if (evidenceOnly?.rowKind === "evidence" && evidenceOnly.items[0].locator === "c") {
    pass("evidence before preview");
  } else {
    fail("evidence before preview");
  }

  const previewOnly = collectFixEvidenceItems(issue, { mismatches: [], evidence: [] });
  if (previewOnly?.rowKind === "evidence" && previewOnly.items[0].locator === "a") {
    pass("preview fallback");
  } else {
    fail("preview fallback");
  }
}

function testFixDownloadWiring() {
  console.log("\n4. Phase 2 Fix download wiring");

  const fixPage = readSrc("src/routes/fix.tsx");
  assertIncludes(fixPage, "fix.tsx", "Download evidence (.csv)", "download button label");
  assertIncludes(fixPage, "fix.tsx", "downloadFixEvidenceExport", "Fix uses export helper");
  assertIncludes(fixPage, "fix.tsx", "hasExportableEvidence", "export eligibility guard");
  assertIncludes(fixPage, "fix.tsx", "Demo data · export off", "fixture export off");
  assertIncludes(fixPage, "fix.tsx", "Nothing to download", "empty export toast");
  assertIncludes(fixPage, "fix.tsx", "Downloaded ·", "success toast");
  assertIncludes(fixPage, "fix.tsx", "CSV · opens in Excel", "helper copy");
  assertIncludes(fixPage, "fix.tsx", "issueDetailPending", "disabled while detail loads");
  assertIncludes(fixPage, "fix.tsx", "Loading evidence…", "loading copy");
  assertIncludes(fixPage, "fix.tsx", "Evidence still loading", "loading toast guard");
}

function testStaticModule() {
  console.log("\n5. Static module wiring");

  const exportMod = readSrc("src/lib/fix-evidence-export.ts");
  const sourceMod = readSrc("src/lib/fix-evidence-source.ts");
  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  const writebacks = readSrc("src/lib/writebacks.ts");

  assertIncludes(exportMod, "fix-evidence-export.ts", "triggerEvidenceDownload", "CSV download trigger");
  assertIncludes(exportMod, "fix-evidence-export.ts", "downloadFixEvidenceExport", "one-shot download helper");

  assertIncludes(exportMod, "fix-evidence-export.ts", "buildEvidenceExportRows", "export rows builder");
  assertIncludes(exportMod, "fix-evidence-export.ts", "buildEvidenceCsv", "CSV builder");
  assertIncludes(exportMod, "fix-evidence-export.ts", "buildEvidenceExportBlob", "blob helper");
  assertIncludes(exportMod, "fix-evidence-export.ts", "formatFriendlyEvidenceRows", "reuse FE-09 formatter");
  assertIncludes(exportMod, "fix-evidence-export.ts", "assertNoRawJson", "no raw JSON guard");
  assertNotIncludes(
    exportMod,
    "fix-evidence-export.ts",
    "JSON.stringify",
    "no JSON.stringify in export cells",
  );
  assertNotIncludes(
    exportMod,
    "fix-evidence-export.ts",
    "executeWriteback",
    "no writeback execute in export module",
  );

  assertIncludes(sourceMod, "fix-evidence-source.ts", "collectFixEvidenceItems", "shared source collector");
  assertIncludes(livePlan, "fix-live-plan.ts", "collectFixEvidenceItems", "fix-live-plan uses shared source");
  assertNotIncludes(livePlan, "fix-live-plan.ts", "function previewItems", "removed duplicate previewItems");

  assertIncludes(
    writebacks,
    "writebacks.ts",
    "Download evidence for manual or integration fix",
    "non-writable honesty mentions download",
  );
}

function main() {
  console.log("FE-12 frontend verification (Phases 1–3)");
  testCsvHelpers();
  testEvidenceSourcePriority();
  testExportEligibility();
  testFixDownloadWiring();
  testStaticModule();
  testPrdAcceptance();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All FE-12 frontend checks passed.");
}

main();
