/**
 * Persisted OrchestrationTask SM client (PRD-GAP-01 Slice A1 Phase 5).
 * GET/POST /api/v1/orchestration/tasks/ — separate from plan-only orchestration.ts.
 */

import { apiRequest } from "@/lib/api";
import type { OrchPriorityInputs } from "@/lib/orchestration";

export const ORCH_TASKS_QUERY_KEY = ["orchestration", "tasks"] as const;
export const ORCH_TASKS_STALE_MS = 8_000;

/** Pack status enum (8) — persisted OrchestrationTask SM. */
export type OrchTaskStatus =
  | "PENDING"
  | "BLOCKED"
  | "READY"
  | "IN_PROGRESS"
  | "AWAITING_APPROVAL"
  | "DONE"
  | "FAILED"
  | "CANCELLED";

export const ORCH_TASK_STATUSES: readonly OrchTaskStatus[] = [
  "PENDING",
  "BLOCKED",
  "READY",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "DONE",
  "FAILED",
  "CANCELLED",
] as const;

/** Pack task_type enum (11) — FE v1 lists all; UI surfaces FIX-first only. */
export type OrchTaskType =
  | "CONNECT"
  | "DISCOVER"
  | "SCORE"
  | "FIX"
  | "ASSESS"
  | "PLAN"
  | "REPORT"
  | "EXPORT"
  | "BUILD"
  | "QA"
  | "HANDOFF";

export type OrchestrationTaskRecord = {
  schema_version: string;
  id: string;
  task_id: string;
  tenant_id: string;
  task_type: OrchTaskType | string;
  status: OrchTaskStatus | string;
  title: string;
  check_id: string | null;
  priority_class: string;
  priority_inputs: OrchPriorityInputs;
  priority_score: number;
  depends_on: string[];
  wave: number;
  capability_dependencies: string[];
  approval: Record<string, unknown>;
  idempotency_key: string;
  provenance: Record<string, unknown>;
  source_refs: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  /** Present on POST create/transition responses. */
  idempotent?: boolean;
};

export type OrchestrationTaskListResponse = {
  count: number;
  results: OrchestrationTaskRecord[];
};

export type ListOrchestrationTasksParams = {
  status?: OrchTaskStatus | string;
  task_type?: OrchTaskType | string;
  check_id?: string;
};

export type CreateOrchestrationTaskInput = {
  task_id: string;
  task_type: OrchTaskType | string;
  idempotency_key: string;
  priority_inputs: OrchPriorityInputs;
  status?: OrchTaskStatus | string;
  title?: string;
  check_id?: string | null;
  priority_score?: number;
  priority_class?: string;
  depends_on?: string[];
  wave?: number;
  capability_dependencies?: string[];
  approval?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  source_refs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type TransitionOrchestrationTaskInput = {
  to_status: OrchTaskStatus | string;
  reason?: string | null;
};

function requireNonEmpty(value: string, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

export function orchTaskDetailQueryKey(taskId: string) {
  return [...ORCH_TASKS_QUERY_KEY, "detail", taskId.trim()] as const;
}

function buildListQuery(params?: ListOrchestrationTasksParams): string {
  const search = new URLSearchParams();
  if (params?.status?.trim()) search.set("status", params.status.trim());
  if (params?.task_type?.trim()) search.set("task_type", params.task_type.trim());
  if (params?.check_id?.trim()) search.set("check_id", params.check_id.trim());
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** GET /api/v1/orchestration/tasks/ */
export function listOrchestrationTasks(
  params?: ListOrchestrationTasksParams,
): Promise<OrchestrationTaskListResponse> {
  const qs = buildListQuery(params).replace(/^\?/, "");
  const path = qs
    ? `/api/v1/orchestration/tasks/?${qs}`
    : "/api/v1/orchestration/tasks/";
  return apiRequest(path) as Promise<OrchestrationTaskListResponse>;
}

/** GET /api/v1/orchestration/tasks/{id}/ — UUID primary key. */
export function getOrchestrationTask(
  recordId: string,
): Promise<OrchestrationTaskRecord> {
  const id = requireNonEmpty(recordId, "recordId");
  return apiRequest(
    `/api/v1/orchestration/tasks/${encodeURIComponent(id)}/`,
  ) as Promise<OrchestrationTaskRecord>;
}

/** POST /api/v1/orchestration/tasks/ */
export function createOrchestrationTask(
  input: CreateOrchestrationTaskInput,
): Promise<OrchestrationTaskRecord> {
  return apiRequest("/api/v1/orchestration/tasks/", {
    method: "POST",
    body: JSON.stringify(input),
  }) as Promise<OrchestrationTaskRecord>;
}

/** POST /api/v1/orchestration/tasks/{id}/transition/ */
export function transitionOrchestrationTask(
  recordId: string,
  input: TransitionOrchestrationTaskInput,
): Promise<OrchestrationTaskRecord> {
  const id = requireNonEmpty(recordId, "recordId");
  const toStatus = requireNonEmpty(String(input.to_status ?? ""), "to_status");
  const body: TransitionOrchestrationTaskInput = { to_status: toStatus };
  if (input.reason?.trim()) body.reason = input.reason.trim();
  return apiRequest(
    `/api/v1/orchestration/tasks/${encodeURIComponent(id)}/transition/`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  ) as Promise<OrchestrationTaskRecord>;
}

export function normalizeOrchTaskStatus(
  status: string | null | undefined,
): OrchTaskStatus | string {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

export function orchTaskStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeOrchTaskStatus(status);
  if (normalized === "AWAITING_APPROVAL") return "Awaiting approval";
  if (normalized === "IN_PROGRESS") return "In progress";
  if (normalized === "CANCELLED") return "Cancelled";
  if (!normalized) return "Unknown";
  return normalized.charAt(0) + normalized.slice(1).toLowerCase().replaceAll("_", " ");
}

export type OrchTaskStatusTone =
  | "muted"
  | "ready"
  | "progress"
  | "approval"
  | "done"
  | "blocked"
  | "failed";

export function orchTaskStatusTone(
  status: string | null | undefined,
): OrchTaskStatusTone {
  switch (normalizeOrchTaskStatus(status)) {
    case "DONE":
      return "done";
    case "READY":
      return "ready";
    case "IN_PROGRESS":
      return "progress";
    case "AWAITING_APPROVAL":
      return "approval";
    case "BLOCKED":
      return "blocked";
    case "FAILED":
      return "failed";
    case "CANCELLED":
    case "PENDING":
    default:
      return "muted";
  }
}

export function canMutateOrchestrationTasks(role: string | null | undefined): boolean {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "analyst";
}

/** Admin-only edge: AWAITING_APPROVAL → DONE (PRD-GAP-01 §7). */
export function canApproveOrchestrationTask(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toLowerCase() === "admin";
}

export function orchTaskDisplayTitle(task: OrchestrationTaskRecord): string {
  const title = task.title?.trim();
  if (title) return title;
  const checkId = task.check_id?.trim();
  if (checkId) return checkId;
  return task.task_id?.trim() || "Orchestration task";
}

/** Maps SM tone → Overview `ov-chip-readiness` modifier class. */
export function orchTaskStatusChipClass(
  status: string | null | undefined,
): string {
  switch (orchTaskStatusTone(status)) {
    case "done":
      return "ready";
    case "ready":
    case "progress":
    case "approval":
      return "waiting";
    case "blocked":
    case "failed":
      return "blocked";
    default:
      return "";
  }
}
