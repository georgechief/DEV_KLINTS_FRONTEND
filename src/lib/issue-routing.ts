/**
 * GAP-01E W8-02 — issue taxonomy (Data / Workflow / Security).
 * Pure classifiers — no route graph imports (avoids cycles with use-cases).
 */

export type IssueRouteTaxonomy = "data" | "workflow" | "security";

export type IssueRouteSignals = {
  checkId?: string | null;
  dimension?: string | null;
  fixOwner?: string | null;
  title?: string | null;
  detail?: string | null;
  suggestedFix?: string | null;
  systemsCompared?: string | null;
  isOptional?: boolean | null;
  status?: string | null;
};

/**
 * Auth / connector failure signals only (E0.6).
 * Intentionally tight — avoid false positives on "authorization", "unauthorized",
 * "needs attention", bare "auth", "credential mapping", or marketing "reconnect".
 */
const SECURITY_TEXT_RE =
  /\b(oauth|api[_\s-]?key|refresh[_\s-]?token|token[_\s-]?expired|(?:access[_\s-]?)?token\s+(?:invalid|expired|revoked)|(?:invalid|expired|revoked)\s+(?:access[_\s-]?)?token|authentication\s+failed|auth(?:entication)?\s+fail(?:ed|ure)?|connector\s+(?:error|disconnected|failure)|shopify\s+(?:auth|reconnect)|reconnect\s+(?:required|oauth|shopify|with|to\s+restore)|(?:must|please)\s+reconnect|(?:invalid|expired|bad)\s+credential(?:s)?|oauth\s+credential(?:s)?|credential(?:s)?\s+(?:expired|invalid|required))\b/i;

/** Dimension names that mean connector/security — not Channel & Consent "auth". */
const SECURITY_DIMENSION_RE = /\b(security|access\s*control)\b/i;

export function classifyIssueRouteKind(
  signals: IssueRouteSignals,
): IssueRouteTaxonomy {
  const blob = [
    signals.checkId,
    signals.dimension,
    signals.fixOwner,
    signals.title,
    signals.detail,
    signals.suggestedFix,
    signals.systemsCompared,
  ]
    .map((part) => (typeof part === "string" ? part : ""))
    .join(" ");

  if (SECURITY_DIMENSION_RE.test(signals.dimension ?? "")) {
    return "security";
  }
  if (SECURITY_TEXT_RE.test(blob)) {
    return "security";
  }

  return "data";
}

/** Map a live DcsIssue-like object into route signals. */
export function issueRouteSignalsFromDcs(issue: {
  check_id?: string | null;
  dimension?: string | null;
  fix_owner?: string | null;
  title?: string | null;
  detail?: string | null;
  suggested_fix?: string | null;
  systems_compared?: string | null;
  is_optional?: boolean | null;
  status?: string | null;
}): IssueRouteSignals {
  return {
    checkId: issue.check_id,
    dimension: issue.dimension,
    fixOwner: issue.fix_owner,
    title: issue.title,
    detail: issue.detail,
    suggestedFix: issue.suggested_fix,
    systemsCompared: issue.systems_compared,
    isOptional: issue.is_optional,
    status: issue.status,
  };
}
