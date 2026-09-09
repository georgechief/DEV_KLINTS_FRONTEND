/**
 * PRD-AI-01 Phase D — Fix AI suggestion box (frontend).
 * Run: npm run verify:ai01
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
  pass(`file exists: ${rel}`);
  return readFileSync(path, "utf8");
}

function assertIncludes(src, rel, needle, label) {
  if (src.includes(needle)) pass(label);
  else fail(label, `missing in ${rel}: ${needle.slice(0, 90)}`);
}

function assertNotIncludes(src, rel, needle, label) {
  if (!src.includes(needle)) pass(label);
  else fail(label, `forbidden in ${rel}: ${needle.slice(0, 90)}`);
}

console.log("PRD-AI-01 Phase D — Fix AI suggestion box\n");

const ai = readSrc("src/lib/ai.ts");
const box = readSrc("src/components/klints/FixAiSuggestionBox.tsx");
const fix = readSrc("src/routes/fix.tsx");
const css = readSrc("src/styles/fix.css");

assertIncludes(ai, "src/lib/ai.ts", "/api/v1/ai/suggestions/fix/", "client posts to Fix suggestion API");
assertIncludes(ai, "src/lib/ai.ts", "getOrCreateFixSuggestion", "get-or-create helper exported");
assertIncludes(
  ai,
  "src/lib/ai.ts",
  "AI suggestion unavailable — follow the suggested fix above.",
  "fallback copy matches PRD",
);
assertIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "What’s wrong", "renders What’s wrong");
assertIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "Why it matters", "renders Why it matters");
assertIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "Cautions", "renders Cautions");
assertIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "Saved suggestion", "cached label");
assertIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "fix-ai-skeleton", "loading skeleton");
assertNotIncludes(box, "src/components/klints/FixAiSuggestionBox.tsx", "JSON.stringify", "no raw JSON dump in box");
assertIncludes(fix, "src/routes/fix.tsx", "FixAiSuggestionBox", "box mounted on Fix route");
assertIncludes(fix, "src/routes/fix.tsx", "target.kind === \"live\" && writebackCheckId", "live issues show the box");
assertNotIncludes(
  fix,
  "src/routes/fix.tsx",
  "target.kind === \"sandbox-mapping\") &&",
  "sandbox-only mappings do not call AI",
);
const diagnose = readSrc("src/components/klints/DiagnoseEvidence.tsx");
const overview = readSrc("src/components/klints/OverviewPanel.tsx");
const explainBox = readSrc("src/components/klints/AiExplainFindingBox.tsx");
const nbaBox = readSrc("src/components/klints/NbaBlurbBox.tsx");
const dccCss = readSrc("src/styles/data-consistency.css");
const ovCss = readSrc("src/styles/overview.css");

assertIncludes(ai, "src/lib/ai.ts", "dcs_run_id", "client sends dcs_run_id when known");
assertIncludes(css, "src/styles/fix.css", ".fix-page .fix-ai", "Fix CSS includes AI box");

const aiIdx = fix.indexOf("<FixAiSuggestionBox");
const previewIdx = fix.indexOf("activePreview.title");
const nextIdx = fix.indexOf('className="fix-next-action"');
if (aiIdx > 0 && nextIdx > aiIdx) {
  pass("AI box sits after the approved hero, before next action");
} else {
  fail("AI box sits after the approved hero, before next action", `ai=${aiIdx} next=${nextIdx}`);
}
if (previewIdx > 0 && aiIdx > previewIdx) {
  pass("approved preview table is inside the hero, AI is outside it");
} else {
  fail("approved preview table is inside the hero, AI is outside it", `preview=${previewIdx} ai=${aiIdx}`);
}

console.log("\nPRD-AI-01 remaining — explain_finding + nba_blurb\n");
assertIncludes(ai, "src/lib/ai.ts", "/api/v1/ai/suggestions/explain/", "client posts to explain API");
assertIncludes(ai, "src/lib/ai.ts", "/api/v1/ai/suggestions/nba/", "client posts to NBA API");
assertIncludes(ai, "src/lib/ai.ts", "getOrCreateExplainFinding", "explain helper exported");
assertIncludes(ai, "src/lib/ai.ts", "getOrCreateNbaBlurb", "NBA helper exported");
assertIncludes(explainBox, "src/components/klints/AiExplainFindingBox.tsx", "In plain language", "explain kicker");
assertNotIncludes(explainBox, "src/components/klints/AiExplainFindingBox.tsx", "JSON.stringify", "no raw JSON in explain box");
assertIncludes(diagnose, "src/components/klints/DiagnoseEvidence.tsx", "AiExplainFindingBox", "explain box in Diagnose drawer");
assertIncludes(diagnose, "src/components/klints/DiagnoseEvidence.tsx", 'SectionLabel num="1">Problem', "CheckMaster Problem kept");
const compactStart = diagnose.indexOf("if (compact)");
const compactEnd = diagnose.indexOf("const statusLabel");
const compactSrc = compactStart >= 0 && compactEnd > compactStart
  ? diagnose.slice(compactStart, compactEnd)
  : "";
if (compactSrc && !compactSrc.includes("AiExplainFindingBox")) {
  pass("compact Diagnose mode does not call AI");
} else {
  fail("compact Diagnose mode does not call AI");
}
assertIncludes(dccCss, "src/styles/data-consistency.css", ".dcc-ai-explain", "Diagnose AI CSS");
assertIncludes(nbaBox, "src/components/klints/NbaBlurbBox.tsx", "ov-nba-blurb", "NBA blurb class");
assertIncludes(nbaBox, "src/components/klints/NbaBlurbBox.tsx", "NBA_STAGGER_MS", "NBA fetches are staggered");
assertIncludes(overview, "src/components/klints/OverviewPanel.tsx", "NbaBlurbBox", "NBA blurb on Overview cards");
assertIncludes(overview, "src/components/klints/OverviewPanel.tsx", "planRank={index + 1}", "plan_rank is display index");
assertIncludes(overview, "src/components/klints/OverviewPanel.tsx", "exec.whyMatters", "deterministic whyMatters kept");
assertIncludes(ovCss, "src/styles/overview.css", ".ov-nba-blurb", "Overview NBA blurb CSS");

const problemIdx = diagnose.indexOf('SectionLabel num="1">Problem');
const explainIdx = diagnose.indexOf("<AiExplainFindingBox");
if (problemIdx > 0 && explainIdx > problemIdx) {
  pass("explain box is after CheckMaster Problem");
} else {
  fail("explain box is after CheckMaster Problem", `problem=${problemIdx} explain=${explainIdx}`);
}

const nbaIdx = overview.indexOf("<NbaBlurbBox");
const actionIdx = overview.indexOf('<div className="ov-nba-action">', nbaIdx > 0 ? nbaIdx - 80 : 0);
if (nbaIdx > 0 && actionIdx > nbaIdx) {
  pass("NBA blurb is between card body and action");
} else {
  fail("NBA blurb is between card body and action", `nba=${nbaIdx} action=${actionIdx}`);
}

console.log("");
if (failed) {
  console.log(`Failed: ${failed}`);
  process.exit(1);
}
console.log("All AI-01 frontend checks passed.");
