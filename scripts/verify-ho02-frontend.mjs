/**
 * HO-02 frontend verification — approve + activation guide + confirm (human Manago path).
 * Run: npm run verify:ho02
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function pass(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
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

function assertIncludes(src, rel, needle, label) {
  if (src.includes(needle)) pass(label);
  else fail(label, `missing in ${rel}: ${needle.slice(0, 80)}`);
}

function assertNotIncludes(src, rel, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden in ${rel}: ${needle.slice(0, 80)}`);
}

console.log("=== HO-02 FRONTEND VERIFICATION ===\n");

const handoffRel = "src/routes/handoff.tsx";
const handoffLibRel = "src/lib/handoff.ts";
const sendLockedRel = "src/components/klints/HandoffSendLocked.tsx";
const packageJsonRel = "package.json";
const handoff = readSrc(handoffRel);
const handoffLib = readSrc(handoffLibRel);
const sendLocked = readSrc(sendLockedRel);
const packageJson = readSrc(packageJsonRel);

console.log("§7 — API client + types");
assertIncludes(
  handoffLib,
  handoffLibRel,
  "approveHandoffForActivation",
  "approve API client",
);
assertIncludes(
  handoffLib,
  handoffLibRel,
  "confirmHandoffActivated",
  "confirm-activated API client",
);
assertIncludes(
  handoffLib,
  handoffLibRel,
  "rejectHandoff",
  "reject API client",
);
assertIncludes(handoffLib, handoffLibRel, "activation_meta", "activation_meta type");
assertIncludes(handoffLib, handoffLibRel, "activation_guide", "activation_guide type");
assertIncludes(handoffLib, handoffLibRel, "canApproveHandoffActivation", "admin role gate helper");
assertIncludes(handoffLib, handoffLibRel, "mergeHandoffActivationResponse", "cache merge helper");

console.log("\n§7.1 — status UI + honest copy");
assertIncludes(handoff, handoffRel, "HandoffStatusBanner", "status banner component");
assertIncludes(handoff, handoffRel, "HANDOFF_APPROVED_BANNER", "approved banner copy");
assertIncludes(handoff, handoffRel, "HANDOFF_ACTIVATED_BANNER", "activated banner copy");
assertIncludes(handoff, handoffRel, "HANDOFF_REJECTED_BANNER", "rejected banner copy");
assertIncludes(handoff, handoffRel, "Activation guide", "activation guide panel label");
assertIncludes(handoff, handoffRel, "HandoffConfirmButton", "confirm activated control");
assertIncludes(handoff, handoffRel, "data-handoff-approve", "live approve control marker");
assertIncludes(handoff, handoffRel, "data-handoff-confirm", "live confirm control marker");
assertIncludes(handoff, handoffRel, "canApproveHandoff", "admin gate in page");

console.log("\n§7.1 — no fake MCP Send toast");
assertNotIncludes(handoff, handoffRel, 'toast.success("Sent"', "no fake Sent success toast");
assertNotIncludes(handoff, handoffRel, "toast.success('Sent'", "no fake Sent success toast (single quotes)");
assertNotIncludes(
  handoff,
  handoffRel,
  "Delivered to agent",
  "no Delivered to agent toast copy",
);
assertNotIncludes(handoff, handoffRel, "Agent handoff", "Slice D: HO-02 page no Agent handoff");
assertNotIncludes(handoff, handoffRel, "Agent-ready", "Slice D: HO-02 no Agent-ready label");
assertIncludes(
  handoff,
  handoffRel,
  "Approve for activation",
  "Slice D: Approve for activation CTA preserved",
);

console.log("\n§7.1 — locked Send only for ineligible / terminal states");
assertIncludes(sendLocked, sendLockedRel, "lockedTitle", "locked title override prop");
assertIncludes(
  handoffLib,
  handoffLibRel,
  "HANDOFF_ALREADY_ACTIVATED_TITLE",
  "already activated locked title",
);
assertIncludes(
  handoffLib,
  handoffLibRel,
  "HANDOFF_ADMIN_REQUIRED_TITLE",
  "admin required locked title",
);
if (handoff.includes("HandoffApproveButton")) {
  pass("live approve button component present");
} else {
  fail("live approve button component present");
}

console.log("\n§7.3 — deep links + QA gate bypass");
assertIncludes(
  handoffLib,
  handoffLibRel,
  "handoffBypassesQaGate",
  "post-STAGE QA gate bypass helper",
);
const useCases = readSrc("src/lib/use-cases.ts");
assertIncludes(useCases, "src/lib/use-cases.ts", "handoff_id", "handoff_id search param");
assertIncludes(handoff, handoffRel, "getHandoff", "handoff_id GET fetch");
assertIncludes(handoff, handoffRel, "handoffDetailQueryKey", "handoff detail query key");

const audit = readSrc("src/lib/audit.ts");
assertIncludes(audit, "src/lib/audit.ts", "workflow.handoff", "audit deep-link to /handoff");
const handoffActionIdx = audit.indexOf('if (action.startsWith("workflow.handoff"))');
const apiHrefIdx = audit.indexOf("const apiHref = event.href");
if (handoffActionIdx >= 0 && apiHrefIdx > handoffActionIdx) {
  pass("handoff action resolved before API href fallback");
} else {
  fail("handoff action resolved before API href fallback");
}

console.log("\n§8 — optional Manago workflow id on confirm");
assertIncludes(handoff, handoffRel, "manago_workflow_external_id", "optional confirm field");
assertIncludes(handoff, handoffRel, "Manago workflow id (optional)", "confirm field label");

console.log("\n§9 — audit API handoff_id on FE type");
assertIncludes(audit, "src/lib/audit.ts", "handoff_id?:", "AuditEvent handoff_id field");
assertIncludes(audit, "src/lib/audit.ts", "qa_run_id?:", "AuditEvent qa_run_id field");

console.log("\n§10 — verify script + WORKING_GAPS");
assertIncludes(packageJson, packageJsonRel, "verify:ho02", "package.json verify:ho02 script");

const beRoot = join(ROOT, "..", "klints_backend");
const beVerifyPath = join(beRoot, "scripts/verify_ho02_backend.py");
const gapsPath = join(beRoot, "docs/sahil/HO_02_WORKING_GAPS.md");
if (existsSync(beVerifyPath)) pass("BE verify_ho02_backend.py exists");
else fail("BE verify_ho02_backend.py exists");
if (existsSync(gapsPath)) pass("HO_02_WORKING_GAPS.md exists");
else fail("HO_02_WORKING_GAPS.md exists");

console.log(`\nHO-02 frontend verification: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
