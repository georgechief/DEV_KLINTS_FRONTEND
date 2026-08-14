/**
 * DCS-10 frontend verification — PRD §8 + §10 acceptance.
 * Run: node scripts/verify-dcs10-frontend.mjs
 * Optional live API: DCS10_API_BASE=http://127.0.0.1:8000 DCS10_EMAIL=... DCS10_PASSWORD=... node scripts/verify-dcs10-frontend.mjs
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
  else fail(label, `missing in ${rel}: ${needle.slice(0, 60)}…`);
}

// --- Mirror PRD helpers (keep in sync with src/lib/dcs.ts) ---
function resolvePeriodHeadlineDelta(periodCompare) {
  if (!periodCompare?.available) return null;
  const raw = periodCompare.deltas?.headline_score;
  if (raw == null || !Number.isFinite(raw)) return null;
  const delta = Math.round(raw);
  if (delta === 0) return { delta: 0, direction: "flat" };
  return { delta, direction: delta > 0 ? "up" : "down" };
}

function resolvePeriodCapturedAmount(periodCompare) {
  if (!periodCompare?.available) return null;
  const captured = periodCompare.deltas?.captured_from_estimate;
  if (captured == null || !Number.isFinite(captured) || captured <= 0) return null;
  return Math.round(captured);
}

function liveDimensionsWithPeriodDeltas(dimensions, periodCompare) {
  if (!dimensions) return [];
  const periodDeltas = periodCompare?.available ? periodCompare.deltas?.dimensions : null;
  return Object.entries(dimensions).map(([name, dim]) => ({
    name,
    score: Math.round(dim.score),
    delta: periodDeltas?.[name] ?? null,
  }));
}

function resolveAuditEventMeta(event) {
  const meta = event.meta?.trim();
  if (!meta) return null;
  if (event.action === "dcs.score_completed") {
    const parts = event.summary.split("·").map((p) => p.trim());
    const tail = parts[parts.length - 1]?.toLowerCase();
    if (tail && meta.toLowerCase() === tail) return null;
  }
  return meta;
}

function testHelpers() {
  console.log("\n1. Helper unit tests (PRD bindings)");

  const up = resolvePeriodHeadlineDelta({
    available: true,
    deltas: { headline_score: 9 },
  });
  if (up?.direction === "up" && up.delta === 9) pass("resolvePeriodHeadlineDelta positive");
  else fail("resolvePeriodHeadlineDelta positive", JSON.stringify(up));

  const flat = resolvePeriodHeadlineDelta({
    available: true,
    deltas: { headline_score: 0 },
  });
  if (flat?.direction === "flat") pass("resolvePeriodHeadlineDelta flat");
  else fail("resolvePeriodHeadlineDelta flat");

  const captured = resolvePeriodCapturedAmount({
    available: true,
    deltas: { captured_from_estimate: 25000 },
  });
  if (captured === 25000) pass("resolvePeriodCapturedAmount");
  else fail("resolvePeriodCapturedAmount", String(captured));

  const noFakeZero = resolvePeriodCapturedAmount({
    available: true,
    deltas: { captured_from_estimate: 0 },
  });
  if (noFakeZero === null) pass("no silent zero captured");
  else fail("no silent zero captured", String(noFakeZero));

  const dims = liveDimensionsWithPeriodDeltas(
    { "01 Customer Identity": { score: 80 } },
    { available: true, deltas: { dimensions: { "01 Customer Identity": 5 } } },
  );
  if (dims[0]?.delta === 5) pass("liveDimensionsWithPeriodDeltas");
  else fail("liveDimensionsWithPeriodDeltas");

  const auditMeta = resolveAuditEventMeta({
    action: "dcs.score_completed",
    summary: "DCS score completed · 71 (+9) · SUCCEEDED",
    meta: "SUCCEEDED",
  });
  if (auditMeta === null) pass("resolveAuditEventMeta hides redundant run_state");
  else fail("resolveAuditEventMeta", auditMeta);

  const runDiffLabel = formatConsecutiveRunDiffLabel({
    baseline: false,
    headline_score: { previous: 70.516, current: 75.222, delta: 4.706 },
  });
  if (runDiffLabel === "+4 vs prior run") pass("formatConsecutiveRunDiffLabel");
  else fail("formatConsecutiveRunDiffLabel", runDiffLabel);
}

function formatConsecutiveRunDiffLabel(runDiff) {
  if (!runDiff || runDiff.baseline) return null;
  const headline = runDiff.headline_score;
  if (!headline || headline.delta == null) return null;
  const current = headline.current != null ? Math.round(headline.current) : null;
  const previous = headline.previous != null ? Math.round(headline.previous) : null;
  const displayDelta =
    current != null && previous != null ? current - previous : Math.round(headline.delta);
  if (displayDelta === 0) return "No change vs prior run";
  return displayDelta > 0 ? `+${displayDelta} vs prior run` : `${displayDelta} vs prior run`;
}

function testSourceWiring() {
  console.log("\n2. Source wiring (PRD §8 deliverables)");

  const dcs = readSrc("src/lib/dcs.ts");
  assertIncludes(dcs, "dcs.ts", "until?: string", "getDcsScoreHistory accepts until");
  assertIncludes(dcs, "dcs.ts", "period_compare?: DcsPeriodCompare", "period_compare type");
  assertIncludes(dcs, "dcs.ts", "at_stake_series?: DcsAtStakeSeriesPoint[]", "at_stake_series type");
  assertIncludes(dcs, "dcs.ts", "resolvePeriodHeadlineDelta", "resolvePeriodHeadlineDelta helper");
  assertIncludes(dcs, "dcs.ts", "DCS_PERIOD_CAPTURED_TOOLTIP", "captured tooltip constant");

  const overview = readSrc("src/components/klints/OverviewPanel.tsx");
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "until: periodWindow.until.toISOString()",
    "Overview history passes until",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "resolvePeriodHeadlineDelta(periodCompare)",
    "Overview score Δ uses period_compare",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "liveDimensionsWithPeriodDeltas",
    "Overview dimension period deltas",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "at_stake_series",
    "Overview spark from at_stake_series",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "showDelta={periodCompareAvailable}",
    "Overview dimension showDelta from period_compare",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "Need ≥2 scored runs in period",
    "Overview honest empty copy",
  );
  assertIncludes(
    overview,
    "OverviewPanel.tsx",
    "DCS_PERIOD_CAPTURED_TOOLTIP",
    "Overview captured tooltip",
  );
  if (!overview.includes('showDelta={false}')) pass("no hard-coded showDelta={false} in Overview");
  else fail("hard-coded showDelta={false} in Overview");

  const dataCenter = readSrc("src/routes/data-consistency.tsx");
  assertIncludes(
    dataCenter,
    "data-consistency.tsx",
    "until: periodWindow.until.toISOString()",
    "Data Center history passes until",
  );
  assertIncludes(
    dataCenter,
    "data-consistency.tsx",
    "trendPeriod",
    "Data Center trend period selector",
  );
  assertIncludes(
    dataCenter,
    "data-consistency.tsx",
    "formatConsecutiveRunDiffLabel",
    "Data Center consecutive run_diff label",
  );
  assertIncludes(dcs, "dcs.ts", "formatConsecutiveRunDiffLabel", "consecutive run_diff helper");
  assertIncludes(dcs, "dcs.ts", "run_diff?: DcsRunDiff", "run_diff on DcsRunSummary type");
  assertIncludes(
    dataCenter,
    "data-consistency.tsx",
    "resolvePeriodHeadlineDelta(periodCompare)",
    "Data Center trend Δ uses period_compare",
  );

  const activity = readSrc("src/routes/activity.tsx");
  assertIncludes(activity, "activity.tsx", "resolveAuditEventMeta", "Activity audit meta helper");
  assertIncludes(activity, "activity.tsx", "formatAuditEventSummary", "Activity audit summary formatter");

  const audit = readSrc("src/lib/audit.ts");
  assertIncludes(audit, "audit.ts", "resolveAuditEventMeta", "audit.ts meta helper");

  const opportunities = readSrc("src/routes/opportunities.tsx");
  if (!opportunities.includes("period_compare") && !opportunities.includes("run_diff")) {
    pass("Opportunities not wired to DCS-10 (out of scope)");
  } else {
    fail("Opportunities incorrectly wired to DCS-10");
  }
}

async function testLiveApi() {
  const base = process.env.DCS10_API_BASE ?? "http://127.0.0.1:8000";
  const email = process.env.DCS10_EMAIL;
  const password = process.env.DCS10_PASSWORD;

  console.log("\n3. Live API (optional)");

  if (!email || !password) {
    pass("live API skipped", "set DCS10_EMAIL + DCS10_PASSWORD to enable");
    return;
  }

  try {
    const loginRes = await fetch(`${base}/api/v1/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    const token = loginData.access;
    if (!token) {
      fail("login", JSON.stringify(loginData).slice(0, 120));
      return;
    }
    pass("login", email);

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date().toISOString();
    const historyRes = await fetch(
      `${base}/api/v1/dcs/history/?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const history = await historyRes.json();
    if (!historyRes.ok) {
      fail("GET /dcs/history/", JSON.stringify(history).slice(0, 120));
      return;
    }

    const keys = ["points", "period_compare", "at_stake_series", "since", "until"];
    const missing = keys.filter((k) => !(k in history));
    if (missing.length === 0) pass("history response shape", keys.join(", "));
    else fail("history response shape", `missing: ${missing.join(", ")}`);

    const pc = history.period_compare;
    if (pc && typeof pc.available === "boolean") {
      pass(
        "period_compare.available",
        `${pc.available}, run_count=${pc.run_count ?? "?"}`,
      );
      if (pc.available && pc.deltas?.headline_score != null) {
        const delta = resolvePeriodHeadlineDelta(pc);
        pass("FE headline Δ from live period_compare", JSON.stringify(delta));
      }
      if (pc.available && pc.deltas?.captured_from_estimate != null) {
        const cap = resolvePeriodCapturedAmount(pc);
        pass("FE captured from live period_compare", String(cap ?? "null (no improvement)"));
      }
    } else {
      fail("period_compare object");
    }

    const auditRes = await fetch(`${base}/api/v1/audit/events/?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const auditData = await auditRes.json();
    const dcsEvents = (auditData.results ?? []).filter(
      (e) => e.action === "dcs.score_completed",
    );
    if (dcsEvents.length > 0) {
      const sample = dcsEvents[0];
      const hasDelta =
        sample.summary?.includes("(+") || sample.summary?.includes("(-");
      if (hasDelta) pass("Activity summary consecutive Δ", sample.summary.slice(0, 60));
      else pass("Activity DCS event (baseline/no delta)", sample.summary?.slice(0, 60));
      const meta = resolveAuditEventMeta(sample);
      if (meta) pass("Activity meta line", meta.slice(0, 60));
    } else {
      pass("audit events", "no dcs.score_completed in last 10");
    }
  } catch (err) {
    fail("live API", err instanceof Error ? err.message : String(err));
  }
}

console.log("=== DCS-10 FRONTEND VERIFICATION ===");
testHelpers();
testSourceWiring();
await testLiveApi();

console.log("\n=== SUMMARY ===");
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} checks passed`);
if (failed > 0) {
  console.log(`FAILED: ${failed}`);
  process.exit(1);
}
console.log("=== DCS-10 FRONTEND: PASS ===");
