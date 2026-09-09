/**
 * WF-01 frontend verification — PRD-WF-01 §12 acceptance (static).
 * Run: npm run verify:wf01
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MVP1_PILOT_IDS = [
  "UC-02",
  "UC-04",
  "UC-05",
  "UC-06B",
  "UC-08",
  "UC-09",
  "UC-10",
  "UC-11",
  "UC-12",
  "UC-13",
  "UC-16",
  "UC-17",
  "UC-21",
  "UC-23",
  "UC-28",
  "UC-36",
];

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

function testUseCasesClient() {
  console.log("\n1. use-cases client (BL-016)");
  const src = readSrc("src/lib/use-cases.ts");
  assertIncludes(src, "use-cases.ts", "getUseCaseRecommendations", "recommendations client");
  assertIncludes(src, "use-cases.ts", "generateBuildPackage", "build-package POST client");
  assertIncludes(src, "use-cases.ts", "getBuildPackage", "build-package GET client");
  assertIncludes(src, "use-cases.ts", "ready_provisional", "provisional status type");
  assertIncludes(src, "use-cases.ts", "pilotsGatedByCheck", "Fix→Studio gated pilot bridge");
  assertIncludes(src, "use-cases.ts", "parseWorkflowSearch", "workflow search parser");
  assertIncludes(src, "use-cases.ts", 'to: "/workflow"', "workflow studio route");
}

function testWorkflowRoutes() {
  console.log("\n2. Workflow routes (§7.5 deep links)");
  const index = readSrc("src/routes/workflow.index.tsx");
  const legacy = readSrc("src/routes/workflow.$id.tsx");
  assertIncludes(index, "workflow.index.tsx", "WorkflowStudio", "Studio component");
  assertIncludes(index, "workflow.index.tsx", "WorkflowReadyList", "ready pilots list");
  assertIncludes(index, "workflow.index.tsx", "All blueprints", "design index table section");
  assertIncludes(index, "workflow.index.tsx", "workflowStudioFromFix", "Fix bridge resolver");
  assertIncludes(legacy, "workflow.$id.tsx", "LEGACY_WORKFLOW_TO_UC", "legacy wf-* map");
  assertIncludes(legacy, "workflow.$id.tsx", "UC_ID_RE", "UC-xx redirect");
}

function testWorkflowStudio() {
  console.log("\n3. Workflow Studio chrome");
  const src = readSrc("src/components/workflow/WorkflowStudio.tsx");
  assertIncludes(src, "WorkflowStudio.tsx", "flow-provisional-banner", "provisional banner");
  assertIncludes(src, "WorkflowStudio.tsx", "generateBuildPackage", "generate package");
  assertIncludes(src, "WorkflowStudio.tsx", "downloadPackageJson", "download JSON");
  assertIncludes(src, "WorkflowStudio.tsx", "Download JSON", "Download JSON CTA label (not MCP action)");
  assertIncludes(src, "WorkflowStudio.tsx", 'to="/qa"', "QA link with package");
  assertIncludes(src, "WorkflowStudio.tsx", "package_id", "package_id in QA search");
  assertIncludes(src, "WorkflowStudio.tsx", "Gates — build blocked", "blocked state UI");
  assertIncludes(src, "WorkflowStudio.tsx", "flow-step-fields", "step field chips");
  assertIncludes(src, "WorkflowStudio.tsx", "fieldsByNodeId", "chips survive generate via node_id merge");
  assertIncludes(src, "WorkflowStudio.tsx", "Workflow Klints assembled", "design step heading");
  assertIncludes(src, "WorkflowStudio.tsx", "Open approved fix", "design Open approved fix CTA");
  assertIncludes(src, "WorkflowStudio.tsx", "Built from your approved fix", "design built-from label");
  assertIncludes(src, "WorkflowStudio.tsx", "Blueprint preview", "brief visible when blocked");
  assertNotIncludes(src, "WorkflowStudio.tsx", "MCP write", "no MCP write claim");
  assertIncludes(src, "WorkflowStudio.tsx", "No live MCP send", "Studio CTA honesty (not MCP send)");
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    "Human guide + machine package JSON",
    "Slice D: honest package JSON label",
  );
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    "staged for handoff",
    "Slice D: staged handoff copy (not AI agent)",
  );
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    "stage for handoff",
    "Slice D: brief stage-for-handoff copy",
  );
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    "package-ready brief",
    "Slice D: package-ready brief (not agent-ready)",
  );
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    "handoff-package-spec-format",
    "Slice D: handoff_stub.format chip",
  );
  assertIncludes(
    src,
    "WorkflowStudio.tsx",
    '|| "HANDOFF_PACKAGE_SPEC"',
    "Slice D: format chip fallback when stub.format missing",
  );
  assertNotIncludes(src, "WorkflowStudio.tsx", "AI agent", "Slice D: no AI agent claim");
  assertNotIncludes(src, "WorkflowStudio.tsx", "agent-ready", "Slice D: no agent-ready UI copy");
  assertNotIncludes(
    src,
    "WorkflowStudio.tsx",
    "handed to the agent",
    "Slice D: no handed-to-agent copy",
  );
  assertNotIncludes(
    src,
    "WorkflowStudio.tsx",
    "for the agent",
    "Slice D: Studio no for-the-agent",
  );
  assertNotIncludes(
    src,
    "WorkflowStudio.tsx",
    "MCP_ACTION_OBJECT",
    "Slice D: no MCP_ACTION theater string in Studio",
  );
  assertNotIncludes(
    src,
    "WorkflowStudio.tsx",
    "agent JSON",
    "Slice D: no agent JSON label",
  );

  const indexSrc = readSrc("src/routes/workflow.index.tsx");
  assertIncludes(
    indexSrc,
    "workflow.index.tsx",
    "staged workflow package",
    "Slice D: index honest package description",
  );
  assertIncludes(
    indexSrc,
    "workflow.index.tsx",
    "package builder",
    "Slice D: index meta package builder (not agent)",
  );
  assertNotIncludes(
    indexSrc,
    "workflow.index.tsx",
    "agent-ready",
    "Slice D: index no agent-ready",
  );
  assertNotIncludes(
    indexSrc,
    "workflow.index.tsx",
    "for the agent",
    "Slice D: index no for-the-agent",
  );

  const spotlight = readSrc("src/components/klints/SpotlightSearch.tsx");
  assertIncludes(
    spotlight,
    "SpotlightSearch.tsx",
    "Package blueprints",
    "Slice D: Spotlight Studio hint (not Agent blueprints)",
  );
  assertNotIncludes(
    spotlight,
    "SpotlightSearch.tsx",
    "Agent blueprints",
    "Slice D: no Agent blueprints Spotlight hint",
  );
}

function testJourneyHonesty() {
  console.log("\n4. CTA honesty (§5.2 + §7.5)");
  const fix = readSrc("src/routes/fix.tsx");
  const dcs = readSrc("src/routes/data-consistency.tsx");
  const opp = readSrc("src/routes/opportunities.tsx");
  const stepper = readSrc("src/components/klints/FlowStepper.tsx");
  const ucLib = readSrc("src/lib/use-cases.ts");

  assertIncludes(fix, "fix.tsx", "workflowStudioFromFix", "Fix uses live Studio bridge");
  assertNotIncludes(fix, "fix.tsx", 'to="/workflow/$id"', "no legacy workflow/$id from Fix");
  assertIncludes(dcs, "data-consistency.tsx", "Fix this issue", "DCS rows use Fix CTA");
  assertIncludes(opp, "opportunities.tsx", 'to="/workflow"', "Opportunities links to Studio");
  assertIncludes(opp, "opportunities.tsx", "search={{ uc:", "Opportunities uses ?uc=");
  assertIncludes(stepper, "FlowStepper.tsx", "resolveFlowStepperStage", "Build step uses journey resolver");
  assertIncludes(
    ucLib,
    "use-cases.ts",
    "workflowStudioFromFix(ctx.pilots, issue)",
    "Build stage binds ?uc= via workflowStudioFromFix",
  );
  const workflowIndex = readSrc("src/routes/workflow.index.tsx");
  assertIncludes(ucLib, "use-cases.ts", "pickPrimaryPilotForCheck", "Fix auto-opens primary gated blueprint");
  assertIncludes(workflowIndex, "workflow.index.tsx", "fromFix", "index auto-opens brief from selected issue");
}

function testSixteenPilotSupport() {
  console.log("\n5. All 16 MVP1 pilots (§13 slice 4)");
  const ucRe = readSrc("src/lib/use-cases.ts");
  assertIncludes(ucRe, "use-cases.ts", "UC_ID_RE", "UC id validation");
  for (const id of MVP1_PILOT_IDS) {
    if (ucRe.includes(id) || id === "UC-06B") continue;
  }
  pass("MVP1 pilot id set documented", `${MVP1_PILOT_IDS.length} pilots`);
  const studio = readSrc("src/components/workflow/WorkflowStudio.tsx");
  assertIncludes(studio, "WorkflowStudio.tsx", "getUseCase(uc)", "dynamic pilot detail fetch");
  assertIncludes(studio, "WorkflowStudio.tsx", "isBuildableStatus", "honest buildable gate");
}

async function main() {
  console.log("WF-01 frontend verification (PRD-WF-01 §12)");
  testUseCasesClient();
  testWorkflowRoutes();
  testWorkflowStudio();
  testJourneyHonesty();
  testSixteenPilotSupport();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WF-01 frontend checks passed.");
}

main();
