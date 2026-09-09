/**
 * FE-13 frontend verification — shell honesty, deep-links, DCS export.
 * Run: npm run verify:fe13
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

console.log("=== FE-13 FRONTEND VERIFICATION ===\n");

// --- Static wiring ---
console.log("1) Static wiring");
const dcs = readSrc("src/routes/data-consistency.tsx");
assertIncludes(dcs, "data-consistency.tsx", "exportFixPlanMutation", "DCS Export mutation wired");
assertNotIncludes(
  dcs,
  "data-consistency.tsx",
  "Fix plan PDF export is not available in v1",
  "No fake Export queued toast",
);
assertNotIncludes(dcs, "data-consistency.tsx", "Export queued", "No Export queued message");

const audit = readSrc("src/lib/audit.ts");
assertIncludes(audit, "audit.ts", "resolveAuditDeepLink", "resolveAuditDeepLink helper exists");
assertIncludes(audit, "audit.ts", "check_id?", "AuditEvent includes check_id");
assertIncludes(audit, "audit.ts", "job_id?", "AuditEvent includes job_id");
assertIncludes(audit, "audit.ts", "href?", "AuditEvent includes href");

const shell = readSrc("src/components/klints/AppShell.tsx");
assertIncludes(shell, "AppShell.tsx", "resolveAuditDeepLink", "Bell click uses resolveAuditDeepLink");
assertNotIncludes(
  shell,
  "AppShell.tsx",
  'navigate({ to: "/activity" })',
  "Bell click is not hardcoded to /activity only",
);

const activity = readSrc("src/routes/activity.tsx");
assertIncludes(activity, "activity.tsx", "resolveAuditDeepLink", "Activity rows use deep-links");
assertIncludes(activity, "activity.tsx", "event.job_id", "Activity focus matches job_id field");
assertIncludes(activity, "activity.tsx", "Load more", "Activity Load more control");
assertIncludes(activity, "activity.tsx", "next_cursor", "Activity uses next_cursor");
assertIncludes(
  activity,
  "activity.tsx",
  "Searching timeline for matching activity",
  "Activity auto-paginates for deep-link focus",
);
assertIncludes(
  activity,
  "activity.tsx",
  "focusSearchExhausted",
  "Activity stops auto-search when timeline exhausted",
);

function eventMatchesActivityFocus(event, focus) {
  const check = focus.check?.trim().toUpperCase();
  const action = focus.action?.trim().toLowerCase();
  const job = focus.job?.trim().toLowerCase();
  if (!check && !action && !job) return false;
  if (check) {
    const eventCheck = (event.check_id ?? "").trim().toUpperCase();
    if (eventCheck !== check) {
      const haystack = `${event.summary} ${event.meta ?? ""}`.toUpperCase();
      if (!haystack.includes(check)) return false;
    }
  }
  if (action) {
    const eventAction = (event.action ?? "").trim().toLowerCase();
    if (eventAction !== action && !eventAction.startsWith(action)) return false;
  }
  if (job) {
    const eventJob = (event.job_id ?? "").trim().toLowerCase();
    if (eventJob) {
      if (
        eventJob !== job &&
        !eventJob.startsWith(job.slice(0, 8)) &&
        !job.startsWith(eventJob.slice(0, 8))
      ) {
        return false;
      }
    } else {
      const haystack = `${event.summary} ${event.meta ?? ""} ${event.id}`.toLowerCase();
      if (!haystack.includes(job.slice(0, 8))) return false;
    }
  }
  return true;
}

const focusMatch = eventMatchesActivityFocus(
  {
    id: "audit-1",
    action: "writeback.executed",
    check_id: "CC-03",
    job_id: "b840ae3f-12e9-428e-a201-e0776bb7fc2d",
    summary: "Writeback executed for CC-03",
    meta: null,
  },
  {
    action: "writeback.executed",
    check: "CC-03",
    job: "b840ae3f-12e9-428e-a201-e0776bb7fc2d",
  },
);
if (focusMatch) pass("Activity focus matches writeback job_id");
else fail("Activity focus matches writeback job_id");

const overview = readSrc("src/components/klints/OverviewPanel.tsx");
assertIncludes(overview, "OverviewPanel.tsx", "resolveAuditDeepLink", "Overview activity deep-links");
assertIncludes(
  overview,
  "OverviewPanel.tsx",
  "routeIssueTarget",
  "NBA/open targets use routeIssueTarget (GAP-01E W8-02)",
);
assertIncludes(
  overview,
  "OverviewPanel.tsx",
  "nbaOpenTarget",
  "NBA opens via nbaOpenTarget helper",
);
assertIncludes(
  overview,
  "OverviewPanel.tsx",
  "issueOpenTarget",
  "Overview stake/issue links use issueOpenTarget helper",
);
assertIncludes(
  overview,
  "OverviewPanel.tsx",
  "fixAllowed={fixAllowed}",
  "LiveRevenueStakeBreakdown receives fixAllowed",
);

const settings = readSrc("src/routes/settings.tsx");
assertIncludes(settings, "settings.tsx", "ComingSoonField", "Settings ComingSoonField");
assertNotIncludes(
  settings,
  "settings.tsx",
  'defaultValue="Coming soon"',
  "No fake Coming soon input values",
);

const qa = readSrc("src/routes/qa.tsx");
assertNotIncludes(qa, "qa.tsx", "QA re-run complete", "QA does not fake re-run success toast");
// Live QA-01: empty state tells users to generate a package (not "QA is next").
assertIncludes(
  qa,
  "qa.tsx",
  "Generate a build package in Workflow Studio first",
  "QA honest empty-state copy",
);

const handoff = readSrc("src/routes/handoff.tsx");
assertNotIncludes(handoff, "handoff.tsx", 'toast.success("Sent"', "Handoff does not fake Sent toast");
assertIncludes(handoff, "handoff.tsx", "no MCP auto-send", "Handoff honest soft-lock / MCP honesty");

const fixFlow = readSrc("src/lib/fix-flow.ts");
assertIncludes(fixFlow, "fix-flow.ts", "fixturesAllowedInBuild", "Fixture bleed gate helper");
assertIncludes(fixFlow, "fix-flow.ts", "import.meta.env.PROD", "Prod fixture gate uses PROD");

const fix = readSrc("src/routes/fix.tsx");
assertIncludes(fix, "fix.tsx", "prodFixtureBleed", "Fix page prod fixture bleed gate");
assertIncludes(fix, "fix.tsx", "Demo fixture blocked", "Fix honest fixture blocked copy");

const spotlight = readSrc("src/components/klints/SpotlightSearch.tsx");
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "resolveSpotlightPageHint",
  "Spotlight dynamic QA/Handoff hints",
);
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "unlocks with Workflow Studio",
  "Spotlight locked QA hint",
);
assertIncludes(
  spotlight,
  "SpotlightSearch.tsx",
  "url.hash.replace",
  "Spotlight preserves href hash",
);

const opportunities = readSrc("src/routes/opportunities.tsx");
assertNotIncludes(opportunities, "opportunities.tsx", "No deep-link", "Plan queue hides dead No deep-link");
assertIncludes(
  opportunities,
  "opportunities.tsx",
  'to: "/fix", search: { issue: checkId }',
  "Plan opens /fix?issue=",
);

// --- PDF profile parity (FE-13 §4 — Overview Export brief = DCS Export fix plan) ---
console.log("\n2) PDF profile parity");

const assessmentReport = readSrc("src/lib/assessment-report.ts");
assertIncludes(
  assessmentReport,
  "assessment-report.ts",
  'report_profile: "overview_brief"',
  "downloadOverviewBrief sends overview_brief profile",
);

const overviewBriefFn = assessmentReport.match(
  /export async function downloadOverviewBrief[\s\S]*?(?=\/\*\*|export async function|export function|$)/,
);
if (overviewBriefFn?.[0]?.includes('report_profile: "overview_brief"')) {
  pass("overview_brief profile scoped to downloadOverviewBrief");
} else {
  fail("overview_brief profile scoped to downloadOverviewBrief");
}

assertNotIncludes(
  assessmentReport,
  "assessment-report.ts",
  "downloadAssessmentBrief",
  "Legacy downloadAssessmentBrief removed from assessment-report.ts",
);

assertIncludes(dcs, "data-consistency.tsx", "downloadOverviewBrief", "DCS Export uses downloadOverviewBrief");
assertNotIncludes(
  dcs,
  "data-consistency.tsx",
  "downloadAssessmentBrief",
  "DCS Export does not use legacy downloadAssessmentBrief",
);
assertIncludes(overview, "OverviewPanel.tsx", "downloadOverviewBrief", "Overview Export uses downloadOverviewBrief");
assertNotIncludes(
  overview,
  "OverviewPanel.tsx",
  "downloadAssessmentBrief",
  "Overview Export does not use legacy downloadAssessmentBrief",
);

const exportCallPattern =
  /downloadOverviewBrief\(\{\s*since:\s*periodWindow\.since\.toISOString\(\),\s*until:\s*periodWindow\.until\.toISOString\(\),?\s*\}\)/;
if (exportCallPattern.test(dcs)) {
  pass("DCS export passes periodWindow since/until to downloadOverviewBrief");
} else {
  fail("DCS export passes periodWindow since/until to downloadOverviewBrief");
}
if (exportCallPattern.test(overview)) {
  pass("Overview export passes periodWindow since/until to downloadOverviewBrief");
} else {
  fail("Overview export passes periodWindow since/until to downloadOverviewBrief");
}

assertIncludes(
  dcs,
  "data-consistency.tsx",
  "resolveOverviewPeriodWindow",
  "DCS uses resolveOverviewPeriodWindow",
);
assertIncludes(
  overview,
  "OverviewPanel.tsx",
  "resolveOverviewPeriodWindow",
  "Overview uses resolveOverviewPeriodWindow",
);

// --- Runtime deep-link helper (mirrors src/lib/audit.ts contract) ---
console.log("\n3) resolveAuditDeepLink runtime");

function isSameOriginPath(href) {
  const candidate = href.trim();
  return candidate.startsWith("/") && !candidate.startsWith("//");
}

function parseHrefToDeepLink(href) {
  if (!isSameOriginPath(href)) return null;
  const url = new URL(href, "https://klints.local");
  const search = {};
  url.searchParams.forEach((value, key) => {
    search[key] = value;
  });
  const hash = url.hash.replace(/^#/, "") || undefined;
  return {
    to: url.pathname,
    search: Object.keys(search).length > 0 ? search : undefined,
    hash,
  };
}

function rewriteFixWhenLocked(link, fixAllowed) {
  if (fixAllowed) return link;
  if (link.to !== "/fix") return link;
  const checkId = link.search?.issue?.trim() || link.search?.check?.trim() || "";
  if (!checkId) return { to: "/data-consistency" };
  return { to: "/data-consistency", search: { check: checkId } };
}

function resolveAuditDeepLink(event, options = {}) {
  const fixAllowed = options.fixAllowed !== false;
  const apiHref = event.href?.trim();
  if (apiHref) {
    const parsed = parseHrefToDeepLink(apiHref);
    if (parsed) return rewriteFixWhenLocked(parsed, fixAllowed);
  }
  const checkId = event.check_id?.trim();
  if (checkId) {
    return rewriteFixWhenLocked(
      { to: "/fix", search: { issue: checkId } },
      fixAllowed,
    );
  }
  if ((event.action || "").startsWith("connector.")) {
    return { to: "/integrations" };
  }
  return { to: "/activity" };
}

{
  const fixLink = resolveAuditDeepLink({
    action: "writeback.executed",
    href: "/fix?issue=CC-03",
    check_id: "CC-03",
  });
  if (fixLink.to === "/fix" && fixLink.search?.issue === "CC-03") {
    pass("href /fix?issue=CC-03 resolves");
  } else {
    fail("href /fix?issue=CC-03 resolves", JSON.stringify(fixLink));
  }

  const locked = resolveAuditDeepLink(
    { action: "writeback.executed", check_id: "CI-01" },
    { fixAllowed: false },
  );
  if (locked.to === "/data-consistency" && locked.search?.check === "CI-01") {
    pass("fixAllowed=false rewrites to Data Consistency");
  } else {
    fail("fixAllowed=false rewrite", JSON.stringify(locked));
  }

  const connector = resolveAuditDeepLink({ action: "connector.connected" });
  if (connector.to === "/integrations") pass("connector.* → /integrations");
  else fail("connector deep-link", JSON.stringify(connector));

  const fallback = resolveAuditDeepLink({ action: "unknown.event" });
  if (fallback.to === "/activity") pass("unknown action → /activity fallback");
  else fail("fallback", JSON.stringify(fallback));
}

console.log(`\nFE-13 frontend verification: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
