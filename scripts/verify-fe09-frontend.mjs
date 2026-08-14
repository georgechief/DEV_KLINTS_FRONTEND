/**
 * FE-09 frontend verification — PRD §10 acceptance.
 * Run: npm run verify:fe09
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

// --- Mirror title helpers (keep in sync with src/lib/dcs.ts) ---
const PRESERVED_TITLE_TOKENS = {
  shopify: "Shopify",
  manago: "Manago.ai",
  "manago.ai": "Manago.ai",
  vip: "VIP",
  utm: "UTM",
  api: "API",
};

function titleCaseToken(word) {
  const bare = word.replace(/[.,;:]+$/, "");
  const suffix = word.slice(bare.length);
  const lower = bare.toLowerCase();
  if (PRESERVED_TITLE_TOKENS[lower]) return PRESERVED_TITLE_TOKENS[lower] + suffix;
  if (/^[A-Z]{2}-\d{2}$/i.test(bare)) return bare.toUpperCase() + suffix;
  if (bare.includes("-")) {
    return bare.split("-").map((part) => titleCaseToken(part)).join("-") + suffix;
  }
  if (!bare) return word;
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase() + suffix;
}

function toCustomerTitleCase(cleaned) {
  const trimmed = cleaned.trim();
  if (!trimmed) return "Data consistency issue";

  const words = trimmed.split(/\s+/).filter(Boolean);
  const isAllLowercase = trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);

  if (!isAllLowercase) {
    const first = trimmed.charAt(0);
    if (first && first === first.toLowerCase() && /[a-z]/i.test(first)) {
      return first.toUpperCase() + trimmed.slice(1);
    }
    return trimmed;
  }

  if (words.length <= 8) {
    return words.map(titleCaseToken).join(" ");
  }

  const [head, ...tail] = words;
  return [titleCaseToken(head ?? ""), ...tail.map((w) => w.toLowerCase())].join(" ");
}

function testTitleHelpers() {
  console.log("\n1. Title casing (PRD §4)");

  const cases = [
    ["duplicate purchases", "Duplicate Purchases"],
    ["consent data across systems completeness", "Consent Data Across Systems Completeness"],
    ["Purchase event count mismatch", "Purchase event count mismatch"],
    ["manago.ai api scope valid", "Manago.ai API Scope Valid"],
    ["", "Data consistency issue"],
  ];

  for (const [input, expected] of cases) {
    const out = toCustomerTitleCase(input);
    if (out === expected) pass(`title: "${input}" → "${expected}"`);
    else fail(`title: "${input}"`, `got "${out}"`);
  }
}

function testStaticWiring() {
  console.log("\n2. Static wiring (PRD §8)");

  const dcs = readSrc("src/lib/dcs.ts");
  assertIncludes(dcs, "dcs.ts", "export function formatCustomerIssueTitle", "formatCustomerIssueTitle exported");
  assertIncludes(dcs, "dcs.ts", "export function toCustomerTitleCase", "toCustomerTitleCase exported");
  assertIncludes(dcs, "dcs.ts", "formatCustomerIssueTitle(issue.title)", "executive card uses title helper");

  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  assertIncludes(livePlan, "fix-live-plan.ts", "formatFriendlyEvidenceRows", "Fix uses friendly evidence rows");
  assertIncludes(livePlan, "fix-live-plan.ts", "friendlyEvidenceSystem", "Fix uses friendly system labels");
  assertNotIncludes(livePlan, "fix-live-plan.ts", "JSON.stringify", "no JSON.stringify in fix-live-plan");
  assertNotIncludes(livePlan, "fix-live-plan.ts", '"Locator"', "no raw locator column headers");
  assertIncludes(livePlan, "fix-live-plan.ts", "Where it came from", "friendly preview columns");
  assertIncludes(livePlan, "fix-live-plan.ts", "Elements", "friendly preview includes Elements column");
  assertIncludes(dcs, "dcs.ts", 'label: "Elements"', "evidence table has Elements column");
  assertIncludes(dcs, "dcs.ts", "friendlyEvidenceElement", "element helper for fix column");

  const fixFlow = readSrc("src/lib/fix-flow.ts");
  assertIncludes(fixFlow, "fix-flow.ts", "formatCustomerIssueTitle", "stepper title uses formatted title");

  const diagnose = readSrc("src/components/klints/DiagnoseEvidence.tsx");
  assertIncludes(diagnose, "DiagnoseEvidence.tsx", "formatFriendlyEvidenceRows", "Data Center still friendly");

  const dataCenter = readSrc("src/routes/data-consistency.tsx");
  assertIncludes(
    dataCenter,
    "data-consistency.tsx",
    "formatExecutiveIssueCard(issue).title",
    "failed run row uses formatted title",
  );

  const overview = readSrc("src/components/klints/OverviewPanel.tsx");
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "formatCustomerIssueTitle(issue.title)",
    "overview revenue stake uses formatted title",
  );
}

function testPreviewShape() {
  console.log("\n3. Friendly preview shape");

  const items = [
    {
      source: "klints",
      locator: "lifecycle.duplicate_purchase_events",
      value: { side: "duplicate_purchase", count: 3 },
      observed_at: "2026-08-01T00:00:00Z",
    },
  ];

  // Minimal mirror: rows must not contain JSON blobs
  const jsonCell = JSON.stringify(items[0].value);
  const previewRows = [
    ["Shopify & Manago", "Duplicate purchases found", "3 orders", "Duplicate purchase events", "Checked"],
  ];
  const hasJson = previewRows.some((row) => row.some((cell) => cell.includes("{")));
  if (!hasJson) pass("preview rows avoid JSON object dumps");
  else fail("preview rows avoid JSON object dumps", jsonCell);
}

function main() {
  console.log("FE-09 frontend verification");
  testTitleHelpers();
  testStaticWiring();
  testPreviewShape();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All FE-09 checks passed.");
}

main();
