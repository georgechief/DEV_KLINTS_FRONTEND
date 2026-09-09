/**
 * CAP-01 Steps 8–9 — Studio + QA + Handoff route honesty (static).
 * Run: npm run verify:cap01
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
  else fail(label, `missing: ${needle.slice(0, 80)}`);
}

function assertNotIncludes(src, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden: ${needle.slice(0, 80)}`);
}

function countMatches(src, pattern) {
  const m = src.match(pattern);
  return m ? m.length : 0;
}

console.log("=== CAP-01 Steps 8–9 FRONTEND VERIFICATION ===\n");

const helpersRel = "src/lib/capability-route.ts";
const honestyRel = "src/components/workflow/PackageRouteHonesty.tsx";
const studioRel = "src/components/workflow/WorkflowStudio.tsx";
const qaRel = "src/routes/qa.tsx";
const useCasesRel = "src/lib/use-cases.ts";
const handoffRel = "src/routes/handoff.tsx";
const handoffLibRel = "src/lib/handoff.ts";
const sendLockedRel = "src/components/klints/HandoffSendLocked.tsx";

const helpers = readSrc(helpersRel);
const honesty = readSrc(honestyRel);
const studio = readSrc(studioRel);
const qa = readSrc(qaRel);
const useCases = readSrc(useCasesRel);
const handoff = readSrc(handoffRel);
const handoffLib = readSrc(handoffLibRel);
const sendLocked = readSrc(sendLockedRel);

console.log("Step 8 — Helpers");
assertIncludes(
  helpers,
  "Human build guide — MCP upsert not confirmed",
  "HUMAN_FALLBACK copy lock",
);
assertIncludes(
  helpers,
  "MCP upsert confirmed — Send still not live (HO-02)",
  "MCP copy lock",
);
assertIncludes(helpers, "Route not set on this package", "empty-route label");
assertNotIncludes(
  helpers,
  "Generate a package to resolve the build route",
  "no pre-generate hint in packageRouteSummary",
);
assertIncludes(helpers, "packageResolutionLine", "resolution line helper");
assertIncludes(helpers, "MCP.WORKFLOW.UPSERT", "UPSERT id in resolution helper");

console.log("\nStep 8 — Shared UI");
assertIncludes(honesty, "PackageRouteHonesty", "shared honesty component");
assertIncludes(honesty, "packageRouteSummary", "component uses summary helper");
assertIncludes(honesty, "packageResolutionLine", "component uses resolution helper");

console.log("\nStep 8 — Studio");
assertIncludes(studio, "PackageRouteHonesty", "Studio uses PackageRouteHonesty");
assertIncludes(studio, "packageRouteSummary", "Studio uses packageRouteSummary for identity/toast");
assertNotIncludes(
  studio,
  "pkg?.route ?? pilot.execution.fallback",
  "Studio does not use pilot fallback as Build route",
);

console.log("\nStep 8 — QA");
assertIncludes(qa, "PackageRouteHonesty", "QA uses PackageRouteHonesty");
assertNotIncludes(qa, "route {pkg.route}", "QA eyebrow not raw route-only string");
assertNotIncludes(
  qa,
  "pills.push(pkg.route)",
  "QA does not use route as touchpoint pill",
);

console.log("\nStep 8 — Types");
assertIncludes(
  useCases,
  "capability_resolution?",
  "BuildPackageResponse has capability_resolution",
);

console.log("\nStep 9 — Handoff route honesty");
assertIncludes(
  handoffLib,
  "packageRouteSummary",
  "handoffRouteSummary delegates to packageRouteSummary",
);
assertIncludes(handoffLib, "handoffRouteSummary", "handoffRouteSummary still exported");
assertNotIncludes(
  handoffLib,
  "Human fallback · build & activate in Manago",
  "old HO-only HUMAN_FALLBACK copy removed",
);
assertIncludes(handoff, "PackageRouteHonesty", "Handoff uses PackageRouteHonesty");
assertIncludes(
  handoff,
  "capability_resolution",
  "Handoff passes package capability_resolution",
);
assertIncludes(
  handoff,
  'String(live.route ?? "").trim()',
  "live route trimmed before package fallback",
);
assertIncludes(handoff, "HandoffSendLockedButton", "Send stays locked control");
assertIncludes(sendLocked, "HANDOFF_SEND_DISABLED_TITLE", "Send title SoT present");
const lockedButtonUses = countMatches(handoff, /<HandoffSendLockedButton/g);
if (lockedButtonUses >= 3) {
  pass(`Send surfaces use HandoffSendLockedButton (≥3, found ${lockedButtonUses})`);
} else {
  fail("Send surfaces use HandoffSendLockedButton", `found ${lockedButtonUses}, expected ≥3`);
}
assertNotIncludes(handoff, "toast.success(\"Sent", "no fake Sent toast");
assertNotIncludes(handoff, "sent via MCP", "no sent-via-MCP copy");

console.log(
  failed === 0
    ? "\nCAP-01 Steps 8–9 frontend verification passed.\n"
    : `\nCAP-01 Steps 8–9 frontend verification failed (${failed}).\n`,
);
process.exit(failed === 0 ? 0 : 1);
