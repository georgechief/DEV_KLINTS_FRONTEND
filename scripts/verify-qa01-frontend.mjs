/**
 * QA-01 frontend verification — PRD-QA-01 (grows each implementation step).
 * Run: npm run verify:qa01
 *
 * Step 6: FE client — types, POST/GET paths, hard_test copy, error helpers.
 * Step 7: Live /qa bind — package_id path, auto-run, no fixture primary path.
 * Step 8: FlowStepper Handoff only after latest QA PASS (§8.7).
 * Step 9: §12 acceptance sweep + WORKING_GAPS / BE evidence hooks.
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
  else fail(label, `missing in ${rel}: ${String(needle).slice(0, 90)}`);
}

function assertNotIncludes(src, rel, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `must not appear in ${rel}: ${String(needle).slice(0, 90)}`);
}

console.log("\nQA-01 Step 6 — FE QA client\n");

const qaRel = "src/lib/qa.ts";
const qa = readSrc(qaRel);
if (qa) {
  pass("file exists: src/lib/qa.ts");

  assertIncludes(
    qa,
    qaRel,
    "/api/v1/build-packages/${encodeURIComponent(id)}/qa/",
    "GET/POST path uses /api/v1/build-packages/{id}/qa/",
  );
  assertIncludes(qa, qaRel, 'method: "POST"', "runPackageQa uses POST");
  assertIncludes(
    qa,
    qaRel,
    "/api/v1/qa-runs/${encodeURIComponent(id)}/",
    "getQaRun path uses /api/v1/qa-runs/{id}/",
  );

  for (const name of [
    "export function getLatestPackageQa",
    "export function runPackageQa",
    "export function getQaRun",
    "export function isQaNeverRunError",
    "export function isQaRequirementsMissingError",
    "export function handoffFromQa",
    "export const HARD_TEST_COPY",
    "export const PACK_HARD_TEST_IDS",
    "export type QaResultResponse",
  ]) {
    assertIncludes(
      qa,
      qaRel,
      name,
      name.replace(/^export (function|const|type) /, "exports "),
    );
  }

  const hardIds = [
    "data_gates_pass",
    "consent_branching",
    "terminal_reachable",
    "no_orphan_nodes",
    "collision_policy",
    "measurement_wired",
    "rollback_defined",
  ];
  for (const id of hardIds) {
    assertIncludes(qa, qaRel, id, `pack hard_test id: ${id}`);
  }

  assertIncludes(
    qa,
    qaRel,
    "export function classifyPackageQaGetError",
    "exports classifyPackageQaGetError",
  );
  assertIncludes(
    qa,
    qaRel,
    "export function qaScoreChipSummary",
    "exports qaScoreChipSummary",
  );
  assertIncludes(qa, qaRel, "build package not found", "package 404 matches BE detail");
  assertIncludes(qa, qaRel, "has not been run", "never-run 404 matches BE detail");

  const packageNotFoundFn = qa.slice(
    qa.indexOf("export function isQaPackageNotFoundError"),
    qa.indexOf("export function isQaRunNotFoundError"),
  );
  if (
    packageNotFoundFn.includes('includes("not found")') ||
    packageNotFoundFn.includes("includes('not found')")
  ) {
    fail(
      "isQaPackageNotFoundError specificity",
      'must not match bare "not found" (collides with QA run not found)',
    );
  } else {
    pass("isQaPackageNotFoundError does not match bare not found");
  }

  assertIncludes(qa, qaRel, "Cleared · score", "§8.4 PASS chip copy");
  assertIncludes(qa, qaRel, "Blocked · score", "§8.4 FAIL chip copy");
  assertIncludes(qa, qaRel, "requireNonEmptyId", "rejects empty ids via requireNonEmptyId");
  assertIncludes(qa, qaRel, "is required", "empty id error message");
  assertIncludes(qa, qaRel, 'to: "/handoff"', "handoffFromQa targets /handoff");
}

console.log("\nQA-01 Step 7 — live /qa bind\n");

const pageRel = "src/routes/qa.tsx";
const page = readSrc(pageRel);
if (page) {
  pass("file exists: src/routes/qa.tsx");
  assertIncludes(page, pageRel, 'from "@/lib/qa"', "qa.tsx imports @/lib/qa");
  assertIncludes(page, pageRel, "getLatestPackageQa", "loads latest QA");
  assertIncludes(page, pageRel, "runPackageQa", "can POST re-run / auto-run");
  assertIncludes(page, pageRel, "getBuildPackage", "loads build package");
  assertIncludes(page, pageRel, "classifyPackageQaGetError", "classifies never-run 404");
  assertIncludes(page, pageRel, '"never_run"', "auto-run on never_run");
  assertIncludes(
    page,
    pageRel,
    "Generate a build package in Workflow Studio first",
    "empty state without package_id",
  );
  assertIncludes(page, pageRel, "qaScoreChipSummary", "score chip uses §8.4 helper");
  assertIncludes(page, pageRel, "hardTestLabel", "gate rows use hard-test labels");
  assertIncludes(page, pageRel, "handoffFromQa", "handoff CTA uses handoffFromQa");
  assertIncludes(page, pageRel, "Re-run QA", "Re-run QA control");
  assertIncludes(page, pageRel, "Handoff locked", "locked handoff when not PASS");
  assertIncludes(
    page,
    pageRel,
    "not MCP delivery",
    "honesty copy — not MCP delivery",
  );
  assertIncludes(
    page,
    pageRel,
    "This is not an MCP send",
    "Slice D: package card not-MCP-send honesty",
  );
  assertIncludes(
    page,
    pageRel,
    "Is this package safe to stage?",
    "Slice D: QA title (not hand-to-agent)",
  );
  assertIncludes(
    page,
    pageRel,
    "rule engine",
    "Slice D: QA description rule engine honesty",
  );
  assertIncludes(
    page,
    pageRel,
    "Stage for human activation",
    "Slice D: next-step stage for human activation",
  );
  assertIncludes(
    page,
    pageRel,
    "staged package for human activation",
    "Slice D: staged package copy (not agent stub)",
  );
  assertIncludes(
    page,
    pageRel,
    "Continue to Handoff",
    "Slice D: Continue to Handoff CTA preserved",
  );
  assertNotIncludes(
    page,
    pageRel,
    "hand to the agent",
    "Slice D: no hand-to-the-agent title",
  );
  assertNotIncludes(
    page,
    pageRel,
    "Deliver to the agent",
    "Slice D: no deliver-to-the-agent CTA",
  );
  assertNotIncludes(
    page,
    pageRel,
    "agent package stub",
    "Slice D: no agent package stub copy",
  );
  assertNotIncludes(
    page,
    pageRel,
    "AI agent",
    "Slice D: no AI agent claim on QA",
  );
  assertNotIncludes(
    page,
    pageRel,
    "agent-ready",
    "Slice D: QA no agent-ready copy",
  );
  assertNotIncludes(
    page,
    pageRel,
    "for the agent",
    "Slice D: QA no for-the-agent copy",
  );
  assertNotIncludes(
    page,
    pageRel,
    "getQaRunForIssue",
    "live path does not use getQaRunForIssue fixtures",
  );
  assertNotIncludes(
    page,
    pageRel,
    "Full QA gate runner is BL-018",
    "stub copy removed",
  );
  assertNotIncludes(
    page,
    pageRel,
    "Sent via MCP",
    "must not toast Sent via MCP",
  );
  assertIncludes(
    page,
    pageRel,
    "autoStartedPackages",
    "auto-run guard survives Strict Mode remount",
  );
  assertIncludes(
    page,
    pageRel,
    "const autoStartedPackages = new Set",
    "auto-run Set is module-scoped not per-mount ref",
  );
  assertIncludes(
    page,
    pageRel,
    "mutationForPackage",
    "QA result scoped to current package_id",
  );
  assertIncludes(
    page,
    pageRel,
    "runMutation.variables === packageId",
    "POST/cache keyed by mutate package id",
  );
  assertIncludes(
    page,
    pageRel,
    "runErrorForPackage",
    "failed auto-run exits running state",
  );
  assertIncludes(
    page,
    pageRel,
    "setQueryData(packageQaQueryKey(pid)",
    "onSuccess writes cache for mutate pid not search",
  );
  assertIncludes(
    page,
    pageRel,
    "autoStartedPackages.delete",
    "failed POST clears auto-run guard for retry",
  );
  assertIncludes(
    page,
    pageRel,
    "firstEvidenceForHardTest",
    "FAIL rows join evidence via evidence_ids order",
  );
  assertIncludes(
    page,
    pageRel,
    "Loading latest QA",
    "GET pending shows loading not running",
  );
  assertNotIncludes(
    page,
    pageRel,
    "autoRunInFlight",
    "must not treat Set membership alone as running",
  );
  assertIncludes(
    page,
    pageRel,
    "if (runMutation.isPending) return",
    "auto-run waits for any in-flight POST",
  );
  assertNotIncludes(
    page,
    pageRel,
    '.includes("fail")',
    "evidence hint must not match bare fail values",
  );
}

console.log("\nQA-01 Step 8 — FlowStepper Handoff gate\n");

const useCasesRel = "src/lib/use-cases.ts";
const useCases = readSrc(useCasesRel);
const shellRel = "src/components/klints/AppShell.tsx";
const shell = readSrc(shellRel);
const stepperRel = "src/components/klints/FlowStepper.tsx";
const stepper = readSrc(stepperRel);
const handoffRel = "src/routes/handoff.tsx";
const handoff = readSrc(handoffRel);

if (useCases) {
  assertIncludes(
    useCases,
    useCasesRel,
    'handoffQaLocked: "Clear QA (≥80, all hard tests) first"',
    "§8.7 Handoff locked tooltip copy",
  );
  assertIncludes(
    useCases,
    useCasesRel,
    'ctx.qaPending || ctx.qaStatus !== "PASS"',
    "Handoff locked unless PASS (pending included)",
  );
  assertIncludes(
    useCases,
    useCasesRel,
    "ctx.packageId || ctx.ucFromSearch",
    "QA stage enables on package_id or working uc",
  );
  assertIncludes(
    useCases,
    useCasesRel,
    'input.qaStatus === "PASS"',
    "deriveJourneyStage respects QA PASS for /handoff",
  );
  assertIncludes(
    useCases,
    useCasesRel,
    "export function parseHandoffSearch",
    "handoff search preserves package_id / qa_run_id",
  );
}

if (shell) {
  assertIncludes(shell, shellRel, "getLatestPackageQa", "AppShell loads latest package QA");
  assertIncludes(shell, shellRel, "qaMatchesPackage", "QA result must match package_id");
  assertIncludes(shell, shellRel, "qaStatus:", "AppShell passes qaStatus to journey");
  assertIncludes(shell, shellRel, "qaPending:", "AppShell passes qaPending to journey");
}

if (stepper) {
  assertIncludes(stepper, stepperRel, "qaStatus: journey?.qaStatus", "FlowStepper forwards qaStatus");
  assertIncludes(
    stepper,
    stepperRel,
    "journeyActive",
    "stepper lights up for package/uc journey without issue",
  );
}

if (handoff) {
  assertIncludes(
    handoff,
    handoffRel,
    "parseHandoffSearch",
    "handoff route validates package + qa_run_id search",
  );
}

console.log("\nQA-01 Step 9 — §12 Acceptance sweep\n");

const studioRel = "src/components/workflow/WorkflowStudio.tsx";
const studio = readSrc(studioRel);
const beRoot = join(ROOT, "..", "klints_backend");
const gapsRel = "docs/sahil/QA_01_WORKING_GAPS.md";
const gapsPath = join(beRoot, gapsRel);
const gaps = existsSync(gapsPath) ? readFileSync(gapsPath, "utf8") : "";
const beVerifyRel = "scripts/verify_qa01_backend.py";
const beVerifyPath = join(beRoot, beVerifyRel);

assertIncludes(
  gaps || "",
  gapsRel,
  "Demo path — UC-02",
  "§12: UC-02 demo path documented in WORKING_GAPS",
);
assertIncludes(
  gaps || "",
  gapsRel,
  "**Right:**",
  "§12: PR right note in WORKING_GAPS",
);
assertIncludes(
  gaps || "",
  gapsRel,
  "**Gap:**",
  "§12: PR gap note in WORKING_GAPS",
);
if (existsSync(beVerifyPath)) pass("BE verify_qa01_backend.py exists");
else fail("BE verify_qa01_backend.py exists");

assertIncludes(
  page,
  pageRel,
  "getLatestPackageQa",
  "§12: /qa live score path (loads latest QA)",
);
assertIncludes(
  page,
  pageRel,
  "hardTestLabel",
  "§12: /qa shows hard-test gate rows",
);
assertNotIncludes(
  page,
  pageRel,
  "getQaRunForIssue",
  "§12: /qa not fixture-primary",
);
assertIncludes(page, pageRel, "Re-run QA", "§12: Re-run control present");
assertIncludes(
  page,
  pageRel,
  "setQueryData(packageQaQueryKey(pid)",
  "§12: Re-run refreshes QA cache",
);
assertIncludes(page, pageRel, "canHandoff", "§12: Handoff CTA gated on PASS");
assertIncludes(page, pageRel, "Handoff locked", "§12: Handoff locked when not PASS");

if (studio) {
  assertIncludes(
    studio,
    studioRel,
    'to="/qa"',
    "§12: Studio → QA deep-link",
  );
  assertIncludes(
    studio,
    studioRel,
    "package_id: pkg.package_id",
    "§12: Studio QA link carries package_id",
  );
  assertIncludes(
    studio,
    studioRel,
    "No live MCP send",
    "§12: Studio CTA honesty (not MCP send)",
  );
}

assertIncludes(
  useCases,
  useCasesRel,
  'handoffQaLocked: "Clear QA (≥80, all hard tests) first"',
  "§12: FlowStepper Handoff tooltip §8.7",
);
assertIncludes(
  useCases,
  useCasesRel,
  'ctx.qaPending || ctx.qaStatus !== "PASS"',
  "§12: FlowStepper Handoff only on QA PASS",
);

const beApiTest = join(beRoot, "dataruns/tests/test_qa_api_step5.py");
const beRunTest = join(beRoot, "dataruns/tests/test_qa_run_step4.py");
const beEvalTest = join(beRoot, "dataruns/tests/test_qa_evaluators_step3.py");
const beApi = existsSync(beApiTest) ? readFileSync(beApiTest, "utf8") : "";
const beRun = existsSync(beRunTest) ? readFileSync(beRunTest, "utf8") : "";
const beEval = existsSync(beEvalTest) ? readFileSync(beEvalTest, "utf8") : "";

assertIncludes(
  beApi,
  "test_qa_api_step5.py",
  "test_post_qa_returns_201_schema_and_audits",
  "§12: POST QA schema + audit test",
);
assertIncludes(
  beApi,
  "test_qa_api_step5.py",
  "test_rerun_appends_and_get_returns_newest",
  "§12: Re-run appends history (API)",
);
assertIncludes(
  beRun,
  "test_qa_run_step4.py",
  "test_uc02_golden_run_passes_and_audits",
  "§12: UC-02 golden PASS + audit",
);
assertIncludes(
  beRun,
  "test_qa_run_step4.py",
  "test_hard_fail_forces_fail_even_when_score_ge_minimum",
  "§12: hard FAIL ⇒ overall FAIL",
);
assertIncludes(
  beEval,
  "test_qa_evaluators_step3.py",
  "test_uc02_golden_all_seven_pass",
  "§12: all 7 hard_tests evaluated",
);
assertIncludes(
  beRun,
  "test_qa_run_step4.py",
  "test_compute_score_all_pass_but_below_minimum_fails",
  "§12: PASS requires score ≥ minimum",
);

const pkg = readSrc("package.json");
assertIncludes(pkg, "package.json", '"verify:qa01"', "package.json has verify:qa01");

console.log(`\n${failed === 0 ? "OK" : "FAILED"} — ${failed} failure(s)\n`);
process.exit(failed === 0 ? 0 : 1);
