/**
 * FE-11 frontend verification — PRD-FE-11 acceptance.
 * Run: npm run verify:fe11
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

function isPlaceholderEvidenceLocator(locator) {
  const trimmed = (locator ?? "").trim().toLowerCase();
  return !trimmed || trimmed === "—" || trimmed === "-" || trimmed === "n/a" || trimmed === "na";
}

function humanizeSnakeLabel(value) {
  return String(value)
    .replace(/[_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

function looksLikeFieldPath(value) {
  return /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value);
}

function formatEntityField(entity, field) {
  const e = entity?.trim();
  const f = field?.trim();
  if (e && f) return `${e}.${f}`;
  if (f) return f;
  return null;
}

/** Mirror of src/lib/dcs.ts friendlyEvidenceElement (PRD-FE-11B order). */
function friendlyEvidenceElement(locator, value, item = {}) {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entity = item.entity || rec.entity;
  const apiKey = item.api_key || rec.api_key;
  const fromApi = formatEntityField(entity, apiKey);
  if (fromApi) return fromApi;

  const dbKey = item.db_key || rec.db_key || rec.field;
  const fromDb = formatEntityField(entity, dbKey);
  if (fromDb) return fromDb;

  const element = item.element || rec.element || rec.element_name || rec.fix_target;
  if (element) {
    if (looksLikeFieldPath(element) || element.includes(".")) return element;
    const withEntity = formatEntityField(entity, element);
    if (withEntity) return withEntity;
    return element;
  }

  const loc = (locator ?? "").trim();
  if (loc && !isPlaceholderEvidenceLocator(loc)) {
    if (looksLikeFieldPath(loc)) return loc;
    const leaf = loc.split(/[./]+/).filter(Boolean).pop();
    if (leaf) return leaf;
  }

  const side = rec.side;
  if (side) return humanizeSnakeLabel(side);
  return "—";
}

/** Mirror of src/lib/dcs.ts friendlyEvidenceSystem CI-13 branch. */
function friendlyEvidenceSystem(source, value, locator) {
  const blob = `${source} ${locator ?? ""}`.toLowerCase();
  const rec = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const side = String(rec.side ?? "").toLowerCase();

  if (
    side === "dead_state" ||
    side === "dead_date_cluster" ||
    /drift\.contact_state|contact_state_distribution/.test(blob)
  ) {
    return "Manago.ai";
  }
  if (side === "shopify_only" || /shopify/.test(blob)) return "Shopify";
  if (side === "manago_only" || /manago/.test(blob)) return "Manago.ai";
  if (/klints|internal|computed|derived/.test(blob)) return "Shopify & Manago";
  return source || "Connected systems";
}

function testElementResolution() {
  console.log("\n1. Element resolution (PRD §3.2)");

  const ci13Enriched = {
    source: "manago_ai",
    locator: "",
    element: "contact.state",
    element_label: "Contact state (dead/blocked/resigned) (blocked)",
    entity: "contact",
    value: { side: "dead_state", bucket: "blocked", count: 3 },
    observed_at: "",
  };
  const ci13Element = friendlyEvidenceElement(
    ci13Enriched.locator,
    ci13Enriched.value,
    ci13Enriched,
  );
  if (ci13Element === "contact.state") {
    pass("CI-13 enriched mismatch Elements = contact.state", ci13Element);
  } else {
    fail("CI-13 enriched mismatch Elements = contact.state", ci13Element);
  }

  const legacyRow = {
    source: "klints",
    locator: "—",
    value: { side: "dead_state", bucket: "blocked", count: 3 },
  };
  const legacyElement = friendlyEvidenceElement(
    legacyRow.locator,
    legacyRow.value,
    legacyRow,
  );
  if (legacyElement === "Dead state") {
    pass("placeholder locator does not block side fallback", legacyElement);
  } else {
    fail("placeholder locator does not block side fallback", legacyElement);
  }

  const fieldRow = {
    source: "shopify",
    entity: "contact",
    db_key: "email",
    api_key: "email",
    value: { email: "a@example.com" },
  };
  const fieldElement = friendlyEvidenceElement("", fieldRow.value, fieldRow);
  if (fieldElement === "contact.email") {
    pass("field row shows entity.api_key", fieldElement);
  } else {
    fail("field row shows entity.api_key", fieldElement);
  }
}

function testSystemLabels() {
  console.log("\n2. Where it came from (CI-13)");

  const system = friendlyEvidenceSystem(
    "klints",
    { side: "dead_state", count: 3 },
    "",
  );
  if (system === "Manago.ai") {
    pass("CI-13 drift row labels Manago.ai", system);
  } else {
    fail("CI-13 drift row labels Manago.ai", system);
  }

  const enrichedSystem = friendlyEvidenceSystem(
    "manago_ai",
    { side: "dead_state", bucket: "blocked", count: 3 },
    "",
  );
  if (enrichedSystem === "Manago.ai") {
    pass("enriched manago_ai source stays Manago.ai", enrichedSystem);
  } else {
    fail("enriched manago_ai source stays Manago.ai", enrichedSystem);
  }
}

function testStaticWiring() {
  console.log("\n3. Static wiring");

  const dcs = readSrc("src/lib/dcs.ts");
  assertIncludes(dcs, "dcs.ts", "element_label?: string", "DcsEvidenceItem has element_label");
  assertIncludes(dcs, "dcs.ts", "isPlaceholderEvidenceLocator", "placeholder locator guard");
  assertIncludes(dcs, "dcs.ts", "dead_state", "dead_state handling in evidence copy");
  assertIncludes(dcs, "dcs.ts", "friendlyEvidenceElement(item.locator, item.value, item)", "element helper receives enriched item");
  assertIncludes(dcs, "dcs.ts", "dead_date_cluster", "CI-13 Manago system inference");
}

function main() {
  console.log("FE-11 frontend verification");
  testElementResolution();
  testSystemLabels();
  testStaticWiring();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
