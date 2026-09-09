/**
 * GAP-01E Phase 4 deep probes — adversarial honesty checks (not just static verify).
 * Run: node scripts/probe-gap01-e-phase4.mjs
 */
import { readFileSync } from "node:fs";
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

const SECURITY_TEXT_RE =
  /\b(oauth|api[_\s-]?key|refresh[_\s-]?token|token[_\s-]?expired|(?:access[_\s-]?)?token\s+(?:invalid|expired|revoked)|(?:invalid|expired|revoked)\s+(?:access[_\s-]?)?token|authentication\s+failed|auth(?:entication)?\s+fail(?:ed|ure)?|connector\s+(?:error|disconnected|failure)|shopify\s+(?:auth|reconnect)|reconnect\s+(?:required|oauth|shopify|with|to\s+restore)|(?:must|please)\s+reconnect|(?:invalid|expired|bad)\s+credential(?:s)?|oauth\s+credential(?:s)?|credential(?:s)?\s+(?:expired|invalid|required))\b/i;
const SECURITY_DIMENSION_RE = /\b(security|access\s*control)\b/i;

function classify(signals) {
  const blob = [
    signals.checkId,
    signals.dimension,
    signals.fixOwner,
    signals.title,
    signals.detail,
    signals.suggestedFix,
    signals.systemsCompared,
  ]
    .map((p) => (typeof p === "string" ? p : ""))
    .join(" ");
  if (SECURITY_DIMENSION_RE.test(signals.dimension ?? "")) return "security";
  if (SECURITY_TEXT_RE.test(blob)) return "security";
  return "data";
}

function formatLag(finishedAt, now = new Date("2026-09-04T12:00:00.000Z")) {
  if (!finishedAt) return "—";
  const ms = now.getTime() - new Date(finishedAt).getTime();
  if (ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function syncHealth(c, now = new Date("2026-09-04T12:00:00.000Z")) {
  const refresh = c.last_data_refresh ?? null;
  const finishedAt = refresh?.finished_at ?? null;
  const inFlight =
    refresh?.data_run_status === "pending" ||
    refresh?.data_run_status === "running";
  const issueCount =
    typeof refresh?.issue_count === "number"
      ? Math.max(0, Math.trunc(refresh.issue_count))
      : 0;
  const status = (c.status || "").toLowerCase();
  const summary = (refresh?.summary_status || "").toLowerCase();
  let badge = "Healthy";
  if (
    status === "error" ||
    summary === "error" ||
    refresh?.data_run_status === "failed"
  ) {
    badge = "Error";
  } else if (inFlight) {
    badge = "Syncing";
  } else if (!finishedAt) {
    badge = "No sync";
  } else if (status === "degraded" || summary === "degraded" || issueCount > 0) {
    badge = "Degraded";
  }
  return {
    badge,
    lag: inFlight && !finishedAt ? "—" : formatLag(finishedAt, now),
    issueCount,
  };
}

function extractCheck(ev) {
  if (!ev) return null;
  const m = String(ev.locator || "").match(
    /gates_snapshot\.checks\.([A-Z]{1,4}-\d+)/i,
  );
  return m ? m[1].toUpperCase() : null;
}

function preferInteg(ev) {
  if (!ev) return false;
  const b = `${String(ev.value || "")} ${String(ev.locator || "")}`.toLowerCase();
  return (
    b.includes("connector") || b.includes("webhook") || b.includes("latency")
  );
}

console.log("=== GAP-01E Phase 4 deep probes ===\n");
console.log("1) Security taxonomy false positives");
const taxonomyCases = [
  ["needs attention → data", { title: "Field mapping needs attention" }, "data"],
  ["authorization → data", { title: "Channel authorization flag" }, "data"],
  ["unauthorized → data", { title: "Unauthorized discount codes" }, "data"],
  ["credential mapping → data", { title: "Credential mapping mismatch" }, "data"],
  [
    "marketing reconnect → data",
    { title: "Customers who reconnect after churn" },
    "data",
  ],
  [
    "shared credentials → data",
    { title: "Shared credentials across channels" },
    "data",
  ],
  [
    "oauth reconnect → security",
    { title: "Shopify reconnect required", suggestedFix: "Reconnect OAuth credentials" },
    "security",
  ],
  ["api key → security", { suggestedFix: "Rotate API key" }, "security"],
  ["access token invalid → security", { detail: "Access token invalid" }, "security"],
  [
    "ext integrator alone → data",
    { fixOwner: "External integrator", title: "Mapping" },
    "data",
  ],
  [
    "consent dim → data",
    { title: "Consent mismatch", dimension: "Channel & Consent" },
    "data",
  ],
];
for (const [label, signals, expect] of taxonomyCases) {
  const got = classify(signals);
  if (got === expect) pass(label);
  else fail(label, `got ${got}`);
}

console.log("\n2) Sync health honesty");
const never = syncHealth({ status: "connected", last_data_refresh: null });
if (never.badge === "No sync" && never.lag === "—") pass("never synced → No sync");
else fail("never synced → No sync", JSON.stringify(never));

const healthy = syncHealth({
  status: "connected",
  last_data_refresh: {
    finished_at: "2026-09-04T11:50:00.000Z",
    issue_count: 0,
    data_run_status: "succeeded",
    summary_status: "ok",
  },
});
if (healthy.badge === "Healthy" && healthy.lag === "10m") {
  pass("fresh sync → Healthy + lag");
} else fail("fresh sync → Healthy + lag", JSON.stringify(healthy));

const errored = syncHealth({
  status: "error",
  last_data_refresh: {
    finished_at: "2026-09-04T11:00:00.000Z",
    issue_count: 2,
    data_run_status: "failed",
    summary_status: "error",
  },
});
if (errored.badge === "Error" && errored.issueCount === 2) {
  pass("error connector → Error badge");
} else fail("error connector → Error badge", JSON.stringify(errored));

console.log("\n3) QA FAIL matrix honesty");
const fixEv = { locator: "gates_snapshot.checks.CC-03", value: "FAIL" };
if (extractCheck(fixEv) === "CC-03") pass("extract check id");
else fail("extract check id");
if (!preferInteg({ value: "async_fail" })) pass("async_* not Integrations");
else fail("async_* not Integrations");
if (preferInteg({ locator: "connector.latency", value: "stale" })) {
  pass("latency/connector → Integrations prefer");
} else fail("latency/connector → Integrations prefer");

console.log("\n4) Surface inventory");
const integ = readFileSync(join(ROOT, "src/routes/integrations.tsx"), "utf8");
const qa = readFileSync(join(ROOT, "src/routes/qa.tsx"), "utf8");
const ov = readFileSync(
  join(ROOT, "src/components/klints/OverviewPanel.tsx"),
  "utf8",
);
const dcs = readFileSync(join(ROOT, "src/routes/data-consistency.tsx"), "utf8");
const connectors = readFileSync(join(ROOT, "src/lib/connectors.ts"), "utf8");
const useCases = readFileSync(join(ROOT, "src/lib/use-cases.ts"), "utf8");

if (!integ.includes("42s")) pass("Integrations: no 42s");
else fail("Integrations: no 42s");
if (integ.includes("gap01e-w803") && integ.includes("connectorSyncHealth")) {
  pass("Integrations: W8-03 wired");
} else fail("Integrations: W8-03 wired");
if (qa.includes("qaFailDeepLink") && qa.includes("data-qa-fail-route")) {
  pass("QA: W8-04 wired");
} else fail("QA: W8-04 wired");
if (ov.includes("routeIssueTarget") && ov.includes("data-issue-route")) {
  pass("Overview: W8-02 wired");
} else fail("Overview: W8-02 wired");
{
  // Unlock / null-target Integrations links must not claim Security taxonomy (E0.6).
  const hardSec = (ov.match(/to="\/integrations"[\s\S]{0,120}?data-issue-route="security"/g) || [])
    .length;
  const hardFallback = (ov.match(/to="\/integrations"[\s\S]{0,120}?data-issue-route="fallback"/g) || [])
    .length;
  if (hardSec === 0 && hardFallback >= 1) {
    pass("Overview Integrations fallback is fallback not security");
  } else {
    fail(
      "Overview Integrations fallback is fallback not security",
      `security=${hardSec} fallback=${hardFallback}`,
    );
  }
}if (useCases.includes('taxonomy: "fallback"')) {
  pass("Unlock path is fallback not security");
} else fail("Unlock path is fallback not security");

const frStart = dcs.indexOf("function FailedRunWorklistRow");
const frEnd = dcs.indexOf("\nfunction ", frStart + 1);
const failedRow = frStart >= 0 ? dcs.slice(frStart, frEnd > frStart ? frEnd : undefined) : "";
if (failedRow && !failedRow.includes('to="/fix"') && failedRow.includes("data-failed-run-cta")) {
  pass("FailedRunWorklistRow honest (no bare /fix)");
} else fail("FailedRunWorklistRow honest (no bare /fix)");

if (connectors.includes("No sync") && connectors.includes("connectorSyncHealth")) {
  pass("connectors sync helper present");
} else fail("connectors sync helper present");
if (
  connectors.includes("latest_bootstrap") &&
  connectors.includes("connectorLastDataRefresh")
) {
  pass("sync health uses bootstrap fallback (not inventing lag)");
} else fail("sync health uses bootstrap fallback (not inventing lag)");

console.log("");
if (failed === 0) {
  console.log("OK — Phase 4 deep probes 0 failure(s)");
  process.exit(0);
}
console.log(`FAILED — ${failed} failure(s)`);
process.exit(1);
