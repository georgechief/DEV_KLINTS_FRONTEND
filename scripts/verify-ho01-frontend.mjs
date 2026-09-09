/**
 * HO-01 frontend verification — live /handoff bind, STAGED UI, Send locked.
 * Run: npm run verify:ho01
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

function countMatches(src, pattern) {
  const m = src.match(pattern);
  return m ? m.length : 0;
}

console.log("=== HO-01 FRONTEND VERIFICATION ===\n");

const handoffRel = "src/routes/handoff.tsx";
const handoffLibRel = "src/lib/handoff.ts";
const sendLockedRel = "src/components/klints/HandoffSendLocked.tsx";
const handoff = readSrc(handoffRel);
const handoffLib = readSrc(handoffLibRel);
const sendLocked = readSrc(sendLockedRel);

console.log("Step 7 — live bind");
assertIncludes(handoffLib, handoffLibRel, "fetchHandoffForDeepLink", "deep-link fetch helper");
assertIncludes(handoffLib, handoffLibRel, "stagePackageHandoff", "POST stage helper");
assertIncludes(handoff, handoffRel, "parseHandoffSearch", "handoff search validation");
assertNotIncludes(
  handoff,
  handoffRel,
  "getHandoffForIssue(",
  "no fixture call on /handoff",
);

console.log("\nStep 8 — STAGED UI");
assertIncludes(handoff, handoffRel, "LiveHandoffBody", "live STAGED body");
assertIncludes(handoffLib, handoffLibRel, "handoffRouteSummary", "route summary helper");
if (
  handoff.includes("Activation stays human in Manago") ||
  handoff.includes("human activation in Manago") ||
  handoff.includes("HANDOFF_APPROVED_BANNER")
) {
  pass("Manago honesty banner");
} else {
  fail("Manago honesty banner", "missing Manago human-activation copy in handoff.tsx");
}
assertIncludes(handoff, handoffRel, 'title="Handoff"', "Slice D: Handoff page title (not Agent handoff)");
assertIncludes(
  handoff,
  handoffRel,
  "Staged package · machine spec",
  "Slice D: staged package machine spec label",
);
assertNotIncludes(handoff, handoffRel, "Agent handoff", "Slice D: no Agent handoff on page");
assertNotIncludes(handoff, handoffRel, "Agent-ready", "Slice D: no Agent-ready package label");
assertIncludes(
  handoff,
  handoffRel,
  "does not auto-send via MCP",
  "Slice D: no MCP auto-send honesty",
);

const appShell = readSrc("src/components/klints/AppShell.tsx");
assertIncludes(
  appShell,
  "AppShell.tsx",
  'label: "Handoff"',
  "Slice D: nav Handoff (not Agent handoff)",
);
assertNotIncludes(appShell, "AppShell.tsx", "Agent handoff", "Slice D: nav no Agent handoff");

const spotlight = readSrc("src/components/klints/SpotlightSearch.tsx");
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  'label: "Handoff"',
  "Slice D: Spotlight Handoff label",
);
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "Staged package · human activation",
  "Slice D: Spotlight Handoff unlocked hint",
);
assertNotIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "Agent handoff",
  "Slice D: Spotlight no Agent handoff",
);
assertNotIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "Deliver validated specs",
  "Slice D: no Deliver validated specs hint",
);

const klintsData = readSrc("src/lib/klints-data.ts");
assertIncludes(
  klintsData,
  "klints-data.ts",
  'short: "Handoff"',
  "Slice D: journey stepper short Handoff",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "Agent handoff",
  "Slice D: stepper no Agent handoff",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "for the agent",
  "Slice D Phase 5: fixtures no for-the-agent",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "Delivered to agent",
  "Slice D Phase 5: fixtures no Delivered-to-agent",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "MCP / A2A → Manago.ai agent",
  "Slice D Phase 5: fixtures no MCP/A2A delivery claim",
);
assertIncludes(
  klintsData,
  "klints-data.ts",
  "Staged package · human activation in Manago.ai",
  "Slice D Phase 5: fixture handoff delivery honesty",
);
assertIncludes(
  klintsData,
  "klints-data.ts",
  "Manago.ai answers questions",
  "Slice D Phase 5: Diagnose provenance names Manago (not bare The agent)",
);
assertIncludes(
  klintsData,
  "klints-data.ts",
  "Manago.ai knows what sells",
  "Slice D Phase 5: margin provenance names Manago",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "The agent answers questions",
  "Slice D Phase 5: no bare The-agent provenance",
);
assertNotIncludes(
  klintsData,
  "klints-data.ts",
  "The agent knows what sells",
  "Slice D Phase 5: no bare The-agent margin provenance",
);
const overviewPanelRel = "src/components/klints/OverviewPanel.tsx";
const overviewPanel = readSrc(overviewPanelRel);
assertIncludes(
  overviewPanel,
  overviewPanelRel,
  "Manago.ai agent builds the workflow",
  "Slice D Phase 5: Overview external Manago target",
);
assertNotIncludes(
  overviewPanel,
  overviewPanelRel,
  "; the agent builds the workflow.",
  "Slice D Phase 5: Overview no bare agent builds",
);

const lifecycleRel = "src/routes/lifecycle.tsx";
const lifecycle = readSrc(lifecycleRel);
assertIncludes(
  lifecycle,
  lifecycleRel,
  "Rule-based architecture assessment",
  "Slice D Phase 6: Lifecycle W6-04 rule-based honesty",
);
assertIncludes(
  lifecycle,
  lifecycleRel,
  "Rule-based architecture assessment across the lifecycle",
  "Slice D Phase 6: Lifecycle head meta rule-based",
);
{
  const subtitleHits = countMatches(
    lifecycle,
    /subtitle="Rule-based architecture assessment"/g,
  );
  if (subtitleHits >= 3) {
    pass(
      "Slice D Phase 6: loading/error/ready AppShell subtitles rule-based",
      String(subtitleHits),
    );
  } else {
    fail(
      "Slice D Phase 6: loading/error/ready AppShell subtitles rule-based",
      `expected >=3 subtitle locks, got ${subtitleHits}`,
    );
  }
}
assertIncludes(
  lifecycle,
  lifecycleRel,
  "Not an AI agent",
  "Slice D Phase 6: Lifecycle not-AI-agent honesty",
);
assertNotIncludes(
  lifecycle,
  lifecycleRel,
  "Lifecycle Architect",
  "Slice D Phase 6: no Lifecycle Architect theater",
);
assertNotIncludes(
  lifecycle,
  lifecycleRel,
  "is an AI agent",
  "Slice D Phase 6: no positive AI-agent claim",
);
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "Rule-based architecture assessment",
  "Slice D Phase 6: Spotlight Lifecycle hint",
);

assertIncludes(
  handoff,
  handoffRel,
  "Handoff — Klints",
  "Slice D: document title Handoff",
);
assertIncludes(
  handoff,
  handoffRel,
  "Phase 5 · Handoff · staged package",
  "Slice D: Handoff kicker",
);

console.log("\nStep 9 — empty / blocked");
assertIncludes(handoff, handoffRel, "HandoffQaBlockedEmpty", "QA blocked empty state");
assertIncludes(handoff, handoffRel, "getLatestPackageQa", "proactive QA gate fetch");
assertIncludes(handoff, handoffRel, "qaResultMatchesPackage", "QA package match gate");
assertIncludes(handoff, handoffRel, "Preparing staged handoff", "preparing copy");

console.log("\nStep 10 — Send locked (PRD §6.3 / §8)");
assertIncludes(
  handoffLib,
  handoffLibRel,
  "HANDOFF_SEND_DISABLED_TITLE",
  "shared Send disabled title",
);
assertIncludes(
  handoffLib,
  handoffLibRel,
  "HANDOFF_SEND_LOCKED_HINT",
  "delivery honesty hint",
);
assertIncludes(
  handoffLib,
  handoffLibRel,
  "auto-deliver via MCP",
  "Slice D: locked Send hint uses MCP honesty (not agent)",
);
assertNotIncludes(
  handoffLib,
  handoffLibRel,
  "deliver to an agent",
  "Slice D: locked Send hint no deliver-to-agent",
);
assertIncludes(handoff, handoffRel, "HandoffSendLockedButton", "locked Send uses shared control");
assertIncludes(sendLocked, sendLockedRel, 'data-handoff-send-locked="true"', "Send locked data marker");
assertIncludes(sendLocked, sendLockedRel, "aria-disabled", "Send locked aria-disabled");
assertIncludes(sendLocked, sendLockedRel, "HANDOFF_SEND_DISABLED_TITLE", "title from SoT constant");
assertIncludes(sendLocked, sendLockedRel, "lockedTitle", "locked title prop on wrapper span");

const ho02Live =
  handoffLib.includes("approveHandoffForActivation") &&
  handoff.includes("HandoffApproveButton");

const lockedButtonUses = (handoff.match(/<HandoffSendLockedButton/g) || []).length;
if (ho02Live) {
  if (lockedButtonUses >= 1) {
    pass("HandoffSendLocked retained for ineligible users", String(lockedButtonUses));
  } else {
    fail("HandoffSendLocked retained for ineligible users", "expected ≥1");
  }
  if (handoff.includes("data-handoff-approve")) {
    pass("HO-02 live approve control present");
  } else {
    fail("HO-02 live approve control present");
  }
} else if (lockedButtonUses >= 3) {
  pass("all Send surfaces use HandoffSendLockedButton", String(lockedButtonUses));
} else {
  fail("all Send surfaces use HandoffSendLockedButton", `found ${lockedButtonUses}, expected ≥3`);
}

assertNotIncludes(handoff, handoffRel, 'toast.success("Sent"', "no fake Sent success toast");
assertNotIncludes(handoff, handoffRel, "toast.success('Sent'", "no fake Sent success toast (single quotes)");
assertNotIncludes(handoffLib, handoffLibRel, "sendHandoff", "no sendHandoff API client");
assertNotIncludes(handoffLib, handoffLibRel, "activateHandoff", "no activateHandoff API client");

if (/onClick\s*=/.test(sendLocked)) {
  fail("HandoffSendLockedButton has no onClick handler");
} else {
  pass("HandoffSendLockedButton has no onClick handler");
}

const rawSendButtons = handoff.match(/>\s*Send\s*<\/button>/g);
if (!rawSendButtons || rawSendButtons.length === 0) {
  pass("no raw Send </button> outside locked component");
} else {
  fail("no raw Send </button> outside locked component", String(rawSendButtons.length));
}

console.log("\nStep 11 — §9 Acceptance sweep");

const beRoot = join(ROOT, "..", "klints_backend");
const gapsRel = "docs/sahil/HO_01_WORKING_GAPS.md";
const gapsPath = join(beRoot, gapsRel);
const gaps = existsSync(gapsPath) ? readFileSync(gapsPath, "utf8") : "";
const prdPath = join(beRoot, "docs/sahil/PRD_HO_01_HANDOFF_PACKAGE_BIND.md");
const prd = existsSync(prdPath) ? readFileSync(prdPath, "utf8") : "";
const beVerifyPath = join(beRoot, "scripts/verify_ho01_backend.py");
const qaRel = "src/routes/qa.tsx";
const qa = readSrc(qaRel);
const packageJson = readSrc("package.json");

assertIncludes(gaps || "", gapsRel, "Demo path — UC-02", "§9: UC-02 demo path in WORKING_GAPS");
assertIncludes(gaps || "", gapsRel, "**Right:**", "§9: PR right note in WORKING_GAPS");
assertIncludes(gaps || "", gapsRel, "**Gap:**", "§9: PR gap note in WORKING_GAPS");
assertIncludes(gaps || "", gapsRel, "workflow.handoff_staged", "§9: audit documented");
if (existsSync(beVerifyPath)) pass("BE verify_ho01_backend.py exists");
else fail("BE verify_ho01_backend.py exists");

assertIncludes(
  prd || "",
  "PRD_HO_01_HANDOFF_PACKAGE_BIND.md",
  "- [x] Staged",
  "§9: PRD acceptance checked off",
);

assertIncludes(handoff, handoffRel, "fetchHandoffForDeepLink", "§9: live deep-link fetch");
assertIncludes(handoff, handoffRel, "package_id", "§9: package_id search param used");
assertIncludes(handoff, handoffRel, "qa_run_id", "§9: qa_run_id deep-link preserved");
assertIncludes(qa, qaRel, "handoffFromQa", "§9: QA Continue uses handoffFromQa");
assertIncludes(qa, qaRel, "Continue to Handoff", "§9: QA → Handoff CTA on PASS");
assertIncludes(handoffLib, handoffLibRel, "HANDOFF_SEND_DISABLED_TITLE", "§9: Send disabled copy SoT");
assertIncludes(handoff, handoffRel, "qaGateOpen", "§9: live handoff gated on QA PASS");
assertIncludes(handoff, handoffRel, "gateQa", "§9: gate QA passed to STAGED UI");
assertIncludes(handoffLib, handoffLibRel, "handoffMatchesGateQa", "§9: stale handoff gate match");

console.log("\nStep 12 — PR readiness");
assertIncludes(gaps || "", gapsRel, "## Step 12 — PR (manual)", "Step 12 PR section in WORKING_GAPS");
assertIncludes(gaps || "", gapsRel, "feature/ho-01-handoff-package-bind", "branch name documented");
assertIncludes(gaps || "", gapsRel, "klints_backend", "split repo guidance");
assertIncludes(gaps || "", gapsRel, "klints_frontend", "split repo guidance");
assertIncludes(
  prd || "",
  "PRD_HO_01_HANDOFF_PACKAGE_BIND.md",
  "Frontend PR title",
  "split FE/BE PR titles in PRD §11",
);
assertIncludes(packageJson, "package.json", "verify:ho01", "package.json verify:ho01 script");

console.log(`\nHO-01 frontend verification: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
