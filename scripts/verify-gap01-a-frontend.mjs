/**
 * GAP-01 Slice A1 frontend verification — persisted OrchestrationTask SM (Phase 5).
 * Run: npm run verify:gap01a
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

console.log("=== GAP-01 Slice A1 FRONTEND VERIFICATION (Phase 5) ===\n");

const tasksLibRel = "src/lib/orchestration-tasks.ts";
const overviewRel = "src/components/klints/OverviewPanel.tsx";
const packageJsonRel = "package.json";
const tasksLib = readSrc(tasksLibRel);
const overview = readSrc(overviewRel);
const packageJson = readSrc(packageJsonRel);

console.log("§5.1 — full OrchTaskStatus types (8 pack statuses)");
for (const status of [
  "PENDING",
  "BLOCKED",
  "READY",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "DONE",
  "FAILED",
  "CANCELLED",
]) {
  assertIncludes(tasksLib, tasksLibRel, `"${status}"`, `status enum ${status}`);
}

console.log("\n§5.2 — query key + GET list/detail clients");
assertIncludes(tasksLib, tasksLibRel, "ORCH_TASKS_QUERY_KEY", "ORCH_TASKS_QUERY_KEY");
assertIncludes(tasksLib, tasksLibRel, "listOrchestrationTasks", "list GET client");
assertIncludes(tasksLib, tasksLibRel, "getOrchestrationTask", "detail GET client");
assertIncludes(tasksLib, tasksLibRel, "orchTaskDetailQueryKey", "detail query key helper");

console.log("\n§5.3 — POST create + transition clients");
assertIncludes(tasksLib, tasksLibRel, "createOrchestrationTask", "create POST client");
assertIncludes(
  tasksLib,
  tasksLibRel,
  "transitionOrchestrationTask",
  "transition POST client",
);
assertIncludes(tasksLib, tasksLibRel, "canApproveOrchestrationTask", "admin approval gate");

console.log("\n§5.4 — Overview persisted task list + status chip");
assertIncludes(overview, overviewRel, "ORCH_TASKS_QUERY_KEY", "tasks query in Overview");
assertIncludes(overview, overviewRel, "listOrchestrationTasks", "tasks list fetch in Overview");
assertIncludes(overview, overviewRel, "data-orch-task-status", "status chip marker");
assertIncludes(overview, overviewRel, "Persisted orchestration tasks", "persisted tasks section label");
assertIncludes(overview, overviewRel, "orchTaskStatusLabel", "status label helper used");

console.log("\n§5.5 — verify script + WORKING_GAPS");
assertIncludes(packageJson, packageJsonRel, "verify:gap01a", "package.json verify:gap01a script");

const beRoot = join(ROOT, "..", "klints_backend");
const beVerifyPath = join(beRoot, "scripts/verify_orch_sm_01_backend.py");
const gapsPath = join(beRoot, "docs/sahil/GAP_01_WORKING_GAPS.md");
if (existsSync(beVerifyPath)) pass("BE verify_orch_sm_01_backend.py exists");
else fail("BE verify_orch_sm_01_backend.py exists");
if (existsSync(gapsPath)) pass("GAP_01_WORKING_GAPS.md exists");
else fail("GAP_01_WORKING_GAPS.md exists");

console.log(`\nGAP-01 Slice A1 frontend verification: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
