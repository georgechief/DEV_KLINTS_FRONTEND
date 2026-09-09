/**
 * WB-01B frontend verification — PRD-WB-01B acceptance (FE slice).
 * Run: npm run verify:wb01b
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

const WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS = ["LE-04"];

function isWritebackPreviewBlocked(checkId) {
  if (!checkId?.trim()) return false;
  const id = checkId.trim().toUpperCase();
  return WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS.some(
    (blocked) => blocked.toUpperCase() === id,
  );
}

function findWritebackMapping(mappings, checkId) {
  if (!checkId?.trim() || !mappings?.length) return undefined;
  const id = checkId.trim().toUpperCase();
  return mappings.find((row) => row.check_id.toUpperCase() === id);
}

function isWritebackMappingEnabled(mappings, checkId) {
  if (isWritebackPreviewBlocked(checkId)) return false;
  const row = findWritebackMapping(mappings, checkId);
  return Boolean(row?.enabled);
}

function testLe04Blocked() {
  console.log("\n1. LE-04 not advertised (PRD §2 / §8)");

  const mappings = [
    { check_id: "LE-04", enabled: true },
    { check_id: "CI-01", enabled: true },
    { check_id: "WB-SHOP-01", enabled: true },
  ];

  if (isWritebackPreviewBlocked("LE-04")) pass("LE-04 in blocklist");
  else fail("LE-04 in blocklist");

  if (!isWritebackMappingEnabled(mappings, "LE-04")) {
    pass("LE-04 blocked even when API says enabled");
  } else {
    fail("LE-04 blocked even when API says enabled");
  }

  if (isWritebackMappingEnabled(mappings, "CI-01")) pass("CI-01 still enabled");
  else fail("CI-01 still enabled");

  if (isWritebackMappingEnabled(mappings, "WB-SHOP-01")) {
    pass("WB-SHOP-01 enabled");
  } else {
    fail("WB-SHOP-01 enabled");
  }
}

function testWbShop01UrlParsing() {
  console.log("\n4. WB-SHOP-01 URL parsing (PRD §4)");

  const dcs = readSrc("src/lib/dcs.ts");
  assertIncludes(
    dcs,
    "dcs.ts",
    "WRITEBACK_SANDBOX_CHECK_ID_PATTERN",
    "sandbox check id pattern",
  );
  assertIncludes(dcs, "dcs.ts", "isFixFlowCheckOrMappingId", "mapping id helper exported");

  // Mirror resolveCheckIdFromSearch
  function resolveCheckIdFromSearch(check, issue) {
    const DCS = /^[A-Z]{2}-\d{2}$/i;
    const WB = /^WB-[A-Z]+-\d{2}$/i;
    function isId(value) {
      if (!value?.trim()) return false;
      const id = value.trim();
      if (/^iss-/i.test(id)) return false;
      return DCS.test(id) || WB.test(id);
    }
    if (typeof check === "string" && check.trim()) return check.trim();
    if (typeof issue === "string" && isId(issue)) return issue.trim();
    return undefined;
  }

  if (resolveCheckIdFromSearch(undefined, "WB-SHOP-01") === "WB-SHOP-01") {
    pass("issue=WB-SHOP-01 resolves from URL");
  } else {
    fail("issue=WB-SHOP-01 resolves from URL");
  }

  if (resolveCheckIdFromSearch(undefined, "LE-04") === "LE-04") {
    pass("standard DCS check ids still resolve");
  } else {
    fail("standard DCS check ids still resolve");
  }
}

function testStaticWiring() {
  console.log("\n2. Static wiring (PRD-WB-01B)");

  const writebacks = readSrc("src/lib/writebacks.ts");
  assertIncludes(
    writebacks,
    "writebacks.ts",
    'WRITEBACK_PREVIEW_BLOCKED_CHECK_IDS = ["LE-04"]',
    "LE-04 blocklist constant",
  );
  assertIncludes(writebacks, "writebacks.ts", "isWritebackPreviewBlocked", "block helper exported");
  assertIncludes(writebacks, "writebacks.ts", "findWritebackMapping", "mapping lookup exported");
  assertIncludes(writebacks, "writebacks.ts", "writebackMappingTargets", "target labels helper");
  assertNotIncludes(writebacks, "writebacks.ts", "/writebacks/execute/", "no execute API on FE");

  const fixFlow = readSrc("src/lib/fix-flow.ts");
  assertIncludes(fixFlow, "fix-flow.ts", '"sandbox-mapping"', "sandbox-mapping target kind");
  assertIncludes(fixFlow, "fix-flow.ts", "buildSandboxWritebackFixPlan", "sandbox plan resolver");
  assertIncludes(fixFlow, "fix-flow.ts", "isFixTargetWritebackCapable", "writeback-capable helper");

  const livePlan = readSrc("src/lib/fix-live-plan.ts");
  assertIncludes(
    livePlan,
    "fix-live-plan.ts",
    "order/transaction writes not supported",
    "Shopify surface honesty",
  );
  assertIncludes(
    livePlan,
    "fix-live-plan.ts",
    "buildSandboxWritebackFixPlan",
    "sandbox fix plan builder",
  );

  const fixPage = readSrc("src/routes/fix.tsx");
  assertNotIncludes(fixPage, "fix.tsx", "LE-04", "Fix page does not hardcode LE-04");
  assertIncludes(fixPage, "fix.tsx", "writebackMappings?.mappings", "Fix passes mappings to resolver");
  assertIncludes(fixPage, "fix.tsx", "isFixTargetWritebackCapable", "Fix uses writeback-capable helper");
  assertIncludes(fixPage, "fix.tsx", "Approve writeback", "approve matches approved design");
  assertNotIncludes(fixPage, "fix.tsx", "Approve writeback · Coming soon", "no Coming soon on approve");
  assertNotIncludes(fixPage, "fix.tsx", "/writebacks/execute/", "no execute on Fix page");
}

function testVerifyWb01UsesCc03NotLe04() {
  console.log("\n3. WB-01 verify script aligned");

  const verify = readSrc("scripts/verify-wb01-frontend.mjs");
  if (!verify.includes('check_id: "LE-04", enabled: true')) {
    pass("verify-wb01 no longer treats LE-04 as enabled");
  } else {
    fail("verify-wb01 no longer treats LE-04 as enabled");
  }
}

function main() {
  console.log("WB-01B frontend verification");
  testLe04Blocked();
  testStaticWiring();
  testVerifyWb01UsesCc03NotLe04();
  testWbShop01UrlParsing();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All WB-01B frontend checks passed.");
}

main();
