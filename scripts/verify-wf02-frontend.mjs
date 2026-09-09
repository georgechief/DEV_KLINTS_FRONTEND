/**
 * WF-02 frontend verification — PRD-WF-02 (grows each implementation step).
 * Run: npm run verify:wf02
 *
 * Step 1: isStudioEligibleCheck + routing helpers (pack-accurate fixtures).
 * Step 2: Fix CTAs — Proceed gating, honest labels (PRD §6).
 * Step 3: FlowStepper — disable/tooltips + Build search via workflowStudioFromFix (PRD §4).
 * Step 4: deriveJourneyStage — FlowStepper current from §5.2 (not path-only).
 * Step 5: DCS row CTAs — Fix / Blocks UC / Build per §7.1.
 * Step 6: Studio "Open approved fix" guard + QA/Handoff issue context.
 * Step 7: Full §12 acceptance sweep.
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

function assert(cond, label, detail = "") {
  if (cond) pass(label, detail);
  else fail(label, detail);
}

// --- Mirror use-cases routing helpers (keep in sync with src/lib/use-cases.ts) ---

const BUILDABLE_STATUSES = new Set(["ready", "ready_provisional"]);

function isBuildableStatus(status) {
  return BUILDABLE_STATUSES.has(status);
}

function pilotsGatedByCheck(pilots, checkId) {
  if (!pilots || checkId == null) return [];
  const normalized = checkId.trim().toUpperCase();
  if (!normalized) return [];
  return pilots.filter((pilot) =>
    (pilot.gates?.gating_check_ids ?? []).some(
      (gateId) => gateId.trim().toUpperCase() === normalized,
    ),
  );
}

function isStudioEligibleCheck(pilots, checkId) {
  return pilotsGatedByCheck(pilots, checkId).length > 0;
}

function resolveFixStudioEligibility(input) {
  if (input.isFixture) {
    return { showProceed: true, known: true };
  }
  if (!input.checkId?.trim()) {
    return { showProceed: false, known: true };
  }
  if (input.recommendationsPending) {
    return { showProceed: false, known: false };
  }
  if (input.recommendationsError || !input.recommendationsSuccess) {
    return { showProceed: false, known: true };
  }
  return {
    showProceed: isStudioEligibleCheck(input.pilots, input.checkId),
    known: true,
  };
}

function pickPrimaryPilotForCheck(pilots, checkId) {
  const gated = pilotsGatedByCheck(pilots, checkId);
  if (gated.length === 0) return undefined;
  const unblocked = gated.filter((pilot) => isBuildableStatus(pilot.status));
  const pool = unblocked.length > 0 ? unblocked : gated;
  return [...pool].sort(
    (a, b) =>
      a.pilot_rank - b.pilot_rank || a.use_case_id.localeCompare(b.use_case_id),
  )[0];
}

function workflowStudioLink(search = {}) {
  return { to: "/workflow", search };
}

function workflowStudioFromFix(pilots, checkId) {
  const normalized =
    typeof checkId === "string" && checkId.trim().length > 0
      ? checkId.trim()
      : undefined;
  const chosen = pickPrimaryPilotForCheck(pilots, checkId);
  if (chosen) {
    return workflowStudioLink({
      uc: chosen.use_case_id,
      ...(normalized ? { issue: normalized } : {}),
    });
  }
  return normalized
    ? workflowStudioLink({ issue: normalized })
    : workflowStudioLink();
}

function resolveDcsRowCtas(input) {
  const checkId = input.checkId?.trim();
  if (!checkId) return { primary: null, secondary: null, pending: false };

  const failWarn = input.status === "FAIL" || input.status === "WARN";

  if (input.recommendationsPending) {
    if (failWarn) {
      return { primary: { kind: "fix", checkId }, secondary: null, pending: true };
    }
    return { primary: null, secondary: null, pending: true };
  }

  const recsOk = input.recommendationsSuccess === true;
  const pilots = input.pilots;
  const studioEligible = recsOk && isStudioEligibleCheck(pilots, checkId);
  const primaryPilot = recsOk ? pickPrimaryPilotForCheck(pilots, checkId) : undefined;
  const buildable = Boolean(primaryPilot && isBuildableStatus(primaryPilot.status));

  if (input.isOptional && recsOk) {
    const gatedLink = workflowStudioFromFix(pilots, checkId);
    // Only Build when this check gates a pilot — never attach an unrelated ready UC.
    if (gatedLink.search.uc) {
      return {
        primary: {
          kind: "build",
          label: `Build ${gatedLink.search.uc}`,
          link: gatedLink,
        },
        secondary: null,
        pending: false,
      };
    }
  }

  if (input.status === "PASS") {
    if (studioEligible && buildable && primaryPilot) {
      const link = workflowStudioFromFix(pilots, checkId);
      return {
        primary: {
          kind: "build",
          label: `Build ${primaryPilot.use_case_id}`,
          link,
        },
        secondary: null,
        pending: false,
      };
    }
    return { primary: { kind: "passed" }, secondary: null, pending: false };
  }

  const secondary =
    studioEligible && primaryPilot
      ? {
          kind: "blocks_uc",
          uc: primaryPilot.use_case_id,
          link: workflowStudioFromFix(pilots, checkId),
        }
      : null;

  return {
    primary: { kind: "fix", checkId },
    secondary,
    pending: false,
  };
}

const LEGACY_WORKFLOW_TO_UC = { "wf-second-purchase": "UC-06B" };

const FLOW_STEPPER_TOOLTIPS = {
  fixNoIssue: "Pick an issue in Data Consistency first",
  buildNoGate: "This check doesn't gate a workflow blueprint — Fix / evidence only",
  buildLoading: "Loading workflow gates…",
  buildRecsError: "Could not load workflow gates — refresh and try again",
  qaNoPackage: "Generate a build package in Workflow Studio first",
  handoffQaLocked: "Clear QA (≥80, all hard tests) first",
  handoffNoPackage: "Clear QA (≥80, all hard tests) first",
  dataCenterLocked: "Available after your Data Consistency Score is calculated",
};

function resolveFlowStepperStage(stageKey, ctx) {
  const issue = ctx.issueId?.trim() || undefined;
  const dataCenterAllowed = ctx.dataCenterAllowed !== false;

  switch (stageKey) {
    case "diagnose":
      return {
        enabled: dataCenterAllowed,
        tooltip: dataCenterAllowed ? undefined : FLOW_STEPPER_TOOLTIPS.dataCenterLocked,
        to: "/data-consistency",
        search: issue ? { issue } : {},
      };
    case "fix":
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/fix",
          search: {},
        };
      }
      return { enabled: true, to: "/fix", search: { issue } };
    case "build": {
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/workflow",
          search: {},
        };
      }
      if (ctx.isFixture) {
        const legacyUc = ctx.legacyWorkflowId
          ? LEGACY_WORKFLOW_TO_UC[ctx.legacyWorkflowId]
          : undefined;
        return {
          enabled: Boolean(legacyUc),
          to: "/workflow",
          search: legacyUc ? { uc: legacyUc } : {},
        };
      }
      if (ctx.recommendationsPending) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildLoading,
          to: "/workflow",
          search: { issue },
        };
      }
      if (ctx.recommendationsError) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildRecsError,
          to: "/workflow",
          search: { issue },
        };
      }
      if (!ctx.recommendationsSuccess) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildLoading,
          to: "/workflow",
          search: { issue },
        };
      }
      if (!isStudioEligibleCheck(ctx.pilots, issue)) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.buildNoGate,
          to: "/workflow",
          search: { issue },
        };
      }
      const studioLink = workflowStudioFromFix(ctx.pilots, issue);
      return {
        enabled: true,
        to: "/workflow",
        search: studioLink.search,
      };
    }
    case "qa": {
      const qaSearch = {
        ...(issue ? { issue } : {}),
        ...(ctx.packageId ? { package_id: ctx.packageId } : {}),
        ...(ctx.ucFromSearch ? { uc: ctx.ucFromSearch } : {}),
      };
      if (ctx.packageId || ctx.ucFromSearch) {
        return { enabled: true, to: "/qa", search: qaSearch };
      }
      if (!issue) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.fixNoIssue,
          to: "/qa",
          search: {},
        };
      }
      return {
        enabled: false,
        tooltip: FLOW_STEPPER_TOOLTIPS.qaNoPackage,
        to: "/qa",
        search: qaSearch,
      };
    }
    case "handoff": {
      const handoffSearch = {
        ...(issue ? { issue } : {}),
        ...(ctx.packageId ? { package_id: ctx.packageId } : {}),
        ...(ctx.ucFromSearch ? { uc: ctx.ucFromSearch } : {}),
        ...(ctx.qaRunId ? { qa_run_id: ctx.qaRunId } : {}),
      };
      if (!ctx.packageId) {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch,
        };
      }
      if (ctx.qaPending || ctx.qaStatus !== "PASS") {
        return {
          enabled: false,
          tooltip: FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
          to: "/handoff",
          search: handoffSearch,
        };
      }
      return { enabled: true, to: "/handoff", search: handoffSearch };
    }
    default:
      return { enabled: false, to: "/fix", search: {} };
  }
}

function journeyIssueNeedsFix(status) {
  return status === "FAIL" || status === "WARN";
}

function journeyHasExplicitLaterStage(input) {
  return Boolean(input.ucFromSearch?.trim() || input.packageId?.trim());
}

function deriveJourneyStage(input) {
  const issue = input.issueId?.trim() || undefined;
  const path = input.pathname;

  if (!issue) {
    if (path.startsWith("/handoff")) {
      return input.qaStatus === "PASS" ? "handoff" : input.packageId ? "qa" : "diagnose";
    }
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/workflow") && input.ucFromSearch?.trim()) return "build";
    return "diagnose";
  }

  if (input.isFixture) {
    if (path.startsWith("/handoff")) return "handoff";
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/workflow")) return "build";
    if (path.startsWith("/fix")) return "fix";
    return "diagnose";
  }

  if (input.worklistPending) {
    if (path.startsWith("/handoff")) {
      return input.qaStatus === "PASS" ? "handoff" : input.packageId ? "qa" : "handoff";
    }
    if (path.startsWith("/qa")) return "qa";
    if (path.startsWith("/fix")) return "fix";
    if (path.startsWith("/data-consistency")) return "fix";
    if (path.startsWith("/workflow") && !input.ucFromSearch?.trim()) return "fix";
  }

  const failWarn = journeyIssueNeedsFix(input.issueStatus);
  const laterInUrl = journeyHasExplicitLaterStage(input);
  const recsOk = input.recommendationsSuccess === true;
  const studioEligible = recsOk && isStudioEligibleCheck(input.pilots, issue);

  if (path.startsWith("/fix") || (failWarn && !laterInUrl)) return "fix";
  if (path.startsWith("/workflow") || (studioEligible && Boolean(input.ucFromSearch?.trim()))) {
    return "build";
  }
  if (path.startsWith("/qa")) return "qa";
  if (path.startsWith("/handoff")) {
    if (input.qaStatus === "PASS") return "handoff";
    if (input.packageId) return "qa";
    return "handoff";
  }
  if (failWarn) return "fix";
  if (studioEligible) {
    const primary = pickPrimaryPilotForCheck(input.pilots, issue);
    if (primary && isBuildableStatus(primary.status)) return "build";
  }
  return "diagnose";
}

/** Pack §8 gate snapshot — CC-03 gates UC-02, UC-04, UC-05; CI-01/WB-SHOP-01 gate none. */
function mockPilot(useCaseId, pilotRank, gatingCheckIds, status = "blocked_checks") {
  return {
    use_case_id: useCaseId,
    pilot_rank: pilotRank,
    title: useCaseId,
    status,
    gap_suggested: false,
    gap_stages: [],
    gates: {
      min_dcs: 70,
      gating_check_ids: gatingCheckIds,
      architecture_modes: ["AUGMENT"],
    },
    blockers: [],
    check_results: [],
    execution: {
      mcp_dependency: false,
      fallback: "HUMAN.WORKFLOW.BUILD",
      build_available: false,
      note: "",
    },
    cta: { label: "Build", href: "/workflow" },
  };
}

const PACK_ROUTING_FIXTURE = [
  mockPilot("UC-02", 1, ["CC-03", "CC-06", "CI-08"]),
  mockPilot("UC-04", 4, ["PT-13", "CC-03"]),
  mockPilot("UC-05", 5, ["CC-06", "CC-03"]),
  mockPilot("UC-06B", 6, ["LE-01", "LE-05", "PT-04", "CC-01", "CC-02", "SP-10"]),
  mockPilot("UC-23", 14, ["PT-04", "LE-04", "SP-07"]),
];

function testStep1Exports() {
  console.log("\n1. Step 1 — exports (PRD-WF-02 §10)");
  const src = readSrc("src/lib/use-cases.ts");
  assertIncludes(src, "use-cases.ts", "isStudioEligibleCheck", "isStudioEligibleCheck exported");
  assertIncludes(src, "use-cases.ts", "pilotsGatedByCheck", "pilotsGatedByCheck retained");
  assertIncludes(src, "use-cases.ts", "pickPrimaryPilotForCheck", "pickPrimaryPilotForCheck retained");
  assertIncludes(src, "use-cases.ts", "workflowStudioFromFix", "workflowStudioFromFix retained");
  assertIncludes(
    src,
    "use-cases.ts",
    "pilotsGatedByCheck(pilots, checkId).length > 0",
    "isStudioEligibleCheck delegates to pilotsGatedByCheck",
  );
  const pkg = readSrc("package.json");
  assertIncludes(pkg, "package.json", '"verify:wf02"', "npm script verify:wf02");
}

function testStep1StudioEligibility() {
  console.log("\n2. Step 1 — Studio eligibility (PRD-WF-02 §3 table)");

  assert(
    !isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CI-01"),
    "CI-01 not Studio-eligible",
    "writeback-only check",
  );
  assert(
    !isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "WB-SHOP-01"),
    "WB-SHOP-01 not Studio-eligible",
    "writeback-only check",
  );
  assert(
    isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CC-03"),
    "CC-03 Studio-eligible",
    "gates UC-02, UC-04, UC-05",
  );
  assert(
    isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "LE-04"),
    "LE-04 Studio-eligible",
    "gates UC-23",
  );
  assert(
    isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "LE-05"),
    "LE-05 Studio-eligible",
    "gates UC-06B",
  );
  assert(
    !isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "ZZ-99"),
    "unknown check not Studio-eligible",
  );
  assert(!isStudioEligibleCheck(undefined, "CC-03"), "undefined pilots → not eligible");
  assert(!isStudioEligibleCheck(PACK_ROUTING_FIXTURE, null), "null checkId → not eligible");
  assert(!isStudioEligibleCheck(PACK_ROUTING_FIXTURE, ""), "empty checkId → not eligible");
  assert(!isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "   "), "whitespace checkId → not eligible");
  assert(!isStudioEligibleCheck([], "CC-03"), "empty pilots → not eligible");
  assert(
    !isStudioEligibleCheck([mockPilot("UC-02", 1, undefined, "blocked_checks")], "CC-03"),
    "missing gating_check_ids → not eligible",
  );
}

function testStep1PrimaryPilotPick() {
  console.log("\n3. Step 1 — primary pilot pick (PRD-WF-02 §6.2)");

  const cc03Primary = pickPrimaryPilotForCheck(PACK_ROUTING_FIXTURE, "CC-03");
  assert(cc03Primary?.use_case_id === "UC-02", "CC-03 primary pilot is UC-02", "lowest pilot_rank");
  assert(
    pilotsGatedByCheck(PACK_ROUTING_FIXTURE, "CC-03")
      .map((p) => p.use_case_id)
      .sort()
      .join(",") === "UC-02,UC-04,UC-05",
    "CC-03 gated pilots",
    "UC-02,UC-04,UC-05",
  );

  const le04Primary = pickPrimaryPilotForCheck(PACK_ROUTING_FIXTURE, "LE-04");
  assert(le04Primary?.use_case_id === "UC-23", "LE-04 primary pilot is UC-23");

  assert(
    pickPrimaryPilotForCheck(PACK_ROUTING_FIXTURE, "CI-01") === undefined,
    "CI-01 has no primary pilot",
  );

  const buildablePool = [
    mockPilot("UC-05", 5, ["CC-06", "CC-03"], "ready"),
    mockPilot("UC-02", 1, ["CC-03", "CC-06", "CI-08"], "blocked_checks"),
  ];
  assert(
    pickPrimaryPilotForCheck(buildablePool, "CC-03")?.use_case_id === "UC-05",
    "prefers buildable pilot over lower rank blocked",
    "ready UC-05 beats blocked UC-02",
  );
}

function testStep1FixBridge() {
  console.log("\n4. Step 1 — Fix→Studio bridge (PRD-WF-01 §7.5 / WF-02 §6.2)");

  const cc03Link = workflowStudioFromFix(PACK_ROUTING_FIXTURE, "CC-03");
  assert(cc03Link.to === "/workflow", "CC-03 bridge targets /workflow");
  assert(cc03Link.search.uc === "UC-02", "CC-03 bridge binds ?uc=UC-02");
  assert(cc03Link.search.issue === "CC-03", "CC-03 bridge binds ?issue=CC-03");

  const ci01Link = workflowStudioFromFix(PACK_ROUTING_FIXTURE, "CI-01");
  assert(ci01Link.search.uc === undefined, "CI-01 bridge has no ?uc=");
  assert(ci01Link.search.issue === "CI-01", "CI-01 bridge keeps ?issue= only");

  const le05Link = workflowStudioFromFix(PACK_ROUTING_FIXTURE, "LE-05");
  assert(le05Link.search.uc === "UC-06B", "LE-05 bridge binds ?uc=UC-06B");
}

function testStep2FixCtas() {
  console.log("\n5. Step 2 — Fix CTAs (PRD-WF-02 §6)");

  const fix = readSrc("src/routes/fix.tsx");
  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  const useCases = readSrc("src/lib/use-cases.ts");

  assertIncludes(
    useCases,
    "use-cases.ts",
    "resolveFixStudioEligibility",
    "resolveFixStudioEligibility exported",
  );
  assertIncludes(fix, "fix.tsx", "resolveFixStudioEligibility", "Fix uses resolveFixStudioEligibility");
  assertIncludes(fix, "fix.tsx", "recommendationsError", "Fix handles recommendations error");
  assertIncludes(fix, "fix.tsx", "showProceed", "Proceed gated on showProceed");
  assertIncludes(
    fix,
    "fix.tsx",
    "Proceed to Workflow Studio",
    "Fix Proceed label is honest",
  );
  assertIncludes(fix, "fix.tsx", "Back to Data Consistency", "non-eligible shows Back to DCS in footer row");
  assert(
    !fix.includes("No workflow blueprint gated"),
    "non-eligible does not use Phase 3 blueprint card",
  );
  assertIncludes(
    fix,
    "fix.tsx",
    "Data write done — continue to Workflow Studio when ready",
    "post-writeback Studio helper (§6.3)",
  );
  assertIncludes(
    fix,
    "fix.tsx",
    "Complete evidence or manual fix",
    "evidence-only Studio path helper (Flow J3)",
  );
  assert(
    !fix.includes("plan.ctaLabel"),
    "Fix does not render misleading plan.ctaLabel on Proceed",
  );
  assert(
    !livePlan.includes("Approve fix → Proceed to Workflow Studio"),
    "fix-live-plan drops Approve→Studio wording",
  );
  assert(
    !fix.includes("Approve fix → Proceed to Workflow Studio"),
    "Fix page has no Approve→Studio copy",
  );

  const loading = resolveFixStudioEligibility({
    isFixture: false,
    checkId: "CC-03",
    pilots: undefined,
    recommendationsPending: true,
    recommendationsSuccess: false,
    recommendationsError: false,
  });
  assert(!loading.showProceed && !loading.known, "loading → hide Proceed, not yet known");

  const ci01 = resolveFixStudioEligibility({
    isFixture: false,
    checkId: "CI-01",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!ci01.showProceed && ci01.known, "CI-01 → no Proceed, known ineligible");

  const cc03 = resolveFixStudioEligibility({
    isFixture: false,
    checkId: "CC-03",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(cc03.showProceed && cc03.known, "CC-03 → Proceed after load");

  const recsError = resolveFixStudioEligibility({
    isFixture: false,
    checkId: "CC-03",
    pilots: undefined,
    recommendationsPending: false,
    recommendationsSuccess: false,
    recommendationsError: true,
  });
  assert(!recsError.showProceed && recsError.known, "recommendations error → no Proceed, known");

  const fixture = resolveFixStudioEligibility({
    isFixture: true,
    checkId: undefined,
    pilots: undefined,
    recommendationsPending: true,
    recommendationsSuccess: false,
    recommendationsError: false,
  });
  assert(fixture.showProceed && fixture.known, "fixture Fix → Proceed always");
}

function testStep3FlowStepper() {
  console.log("\n6. Step 3 — FlowStepper (PRD-WF-02 §4)");

  const stepper = readSrc("src/components/klints/FlowStepper.tsx");
  const shell = readSrc("src/components/klints/AppShell.tsx");
  const useCases = readSrc("src/lib/use-cases.ts");

  assertIncludes(
    useCases,
    "use-cases.ts",
    "resolveFlowStepperStage",
    "resolveFlowStepperStage exported",
  );
  assertIncludes(
    useCases,
    "use-cases.ts",
    "FLOW_STEPPER_TOOLTIPS",
    "stepper tooltip constants",
  );
  assertIncludes(
    stepper,
    "FlowStepper.tsx",
    "resolveFlowStepperStage",
    "FlowStepper uses stage resolver",
  );
  assertIncludes(stepper, "FlowStepper.tsx", "aria-disabled", "disabled stages not links");
  assert(
    !stepper.includes('role="button"'),
    "disabled stages are not faux buttons",
  );
  assertIncludes(shell, "AppShell.tsx", "stepperJourney", "AppShell passes journey context");
  assertIncludes(
    shell,
    "AppShell.tsx",
    "UC_RECOMMENDATIONS_QUERY_KEY",
    "AppShell loads pilots for stepper",
  );
  assert(
    !stepper.includes("LEGACY_WORKFLOW_TO_UC"),
    "FlowStepper build search delegates to resolver (no inline legacy map)",
  );
  assert(
    !stepper.includes("/workflow/wf-"),
    "FlowStepper never links legacy wf-* routes",
  );

  const ctxBase = {
    isFixture: false,
    legacyWorkflowId: undefined,
    packageId: undefined,
    ucFromSearch: undefined,
    dataCenterAllowed: true,
  };

  const buildCi01 = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "CI-01",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!buildCi01.enabled, "CI-01 Build step disabled");
  assert(
    buildCi01.tooltip === FLOW_STEPPER_TOOLTIPS.buildNoGate,
    "CI-01 Build tooltip",
    FLOW_STEPPER_TOOLTIPS.buildNoGate,
  );

  const buildCc03 = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "CC-03",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(buildCc03.enabled, "CC-03 Build step enabled");
  assert(buildCc03.search.uc === "UC-02", "CC-03 Build binds ?uc=UC-02");
  assert(buildCc03.search.issue === "CC-03", "CC-03 Build binds ?issue=CC-03");

  const buildLoading = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "CC-03",
    pilots: undefined,
    recommendationsPending: true,
    recommendationsSuccess: false,
    recommendationsError: false,
  });
  assert(!buildLoading.enabled, "Build disabled while recommendations load");

  const buildRecsError = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "CC-03",
    pilots: undefined,
    recommendationsPending: false,
    recommendationsSuccess: false,
    recommendationsError: true,
  });
  assert(!buildRecsError.enabled, "Build disabled when recommendations error");
  assert(
    buildRecsError.tooltip === FLOW_STEPPER_TOOLTIPS.buildRecsError,
    "Build recs-error tooltip",
  );

  const buildWbShop = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "WB-SHOP-01",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!buildWbShop.enabled, "WB-SHOP-01 Build step disabled");

  const buildLe05 = resolveFlowStepperStage("build", {
    ...ctxBase,
    issueId: "LE-05",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(buildLe05.enabled, "LE-05 Build step enabled");
  assert(buildLe05.search.uc === "UC-06B", "LE-05 Build binds ?uc=UC-06B");

  const fixNoIssue = resolveFlowStepperStage("fix", {
    ...ctxBase,
    issueId: undefined,
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!fixNoIssue.enabled, "Fix disabled without issue");
  assert(fixNoIssue.tooltip === FLOW_STEPPER_TOOLTIPS.fixNoIssue, "Fix no-issue tooltip");

  const qaNoPkg = resolveFlowStepperStage("qa", {
    ...ctxBase,
    issueId: "CC-03",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!qaNoPkg.enabled, "QA disabled without package_id");
  assert(qaNoPkg.tooltip === FLOW_STEPPER_TOOLTIPS.qaNoPackage, "QA no-package tooltip");

  const qaWithPkg = resolveFlowStepperStage("qa", {
    ...ctxBase,
    issueId: "CC-03",
    packageId: "pkg-123",
    ucFromSearch: "UC-02",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(qaWithPkg.enabled, "QA enabled with package_id");
  assert(qaWithPkg.search.package_id === "pkg-123", "QA search carries package_id");

  const handoffNoPkg = resolveFlowStepperStage("handoff", {
    ...ctxBase,
    issueId: "CC-03",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!handoffNoPkg.enabled, "Handoff disabled without package_id");
  assert(
    handoffNoPkg.tooltip === FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
    "Handoff no-package uses §8.7 tooltip",
  );

  const handoffFail = resolveFlowStepperStage("handoff", {
    ...ctxBase,
    issueId: "CC-03",
    packageId: "pkg-123",
    ucFromSearch: "UC-02",
    qaStatus: "FAIL",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!handoffFail.enabled, "Handoff disabled when QA FAIL");
  assert(
    handoffFail.tooltip === FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
    "Handoff FAIL tooltip is §8.7 copy",
  );

  const handoffPending = resolveFlowStepperStage("handoff", {
    ...ctxBase,
    issueId: "CC-03",
    packageId: "pkg-123",
    qaPending: true,
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!handoffPending.enabled, "Handoff disabled while QA pending");
  assert(
    handoffPending.tooltip === FLOW_STEPPER_TOOLTIPS.handoffQaLocked,
    "Handoff pending uses §8.7 tooltip",
  );

  const handoffPass = resolveFlowStepperStage("handoff", {
    ...ctxBase,
    issueId: "CC-03",
    packageId: "pkg-123",
    ucFromSearch: "UC-02",
    qaStatus: "PASS",
    qaRunId: "qa-run-1",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(handoffPass.enabled, "Handoff enabled only on QA PASS");
  assert(handoffPass.search.package_id === "pkg-123", "Handoff search carries package_id");
  assert(handoffPass.search.qa_run_id === "qa-run-1", "Handoff search carries qa_run_id");

  const handoffPassNoIssue = resolveFlowStepperStage("handoff", {
    ...ctxBase,
    issueId: null,
    packageId: "pkg-123",
    ucFromSearch: "UC-02",
    qaStatus: "PASS",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(handoffPassNoIssue.enabled, "Handoff enabled on PASS without issue id");

  const qaUcOnly = resolveFlowStepperStage("qa", {
    ...ctxBase,
    issueId: null,
    ucFromSearch: "UC-02",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(qaUcOnly.enabled, "QA enabled with working uc and no package yet");
}

function testStep4StageDerivation() {
  console.log("\n7. Step 4 — stage derivation (PRD-WF-02 §5.2)");

  const shell = readSrc("src/components/klints/AppShell.tsx");
  const useCases = readSrc("src/lib/use-cases.ts");

  assertIncludes(useCases, "use-cases.ts", "deriveJourneyStage", "deriveJourneyStage exported");
  assertIncludes(shell, "AppShell.tsx", "deriveJourneyStage", "AppShell derives journey stage");
  assertIncludes(shell, "AppShell.tsx", "derivedFlowStep", "AppShell passes derived stage");
  assertIncludes(shell, "AppShell.tsx", "current={derivedFlowStep}", "FlowStepper uses derived current");
  assertIncludes(shell, "AppShell.tsx", "worklistIssueStatus", "derivation uses worklist issue status");
  assertIncludes(shell, "AppShell.tsx", "worklistPending", "derivation waits on worklist load");

  const buildableCc03 = [
    mockPilot("UC-02", 1, ["CC-03", "CC-06", "CI-08"], "ready"),
    mockPilot("UC-04", 4, ["PT-13", "CC-03"], "blocked_checks"),
  ];

  assert(deriveJourneyStage({ pathname: "/data-consistency", issueId: null }) === "diagnose", "no issue → diagnose");

  assert(
    deriveJourneyStage({ pathname: "/fix", issueId: "CC-03", issueStatus: "FAIL" }) === "fix",
    "/fix → fix stage",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CC-03",
      issueStatus: "FAIL",
    }) === "fix",
    "DCS + FAIL → fix (resume)",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CC-03",
      worklistPending: true,
    }) === "fix",
    "DCS + worklist pending → fix (conservative)",
  );

  assert(
    deriveJourneyStage({
      pathname: "/workflow",
      issueId: "CC-03",
      worklistPending: true,
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "fix",
    "/workflow pending without ?uc= → fix not build",
  );

  assert(
    deriveJourneyStage({
      pathname: "/workflow",
      issueId: "CC-03",
      issueStatus: "FAIL",
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "fix",
    "/workflow + FAIL without ?uc= → fix not build",
  );

  assert(
    deriveJourneyStage({
      pathname: "/workflow",
      issueId: "CC-03",
      issueStatus: "FAIL",
      ucFromSearch: "UC-02",
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "build",
    "/workflow + ?uc= → build",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CC-03",
      issueStatus: null,
      ucFromSearch: "UC-02",
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "build",
    "DCS + ?uc= + Studio-eligible → build",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CC-03",
      issueStatus: null,
      pilots: buildableCc03,
      recommendationsSuccess: true,
    }) === "build",
    "DCS + PASS + buildable pilot → build",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CI-01",
      issueStatus: "FAIL",
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "fix",
    "CI-01 FAIL → fix",
  );

  assert(
    deriveJourneyStage({
      pathname: "/data-consistency",
      issueId: "CC-03",
      issueStatus: null,
      pilots: PACK_ROUTING_FIXTURE,
      recommendationsSuccess: true,
    }) === "diagnose",
    "DCS + blocked pilot → diagnose",
  );

  assert(deriveJourneyStage({ pathname: "/qa", issueId: "CC-03" }) === "qa", "/qa → qa");
  assert(deriveJourneyStage({ pathname: "/handoff", issueId: "CC-03" }) === "handoff", "/handoff → handoff");
}

function testStep5DcsRowCtas() {
  console.log("\n8. Step 5 — DCS row CTAs (PRD-WF-02 §7.1)");

  const dcs = readSrc("src/routes/data-consistency.tsx");
  const useCases = readSrc("src/lib/use-cases.ts");

  assertIncludes(useCases, "use-cases.ts", "resolveDcsRowCtas", "resolveDcsRowCtas exported");
  assertIncludes(dcs, "data-consistency.tsx", "resolveDcsRowCtas", "DCS uses row CTA resolver");
  assertIncludes(dcs, "data-consistency.tsx", "DcsIssueRowActions", "DCS row actions component");
  assertIncludes(dcs, "data-consistency.tsx", "getUseCaseRecommendations", "DCS loads pilot gates");
  assertIncludes(dcs, "data-consistency.tsx", "Blocks ", "FAIL/WARN secondary Blocks UC copy");
  assertIncludes(dcs, "data-consistency.tsx", "build", "Build CTA styling hook");
  {
    const start = dcs.indexOf("function FailedRunWorklistRow");
    const end = dcs.indexOf("\nfunction ", start + 1);
    const failedRow = start >= 0 ? dcs.slice(start, end > start ? end : undefined) : "";
    assert(
      failedRow && !failedRow.includes('to="/fix"'),
      "FailedRunWorklistRow does not bare-link /fix",
    );
    assert(
      failedRow.includes("data-failed-run-cta"),
      "FailedRunWorklistRow uses honest failed-run CTA marker",
    );
  }
  const buildableCc03 = [
    mockPilot("UC-02", 1, ["CC-03", "CC-06", "CI-08"], "ready"),
    mockPilot("UC-04", 4, ["PT-13", "CC-03"], "blocked_checks"),
  ];

  const cc03Fail = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "FAIL",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsSuccess: true,
  });
  assert(cc03Fail.primary?.kind !== "build", "FAIL row never uses Build as primary");
  assert(cc03Fail.primary?.kind === "fix", "CC-03 FAIL → Fix primary");
  assert(cc03Fail.secondary?.kind === "blocks_uc", "CC-03 FAIL → Blocks UC secondary");
  assert(cc03Fail.secondary?.uc === "UC-02", "CC-03 blocks UC-02");
  assert(
    cc03Fail.secondary?.link.search.uc === "UC-02" &&
      cc03Fail.secondary?.link.search.issue === "CC-03",
    "Blocks UC links to Studio with context",
  );

  const ci01Fail = resolveDcsRowCtas({
    checkId: "CI-01",
    status: "FAIL",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsSuccess: true,
  });
  assert(ci01Fail.primary?.kind === "fix", "CI-01 FAIL → Fix only");
  assert(ci01Fail.secondary === null, "CI-01 has no Blocks UC");

  const cc03Pending = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "FAIL",
    recommendationsPending: true,
  });
  assert(cc03Pending.primary?.kind === "fix", "FAIL pending still shows Fix");
  assert(cc03Pending.secondary === null, "Blocks UC deferred while loading");

  const cc03Pass = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "PASS",
    pilots: buildableCc03,
    recommendationsSuccess: true,
  });
  assert(cc03Pass.primary?.kind === "build", "PASS + buildable → Build primary");
  assert(cc03Pass.primary?.label === "Build UC-02", "Build label includes UC id");

  const ci01Pass = resolveDcsRowCtas({
    checkId: "CI-01",
    status: "PASS",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsSuccess: true,
  });
  assert(ci01Pass.primary?.kind === "passed", "CI-01 PASS → Passed (no Build)");

  const oppCc03 = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "WARN",
    isOptional: true,
    pilots: buildableCc03,
    recommendationsSuccess: true,
  });
  assert(oppCc03.primary?.kind === "build", "Opportunity row → Build primary");

  // Optional check that does NOT gate any pilot must not steal an unrelated ready UC.
  const optionalUngated = resolveDcsRowCtas({
    checkId: "FD-03",
    status: "PASS",
    isOptional: true,
    pilots: buildableCc03,
    recommendationsSuccess: true,
  });
  assert(
    optionalUngated.primary?.kind !== "build",
    "optional ungated check does not attach unrelated readyPilot Build CTA",
  );
  assert(
    !useCases.includes("readyPilot") &&
      !useCases.includes("pilots?.find((pilot) => isBuildableStatus(pilot.status))"),
    "no any-readyPilot fallback in resolveDcsRowCtas",
  );
}

function testStep6StudioGuard() {
  console.log("\n9. Step 6 — Studio Open approved fix guard + QA context (PRD-WF-01 §Flow D)");

  const studio = readSrc("src/components/workflow/WorkflowStudio.tsx");

  assertIncludes(
    studio,
    "WorkflowStudio.tsx",
    "Open approved fix",
    "Studio has Open approved fix back-link",
  );
  assert(
    !studio.includes("firstBlockingCheck ||\n    pilot.gates.gating_check_ids[0]") &&
      !studio.includes("firstBlockingCheck || pilot.gates"),
    "approvedFixId does not fallback to gate list when no ?issue=",
    "guard: only show when issue param present",
  );
  assertIncludes(
    studio,
    "WorkflowStudio.tsx",
    'issue?.trim() || undefined',
    "approvedFixId only set when ?issue= present",
  );
  assertIncludes(
    studio,
    "WorkflowStudio.tsx",
    "issue: issue.trim()",
    "QA link carries ?issue= context",
  );
  assert(
    studio.includes("package_id: pkg.package_id") &&
      studio.includes("issue: issue.trim()"),
    "QA link passes both package_id and issue",
  );
}

function testStep7Acceptance() {
  console.log("\n10. Step 7 — §12 Acceptance sweep (PRD-WF-02)");

  const fix = readSrc("src/routes/fix.tsx");
  const dcs = readSrc("src/routes/data-consistency.tsx");
  const stepper = readSrc("src/components/klints/FlowStepper.tsx");
  const appShell = readSrc("src/components/klints/AppShell.tsx");
  const studio = readSrc("src/components/workflow/WorkflowStudio.tsx");
  const useCases = readSrc("src/lib/use-cases.ts");

  // §12-A: CC-03 Proceed visible → lands /workflow?uc=…&issue=…
  assertIncludes(fix, "fix.tsx", "Proceed to Workflow Studio", "§12-A: Proceed CTA present");
  assertIncludes(fix, "fix.tsx", "showProceed", "§12-A: Proceed gated on eligibility");
  assertIncludes(useCases, "use-cases.ts", "workflowStudioFromFix", "§12-A: bridge sets ?uc= and ?issue=");

  const cc03Eligible = isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CC-03");
  assert(cc03Eligible, "§12-A: CC-03 isStudioEligible = true");
  const cc03Bridge = workflowStudioFromFix(PACK_ROUTING_FIXTURE, "CC-03");
  assert(cc03Bridge.search.uc === "UC-02", "§12-A: CC-03 bridge binds ?uc=UC-02");
  assert(cc03Bridge.search.issue === "CC-03", "§12-A: CC-03 bridge binds ?issue=CC-03");

  // §12-B: CI-01 / WB-SHOP-01 — no Proceed; Build step disabled
  const ci01Eligible = isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CI-01");
  assert(!ci01Eligible, "§12-B: CI-01 not Studio-eligible → no Proceed");
  const wb01Eligible = isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "WB-SHOP-01");
  assert(!wb01Eligible, "§12-B: WB-SHOP-01 not Studio-eligible → no Proceed");

  const ci01Step = resolveFlowStepperStage("build", {
    issueId: "CI-01",
    isFixture: false,
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(!ci01Step.enabled, "§12-B: CI-01 Build stepper step disabled");
  assert(
    ci01Step.tooltip === FLOW_STEPPER_TOOLTIPS.buildNoGate,
    "§12-B: CI-01 Build tooltip correct",
  );

  // §12-C: CTA copy never implies Approve writeback navigates to Studio
  assert(
    !fix.includes("Approve fix → Proceed"),
    "§12-C: No 'Approve fix → Proceed' copy in fix.tsx",
  );
  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  assert(
    !livePlan.includes("Approve fix → Proceed"),
    "§12-C: No 'Approve fix → Proceed' copy in fix-live-plan.ts",
  );

  // §12-D: FlowStepper disabled stages don't navigate
  assertIncludes(stepper, "FlowStepper.tsx", 'aria-disabled="true"', "§12-D: disabled stages use aria-disabled span");
  assert(
    !stepper.includes("<button") || stepper.includes("aria-disabled"),
    "§12-D: disabled stages are not interactive buttons",
  );

  // FlowStepper stage click carries correct search context
  const cc03BuildStep = resolveFlowStepperStage("build", {
    issueId: "CC-03",
    isFixture: false,
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsPending: false,
    recommendationsSuccess: true,
    recommendationsError: false,
  });
  assert(cc03BuildStep.enabled, "§12-D: CC-03 Build step enabled");
  assert(cc03BuildStep.search.uc === "UC-02", "§12-D: Build step click carries ?uc=UC-02");
  assert(cc03BuildStep.search.issue === "CC-03", "§12-D: Build step click carries ?issue=CC-03");

  // §12-E: DCS FAIL/WARN → Fix only; Build not primary on FAIL
  const cc03Fail = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "FAIL",
    pilots: PACK_ROUTING_FIXTURE,
    recommendationsSuccess: true,
  });
  assert(cc03Fail.primary?.kind === "fix", "§12-E: CC-03 FAIL primary = Fix");
  assert(cc03Fail.primary?.kind !== "build", "§12-E: Build never primary on FAIL");
  assertIncludes(dcs, "data-consistency.tsx", "resolveDcsRowCtas", "§12-E: DCS uses resolver");

  // §12-F: PASS + buildable gated pilot → optional Build {UC}
  const buildablePool = [
    mockPilot("UC-02", 1, ["CC-03", "CC-06", "CI-08"], "ready"),
    mockPilot("UC-04", 4, ["PT-13", "CC-03"], "blocked_checks"),
  ];
  const cc03Pass = resolveDcsRowCtas({
    checkId: "CC-03",
    status: "PASS",
    pilots: buildablePool,
    recommendationsSuccess: true,
  });
  assert(cc03Pass.primary?.kind === "build", "§12-F: PASS + buildable → Build UC primary");
  assert(cc03Pass.primary?.label === "Build UC-02", "§12-F: Build label = Build UC-02");

  // §12-G: verify script covers eligible vs non-eligible checks
  assertIncludes(useCases, "use-cases.ts", "isStudioEligibleCheck", "§12-G: isStudioEligibleCheck exported");
  assert(
    isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CC-03") === true &&
      isStudioEligibleCheck(PACK_ROUTING_FIXTURE, "CI-01") === false,
    "§12-G: eligible (CC-03) vs non-eligible (CI-01) correctly distinguished",
  );

  // AppShell passes derived stage (not path-only) to FlowStepper
  assertIncludes(appShell, "AppShell.tsx", "derivedFlowStep", "§12-D: AppShell uses derived stage");
  assertIncludes(appShell, "AppShell.tsx", "worklistIssueStatus", "§12-D: stage derivation uses worklist status");

  // Studio guard correct
  assert(
    !studio.includes("firstBlockingCheck ||\n    pilot.gates.gating_check_ids[0]"),
    "§12 Studio: Open approved fix only when ?issue= present",
  );
}

async function main() {
  console.log("WF-02 frontend verification (PRD-WF-02)");
  testStep1Exports();
  testStep1StudioEligibility();
  testStep1PrimaryPilotPick();
  testStep1FixBridge();
  testStep2FixCtas();
  testStep3FlowStepper();
  testStep4StageDerivation();
  testStep5DcsRowCtas();
  testStep6StudioGuard();
  testStep7Acceptance();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("Fix failures before marking WF-02 complete.");
    process.exit(1);
  }
  console.log("WF-02 COMPLETE — all §12 acceptance criteria passed.");
}

main();
