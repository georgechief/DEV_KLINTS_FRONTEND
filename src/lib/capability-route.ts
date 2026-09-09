/**
 * CAP-01 package route honesty (Studio + QA).
 * Copy locks from PRD-CAP-01 §7 — never imply MCP Send.
 */

export const CAP_ID_MCP_WORKFLOW_UPSERT = "MCP.WORKFLOW.UPSERT";

export type CapabilityResolutionRow = {
  capability_id: string;
  required_status?: string | null;
  resolved_status: string;
  fallback_used?: string | null;
  matrix_status?: string | null;
  channel?: string | null;
};

export function packageRouteSummary(route: string | undefined | null): {
  code: string;
  label: string;
} {
  const code = String(route ?? "").trim() || "—";
  const upper = code.toUpperCase();
  if (upper === "HUMAN_FALLBACK") {
    return {
      code: "HUMAN_FALLBACK",
      label: "Human build guide — MCP upsert not confirmed",
    };
  }
  if (upper === "MCP") {
    return {
      code: "MCP",
      label: "MCP upsert confirmed — Send still not live (HO-02)",
    };
  }
  if (code === "—") {
    return {
      code: "—",
      // Shown only when a package exists but route is missing — not a pre-generate hint.
      label: "Route not set on this package",
    };
  }
  return { code, label: `Capability route · ${code}` };
}

/**
 * Short resolution line from live package capability_resolution[]
 * e.g. "MCP.WORKFLOW.UPSERT → HUMAN.WORKFLOW.BUILD"
 */
export function packageResolutionLine(
  rows: CapabilityResolutionRow[] | null | undefined,
): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const upsert = rows.find(
    (r) =>
      String(r.capability_id || "")
        .trim()
        .toUpperCase() === CAP_ID_MCP_WORKFLOW_UPSERT,
  );
  if (!upsert) return null;
  const fallback = String(upsert.fallback_used || "").trim();
  if (fallback) {
    return `${CAP_ID_MCP_WORKFLOW_UPSERT} → ${fallback}`;
  }
  const resolved = String(upsert.resolved_status || "").trim();
  if (!resolved) return null;
  if (resolved.toUpperCase() === "MCP") {
    return `${CAP_ID_MCP_WORKFLOW_UPSERT} → MCP (confirmed)`;
  }
  return `${CAP_ID_MCP_WORKFLOW_UPSERT} → ${resolved}`;
}
