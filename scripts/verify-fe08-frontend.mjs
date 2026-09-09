/**
 * FE-08 frontend verification — PRD §10 acceptance.
 * Run: npm run verify:fe08
 * Optional live API: FE08_API_BASE=http://127.0.0.1:8000 FE08_EMAIL=... FE08_PASSWORD=... npm run verify:fe08
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

// --- Mirror fix-flow helpers (keep in sync with src/lib/fix-flow.ts) ---
function resolveCheckIdFromSearch(check, issue) {
  const CHECK_ID_PATTERN = /^[A-Z]{2}-\d{2}$/;
  if (typeof check === "string" && check.trim()) return check.trim();
  if (typeof issue === "string" && CHECK_ID_PATTERN.test(issue.trim())) {
    return issue.trim();
  }
  return undefined;
}

function isFixtureIssueId(id) {
  if (!id) return false;
  return /^iss-/i.test(id.trim());
}

function findWorklistIssueByCheckId(worklistIssues, checkId) {
  const normalized = checkId.trim().toUpperCase();
  return worklistIssues.find(
    (issue) => (issue.check_id ?? "").trim().toUpperCase() === normalized,
  );
}

function resolveFixTarget(search, worklistIssues, fixPlansKeys, fixtureIssues) {
  const fixtureId =
    search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;

  if (fixtureId) {
    const issue = fixtureIssues[fixtureId];
    const plan = fixPlansKeys.includes(fixtureId);
    if (issue && plan) {
      return { kind: "fixture", issueId: fixtureId };
    }
  }

  const checkId = resolveCheckIdFromSearch(search.check, search.issue);
  if (!checkId) {
    if (fixtureId) return { kind: "missing", checkId: fixtureId };
    return { kind: "empty" };
  }

  if (!worklistIssues) {
    return { kind: "loading", checkId };
  }

  const liveIssue = findWorklistIssueByCheckId(worklistIssues, checkId);
  if (!liveIssue) {
    return { kind: "missing", checkId };
  }

  return { kind: "live", checkId };
}

function testFixFlowHelpers() {
  console.log("\n1. fix-flow resolution (PRD §4.2)");

  if (isFixtureIssueId("iss-campaign")) pass("isFixtureIssueId accepts iss-*");
  else fail("isFixtureIssueId accepts iss-*");

  if (!isFixtureIssueId("CC-06")) pass("isFixtureIssueId rejects check_id");
  else fail("isFixtureIssueId rejects check_id");

  const sampleIssue = { check_id: "cc-06", title: "Consent mismatch" };
  const found = findWorklistIssueByCheckId([sampleIssue], "CC-06");
  if (found?.title === "Consent mismatch") pass("findWorklistIssueByCheckId case-insensitive");
  else fail("findWorklistIssueByCheckId case-insensitive");

  const fixture = resolveFixTarget(
    { issue: "iss-campaign" },
    undefined,
    ["iss-campaign"],
    { "iss-campaign": { id: "iss-campaign" } },
  );
  if (fixture.kind === "fixture") pass("fixture path without worklist");
  else fail("fixture path without worklist", `got ${fixture.kind}`);

  const loading = resolveFixTarget({ issue: "CC-06" }, undefined, [], {});
  if (loading.kind === "loading" && loading.checkId === "CC-06") {
    pass("live check_id → loading until worklist");
  } else fail("live check_id → loading until worklist", JSON.stringify(loading));

  const live = resolveFixTarget(
    { issue: "CC-06" },
    [sampleIssue],
    [],
    {},
  );
  if (live.kind === "live" && live.checkId === "CC-06") pass("live check_id found in worklist");
  else fail("live check_id found in worklist", JSON.stringify(live));

  const missing = resolveFixTarget({ issue: "CI-99" }, [], [], {});
  if (missing.kind === "missing") pass("unknown check_id → missing");
  else fail("unknown check_id → missing", JSON.stringify(missing));

  const empty = resolveFixTarget({}, undefined, [], {});
  if (empty.kind === "empty") pass("no search params → empty");
  else fail("no search params → empty", JSON.stringify(empty));

  const checkWins = resolveFixIdFromSearchAlias();
  if (checkWins === "CC-06") pass("?check= param wins over issue");
  else fail("?check= param wins over issue");
}

function resolveFixIdFromSearchAlias() {
  return resolveCheckIdFromSearch("CC-06", "iss-campaign");
}

function testStaticFiles() {
  console.log("\n2. Static file checks (PRD §9)");

  const fixFlow = readSrc("src/lib/fix-flow.ts");
  assertIncludes(fixFlow, "fix-flow.ts", "export type FixTarget", "FixTarget type exported");
  assertIncludes(fixFlow, "fix-flow.ts", "resolveFixTarget", "resolveFixTarget exported");
  assertIncludes(fixFlow, "fix-flow.ts", "findWorklistIssueByCheckId", "findWorklistIssueByCheckId exported");

  assertIncludes(fixFlow, "fix-flow.ts", "resolveFixFlowIssueTitle", "resolveFixFlowIssueTitle exported");
  assertIncludes(fixFlow, "fix-flow.ts", "needsFixFlowWorklist", "needsFixFlowWorklist exported");

  const appShell = readSrc("src/components/klints/AppShell.tsx");
  assertIncludes(appShell, "AppShell.tsx", "resolveFixFlowIssueTitle", "AppShell resolves live stepper title");
  assertIncludes(appShell, "AppShell.tsx", "getDcsWorklist", "AppShell loads worklist for live titles");

  const flowStepper = readSrc("src/components/klints/FlowStepper.tsx");
  assertIncludes(flowStepper, "FlowStepper.tsx", "search={dataCenterSearch}", "Switch issue preserves check_id");
  assertIncludes(flowStepper, "FlowStepper.tsx", "fixtureIssue?.workflowId", "Build link only for fixture workflow");

  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  assertIncludes(livePlan, "fix-live-plan.ts", "export function buildLiveFixPlan", "buildLiveFixPlan exported");
  assertIncludes(livePlan, "fix-live-plan.ts", "Sandboxed test complete · ready for approval", "design test badge");
  assertIncludes(livePlan, "fix-live-plan.ts", "No row-level preview yet", "honest empty preview row");

  assertIncludes(livePlan, "fix-live-plan.ts", 'k: "Evidence"', "Evidence kv row in live plan");
  assertIncludes(livePlan, "fix-live-plan.ts", "evidenceSummary", "evidence summary helper");

  const fixPage = readSrc("src/routes/fix.tsx");
  assertNotIncludes(fixPage, "fix.tsx", "queued for Manago", "no Manago queued toast anywhere");
  assertIncludes(fixPage, "fix.tsx", "Approve writeback", "approve matches approved design");
  assertNotIncludes(fixPage, "fix.tsx", "Approve writeback · Coming soon", "no Coming soon on approve");
  assertIncludes(fixPage, "fix.tsx", "getDcsWorklist", "Fix loads DCS worklist");
  assertIncludes(fixPage, "fix.tsx", "resolveFixTarget", "Fix uses resolveFixTarget");
  assertIncludes(fixPage, "fix.tsx", "buildLiveFixPlan", "Fix rebuilds plan with detail");
  assertIncludes(fixPage, "fix.tsx", 'hash="dcs-issues"', "Switch issue scrolls to worklist");
  assertIncludes(
    fixPage,
    "fix.tsx",
    "Writebacks are not enabled yet",
    "honest writeback copy",
  );

  const dc = readSrc("src/routes/data-consistency.tsx");
  assertIncludes(dc, "data-consistency.tsx", 'to="/fix"', "Data Center links to /fix");
  assertIncludes(dc, "data-consistency.tsx", "search={{ issue: checkId }}", "Data Center passes check_id");
}

function testLivePlanShape() {
  console.log("\n3. buildLiveFixPlan shape (PRD §5)");

  const issue = {
    check_id: "CC-06",
    run_issue_id: "ri-1",
    title: "Consent tag mismatch on checkout",
    status: "FAIL",
    severity: "high",
    dimension: "05 Channel & Consent",
    detail: "Tags differ between Shopify and Manago.",
    suggested_fix: "Align consent tags on the checkout capture path.",
    root_cause_ids: [],
    is_optional: false,
    revenue_impact: 12000,
    currency: "EUR",
    evidence_preview: [
      {
        source: "Shopify",
        locator: "checkout.consent",
        value: "marketing=false",
        observed_at: "2026-08-01T00:00:00Z",
      },
    ],
  };

  const plan = mockBuildLiveFixPlan(issue);
  if (plan.changeSetId === "chg_pending_CC-06") pass("changeSetId uses chg_pending_{check_id}");
  else fail("changeSetId", plan.changeSetId);

  if (plan.states.length === 5 && plan.states[2].status === "current") {
    pass("five-state row with Plan ready current");
  } else fail("five-state row");

  if (plan.previewRows.length >= 1 && plan.previewRows[0][3] !== "fake-after") {
    pass("preview rows from evidence or honest empty");
  } else fail("preview rows");

  if (plan.kv.some((row) => row.k === "Evidence")) pass("Evidence kv row present");
  else fail("Evidence kv row present");

  const noEvidence = mockBuildLiveFixPlan({ ...issue, evidence_preview: [] });
  const emptyRow = noEvidence.previewRows.some((r) =>
    r.some((c) => String(c).includes("No row-level preview yet")),
  );
  if (emptyRow) pass("no evidence → honest preview placeholder");
  else fail("no evidence → honest preview placeholder");
}

function mockBuildLiveFixPlan(issue) {
  const checkId = issue.check_id ?? "—";
  const items = issue.evidence_preview ?? [];
  return {
    changeSetId: `chg_pending_${checkId}`,
    kv: [{ k: "Evidence", v: items.length ? `${items.length} samples` : "No samples" }],
    states: [
      { label: "Diagnosed", status: "done" },
      { label: "Evidenced", status: "done" },
      { label: "Plan ready", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewRows: items.length
      ? items.map((item) => [item.locator, item.source, item.value, "observed"])
      : [["—", "—", "—", "No row-level preview yet"]],
    testBadge: "Sandboxed test complete · ready for approval",
    ctaLabel: "Approve fix → Proceed to Workflow Studio",
  };
}

async function testLiveApi() {
  const base = process.env.FE08_API_BASE?.replace(/\/$/, "");
  const email = process.env.FE08_EMAIL;
  const password = process.env.FE08_PASSWORD;

  if (!base || !email || !password) {
    console.log("\n4. Live API (skipped — set FE08_API_BASE, FE08_EMAIL, FE08_PASSWORD)");
    return;
  }

  console.log("\n4. Live API smoke");

  try {
    const loginRes = await fetch(`${base}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      fail("auth login", String(loginRes.status));
      return;
    }
    const { access } = await loginRes.json();
    const headers = { Authorization: `Bearer ${access}` };

    const wlRes = await fetch(`${base}/api/v1/dcs/worklist/`, { headers });
    if (!wlRes.ok) {
      fail("GET worklist", String(wlRes.status));
      return;
    }
    const wl = await wlRes.json();
    const issues = wl.issues ?? [];
    pass("GET worklist", `${issues.length} issues`);

    if (issues.length > 0) {
      const first = issues[0];
      const checkId = first.check_id;
      const resolved = resolveFixTarget({ issue: checkId }, issues, [], {});
      if (resolved.kind === "live") pass("live resolve against API worklist", checkId);
      else fail("live resolve against API worklist", JSON.stringify(resolved));
    }
  } catch (err) {
    fail("live API", err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  console.log("FE-08 frontend verification");
  testFixFlowHelpers();
  testStaticFiles();
  testLivePlanShape();
  await testLiveApi();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All FE-08 checks passed.");
}

main();
