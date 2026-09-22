import { fixPlans, issues, type FixPlan, type GovernanceIssue } from "@/lib/klints-data";
import { formatCustomerIssueTitle, type DcsIssue } from "@/lib/dcs";
import { buildLiveFixPlan, buildSandboxWritebackFixPlan } from "@/lib/fix-live-plan";
import { resolveCheckIdFromSearch } from "@/lib/dcs";
import {
  isWritebackMappingEnabled,
  findWritebackMapping,
  type WritebackMappingEntry,
} from "@/lib/writebacks";

/** Shared search shape for fix-flow pages — all keys optional */
export type FixFlowSearch = {
  issue?: string;
  check?: string;
};

export function parseFixFlowSearch(search: Record<string, unknown>): FixFlowSearch {
  const check =
    typeof search.check === "string" && search.check.length > 0 ? search.check : undefined;
  const issue =
    typeof search.issue === "string" && search.issue.length > 0 ? search.issue : undefined;
  return { check, issue };
}

export function getIssueById(id: string | undefined | null): GovernanceIssue | undefined {
  if (!id) return undefined;
  return issues.find((i) => i.id === id);
}

/** Preserve issue when navigating between fix-flow stages */
export function withIssueSearch(issueId: string | undefined | null): FixFlowSearch {
  return issueId ? { issue: issueId } : {};
}

/**
 * Search params for sidebar links across Diagnose → Handoff.
 * Stepper already preserves context; bare sidebar `to="/fix"` must not drop `?issue=`.
 */
export function sidebarFixFlowSearch(
  to: string,
  ctx: {
    issue?: string | null;
    uc?: string | null;
    package_id?: string | null;
    qa_run_id?: string | null;
  },
): Record<string, string> | undefined {
  const issue = ctx.issue?.trim() || undefined;
  const uc = ctx.uc?.trim() || undefined;
  const packageId = ctx.package_id?.trim() || undefined;
  const qaRunId = ctx.qa_run_id?.trim() || undefined;

  if (to === "/fix" || to === "/data-consistency") {
    return issue ? { issue } : undefined;
  }

  if (to === "/workflow" || to === "/qa" || to === "/handoff") {
    const search: Record<string, string> = {};
    if (issue) search.issue = issue;
    if (uc) search.uc = uc;
    if (packageId) search.package_id = packageId;
    if (to === "/handoff" && qaRunId) search.qa_run_id = qaRunId;
    return Object.keys(search).length > 0 ? search : undefined;
  }

  return undefined;
}

export function getCheckIdFromSearch(search: FixFlowSearch): string | undefined {
  return resolveCheckIdFromSearch(search.check, search.issue);
}

export function isFixtureIssueId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^iss-/i.test(id.trim());
}

/** Demo fixtures (iss-*) are blocked in production builds (PRD-FE-13 §8.2). */
export function fixturesAllowedInBuild(): boolean {
  return !import.meta.env.PROD;
}

export function findWorklistIssueByCheckId(
  worklistIssues: DcsIssue[],
  checkId: string,
): DcsIssue | undefined {
  const normalized = checkId.trim().toUpperCase();
  return worklistIssues.find(
    (issue) => (issue.check_id ?? "").trim().toUpperCase() === normalized,
  );
}

export function needsFixFlowWorklist(search: FixFlowSearch): boolean {
  const fixtureId =
    search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;
  const hasFixture = Boolean(fixtureId && getIssueById(fixtureId));
  return Boolean(getCheckIdFromSearch(search) && !hasFixture);
}

/** Issue/check id preserved in fix-flow URLs — fixture id or live check_id. */
export function getFixFlowIssueIdFromSearch(search: FixFlowSearch): string | undefined {
  if (search.issue?.trim()) return search.issue.trim();
  return getCheckIdFromSearch(search);
}

/** Resolve stepper title from fixture data or live worklist (when loaded). */
export function resolveFixFlowIssueTitle(
  search: FixFlowSearch,
  worklistIssues: DcsIssue[] | undefined,
): string | null {
  const fixtureId =
    search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;
  if (fixtureId) {
    const issue = getIssueById(fixtureId);
    if (issue) return issue.title;
  }

  const checkId = getCheckIdFromSearch(search);
  if (!checkId || !worklistIssues) return null;

  const liveIssue = findWorklistIssueByCheckId(worklistIssues, checkId);
  if (!liveIssue?.title?.trim()) return null;

  return formatCustomerIssueTitle(liveIssue.title);
}

export type FixTarget =
  | { kind: "fixture"; issueId: string; issue: GovernanceIssue; plan: FixPlan }
  | { kind: "live"; checkId: string; issue: DcsIssue; plan: FixPlan }
  | {
      kind: "sandbox-mapping";
      checkId: string;
      mapping: WritebackMappingEntry;
      plan: FixPlan;
    }
  | { kind: "loading"; checkId: string }
  | { kind: "missing"; checkId?: string }
  | { kind: "empty" };

export function fixTargetCheckId(target: FixTarget): string | undefined {
  if (target.kind === "fixture") return undefined;
  if (target.kind === "empty") return undefined;
  if (target.kind === "missing") return target.checkId;
  if (target.kind === "loading") return target.checkId;
  if (target.kind === "live") return target.checkId;
  if (target.kind === "sandbox-mapping") return target.checkId;
  return undefined;
}

export function isFixTargetWritebackCapable(target: FixTarget): boolean {
  return target.kind === "live" || target.kind === "sandbox-mapping";
}

/**
 * Resolve Fix page target from URL search + optional worklist payload.
 * Worklist may be undefined while loading — returns `loading` when a check_id needs it.
 */
export function resolveFixTarget(
  search: FixFlowSearch,
  worklistIssues: DcsIssue[] | undefined,
  writebackMappings?: WritebackMappingEntry[],
): FixTarget {
  const fixtureId =
    search.issue && isFixtureIssueId(search.issue) ? search.issue.trim() : undefined;

  if (fixtureId && fixturesAllowedInBuild()) {
    const issue = getIssueById(fixtureId);
    const plan = fixPlans[fixtureId];
    if (issue && plan) {
      return { kind: "fixture", issueId: fixtureId, issue, plan };
    }
  }

  const checkId = getCheckIdFromSearch(search);
  if (!checkId) {
    if (fixtureId) return { kind: "missing", checkId: fixtureId };
    return { kind: "empty" };
  }

  if (!worklistIssues) {
    return { kind: "loading", checkId };
  }

  const liveIssue = findWorklistIssueByCheckId(worklistIssues, checkId);
  if (liveIssue) {
    return {
      kind: "live",
      checkId,
      issue: liveIssue,
      plan: buildLiveFixPlan(liveIssue),
    };
  }

  const mapping = findWritebackMapping(writebackMappings, checkId);
  if (mapping && isWritebackMappingEnabled(writebackMappings, checkId)) {
    return {
      kind: "sandbox-mapping",
      checkId,
      mapping,
      plan: buildSandboxWritebackFixPlan(mapping),
    };
  }

  if (writebackMappings === undefined) {
    return { kind: "loading", checkId };
  }

  return { kind: "missing", checkId };
}
