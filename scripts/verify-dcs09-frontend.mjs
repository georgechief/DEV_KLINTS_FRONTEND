/**
 * DCS-09 Step 11 — FE light acceptance (static).
 * Run: npm run verify:dcs09
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = "") {
  failed += 1;
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

function assertIncludes(src, needle, label) {
  if (src.includes(needle)) pass(label);
  else fail(label, `missing: ${needle.slice(0, 90)}`);
}

function assertNotIncludes(src, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden: ${needle.slice(0, 90)}`);
}

console.log("=== DCS-09 Step 11 FRONTEND VERIFICATION ===\n");

const useCases = readSrc("src/lib/use-cases.ts");
assertIncludes(useCases, "SUPPLEMENTAL_PREFLIGHT_CHECKS", "12 supplemental IDs set");
assertIncludes(useCases, "isSupplementalGate", "isSupplementalGate helper");
assertIncludes(useCases, "blockerCheckId", "blockerCheckId helper");
assertIncludes(useCases, "isSupplementalBlocker", "isSupplementalBlocker helper");
assertIncludes(useCases, "supplementalBlockingEntries", "supplementalBlockingEntries helper");
assertIncludes(useCases, '"CI-08"', "CI-08 in supplemental set");
assertIncludes(useCases, '"CC-06"', "CC-06 in supplemental set");
assertIncludes(
  useCases,
  "SUPPLEMENTAL_PREFLIGHT_CHECKS.has",
  "supplemental membership via set",
);

const opportunities = readSrc("src/routes/opportunities.tsx");
assertIncludes(opportunities, "isSupplementalBlocker", "Opportunities uses supplemental blocker guard");
assertIncludes(opportunities, "isSupplementalGate", "Opportunities gates check_results links");
assertIncludes(opportunities, "supplementalBlockingEntries", "Opportunities shows supplemental status");
assertIncludes(opportunities, "pilot supplemental", "Opportunities labels supplemental blockers");
assertIncludes(opportunities, 'status === "ready_provisional"', "Provisional chip keyed to ready_provisional only");
assertNotIncludes(
  opportunities,
  "provisional_supplemental ? (",
  "Opportunities provisional chip not driven by flag alone",
);

const studio = readSrc("src/components/workflow/WorkflowStudio.tsx");
assertIncludes(studio, "isSupplementalBlocker", "Studio uses supplemental blocker guard");
assertIncludes(studio, "isSupplementalGate", "Studio ready-list filters supplemental DCS links");
assertIncludes(studio, "supplementalBlockingEntries", "Studio surfaces supplemental FAIL");
assertIncludes(studio, "flow-provisional-banner", "Studio provisional banner present");
assertIncludes(studio, 'pilot.status === "ready_provisional" && buildable', "Banner only for ready_provisional");
assertIncludes(
  studio,
  "not on the Data Center score worklist",
  "Studio avoids DCS CTA for supplemental-only blocks",
);
assertIncludes(
  studio,
  "Review Opportunities",
  "Empty studio prefers Opportunities when only supplemental blockers",
);
assertIncludes(
  studio,
  "(supplemental)",
  "Common blocker list labels supplemental IDs",
);
assertNotIncludes(
  studio,
  "if (blocker.href) return blocker.href;\n  if (blocker.check_id) return `/data-consistency?issue=${blocker.check_id}`",
  "Studio blockerHref no longer auto-routes all check_ids to DCS",
);

// Non-goal: Data Center score page must not gain supplemental pilot UI.
const dcs = readSrc("src/routes/data-consistency.tsx");
assertNotIncludes(dcs, "SUPPLEMENTAL_PREFLIGHT_CHECKS", "No supplemental set on Data Center page");
assertNotIncludes(dcs, "pilot supplemental", "No supplemental pilot copy on Data Center page");

console.log("");
if (failed) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("All DCS-09 Step 11 frontend checks passed.");
