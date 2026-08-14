/**
 * Orchestration plan client (PRD-ORCH-01 / BL-011).
 * GET /api/v1/orchestration/plan/ — ranked FIX tasks.
 */

import { apiRequest } from "@/lib/api";
import type { DcsIssue } from "@/lib/dcs";

export const ORCH_PLAN_QUERY_KEY = ["orchestration", "plan"] as const;
export const ORCH_STALE_MS = 8_000;

export type OrchTaskType = "FIX" | "ASSESS" | "PLAN" | string;
export type OrchTaskStatus =
  | "READY"
  | "PENDING"
  | "BLOCKED"
  | "IN_PROGRESS"
  | "DONE"
  | string;
export type OrchPriorityClass = "P0" | "P1" | "P2" | string;

export type OrchPriorityInputs = {
  blocker_status: number;
  severity_risk: number;
  dependency_readiness: number;
  effort_impact: number;
};

export type OrchPriorityExplainRow = {
  factor: string;
  value: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type OrchPlanTask = {
  task_id: string;
  task_type: OrchTaskType;
  status: OrchTaskStatus;
  title: string;
  check_id: string | null;
  priority_class: OrchPriorityClass;
  priority_inputs: OrchPriorityInputs;
  priority_score: number;
  priority_explain: OrchPriorityExplainRow[];
  depends_on: string[];
  wave: number | null;
  href: string;
  revenue_impact: number;
  currency: string | null;
  idempotency_key?: string;
};

export type OrchPlanResponse = {
  as_of: string;
  reason: "no_dcs" | "no_open_issues" | string | null;
  sources: {
    dcs_data_run_id: number | null;
    af_assessment_id: string | null;
    uc_as_of: string | null;
  };
  summary: {
    task_count: number;
    fix_count: number;
    max_priority_score: number | null;
  };
  tasks: OrchPlanTask[];
};

export function getOrchestrationPlan(): Promise<OrchPlanResponse> {
  return apiRequest(
    "/api/v1/orchestration/plan/",
  ) as Promise<OrchPlanResponse>;
}

function normalizeCheckId(checkId: string | null | undefined): string {
  return (checkId ?? "").trim();
}

function checkIdKey(checkId: string | null | undefined): string {
  return normalizeCheckId(checkId).toUpperCase();
}

/** FIX tasks already ranked by the plan API. */
export function fixTasksFromPlan(
  plan: OrchPlanResponse | null | undefined,
): OrchPlanTask[] {
  if (!plan?.tasks?.length) return [];
  return plan.tasks.filter(
    (task) =>
      task.task_type === "FIX" &&
      typeof task.check_id === "string" &&
      task.check_id.trim().length > 0,
  );
}

/** check_id (uppercased) → rank index (0 = highest priority). */
export function planCheckIdOrder(
  plan: OrchPlanResponse | null | undefined,
): Map<string, number> {
  const order = new Map<string, number>();
  for (const [index, task] of fixTasksFromPlan(plan).entries()) {
    const key = checkIdKey(task.check_id);
    if (key && !order.has(key)) order.set(key, index);
  }
  return order;
}

/**
 * Minimal DcsIssue from a plan FIX task when worklist/status pool lacks the row
 * (e.g. status cap-30). Enough for Overview NBA cards + Fix deep-link.
 */
export function dcsIssueFromPlanTask(task: OrchPlanTask): DcsIssue {
  const checkId = normalizeCheckId(task.check_id);
  const revenue =
    typeof task.revenue_impact === "number" && Number.isFinite(task.revenue_impact)
      ? task.revenue_impact
      : 0;
  return {
    check_id: checkId || null,
    run_issue_id: null,
    title: task.title || checkId || "Fix task",
    status: "FAIL",
    severity: "high",
    dimension: null,
    detail: "",
    suggested_fix: "",
    root_cause_ids: [],
    is_optional: false,
    revenue_impact: revenue,
    currency: task.currency ?? null,
    evidence_preview: [],
  };
}

/**
 * Overview NBA: follow plan FIX order, join live worklist/status rows when present.
 * Missing pool rows are synthesized from the plan so top tasks are not dropped by cap-30.
 */
export function joinPlanFixIssues(
  plan: OrchPlanResponse | null | undefined,
  pool: Array<{ check_id?: string | null } & Partial<DcsIssue>>,
): DcsIssue[] {
  const byId = new Map<string, DcsIssue>();
  for (const issue of pool) {
    const key = checkIdKey(issue.check_id);
    if (!key || byId.has(key)) continue;
    byId.set(key, issue as DcsIssue);
  }

  const joined: DcsIssue[] = [];
  for (const task of fixTasksFromPlan(plan)) {
    const key = checkIdKey(task.check_id);
    if (!key) continue;
    const fromPool = byId.get(key);
    if (fromPool) {
      const title = (fromPool.title || "").trim() || task.title;
      joined.push(title === fromPool.title ? fromPool : { ...fromPool, title });
    } else {
      joined.push(dcsIssueFromPlanTask(task));
    }
  }
  return joined;
}

/**
 * Reorder worklist issues to match plan FIX order.
 * Issues not in the plan append after, preserving relative order
 * (caller should pass Impact-sorted list if that fallback is desired).
 */
export function sortIssuesByPlanOrder<T extends { check_id?: string | null }>(
  issues: T[],
  plan: OrchPlanResponse | null | undefined,
): T[] {
  const order = planCheckIdOrder(plan);
  if (order.size === 0) return [...issues];

  return [...issues].sort((a, b) => {
    const aKey = checkIdKey(a.check_id);
    const bKey = checkIdKey(b.check_id);
    const aRank = aKey ? order.get(aKey) : undefined;
    const bRank = bKey ? order.get(bKey) : undefined;
    const aIn = aRank !== undefined;
    const bIn = bRank !== undefined;
    if (aIn && bIn) return aRank - bRank;
    if (aIn) return -1;
    if (bIn) return 1;
    return 0;
  });
}

export function formatPriorityScore(
  score: number | null | undefined,
  digits = 1,
): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return score.toFixed(digits);
}

export function emptyPlanReasonLabel(
  reason: OrchPlanResponse["reason"],
): string {
  if (reason === "no_dcs") return "No Data Consistency Score yet";
  if (reason === "no_open_issues") return "No open fix tasks in the plan";
  if (typeof reason === "string" && reason.trim()) return reason;
  return "No open fix tasks in the plan";
}
