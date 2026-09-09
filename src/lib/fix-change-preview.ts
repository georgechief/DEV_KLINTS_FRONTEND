/**
 * GAP-01 Slice C / W5-05–06 — Change Preview drawer helpers (Fix writeback tab).
 * Pure functions for before/after rows, DCS impact line, workflows-unblocked estimate.
 */

import { formatDcsRevenue } from "@/lib/dcs";
import {
  isBuildableStatus,
  pilotStatusLabel,
  pilotsGatedByCheck,
  type UseCasePilotRecommendation,
} from "@/lib/use-cases";
import type {
  WritebackIntent,
  WritebackPreviewResult,
  WritebackTablePhase,
} from "@/lib/writebacks";

export type WritebackChangePreviewField = {
  key: string;
  before: string;
  after: string;
  changed: boolean;
};

export type WritebackChangePreviewIntentRow = {
  index: number;
  target: string;
  operation: string;
  entity_key: string;
  status: string;
  fields: WritebackChangePreviewField[];
};

export type WritebackWorkflowImpactPilot = {
  uc: string;
  title: string;
  status: string;
  buildable: boolean;
};

export type WritebackWorkflowImpact = {
  title: string;
  detail: string;
  loading: boolean;
  pilots: WritebackWorkflowImpactPilot[];
};

function friendlyWritebackTarget(target: string): string {
  if (target === "manago") return "Manago.ai";
  if (target === "shopify") return "Shopify";
  return target;
}

function formatChangePreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function intentPreviewStatus(
  intent: WritebackIntent,
  phase: WritebackTablePhase = "preview",
): string {
  if (phase === "executed" && (intent.status === "ready" || intent.status === "executed")) {
    return "Executed";
  }
  if (intent.status === "ready") return "Ready";
  if (intent.status === "error" && intent.error_reason) {
    return `Error · ${intent.error_reason}`;
  }
  if (intent.status === "skipped") {
    if (intent.error_reason === "already_at_target") return "Already applied";
    return intent.error_reason ? `Skipped · ${intent.error_reason}` : "Skipped";
  }
  if (intent.status === "executed") return "Executed";
  return intent.status;
}

/** Expand dry-run intents into drawer-friendly before/after field rows. */
export function writebackChangePreviewIntents(
  result: WritebackPreviewResult | null | undefined,
  phase: WritebackTablePhase = "preview",
): WritebackChangePreviewIntentRow[] {
  if (!result?.intents?.length) return [];

  return result.intents.map((intent, index) => {
    const before =
      intent.before && typeof intent.before === "object" ? intent.before : {};
    const after =
      intent.after && typeof intent.after === "object" ? intent.after : {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const fields = [...keys].sort().map((key) => {
      const beforeText = formatChangePreviewValue(before[key]);
      const afterText = formatChangePreviewValue(after[key]);
      return {
        key,
        before: beforeText,
        after: afterText,
        changed: beforeText !== afterText,
      };
    });

    return {
      index: index + 1,
      target: friendlyWritebackTarget(intent.target),
      operation: intent.operation || intent.op_kind,
      entity_key: intent.entity_key || "—",
      status: intentPreviewStatus(intent, phase),
      fields: fields.length
        ? fields
        : [{ key: "—", before: "—", after: "—", changed: false }],
    };
  });
}

/** W5-05 — compact impact summary for drawer header. */
export function writebackChangePreviewSummary(
  result: WritebackPreviewResult | null | undefined,
  dataRunId?: number | null,
  phase: WritebackTablePhase = "preview",
): string | null {
  if (!result) return null;
  const { ready, skipped, errors, executed } = result.summary;
  const parts =
    phase === "executed"
      ? [`${executed} executed`, `${skipped} skipped`]
      : [`${ready} ready`, `${skipped} skipped`];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  const runId = dataRunId ?? result.data_run_id;
  if (runId != null) parts.push(`run #${runId}`);
  if (result.diff_hash?.trim()) {
    parts.push(`diff ${result.diff_hash.trim().slice(0, 8)}…`);
  }
  return parts.join(" · ");
}

/** W5-05 — DCS revenue-at-stake line when issue carries monetary impact. */
export function writebackDcsImpactLine(input: {
  revenueImpact?: number | null;
  currency?: string | null;
  previewReady: boolean;
}): string | null {
  if (!input.previewReady) return null;
  const amount = input.revenueImpact ?? 0;
  if (!(amount > 0)) return null;
  const formatted = formatDcsRevenue(amount, input.currency);
  if (formatted === "—") return null;
  return `Projected DCS impact · ${formatted} at stake on this check (estimate — re-score after write).`;
}

/** W5-06 — workflows unblocked estimate from MVP1 pilot gates. */
export function writebackWorkflowsUnblockedEstimate(input: {
  checkId: string | undefined;
  pilots: UseCasePilotRecommendation[] | undefined;
  previewReady: boolean;
  written: boolean;
  recommendationsPending?: boolean;
  recommendationsError?: boolean;
}): WritebackWorkflowImpact | null {
  if (!input.checkId?.trim()) return null;

  if (input.recommendationsPending) {
    return {
      title: "Workflows unblocked (estimate)",
      detail: "Loading workflow eligibility…",
      loading: true,
      pilots: [],
    };
  }

  if (input.recommendationsError) {
    return {
      title: "Workflows unblocked (estimate)",
      detail:
        "Workflow recommendations unavailable — re-open Fix after recommendations load to see unlock estimate.",
      loading: false,
      pilots: [],
    };
  }

  const gated = pilotsGatedByCheck(input.pilots, input.checkId);
  if (!gated.length) {
    return {
      title: "Workflows unblocked (estimate)",
      detail: "No MVP1 workflow pilots gate on this check.",
      loading: false,
      pilots: [],
    };
  }

  const buildable = gated.filter((pilot) => isBuildableStatus(pilot.status));
  let detail: string;
  if (input.written) {
    detail =
      buildable.length > 0
        ? `Write applied · up to ${buildable.length} workflow brief${
            buildable.length === 1 ? "" : "s"
          } may proceed to Studio when remaining gates clear.`
        : `Write applied · ${gated.length} pilot${
            gated.length === 1 ? "" : "s"
          } still blocked on other gates — re-run DCS to refresh.`;
  } else if (input.previewReady) {
    detail =
      buildable.length > 0
        ? `After Approve & write, up to ${buildable.length} workflow brief${
            buildable.length === 1 ? "" : "s"
          } can unlock (estimate — re-score may be required).`
        : `This fix gates ${gated.length} workflow pilot${
            gated.length === 1 ? "" : "s"
          } — other checks still block Studio today.`;
  } else {
    detail = "Run writeback preview to estimate which workflow briefs may unlock.";
  }

  return {
    title: "Workflows unblocked (estimate)",
    detail,
    loading: false,
    pilots: gated.map((pilot) => ({
      uc: pilot.use_case_id,
      title: pilot.title,
      status: pilotStatusLabel(pilot.status),
      buildable: isBuildableStatus(pilot.status),
    })),
  };
}
