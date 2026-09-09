/**
 * GAP-01 Slice E frontend verification (Week 8 residual screens).
 * Phase 1 — W8-03 merchant sync health (Integrations).
 * Run: npm run verify:gap01e
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

/** Mirror src/lib/connectors.ts formatConnectorSyncLag */
function formatConnectorSyncLag(finishedAt, now = new Date()) {
  if (!finishedAt) return "—";
  const finished = new Date(finishedAt);
  if (Number.isNaN(finished.getTime())) return "—";
  const ms = now.getTime() - finished.getTime();
  if (ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

/** Mirror connectorLastDataRefresh + connectorSyncHealth (subset). */
function connectorLastDataRefresh(connector) {
  if (connector?.last_data_refresh) return connector.last_data_refresh;
  const bootstrap = connector?.latest_bootstrap;
  if (!bootstrap) return null;
  return { ...bootstrap, source: "bootstrap" };
}

function connectorSyncHealth(connector, now = new Date()) {
  const refresh = connectorLastDataRefresh(connector);
  const finishedAt = refresh?.finished_at ?? null;
  const inFlight =
    refresh?.data_run_status === "pending" ||
    refresh?.data_run_status === "running";
  const issueCount =
    typeof refresh?.issue_count === "number" && Number.isFinite(refresh.issue_count)
      ? Math.max(0, Math.trunc(refresh.issue_count))
      : 0;
  const status = (connector.status || "").toLowerCase();
  const summary = (refresh?.summary_status || "").toLowerCase();
  const marker = connector?.config?.gap01f_demo_seed;
  const demoStub = marker === true || marker === "true";

  let badge = "Healthy";
  if (status === "error" || summary === "error" || refresh?.data_run_status === "failed") {
    badge = "Error";
  } else if (demoStub) {
    badge = "Demo";
  } else if (inFlight) {
    badge = "Syncing";
  } else if (!finishedAt) {
    badge = "No sync";
  } else if (status === "degraded" || summary === "degraded" || issueCount > 0) {
    badge = "Degraded";
  }

  return {
    finishedAt,
    inFlight: demoStub ? false : inFlight,
    lagLabel:
      demoStub && badge !== "Error"
        ? "offline seed"
        : inFlight && !finishedAt
          ? "—"
          : formatConnectorSyncLag(finishedAt, now),
    issueCount,
    badge,
  };
}

function connectorLastSyncDisplayKind(health) {
  if (health.finishedAt) return "when";
  if (health.inFlight) return "syncing";
  return "never";
}

console.log("=== GAP-01E FRONTEND VERIFICATION ===\n");

console.log("Phase 1 — W8-03 connector sync health");
const connectors = readSrc("src/lib/connectors.ts");
assertIncludes(connectors, "connectors.ts", "formatConnectorSyncLag", "formatConnectorSyncLag helper");
assertIncludes(connectors, "connectors.ts", "connectorSyncHealth", "connectorSyncHealth helper");
assertIncludes(
  connectors,
  "connectors.ts",
  "connectorLastSyncDisplayKind",
  "connectorLastSyncDisplayKind helper",
);
assertIncludes(connectors, "connectors.ts", 'badge = "No sync"', "Never-synced uses No sync badge");
assertIncludes(
  connectors,
  "connectors.ts",
  'badge = "Demo"',
  "GAP-01F demo stubs use Demo badge (not Healthy)",
);
assertIncludes(
  connectors,
  "connectors.ts",
  "isGap01fDemoSeedConnector",
  "demo seed connector detector",
);
assertIncludes(
  connectors,
  "connectors.ts",
  "no invented webhook",
  "helper documents no invented webhooks",
);

const integrations = readSrc("src/routes/integrations.tsx");
assertIncludes(
  integrations,
  "integrations.tsx",
  "connectorSyncHealth",
  "Integrations uses connectorSyncHealth",
);
assertIncludes(
  integrations,
  "integrations.tsx",
  "connectorLastSyncDisplayKind",
  "Integrations uses last-sync display kind",
);
assertIncludes(
  integrations,
  "integrations.tsx",
  'data-connector-sync-health="gap01e-w803"',
  "Connector health marker present",
);
assertIncludes(
  integrations,
  "integrations.tsx",
  "Last sync, lag, and import issues by source",
  "Honest sync-health description",
);
assertIncludes(integrations, "integrations.tsx", "Last sync", "Shows last sync label");
assertIncludes(integrations, "integrations.tsx", "Lag", "Shows lag label");
assertIncludes(integrations, "integrations.tsx", "Issues", "Shows Issues (not Errors theater)");
assertIncludes(
  integrations,
  "integrations.tsx",
  'c.status === "error"',
  "Health table includes error connectors",
);
assertNotIncludes(integrations, "integrations.tsx", "42s", "No hardcoded 42s latency theater");
assertNotIncludes(
  integrations,
  "integrations.tsx",
  "Freshness and latency by source",
  "Old latency description removed",
);
assertNotIncludes(
  integrations,
  "integrations.tsx",
  "webhook count",
  "No fake webhook count claim on Integrations",
);
assertIncludes(
  integrations,
  "integrations.tsx",
  "data-card-sync-badge",
  "Connector card footer uses sync-health badge marker",
);
assertIncludes(
  integrations,
  "integrations.tsx",
  "cardHealth.badge",
  "Card footer/subtitle badge from connectorSyncHealth (not status===connected Healthy)",
);
assertNotIncludes(
  integrations,
  "integrations.tsx",
  'text-revenue" /> Healthy',
  "Card footer does not hardcode Healthy icon+label",
);
assertNotIncludes(
  integrations,
  "integrations.tsx",
  'status === "connected" ? (\n                      <>\n                        <CheckCircle2',
  "Card footer does not branch Healthy solely on connected status",
);

const primitives = readSrc("src/components/klints/primitives.tsx");
assertIncludes(primitives, "primitives.tsx", "Syncing:", "StatusBadge styles Syncing");
assertIncludes(primitives, "primitives.tsx", '"No sync":', "StatusBadge styles No sync");
assertIncludes(primitives, "primitives.tsx", "Demo:", "StatusBadge styles Demo");

const now = new Date("2026-09-04T12:00:00.000Z");
if (formatConnectorSyncLag(null, now) === "—") pass("lag helper: missing finished_at → —");
else fail("lag helper: missing finished_at → —");
if (formatConnectorSyncLag("2026-09-04T11:59:30.000Z", now) === "30s") {
  pass("lag helper: seconds");
} else fail("lag helper: seconds");
if (formatConnectorSyncLag("2026-09-04T10:00:00.000Z", now) === "2h") {
  pass("lag helper: hours");
} else fail("lag helper: hours");
if (formatConnectorSyncLag("2026-09-01T12:00:00.000Z", now) === "3d") {
  pass("lag helper: days");
} else fail("lag helper: days");

const neverSynced = connectorSyncHealth(
  { status: "connected", last_data_refresh: null, latest_bootstrap: null },
  now,
);
if (neverSynced.badge === "No sync" && neverSynced.lagLabel === "—") {
  pass("health: never synced → No sync (not Healthy)");
} else fail("health: never synced → No sync (not Healthy)", JSON.stringify(neverSynced));

const demoStub = connectorSyncHealth(
  {
    status: "connected",
    config: { gap01f_demo_seed: true },
    last_data_refresh: {
      finished_at: "2026-09-04T11:50:00.000Z",
      issue_count: 0,
      data_run_status: "succeeded",
      summary_status: "ok",
    },
  },
  now,
);
if (demoStub.badge === "Demo" && demoStub.lagLabel === "offline seed") {
  pass("health: GAP-01F demo stub → Demo (not Healthy)");
} else fail("health: GAP-01F demo stub → Demo (not Healthy)", JSON.stringify(demoStub));

const demoStubFailed = connectorSyncHealth(
  {
    status: "connected",
    config: { gap01f_demo_seed: true },
    last_data_refresh: {
      finished_at: "2026-09-04T11:50:00.000Z",
      issue_count: 0,
      data_run_status: "failed",
      summary_status: "error",
    },
  },
  now,
);
if (
  demoStubFailed.badge === "Error" &&
  demoStubFailed.lagLabel !== "offline seed" &&
  demoStubFailed.lagLabel === "10m"
) {
  pass("health: demo stub + failed import → Error lag (not offline seed)");
} else {
  fail(
    "health: demo stub + failed import → Error lag (not offline seed)",
    JSON.stringify(demoStubFailed),
  );
}

const errored = connectorSyncHealth(
  {
    status: "error",
    last_data_refresh: {
      finished_at: "2026-09-04T11:00:00.000Z",
      issue_count: 2,
      data_run_status: "failed",
      summary_status: "error",
    },
  },
  now,
);
if (errored.badge === "Error" && errored.issueCount === 2) {
  pass("health: error connector → Error badge + issues");
} else fail("health: error connector → Error badge + issues", JSON.stringify(errored));

const inFlightPrior = connectorSyncHealth(
  {
    status: "connected",
    last_data_refresh: {
      finished_at: "2026-09-04T10:00:00.000Z",
      issue_count: 0,
      data_run_status: "running",
      summary_status: null,
    },
  },
  now,
);
if (
  inFlightPrior.badge === "Syncing" &&
  connectorLastSyncDisplayKind(inFlightPrior) === "when" &&
  inFlightPrior.lagLabel === "2h"
) {
  pass("health: in-flight keeps prior finished_at for last sync + lag");
} else {
  fail(
    "health: in-flight keeps prior finished_at for last sync + lag",
    JSON.stringify(inFlightPrior),
  );
}

const healthy = connectorSyncHealth(
  {
    status: "connected",
    last_data_refresh: {
      finished_at: "2026-09-04T11:50:00.000Z",
      issue_count: 0,
      data_run_status: "succeeded",
      summary_status: "ok",
    },
  },
  now,
);
if (healthy.badge === "Healthy" && healthy.lagLabel === "10m") {
  pass("health: fresh succeeded refresh → Healthy");
} else fail("health: fresh succeeded refresh → Healthy", JSON.stringify(healthy));

console.log("\nPhase 2 — W8-04 QA FAIL deep-link matrix");
const qaLib = readSrc("src/lib/qa.ts");
assertIncludes(qaLib, "qa.ts", "qaFailDeepLink", "qaFailDeepLink helper");
assertIncludes(qaLib, "qa.ts", "QA_FAIL_STUDIO_TEST_IDS", "Studio FAIL test id set");
assertIncludes(qaLib, "qa.ts", "extractCheckIdFromQaEvidence", "check id extractor");
assertIncludes(qaLib, "qa.ts", "firstEvidenceForHardTest", "evidence join helper exported");
assertIncludes(qaLib, "qa.ts", "firstDataGatesCheckEvidence", "data gates evidence scan helper");
assertIncludes(
  qaLib,
  "qa.ts",
  "Never invents check ids",
  "matrix documents no invented check ids",
);
assertIncludes(
  qaLib,
  "qa.ts",
  "do not reuse unrelated URL issueId",
  "no unrelated URL issue fallback on Fix",
);
{
  const start = qaLib.indexOf("function evidencePrefersIntegrations");
  const end = qaLib.indexOf("function resolveFailEvidence");
  const prefersBlock =
    start >= 0 && end > start ? qaLib.slice(start, end) : "";
  if (
    prefersBlock &&
    !prefersBlock.includes('includes("sync")') &&
    !prefersBlock.includes("includes('sync')")
  ) {
    pass("Integrations matcher has no bare sync token");
  } else {
    fail("Integrations matcher has no bare sync token", prefersBlock.slice(0, 120));
  }
}

const qaPage = readSrc("src/routes/qa.tsx");
assertIncludes(qaPage, "qa.tsx", "qaFailDeepLink", "QA page wires qaFailDeepLink");
assertIncludes(qaPage, "qa.tsx", "data-qa-fail-route", "FAIL row route marker");
assertIncludes(qaPage, "qa.tsx", "firstEvidenceForHardTest", "QA page uses shared evidence join");

function extractCheckIdFromQaEvidence(evidence) {
  if (!evidence) return null;
  const locator = String(evidence.locator ?? "");
  const fromLocator = locator.match(/gates_snapshot\.checks\.([A-Z]{1,4}-\d+)/i);
  if (fromLocator?.[1]) return fromLocator[1].toUpperCase();
  const trailing = locator.match(/\b([A-Z]{1,4}-\d+)\b/i);
  if (trailing?.[1]) return trailing[1].toUpperCase();
  return null;
}

function firstEvidenceForHardTest(result, row) {
  if (!row.evidence_ids?.length) return undefined;
  let cursor = 0;
  for (const hard of result.hard_tests) {
    const n = hard.evidence_ids?.length ?? 0;
    if (hard.test_id === row.test_id) return result.evidence[cursor];
    cursor += n;
  }
  return undefined;
}

function firstDataGatesCheckEvidence(result) {
  const rows = Array.isArray(result.evidence) ? result.evidence : [];
  return rows.find((ev) =>
    /gates_snapshot\.checks\.[A-Z]{1,4}-\d+/i.test(String(ev.locator ?? "")),
  );
}

function evidenceLooksStaleOrNeedsImport(evidence) {
  if (!evidence) return false;
  const value = String(evidence.value ?? "").toLowerCase();
  const locator = String(evidence.locator ?? "").toLowerCase();
  const blob = `${value} ${locator}`;
  if (
    value === "not_evaluated" ||
    value === "missing_or_empty" ||
    value.includes("not_evaluated")
  ) {
    return true;
  }
  return (
    blob.includes("stale") ||
    blob.includes("freshness") ||
    blob.includes("fresh_import") ||
    blob.includes("latency")
  );
}

function evidencePrefersIntegrations(evidence) {
  if (!evidence) return false;
  const blob = `${String(evidence.value ?? "")} ${String(evidence.locator ?? "")}`.toLowerCase();
  return (
    blob.includes("connector") ||
    blob.includes("webhook") ||
    blob.includes("latency")
  );
}

function resolveFailEvidence(result, row) {
  const joined =
    firstEvidenceForHardTest(result, row) ??
    result.evidence.find((ev) =>
      String(ev.locator ?? "")
        .toLowerCase()
        .includes(row.test_id.toLowerCase()),
    );
  if (joined) return joined;
  if (row.test_id === "data_gates_pass") return firstDataGatesCheckEvidence(result);
  return undefined;
}

function qaFailDeepLink({ result, row, issueId }) {
  if (row.status !== "FAIL") return null;
  const evidence = resolveFailEvidence(result, row);
  const uc = (result.use_case_id || "").trim().toUpperCase() || undefined;
  const packageId = (result.package_id || result.object_id || "").trim() || undefined;
  const studioIds = [
    "consent_branching",
    "terminal_reachable",
    "no_orphan_nodes",
    "collision_policy",
    "measurement_wired",
    "rollback_defined",
  ];
  if (row.test_id === "data_gates_pass") {
    if (evidenceLooksStaleOrNeedsImport(evidence)) {
      const checkId = extractCheckIdFromQaEvidence(evidence);
      if (evidencePrefersIntegrations(evidence)) {
        return { kind: "import", to: "/integrations" };
      }
      return {
        kind: "import",
        to: "/data-consistency",
        search: checkId ? { check: checkId } : undefined,
      };
    }
    const checkId = extractCheckIdFromQaEvidence(evidence);
    if (checkId) return { kind: "fix", to: "/fix", search: { issue: checkId } };
    return { kind: "fix", to: "/fix", search: {} };
  }
  if (studioIds.includes(row.test_id)) {
    return {
      kind: "studio",
      to: "/workflow",
      search: { ...(uc ? { uc } : {}), ...(packageId ? { package_id: packageId } : {}) },
    };
  }
  return { kind: "studio", to: "/workflow" };
}

const baseResult = {
  use_case_id: "UC-02",
  package_id: "pkg-1",
  object_id: "pkg-1",
  hard_tests: [],
  evidence: [],
};

const fixFail = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [
      { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
    ],
    evidence: [
      {
        locator: "gates_snapshot.checks.CC-03",
        value: "FAIL",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
});
if (fixFail?.kind === "fix" && fixFail.search?.issue === "CC-03") {
  pass("matrix: data_gates FAIL → Fix with check id");
} else fail("matrix: data_gates FAIL → Fix with check id", JSON.stringify(fixFail));

const importFail = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [
      { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
    ],
    evidence: [
      {
        locator: "gates_snapshot.checks.CC-03",
        value: "not_evaluated",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
});
if (importFail?.kind === "import" && importFail.to === "/data-consistency") {
  pass("matrix: not_evaluated → Data Center import");
} else fail("matrix: not_evaluated → Data Center import", JSON.stringify(importFail));

const integFail = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [
      { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
    ],
    evidence: [
      {
        locator: "connector.latency",
        value: "stale",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
});
if (integFail?.kind === "import" && integFail.to === "/integrations") {
  pass("matrix: latency/connector → Integrations");
} else fail("matrix: latency/connector → Integrations", JSON.stringify(integFail));

if (!evidencePrefersIntegrations({ locator: "x", value: "async_fail" })) {
  pass("matrix: async_* does not prefer Integrations");
} else fail("matrix: async_* does not prefer Integrations");

const noIds = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [{ test_id: "data_gates_pass", status: "FAIL" }],
    evidence: [
      {
        locator: "gates_snapshot.checks.CC-03",
        value: "FAIL",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "data_gates_pass", status: "FAIL" },
  issueId: "ISSUE-X",
});
if (noIds?.kind === "fix" && noIds.search?.issue === "CC-03") {
  pass("matrix: missing evidence_ids still finds gate check");
} else fail("matrix: missing evidence_ids still finds gate check", JSON.stringify(noIds));

const noIssueFallback = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [{ test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] }],
    evidence: [
      {
        locator: "gates_snapshot.checks",
        value: "FAIL",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "data_gates_pass", status: "FAIL", evidence_ids: ["e1"] },
  issueId: "CC-99",
});
if (
  noIssueFallback?.kind === "fix" &&
  !noIssueFallback.search?.issue
) {
  pass("matrix: no check id → bare Fix (ignores URL issue)");
} else {
  fail(
    "matrix: no check id → bare Fix (ignores URL issue)",
    JSON.stringify(noIssueFallback),
  );
}

const studioFail = qaFailDeepLink({
  result: {
    ...baseResult,
    hard_tests: [
      { test_id: "terminal_reachable", status: "FAIL", evidence_ids: ["e1"] },
    ],
    evidence: [
      {
        locator: "agent_spec.nodes",
        value: "missing",
        source: "t",
        observed_at: "2026-09-04T00:00:00Z",
      },
    ],
  },
  row: { test_id: "terminal_reachable", status: "FAIL", evidence_ids: ["e1"] },
});
if (
  studioFail?.kind === "studio" &&
  studioFail.to === "/workflow" &&
  studioFail.search?.uc === "UC-02"
) {
  pass("matrix: graph FAIL → Studio with use_case_id");
} else fail("matrix: graph FAIL → Studio with use_case_id", JSON.stringify(studioFail));

const passRow = qaFailDeepLink({
  result: baseResult,
  row: { test_id: "data_gates_pass", status: "PASS" },
});
if (passRow === null) pass("matrix: PASS → no deep link");
else fail("matrix: PASS → no deep link", JSON.stringify(passRow));

if (extractCheckIdFromQaEvidence({ locator: "gates_snapshot.checks.le-05", value: "FAIL" }) === "LE-05") {
  pass("extractCheckId: gates_snapshot locator");
} else fail("extractCheckId: gates_snapshot locator");

console.log("\nPhase 3 — W8-02 shared 3-way routing");
const issueRouting = readSrc("src/lib/issue-routing.ts");
assertIncludes(issueRouting, "issue-routing.ts", "classifyIssueRouteKind", "classifyIssueRouteKind helper");
assertIncludes(issueRouting, "issue-routing.ts", "issueRouteSignalsFromDcs", "DCS signal mapper");
assertIncludes(
  issueRouting,
  "issue-routing.ts",
  "Auth / connector failure signals only",
  "Security taxonomy scoped (E0.6)",
);
{
  const start = issueRouting.indexOf("const SECURITY_TEXT_RE");
  const end = issueRouting.indexOf(";", start);
  const reLine = start >= 0 ? issueRouting.slice(start, end > start ? end : undefined) : "";
  if (reLine && !reLine.includes("needs") && !reLine.includes("unauthorized") && !reLine.includes("orization")) {
    pass("Security regex excludes needs-attention / unauthorized / authorization");
  } else {
    fail(
      "Security regex excludes needs-attention / unauthorized / authorization",
      reLine.slice(0, 120),
    );
  }
  if (
    reLine.includes("oauth") &&
    reLine.includes("reconnect\\s+") &&
    !reLine.includes("|reconnect|credential")
  ) {
    pass("Security regex keeps scoped oauth/reconnect (not bare credential/reconnect)");
  } else {
    fail("Security regex keeps scoped oauth/reconnect (not bare credential/reconnect)");
  }
}

const useCases = readSrc("src/lib/use-cases.ts");
assertIncludes(useCases, "use-cases.ts", "routeIssueTarget", "routeIssueTarget helper");
assertIncludes(useCases, "use-cases.ts", 'kind: "integrations"', "DCS CTA integrations kind");
assertIncludes(
  useCases,
  "use-cases.ts",
  "classifyIssueRouteKind(signals) === \"security\"",
  "DCS row CTAs use security taxonomy",
);
assertIncludes(
  useCases,
  "use-cases.ts",
  'taxonomy: "fallback"',
  "Unlock path uses fallback taxonomy (not security)",
);
assertNotIncludes(
  useCases,
  "use-cases.ts",
  "readyPilot",
  "Optional DCS CTA does not bind unrelated ready pilot",
);
assertNotIncludes(
  useCases,
  "use-cases.ts",
  "pilots?.find((pilot) => isBuildableStatus(pilot.status))",
  "No any-readyPilot fallback in resolveDcsRowCtas",
);

const overview = readSrc("src/components/klints/OverviewPanel.tsx");
assertIncludes(overview, "OverviewPanel.tsx", "routeIssueTarget", "Overview uses routeIssueTarget");
assertIncludes(overview, "OverviewPanel.tsx", "issueOpenTarget", "issueOpenTarget retained (FE-13)");
assertIncludes(overview, "OverviewPanel.tsx", "data-issue-route", "Overview marks route taxonomy");
{
  const hardSec = (
    overview.match(/to="\/integrations"[\s\S]{0,120}?data-issue-route="security"/g) || []
  ).length;
  const hardFallback = (
    overview.match(/to="\/integrations"[\s\S]{0,120}?data-issue-route="fallback"/g) || []
  ).length;
  if (hardSec === 0 && hardFallback >= 1) {
    pass("Overview unlock Integrations fallback tagged fallback (not security)");
  } else {
    fail(
      "Overview unlock Integrations fallback tagged fallback (not security)",
      `security=${hardSec} fallback=${hardFallback}`,
    );
  }
}
const dcsPage = readSrc("src/routes/data-consistency.tsx");
assertIncludes(dcsPage, "data-consistency.tsx", 'data-issue-route="security"', "DCS security CTA marker");
assertIncludes(dcsPage, "data-consistency.tsx", 'data-issue-route="data"', "DCS data CTA marker");
assertIncludes(dcsPage, "data-consistency.tsx", 'data-issue-route="workflow"', "DCS workflow CTA marker");
assertIncludes(
  dcsPage,
  "data-consistency.tsx",
  'data-failed-run-cta="gap01e-w802"',
  "Failed-run row honest CTA marker",
);
{
  const start = dcsPage.indexOf("function FailedRunWorklistRow");
  const end = dcsPage.indexOf("\nfunction ", start + 1);
  const failedRow = start >= 0 ? dcsPage.slice(start, end > start ? end : undefined) : "";
  if (failedRow && !failedRow.includes('to="/fix"')) {
    pass("FailedRunWorklistRow does not bare-link /fix");
  } else {
    fail("FailedRunWorklistRow does not bare-link /fix");
  }
}

function classifyIssueRouteKind(signals) {
  const blob = [
    signals.checkId,
    signals.dimension,
    signals.fixOwner,
    signals.title,
    signals.detail,
    signals.suggestedFix,
    signals.systemsCompared,
  ]
    .map((part) => (typeof part === "string" ? part : ""))
    .join(" ");
  if (/\b(security|access\s*control)\b/i.test(signals.dimension ?? "")) return "security";
  if (
    /\b(oauth|api[_\s-]?key|refresh[_\s-]?token|token[_\s-]?expired|(?:access[_\s-]?)?token\s+(?:invalid|expired|revoked)|(?:invalid|expired|revoked)\s+(?:access[_\s-]?)?token|authentication\s+failed|auth(?:entication)?\s+fail(?:ed|ure)?|connector\s+(?:error|disconnected|failure)|shopify\s+(?:auth|reconnect)|reconnect\s+(?:required|oauth|shopify|with|to\s+restore)|(?:must|please)\s+reconnect|(?:invalid|expired|bad)\s+credential(?:s)?|oauth\s+credential(?:s)?|credential(?:s)?\s+(?:expired|invalid|required))\b/i.test(
      blob,
    )
  ) {
    return "security";
  }
  return "data";
}

if (classifyIssueRouteKind({ checkId: "CC-03", title: "Consent mismatch" }) === "data") {
  pass("taxonomy: normal DCS FAIL → data");
} else fail("taxonomy: normal DCS FAIL → data");

if (
  classifyIssueRouteKind({
    checkId: "CONN-01",
    title: "Shopify reconnect required",
    suggestedFix: "Reconnect OAuth credentials",
  }) === "security"
) {
  pass("taxonomy: reconnect/oauth → security");
} else fail("taxonomy: reconnect/oauth → security");

if (
  classifyIssueRouteKind({
    checkId: "X-01",
    fixOwner: "External integrator",
    title: "Mapping gap",
  }) === "data"
) {
  pass("taxonomy: External integrator alone is not security");
} else fail("taxonomy: External integrator alone is not security");

if (
  classifyIssueRouteKind({
    title: "Field mapping needs attention",
    detail: "SKU drift",
  }) === "data"
) {
  pass("taxonomy: needs attention stays data");
} else fail("taxonomy: needs attention stays data");

if (
  classifyIssueRouteKind({
    title: "Channel authorization flag",
  }) === "data"
) {
  pass("taxonomy: authorization stays data");
} else fail("taxonomy: authorization stays data");

if (
  classifyIssueRouteKind({
    title: "Unauthorized discount codes",
  }) === "data"
) {
  pass("taxonomy: unauthorized stays data");
} else fail("taxonomy: unauthorized stays data");

if (
  classifyIssueRouteKind({
    title: "Credential mapping mismatch",
  }) === "data"
) {
  pass("taxonomy: credential mapping stays data");
} else fail("taxonomy: credential mapping stays data");

if (
  classifyIssueRouteKind({
    title: "Customers who reconnect after churn",
  }) === "data"
) {
  pass("taxonomy: marketing reconnect stays data");
} else fail("taxonomy: marketing reconnect stays data");

if (
  classifyIssueRouteKind({
    detail: "Access token invalid",
  }) === "security"
) {
  pass("taxonomy: access token invalid → security");
} else fail("taxonomy: access token invalid → security");
console.log("");
if (failed === 0) {
  console.log("OK — 0 failure(s)");
  process.exit(0);
}
console.log(`FAILED — ${failed} failure(s)`);
process.exit(1);
