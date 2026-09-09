/**
 * DCS-10 Slice D — FE light acceptance (static).
 * Run: npm run verify:dcs10-fresh-import
 */

import { readFileSync, existsSync } from "node:fs";
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

function readSrc(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) {
    fail(`file exists: ${rel}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function assertIncludes(src, needle, label) {
  if (src.includes(needle)) pass(label);
  else fail(label, `missing: ${needle.slice(0, 90)}`);
}

console.log("=== DCS-10 Slice D FRONTEND VERIFICATION ===\n");

const dcsLib = readSrc("src/lib/dcs.ts");
assertIncludes(dcsLib, "DcsFreshImportsSummary", "fresh import summary type");
assertIncludes(dcsLib, "fresh_import_failed_platform", "failed platform on run summary");
assertIncludes(dcsLib, "isDcsFreshImportPhaseRunning", "import phase helper");
assertIncludes(dcsLib, "hasFreshImportsOnRun", "hasFreshImportsOnRun helper");
assertIncludes(dcsLib, "coerceFreshImportDataRunId", "fresh import data_run_id coercion");
assertIncludes(dcsLib, "hasEligibleConnectedDcsConnectors", "eligible connector guard");
assertIncludes(dcsLib, "evaluated_count ?? 0) > 0", "import phase excludes started foundation checks");
assertIncludes(
  dcsLib,
  'if (!run || run.status !== "failed") continue',
  "failed platform only on failed runs",
);
assertIncludes(dcsLib, "formatFreshImportPhaseCopy", "import phase copy helper");
assertIncludes(dcsLib, "formatFreshImportFailedCopy", "import failure copy helper");
assertIncludes(
  dcsLib,
  'return "Fetching latest Shopify + Manago data…";',
  "import phase customer copy",
);

const auth = readSrc("src/lib/auth.ts");
const page = readSrc("src/routes/data-consistency.tsx");
assertIncludes(page, "isDcsFreshImportPhaseRunning", "Data Center detects import phase");
assertIncludes(page, "formatFreshImportPhaseCopy", "Data Center shows import phase copy");
assertIncludes(page, "showFreshImportFailure", "Data Center fresh import failure banner");
assertIncludes(page, "Fetched latest connector data", "Re-run toast acknowledges fresh imports");
assertIncludes(page, "pendingFreshImportRunIdRef", "Re-run toast scoped to new run id");
assertIncludes(page, "hasEligibleConnectedDcsConnectors", "Import phase gated on connected stack");
assertIncludes(auth, 'connector.status === "error"', "Setup path only on terminal error");
assertIncludes(
  page,
  "only reloads progress on this page",
  "Refresh status documented as poll-only",
);

const connectorsLib = readSrc("src/lib/connectors.ts");
const integrations = readSrc("src/routes/integrations.tsx");
assertIncludes(connectorsLib, "last_data_refresh", "Slice F: last_data_refresh type");
assertIncludes(connectorsLib, "connectorLastDataRefresh", "Slice F: connectorLastDataRefresh helper");
assertIncludes(integrations, "connectorLastDataRefresh", "Integrations uses last_data_refresh stats");

console.log("");
if (failed) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("All DCS-10 Slice D frontend checks passed.");
