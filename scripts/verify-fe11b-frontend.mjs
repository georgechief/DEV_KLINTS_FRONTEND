/**
 * FE-11B frontend verification — Elements = {entity}.{api_key}.
 * Run: npm run verify:fe11b
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

/** Mirror of src/lib/dcs.ts friendlyEvidenceElement (PRD-FE-11B). */
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

function testAcceptanceFixtures() {
  console.log("\n1. Acceptance fixtures (PRD §4)");

  const ci01Shopify = friendlyEvidenceElement(
    "—",
    { side: "shopify_only", email: "buyer@example.com" },
    {
      source: "shopify",
      entity: "contact",
      api_key: "email",
      element: "contact.email",
      element_label: "Contact (Shopify only)",
    },
  );
  if (ci01Shopify === "contact.email") pass("CI-01 Shopify Elements = contact.email");
  else fail("CI-01 Shopify Elements = contact.email", ci01Shopify);
  if (ci01Shopify !== "Contact (Shopify only)") {
    pass("CI-01 Shopify ignores element_label");
  } else {
    fail("CI-01 Shopify ignores element_label");
  }

  const ci01Manago = friendlyEvidenceElement(
    "",
    { side: "manago_only", email: "buyer@example.com" },
    {
      source: "manago_ai",
      entity: "contact",
      api_key: "email",
      element: "contact.email",
      element_label: "Contact (Manago only)",
    },
  );
  if (ci01Manago === "contact.email") pass("CI-01 Manago Elements = contact.email");
  else fail("CI-01 Manago Elements = contact.email", ci01Manago);

  const shopifyAmount = friendlyEvidenceElement(
    "—",
    { total_price: "42.00" },
    {
      source: "shopify",
      entity: "order",
      db_key: "amount",
      api_key: "total_price",
      element: "order.total_price",
      element_label: "Purchase value parity",
    },
  );
  if (shopifyAmount === "order.total_price") {
    pass("Shopify amount Elements = order.total_price");
  } else {
    fail("Shopify amount Elements = order.total_price", shopifyAmount);
  }

  const managoAmount = friendlyEvidenceElement(
    "",
    { value: 42.0 },
    {
      source: "manago_ai",
      entity: "order",
      db_key: "amount",
      api_key: "value",
      element: "order.value",
      element_label: "Purchase value parity",
    },
  );
  if (managoAmount === "order.value") pass("Manago amount Elements = order.value");
  else fail("Manago amount Elements = order.value", managoAmount);

  if (shopifyAmount !== managoAmount) {
    pass("same db_key=amount maps to different platform api_keys");
  } else {
    fail("same db_key=amount maps to different platform api_keys");
  }

  const txn = friendlyEvidenceElement(
    "",
    { transactionId: "txn_9" },
    {
      source: "manago_ai",
      entity: "order",
      db_key: "external_id",
      api_key: "transactionId",
      element: "order.transactionId",
    },
  );
  if (txn === "order.transactionId") pass("Manago transaction Elements = order.transactionId");
  else fail("Manago transaction Elements = order.transactionId", txn);

  const ci13 = friendlyEvidenceElement(
    "",
    { side: "dead_state", bucket: "blocked", count: 3 },
    {
      source: "manago_ai",
      entity: "contact",
      element: "contact.state",
      element_label: "Contact state (dead/blocked/resigned) (blocked)",
    },
  );
  if (ci13 === "contact.state") pass("CI-13 Elements = contact.state");
  else fail("CI-13 Elements = contact.state", ci13);
  if (!ci13.includes("dead") && !ci13.includes("blocked") && !ci13.includes("Contact state (")) {
    pass("CI-13 Elements is not side prose");
  } else {
    fail("CI-13 Elements is not side prose", ci13);
  }

  const placeholder = friendlyEvidenceElement(
    "—",
    { email: "a@example.com" },
    { entity: "contact", api_key: "email" },
  );
  if (placeholder === "contact.email") {
    pass("placeholder locator does not block entity.api_key");
  } else {
    fail("placeholder locator does not block entity.api_key", placeholder);
  }

  const legacy = friendlyEvidenceElement(
    "—",
    { side: "dead_state", bucket: "blocked", count: 3 },
    {},
  );
  if (legacy === "Dead state") pass("bare aggregate still falls back to side", legacy);
  else fail("bare aggregate still falls back to side", legacy);

  if (friendlyEvidenceElement("", {}, { entity: "order", api_key: "value" }) !== "orders.value") {
    pass("does not pluralize map entity");
  } else {
    fail("does not pluralize map entity");
  }
}

function testStaticWiring() {
  console.log("\n2. Static wiring");

  const dcs = readSrc("src/lib/dcs.ts");
  assertIncludes(
    dcs,
    "dcs.ts",
    "never prefer element_label",
    "FE-11B comment on element helper",
  );
  assertIncludes(
    dcs,
    "dcs.ts",
    "formatEntityField(entity, apiKey)",
    "entity + api_key is first display path",
  );
  assertNotIncludes(
    dcs,
    "dcs.ts",
    "if (elementLabel) return elementLabel",
    "Elements does not return element_label first",
  );
  assertIncludes(
    dcs,
    "dcs.ts",
    "evidenceElementLabel(item, item.value) || what",
    "element_label used for What we found",
  );
  assertIncludes(
    dcs,
    "dcs.ts",
    "friendlyEvidenceElement(item.locator, item.value, item)",
    "element helper still receives enriched item",
  );

  const fe11 = readSrc("scripts/verify-fe11-frontend.mjs");
  if (!fe11.includes('fieldElement === "email (email)"')) {
    pass("verify:fe11 no longer expects api_key (db_key) display");
  } else {
    fail("verify:fe11 no longer expects api_key (db_key) display");
  }
}

function main() {
  console.log("FE-11B frontend verification");
  testAcceptanceFixtures();
  testStaticWiring();

  console.log(`\n${"=".repeat(48)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`Result: ${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All FE-11B frontend checks passed.");
}

main();
