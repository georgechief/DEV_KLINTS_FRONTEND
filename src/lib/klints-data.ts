// Mock data — Lumera Skin · Klints governance demo

export type FixPhase = "Diagnose" | "Fix" | "Build" | "QA" | "Handoff";
export type IssueStatus = "Blocked" | "Leaking" | "Opportunity" | "Tracked" | "Cleared";
export type ImpactType = "revenue" | "margin" | "opportunity" | "risk";
export type ConnectorName = "Manago.ai" | "Shopify";

export type GovernanceIssue = {
  id: string;
  title: string;
  summary: string;
  connectors: ConnectorName[];
  impact: number;
  impactType: ImpactType;
  cadence: "/q" | "/y";
  phase: FixPhase;
  status: IssueStatus;
  owner: string;
  confidence: number;
  dimension: string;
  suggestedAction: string;
  workflowId: string;
  createdAt: string;
  /** Hours since the issue was detected — used by date filters */
  ageHours: number;
};

/** @deprecated Use GovernanceIssue — kept as alias for gradual migration */
export type Opportunity = GovernanceIssue & { revenue: number; source: string; stage: string; expected: number; actual: number };
export type Stage = FixPhase;
export type ItemStatus = IssueStatus;

export const workflows = [
  {
    id: "wf-campaign-align",
    name: "Campaign Promise Alignment · v1",
    source: "Manago.ai · Shopify",
    revenue: 54000,
    active: 0,
    status: "Draft",
    description: "Align Shopify discount, Manago pop-up, and landing offer so lifecycle entry can start.",
  },
  {
    id: "wf-identity-unify",
    name: "Identity Cluster Unification · v1",
    source: "Manago.ai · Shopify",
    revenue: 38000,
    active: 0,
    status: "Draft",
    description: "Merge high-confidence guest/registered pairs with human approval.",
  },
  {
    id: "wf-margin-rerank",
    name: "Margin-Aware Recommendations · v2.1",
    source: "Manago.ai · Shopify",
    revenue: 12000,
    active: 3,
    status: "Running",
    description: "Re-rank Manago relevance set using Shopify cost/margin floor ≥ 38%.",
  },
  {
    id: "wf-second-purchase",
    name: "Second Purchase Accelerator · v1",
    source: "Manago.ai",
    revenue: 46000,
    active: 0,
    status: "Ready",
    description: "Lifecycle for 1,247 repeat buyers with no active workflow — data ready.",
  },
] as const;

export const issues: GovernanceIssue[] = [
  {
    id: "iss-campaign",
    title: "Campaign promise mismatch",
    summary: "Shopify 30% discount vs Manago.ai pop-up 10% vs landing — lifecycle never enters",
    connectors: ["Shopify", "Manago.ai"],
    impact: 54000,
    impactType: "revenue",
    cadence: "/q",
    phase: "Diagnose",
    status: "Blocked",
    owner: "anton.k",
    confidence: 96,
    dimension: "Channel & Consent",
    suggestedAction: "Align anonymous-visitor offer for campaign UTM traffic, then open Fix.",
    workflowId: "wf-campaign-align",
    createdAt: "2h ago",
    ageHours: 2,
  },
  {
    id: "iss-untapped",
    title: "Untapped segment · second purchase",
    summary: "1,247 repeat buyers have no active lifecycle workflow — data ready",
    connectors: ["Manago.ai"],
    impact: 46000,
    impactType: "opportunity",
    cadence: "/q",
    phase: "Build",
    status: "Opportunity",
    owner: "tomas.l",
    confidence: 97,
    dimension: "Customer segments & fields",
    suggestedAction: "Build Second Purchase Accelerator — no data fix required.",
    workflowId: "wf-second-purchase",
    createdAt: "5h ago",
    ageHours: 5,
  },
  {
    id: "iss-identity",
    title: "Identity fragmentation",
    summary: "1,284 guest/registered pairs are one person each — VIPs hidden by split LTV",
    connectors: ["Manago.ai", "Shopify"],
    impact: 38000,
    impactType: "revenue",
    cadence: "/q",
    phase: "Diagnose",
    status: "Blocked",
    owner: "mara.e",
    confidence: 93,
    dimension: "Customer Identity",
    suggestedAction: "Review cluster merges ≥ 0.90 confidence with CRM Manager approval.",
    workflowId: "wf-identity-unify",
    createdAt: "1d ago",
    ageHours: 24,
  },
  {
    id: "iss-margin",
    title: "Recommendations optimise revenue, not profit",
    summary: "Shopify cost fields not in CDP relevance — recommendation set leaks profit",
    connectors: ["Manago.ai", "Shopify"],
    impact: 12000,
    impactType: "margin",
    cadence: "/q",
    phase: "Fix",
    status: "Leaking",
    owner: "tomas.l",
    confidence: 95,
    dimension: "Business Reality",
    suggestedAction: "Sync Shopify cost/margin and re-rank within Manago relevance set.",
    workflowId: "wf-margin-rerank",
    createdAt: "3d ago",
    ageHours: 72,
  },
  {
    id: "iss-conflict",
    title: "Workflow conflict · winback_60d overlaps lapse_90d",
    summary: "Double-send in 7-day exit window — governance, not data",
    connectors: ["Manago.ai"],
    impact: 0,
    impactType: "risk",
    cadence: "/q",
    phase: "Diagnose",
    status: "Tracked",
    owner: "mara.e",
    confidence: 93,
    dimension: "Lifecycle Event",
    suggestedAction: "Resolve exit-window overlap before next handoff.",
    workflowId: "wf-campaign-align",
    createdAt: "6h ago",
    ageHours: 6,
  },
  {
    id: "iss-sync",
    title: "Shopify order webhooks 2–6 hours late",
    summary: "Affects same-day lifecycle triggers · ~6% of paid orders",
    connectors: ["Shopify", "Manago.ai"],
    impact: 0,
    impactType: "risk",
    cadence: "/q",
    phase: "Diagnose",
    status: "Tracked",
    owner: "anton.k",
    confidence: 88,
    dimension: "Measurement",
    suggestedAction: "Track webhook latency; hold same-day triggers until order settles.",
    workflowId: "wf-campaign-align",
    createdAt: "12h ago",
    ageHours: 12,
  },
];

/** Alias for pages still importing opportunities */
export const opportunities: Opportunity[] = issues.map((i) => ({
  ...i,
  revenue: i.impact,
  source: i.connectors[0] ?? "Manago.ai",
  stage: i.phase,
  expected: i.impact,
  actual: i.status === "Cleared" ? i.impact : 0,
}));

export const activityFeed = [
  {
    id: "a1",
    time: "09:42",
    tone: "revenue" as const,
    actor: "tomas.l",
    text: "Approved writeback · cs_4f81a · manago.contact · 312 profiles",
    meta: "+1 DCS",
  },
  {
    id: "a2",
    time: "08:14",
    tone: "info" as const,
    actor: "anton.k",
    text: "Generated blueprint · Campaign Promise Alignment · v1",
    meta: "draft",
  },
  {
    id: "a3",
    time: "Yesterday",
    tone: "risk" as const,
    actor: "system",
    text: "QA failed · Winback 60-day · channel conflict 1,142 contacts",
    meta: "warn",
  },
  {
    id: "a4",
    time: "Yesterday",
    tone: "loss" as const,
    actor: "system",
    text: "Detected drift · manago.segment.vip_active ≠ CDP · 1,247",
    meta: "critical",
  },
  {
    id: "a5",
    time: "2d ago",
    tone: "revenue" as const,
    actor: "system",
    text: "Eval pass · handoff.margin_rerank.v2 · 47/49 tests",
    meta: "good",
  },
  {
    id: "a6",
    time: "2d ago",
    tone: "info" as const,
    actor: "mara.e",
    text: "Promoted issue · Identity fragmentation to rank 03",
    meta: "€38K /q",
  },
];

export const stakeTrend = [
  { day: "Mon", captured: 4200, atStake: 92000 },
  { day: "Tue", captured: 6100, atStake: 91000 },
  { day: "Wed", captured: 3800, atStake: 94500 },
  { day: "Thu", captured: 7200, atStake: 93000 },
  { day: "Fri", captured: 5400, atStake: 92000 },
  { day: "Sat", captured: 2100, atStake: 92000 },
  { day: "Sun", captured: 3200, atStake: 92000 },
];

/** @deprecated use stakeTrend */
export const revenueTrend = stakeTrend;

/**
 * Weekly captured / at-stake series for overview value cards.
 * Captured weeks sum to overviewMetrics totals; at-stake is the open-issue book.
 */
export const overviewValueTrend = [
  { week: "W1", label: "Week 1", revenueCaptured: 6000, marginCaptured: 1800, revenueAtStake: 102000, marginAtStake: 14000 },
  { week: "W2", label: "Week 2", revenueCaptured: 9000, marginCaptured: 2400, revenueAtStake: 98000, marginAtStake: 14000 },
  { week: "W3", label: "Week 3", revenueCaptured: 7000, marginCaptured: 2100, revenueAtStake: 95000, marginAtStake: 12000 },
  { week: "W4", label: "Week 4", revenueCaptured: 9000, marginCaptured: 2700, revenueAtStake: 92000, marginAtStake: 12000 },
] as const;

export const phaseBreakdown = [
  { stage: "Diagnose", count: 3, value: 92000 },
  { stage: "Fix", count: 1, value: 12000 },
  { stage: "Build", count: 1, value: 46000 },
  { stage: "QA", count: 0, value: 0 },
  { stage: "Handoff", count: 0, value: 0 },
];

/** @deprecated use phaseBreakdown */
export const stageBreakdown = phaseBreakdown;

export function formatCurrency(n: number, opts: { compact?: boolean; currency?: "EUR" | "USD" } = {}) {
  const currency = opts.currency ?? "EUR";
  const symbol = currency === "EUR" ? "€" : "$";
  if (opts.compact && Math.abs(n) >= 1000) {
    return `${symbol}${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  }
  return n.toLocaleString("en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function formatImpact(issue: Pick<GovernanceIssue, "impact" | "impactType" | "cadence">) {
  if (issue.impactType === "risk" || issue.impact === 0) return "—";
  const label =
    issue.impactType === "margin"
      ? "mar"
      : issue.impactType === "opportunity"
        ? "opp"
        : "rev";
  return `${formatCurrency(issue.impact, { compact: true })} ${issue.cadence} ${label}`;
}

export const overviewMetrics = {
  dcs: 67,
  dcsPrevious: 63,
  dcsThreshold: 70,
  revenueAtStake: 92000,
  marginAtStake: 12000,
  revenueCaptured: 31000,
  marginCaptured: 9000,
  openIssues: 21,
  criticalIssues: 2,
  leakingIssues: 1,
  opportunities: 17,
  workflowsActive: 9,
  workflowsTotal: 14,
  pendingWritebacks: 3,
};

/** Connected stack pills on Executive overview */
export const stackConnectors = [
  { name: "Manago.ai", category: "CDP", status: "ok" as const },
  { name: "Shopify", category: "Commerce", status: "ok" as const },
];

/** Global fix-flow stages — sidebar phases + top stepper */
export const fixFlowStages = [
  { phase: 1, key: "diagnose", label: "Diagnose", short: "Data Consistency Center", to: "/data-consistency" },
  { phase: 2, key: "fix", label: "Fix", short: "Fix", to: "/fix" },
  { phase: 3, key: "build", label: "Build", short: "Workflow Studio", to: "/workflow" },
  { phase: 4, key: "qa", label: "QA", short: "QA validation", to: "/qa" },
  { phase: 5, key: "handoff", label: "Handoff", short: "Handoff", to: "/handoff" },
] as const;

export const dataConsistency = {
  score: overviewMetrics.dcs,
  previousScore: overviewMetrics.dcsPrevious,
  threshold: overviewMetrics.dcsThreshold,
  totalIssues: overviewMetrics.openIssues,
  revenueAtRisk: overviewMetrics.revenueAtStake,
  marginAtRisk: overviewMetrics.marginAtStake,
};

/** Canonical 7 DCS dimensions — always present; rank with rankedDcsDimensions() */
export const dcsDimensions = [
  {
    id: "segments",
    name: "Customer segments & fields",
    score: 54,
    delta: -2,
    issues: 7,
    checks: [
      { name: "Segment-membership parity", status: "Failed" as const },
      { name: "Required-property fill rate", status: "Warning" as const },
      { name: "Custom-field schema drift", status: "Failed" as const },
      { name: "Tag taxonomy consistency", status: "Warning" as const },
    ],
  },
  {
    id: "identity",
    name: "Customer Identity",
    score: 58,
    delta: 2,
    issues: 5,
    checks: [
      { name: "Email uniqueness across contacts", status: "Warning" as const },
      { name: "Guest ↔ registered checkout link", status: "Failed" as const },
      { name: "Cross-device identity match", status: "Warning" as const },
      { name: "Payment-fingerprint clustering", status: "Passed" as const },
    ],
  },
  {
    id: "measurement",
    name: "Measurement",
    score: 63,
    delta: 4,
    issues: 3,
    checks: [
      { name: "Conversion-event mapping", status: "Warning" as const },
      { name: "Event-latency within SLA", status: "Warning" as const },
      { name: "Attribution-window consistency", status: "Passed" as const },
    ],
  },
  {
    id: "business",
    name: "Business Reality",
    score: 69,
    delta: 6,
    issues: 1,
    checks: [
      { name: "Margin-floor presence per SKU", status: "Warning" as const },
      { name: "SKU-margin coverage from source", status: "Warning" as const },
      { name: "Stock-freshness within SLA", status: "Passed" as const },
    ],
  },
  {
    id: "lifecycle",
    name: "Lifecycle Event",
    score: 72,
    delta: 3,
    issues: 3,
    checks: [
      { name: "Entry-trigger integrity", status: "Passed" as const },
      { name: "Stage-transition ordering", status: "Warning" as const },
      { name: "Workflow overlap / double-send guard", status: "Warning" as const },
    ],
  },
  {
    id: "consent",
    name: "Channel & Consent",
    score: 76,
    delta: 5,
    issues: 2,
    checks: [
      { name: "consent_email parity across stack", status: "Passed" as const },
      { name: "Unsubscribe honoring", status: "Passed" as const },
      { name: "Channel opt-in sync", status: "Warning" as const },
    ],
  },
  {
    id: "product",
    name: "Product & Transaction",
    score: 81,
    delta: 1,
    issues: 2,
    checks: [
      { name: "SKU catalogue parity (commerce ↔ CDP)", status: "Passed" as const },
      { name: "Order-event completeness", status: "Passed" as const },
      { name: "Refund / cancellation reconciliation", status: "Warning" as const },
    ],
  },
] as const;

export type DcsDimension = (typeof dcsDimensions)[number];

/** Always returns all 7 dimensions, weakest first */
export function rankedDcsDimensions(): DcsDimension[] {
  return [...dcsDimensions].sort((a, b) => a.score - b.score);
}

export const lifecycleStages = [
  {
    name: "01 Acquisition",
    state: "gap" as const,
    label: "Revenue gap",
    meta: "€54K / q",
    metaType: "rev" as const,
    metaTypeLabel: "revenue",
  },
  {
    name: "02 Activation",
    state: "strong" as const,
    label: "Strong",
    meta: "no open issues",
    metaType: null,
    metaTypeLabel: null,
  },
  {
    name: "03 Expansion",
    state: "gap" as const,
    label: "Margin gap",
    meta: "€12K / q",
    metaType: "mar" as const,
    metaTypeLabel: "margin",
  },
  {
    name: "04 Loyalty",
    state: "gap" as const,
    label: "Revenue gap",
    meta: "€38K / q",
    metaType: "rev" as const,
    metaTypeLabel: "revenue",
  },
  {
    name: "05 Retention & Reactivation",
    state: "partial" as const,
    label: "Risk · overlap",
    meta: "governance warning",
    metaType: "risk" as const,
    metaTypeLabel: "risk",
  },
];

/** Lifecycle revenue cockpit — 5 groups / 11 sub-stages (HTML reference) */
export type CockpitSubstage = {
  name: string;
  stat: "full" | "partial" | "gap";
  label: string;
};

export type CockpitGroup = {
  id: string;
  tone: "acq" | "act" | "exp" | "loy" | "ret";
  num: string;
  name: string;
  impactQ: string;
  impactY: string;
  impactType: "rev" | "mar" | "risk";
  workflows: string;
  workflowsBlocked?: boolean;
  desc: string;
  gapLabel: string;
  gapValueQ: string;
  gapValueY: string;
  gapTone?: "spark" | "good" | "warn" | "muted";
  issueId?: string;
  issueLink?: string;
  gapMuted?: string;
  substages: CockpitSubstage[];
};

export const lifecycleCockpit: CockpitGroup[] = [
  {
    id: "acq",
    tone: "acq",
    num: "01 · ACQUISITION",
    name: "Turning visitors into contacts",
    impactQ: "€420K",
    impactY: "€1.68M",
    impactType: "rev",
    workflows: "2 active · 1 blocked",
    workflowsBlocked: true,
    desc: "Where the lifecycle starts — or fails to. A consistent acquisition promise decides whether the contact is ever captured.",
    gapLabel: "Revenue gap",
    gapValueQ: "€54K",
    gapValueY: "€216K",
    gapTone: "spark",
    issueId: "iss-campaign",
    issueLink: "Campaign promise mismatch · fix →",
    substages: [
      { name: "Lead / anonymous visitor", stat: "partial", label: "partial" },
      { name: "Subscriber (pre-purchase)", stat: "gap", label: "blocked" },
    ],
  },
  {
    id: "act",
    tone: "act",
    num: "02 · ACTIVATION",
    name: "First purchase to habit",
    impactQ: "€1.2M",
    impactY: "€4.8M",
    impactType: "rev",
    workflows: "3 active · healthy",
    desc: "Onboarding and second-order push. Strong coverage — the welcome flow is correctly built and Klints does not flag it.",
    gapLabel: "Coverage",
    gapValueQ: "strong",
    gapValueY: "strong",
    gapTone: "good",
    gapMuted: "No open issues",
    substages: [
      { name: "First purchase", stat: "full", label: "strong" },
      { name: "Onboarding / education", stat: "full", label: "strong" },
      { name: "Second purchase", stat: "partial", label: "partial" },
    ],
  },
  {
    id: "exp",
    tone: "exp",
    num: "03 · EXPANSION",
    name: "Growing customer value",
    impactQ: "€780K",
    impactY: "€3.12M",
    impactType: "rev",
    workflows: "2 active · 1 leaking",
    desc: "Cross-sell and replenishment. Recommendations convert — but optimise turnover, not profit, until margin is connected.",
    gapLabel: "Margin gap",
    gapValueQ: "€12K",
    gapValueY: "€48K",
    gapTone: "good",
    issueId: "iss-margin",
    issueLink: "Margin-aware re-rank · fix →",
    substages: [
      { name: "Cross-sell / up-sell", stat: "partial", label: "leaking" },
      { name: "Replenishment", stat: "partial", label: "partial" },
    ],
  },
  {
    id: "loy",
    tone: "loy",
    num: "04 · LOYALTY",
    name: "Your most valuable customers",
    impactQ: "€540K",
    impactY: "€2.16M",
    impactType: "rev",
    workflows: "1 draft · 1 blocked",
    workflowsBlocked: true,
    desc: "VIP and advocacy. Real VIPs are hidden because one person is held as two contacts — so VIP automation misfires.",
    gapLabel: "Revenue gap",
    gapValueQ: "€38K",
    gapValueY: "€152K",
    gapTone: "spark",
    issueId: "iss-identity",
    issueLink: "Identity fragmentation · fix →",
    substages: [
      { name: "VIP / high-LTV", stat: "gap", label: "blocked" },
      { name: "Advocacy / referral", stat: "partial", label: "partial" },
    ],
  },
  {
    id: "ret",
    tone: "ret",
    num: "05 · RETENTION & REACTIVATION",
    name: "Keeping and winning back",
    impactQ: "€310K",
    impactY: "€1.24M",
    impactType: "rev",
    workflows: "2 active · 1 warn",
    desc: "Lapse prevention and winback. A workflow-conflict warning (winback × lapse overlap) is governance, not data.",
    gapLabel: "Risk",
    gapValueQ: "overlap",
    gapValueY: "overlap",
    gapTone: "warn",
    gapMuted: "Governance warning · tracked",
    issueId: "iss-conflict",
    substages: [
      { name: "Lapse risk / at-risk", stat: "partial", label: "partial" },
      { name: "Winback / churned", stat: "partial", label: "warn" },
    ],
  },
];

export const consistencyTrend = [
  { run: "Apr 10", score: 61, issues: 26, impact: 102000 },
  { run: "Apr 14", score: 62, issues: 25, impact: 100500 },
  { run: "Apr 17", score: 63, issues: 24, impact: 98000 },
  { run: "Apr 21", score: 63, issues: 23, impact: 97000 },
  { run: "Apr 24", score: 64, issues: 22, impact: 96000 },
  { run: "Apr 28", score: 65, issues: 21, impact: 95000 },
  { run: "May 01", score: 65, issues: 20, impact: 94000 },
  { run: "May 04", score: 66, issues: 19, impact: 93000 },
  { run: "May 08", score: 67, issues: 18, impact: 92000 },
];

export type IssueGroup = {
  type: string;
  count: number;
  impact: number;
  trend: number;
};

export const issueGroups: IssueGroup[] = [
  { type: "Blocked · lifecycle", count: 2, impact: 92000, trend: 0 },
  { type: "Leaking · margin", count: 1, impact: 12000, trend: 0 },
  { type: "Opportunity · ready", count: 1, impact: 46000, trend: 0 },
  { type: "Tracked · governance", count: 2, impact: 0, trend: 0 },
];

export type Run = {
  id: string;
  ranAt: string;
  score: number;
  issues: number;
  verification: "Passed" | "Warning" | "Failed";
  diffScore: number;
  issuesResolved: number;
  revenueUnlocked: number;
};

export const runs: Run[] = [
  { id: "R#148", ranAt: "42 min ago", score: 67, issues: 8, verification: "Warning", diffScore: 1, issuesResolved: 1, revenueUnlocked: 4000 },
  { id: "R#147", ranAt: "6h ago", score: 66, issues: 9, verification: "Warning", diffScore: 1, issuesResolved: 0, revenueUnlocked: 0 },
  { id: "R#146", ranAt: "1d ago", score: 65, issues: 10, verification: "Passed", diffScore: 2, issuesResolved: 2, revenueUnlocked: 9000 },
  { id: "R#145", ranAt: "3d ago", score: 64, issues: 11, verification: "Passed", diffScore: 1, issuesResolved: 1, revenueUnlocked: 6000 },
  { id: "R#144", ranAt: "5d ago", score: 63, issues: 12, verification: "Failed", diffScore: 2, issuesResolved: 0, revenueUnlocked: 0 },
];

export type IssueRow = {
  id: string;
  entity: string;
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  impact: number;
  risk: number;
  runId: string;
  status: "Open" | "In Review" | "Fixed";
  connector: string;
  snapshot: string;
  field?: string;
};

export const issueRows: IssueRow[] = [
  { id: "iss-campaign", entity: "Campaign", type: "Promise mismatch", severity: "Critical", impact: 54000, risk: 96, runId: "R#148", status: "Open", connector: "Shopify", snapshot: "snap-88", field: "offer" },
  { id: "iss-identity", entity: "Contact", type: "Identity split", severity: "Critical", impact: 38000, risk: 93, runId: "R#148", status: "Open", connector: "Manago.ai", snapshot: "snap-88" },
  { id: "iss-margin", entity: "Product", type: "Margin blind", severity: "High", impact: 12000, risk: 95, runId: "R#147", status: "In Review", connector: "Shopify", snapshot: "snap-87", field: "margin_pct" },
  { id: "iss-untapped", entity: "Segment", type: "Coverage gap", severity: "Medium", impact: 46000, risk: 40, runId: "R#148", status: "Open", connector: "Manago.ai", snapshot: "snap-88", field: "workflow_coverage" },
  { id: "iss-conflict", entity: "Workflow", type: "Collision", severity: "Medium", impact: 0, risk: 70, runId: "R#146", status: "Open", connector: "Manago.ai", snapshot: "snap-86" },
  { id: "iss-sync", entity: "Order", type: "Webhook latency", severity: "Medium", impact: 0, risk: 55, runId: "R#147", status: "Open", connector: "Shopify", snapshot: "snap-87", field: "orders/create" },
];

export type FixBlueprint = {
  id: string;
  title: string;
  targetIssue: string;
  expectedRecovery: number;
  riskReduction: number;
  effort: "Low" | "Medium" | "High";
  description: string;
};

export const fixBlueprints: FixBlueprint[] = [
  {
    id: "FIX-01",
    title: "Align campaign offer across Shopify · Manago · landing",
    targetIssue: "Promise mismatch",
    expectedRecovery: 54000,
    riskReduction: 28,
    effort: "Medium",
    description: "UTM-scoped pop-up offer + Shopify discount parity; human-approved writeback.",
  },
  {
    id: "FIX-02",
    title: "Unify guest/registered identity clusters ≥ 0.90",
    targetIssue: "Identity split",
    expectedRecovery: 38000,
    riskReduction: 34,
    effort: "High",
    description: "No auto-merge. CRM Manager approves each cluster before LTV recompute.",
  },
  {
    id: "FIX-03",
    title: "Re-rank recommendations with Shopify margin floor",
    targetIssue: "Margin blind",
    expectedRecovery: 12000,
    riskReduction: 18,
    effort: "Low",
    description: "Keep Manago relevance; inject catalog cost/margin from Shopify; floor ≥ 38%.",
  },
];

export const opportunityDataQuality: Record<
  string,
  {
    issues: { field: string; type: string; runId: string }[];
    confidenceAdjustment: number;
    verificationScore: number;
    qaChecks: { name: string; status: "Passed" | "Warning" | "Failed" }[];
  }
> = {
  "iss-campaign": {
    issues: [{ field: "offer", type: "Cross-stack mismatch", runId: "R#148" }],
    confidenceAdjustment: 0,
    verificationScore: 96,
    qaChecks: [
      { name: "Source freshness", status: "Passed" },
      { name: "Offer parity", status: "Failed" },
      { name: "Lifecycle entry", status: "Failed" },
    ],
  },
  "iss-identity": {
    issues: [{ field: "contact_id", type: "Identity split", runId: "R#148" }],
    confidenceAdjustment: -4,
    verificationScore: 93,
    qaChecks: [
      { name: "Email normalize", status: "Passed" },
      { name: "Cluster confidence", status: "Warning" },
      { name: "LTV continuity", status: "Failed" },
    ],
  },
  "iss-margin": {
    issues: [{ field: "margin_pct", type: "Missing in CDP", runId: "R#147" }],
    confidenceAdjustment: 0,
    verificationScore: 95,
    qaChecks: [
      { name: "Shopify cost sync", status: "Warning" },
      { name: "Relevance guard", status: "Passed" },
      { name: "Margin floor", status: "Failed" },
    ],
  },
};

export type IssueEvidence = {
  /** Provenance headline */
  provenanceTitle: string;
  /** 1 · What is broken / the observable mismatch */
  problem: string;
  /** 2 · Why it happened */
  cause: string;
  /** 3 · Source-of-truth rows */
  sources: { element: string; connector: string; value: string }[];
  mismatches: string[];
  /** + · What Klints adds before Manago activation */
  klintsAdds: string;
  /** 4 · Per-element fix recommendations */
  fixes: { tag: string; body: string }[];
  /** Footer next-step copy */
  nextStep: string;
  /** Primary writeback / action summary */
  writeback: string;
  runId: string;
  /** Impact ribbon under the card header */
  impactRibbon: {
    impactLabel: string;
    impactNote: string;
    lifecycle: string;
    lifecycleNote: string;
    dcsFrom: string;
    dcsTo: string;
  };
  /** Collapsed card · what this blocks / gaps */
  blocksLabel: string;
  blocks: string;
  readinessChip: string;
};

export const issueEvidence: Record<string, IssueEvidence> = {
  "iss-campaign": {
    provenanceTitle: "Three teams, three offers, one confused customer",
    problem:
      "Shopify campaign discount, Manago.ai pop-up, and landing hero promise three different offers on the same click path — so email capture never fires and lifecycle never enters.",
    cause:
      "The campaign was built by performance (up to 30% off). The Manago.ai pop-up still offers 10% for email. The landing hero only mentions free shipping. None were re-aligned when the summer campaign launched — visitors feel misled and leave without giving an email.",
    sources: [
      { element: "Campaign discount & copy", connector: "Shopify", value: "up_to_30_pct" },
      { element: "Anonymous pop-up offer & URL rule", connector: "Manago.ai", value: "first_order_10_pct" },
      { element: "Landing hero", connector: "Shopify", value: "free_shipping_60" },
    ],
    mismatches: ["Offer mismatch · Shopify ↔ Manago", "Message mismatch · pop-up ↔ landing"],
    klintsAdds:
      "The ad creative and landing promise live outside the CDP. Klints reads both and packages one consistent offer for Manago.ai. Manago owns the workflow; Klints owns the cross-stack context.",
    fixes: [
      {
        tag: "Pop-up",
        body: "Raise the anonymous-visitor offer on this URL to match the 30% campaign, scoped to campaign UTM traffic only — non-campaign visitors keep the 10% baseline.",
      },
      {
        tag: "Ad / discount",
        body: "If 30% is not sustainable on margin, change the creative to “up to 10% + free shipping” so the promise is honest at entry.",
      },
      {
        tag: "Landing",
        body: "Add a campaign-aware hero that restates the ad offer in the first viewport so the message survives the click.",
      },
      {
        tag: "Lifecycle",
        body: "Verify on-site capture tags the contact and fills required properties so the lifecycle entry Manago builds triggers on clean data.",
      },
    ],
    nextStep:
      "Open the guided fix flow — review each per-element recommendation, approve it, and write the aligned offer back so Manago acts on one consistent promise.",
    writeback: "UTM-scoped pop-up offer to 30% for campaign traffic only; keep 10% baseline elsewhere.",
    runId: "R#148",
    impactRibbon: {
      impactLabel: "Revenue gap",
      impactNote: "paid CAC spent, lifecycle never entered",
      lifecycle: "Entry-point workflow",
      lifecycleNote: "whole lifecycle is gated on capture",
      dcsFrom: "Channel & Consent 76",
      dcsTo: "82",
    },
    blocksLabel: "Blocks",
    blocks: "Welcome Series entry · Email capture · First-purchase nurture",
    readinessChip: "Lifecycle never starts",
  },
  "iss-untapped": {
    provenanceTitle: "Manago.ai answers questions. Klints asks the ones nobody thinks to ask.",
    problem:
      "Segment repeat_no_loyalty — 1,247 contacts with 2+ purchases, no active subscription, and zero lifecycle workflow coverage — carries revenue potential with no workflow targeting them.",
    cause:
      "Klints mapped every active lifecycle workflow against the full contact pool and found a revenue-bearing segment with clean data and no coverage. This is a build opportunity, not a data integrity failure.",
    sources: [
      { element: "klints_purchase_count", connector: "Shopify", value: "100% coverage" },
      { element: "klints_days_since_last_order", connector: "Shopify", value: "100% coverage" },
      { element: "klints_consent_email_safe", connector: "Manago.ai", value: "98.7% coverage" },
      { element: "klints_active_loyalty_workflow", connector: "Klints", value: "0 of 1,247 covered" },
    ],
    mismatches: ["Coverage gap · second purchase entry"],
    klintsAdds:
      "Klints stages a validated segment definition, a data-ready workflow brief, and a confirmed collision check for the Manago.ai agent (external). Klints surfaces it, validates it, and packages it — Manago builds; you activate.",
    fixes: [
      {
        tag: "Segment",
        body: "Lock the repeat_no_loyalty definition (2+ purchases, no loyalty workflow) as the build input.",
      },
      {
        tag: "Build",
        body: "Open Second Purchase Accelerator — no data writeback required; DCS for this workflow is already 73.",
      },
      {
        tag: "Collision",
        body: "Confirm no overlap with winback / lapse before handoff.",
      },
    ],
    nextStep:
      "Data is ready. Continue to Build to package the Second Purchase Accelerator blueprint for staged handoff.",
    writeback: "No writeback — stage Second Purchase Accelerator blueprint for Manago.ai handoff.",
    runId: "R#148",
    impactRibbon: {
      impactLabel: "Revenue opportunity",
      impactNote: "1,247 contacts · no active workflow today",
      lifecycle: "Expansion · second purchase",
      lifecycleNote: "gap detected · data confirmed ready",
      dcsFrom: "Segments 54",
      dcsTo: "73 ready",
    },
    blocksLabel: "Gap in",
    blocks: "Expansion · Second purchase · Retention entry",
    readinessChip: "Data ready · no fix required",
  },
  "iss-identity": {
    provenanceTitle: "A guest checkout and a registered account are the same person",
    problem:
      "1,284 guest vs registered pairs are one person each. Neither contact alone crosses the VIP threshold, so genuine high-value buyers look average and VIP workflows skip them.",
    cause:
      "Customers buy as guest, then again via Apple Pay private-relay email. Shopify stores two records; Manago.ai inherits two contacts. A unique email is always a unique contact by design — the link lives in commerce/payment signals outside the CDP.",
    sources: [
      { element: "Payment card / fingerprint", connector: "Shopify", value: "deterministic match" },
      { element: "Shipping address + name", connector: "Shopify", value: "deterministic match" },
      { element: "Phone number", connector: "Shopify", value: "deterministic match" },
      { element: "Guest vs registered LTV", connector: "Manago.ai", value: "€186 + €271 → €457 combined" },
    ],
    mismatches: ["Identity split · cluster confidence 0.93", "LTV understated on each profile"],
    klintsAdds:
      "Klints resolves the link in commerce/payment layers and writes a unified view back into both contacts. Klints never auto-merges — it proposes a cluster with evidence for human approval. Identity integrity precedes staged handoff.",
    fixes: [
      {
        tag: "Policy ≥ 0.90",
        body: "Auto-cluster pairs with ≥ 2 deterministic signals; write for approval (not row-by-row).",
      },
      {
        tag: "0.75–0.90",
        body: "Route to the manual review queue.",
      },
      {
        tag: "< 0.75",
        body: "Never merge.",
      },
      {
        tag: "Writeback",
        body: "On approval, write klints_identity_cluster, true LTV, purchase count, and lifecycle stage to both contacts.",
      },
    ],
    nextStep:
      "Approve the clustering policy and preview how many auto-cluster vs. route to manual review — no row-by-row merging.",
    writeback: "Propose cluster merge ≥ 0.90 — CRM Manager approves; write corrected aggregate to both contacts.",
    runId: "R#148",
    impactRibbon: {
      impactLabel: "Revenue gap",
      impactNote: "missed expansion on real repeat buyers",
      lifecycle: "VIP / loyalty tiering",
      lifecycleNote: "split LTV hides true value",
      dcsFrom: "Customer Identity 58",
      dcsTo: "66",
    },
    blocksLabel: "Blocks",
    blocks: "VIP Expansion · Loyalty Upgrade · Retention tiering",
    readinessChip: "Needs human approval",
  },
  "iss-margin": {
    provenanceTitle: "Manago.ai knows what sells. It does not know what earns.",
    problem:
      "Recommendations optimise revenue/relevance only. Shopify cost/margin never reaches Manago.ai, so equally relevant high-margin SKUs lose to low-margin bestsellers.",
    cause:
      "Manago.ai ranks on behavioural and transactional data — what sells. Margin lives in Shopify/catalog cost fields the CDP never sees. Workflows convert, but on turnover instead of profit.",
    sources: [
      { element: "Product relevance per segment", connector: "Manago.ai", value: "relevance-ranked · no margin" },
      { element: "SKU cost / margin_pct", connector: "Shopify", value: "present · not in relevance set" },
      { element: "Floor rule", connector: "Klints", value: "margin ≥ 38% not applied" },
    ],
    mismatches: ["Margin blind · CDP relevance set", "Profit leak on low-margin SKUs"],
    klintsAdds:
      "Klints never recommends a product just for its margin. It takes only SKUs Manago already judged relevant, then re-ranks within that set with a margin floor — nothing irrelevant is introduced.",
    fixes: [
      {
        tag: "Sync",
        body: "Inject Shopify cost/margin into the Manago relevance set.",
      },
      {
        tag: "Floor",
        body: "Apply margin ≥ 38% — drop clearance SKUs below the floor.",
      },
      {
        tag: "Re-rank",
        body: "Promote high-margin relevant SKUs (e.g. Repair Serum 41%, Night Cream 38%) within the existing relevance set.",
      },
    ],
    nextStep:
      "Approve the margin floor writeback, then continue to Build so expansion workflows recommend relevant × profitable products.",
    writeback: "Inject Shopify cost/margin into relevance set; re-rank with floor ≥ 38%.",
    runId: "R#147",
    impactRibbon: {
      impactLabel: "Margin gap",
      impactNote: "profit left on the table, same relevance",
      lifecycle: "Expansion workflows",
      lifecycleNote: "runs today — but on revenue, not profit",
      dcsFrom: "Business Reality 69",
      dcsTo: "74",
    },
    blocksLabel: "Distorts",
    blocks: "Cross-sell · Bundle upsell · Replenishment recommendations",
    readinessChip: "Running but unprofitable",
  },
  "iss-conflict": {
    provenanceTitle: "Two workflows claim the same exit window",
    problem:
      "winback_60d and lapse_90d both fire contacts in an overlapping 7-day window — double-send risk, not a field mismatch.",
    cause:
      "Exit and entry rules were authored independently. Governance collision: both workflows are valid alone, incompatible together.",
    sources: [
      { element: "winback_60d", connector: "Manago.ai", value: "exit window d53–d60" },
      { element: "lapse_90d", connector: "Manago.ai", value: "entry window d83–d90 · overlap risk" },
    ],
    mismatches: ["Double-send risk · 7-day overlap"],
    klintsAdds:
      "Klints surfaces the collision before handoff so Manago never ships overlapping sends. This is a governance fix — no customer field writeback.",
    fixes: [
      {
        tag: "Exclusivity",
        body: "Make winback exit exclusive of lapse entry for the overlapping 7 days.",
      },
      {
        tag: "QA",
        body: "Re-run collision gate before the next handoff package.",
      },
    ],
    nextStep: "Resolve exit-window exclusivity in Fix, then re-validate collision gates in QA.",
    writeback: "Resolve exit-window exclusivity before next handoff; no customer field writeback.",
    runId: "R#146",
    impactRibbon: {
      impactLabel: "Risk",
      impactNote: "governance · double-send exposure",
      lifecycle: "Winback · Lapse",
      lifecycleNote: "overlap in 7-day exit window",
      dcsFrom: "Lifecycle Event 72",
      dcsTo: "78",
    },
    blocksLabel: "Conflicts",
    blocks: "winback_60d · lapse_90d",
    readinessChip: "Tracked · governance",
  },
  "iss-sync": {
    provenanceTitle: "Same-day triggers fire on stale order state",
    problem:
      "Shopify orders/create webhooks arrive 2–6 hours late for ~6% of paid orders — same-day lifecycle triggers arm on unpaid snapshots.",
    cause:
      "Webhook latency on the commerce side; Manago.ai triggers assume near-real-time order settlement.",
    sources: [
      { element: "orders/create latency", connector: "Shopify", value: "p95 2.4h · tail 6h" },
      { element: "Same-day triggers", connector: "Manago.ai", value: "armed on unpaid snapshot" },
    ],
    mismatches: ["Webhook latency · measurement drift"],
    klintsAdds:
      "Klints tracks latency in the Measurement dimension and recommends holding same-day triggers until the order settles — so Manago never acts on a ghost unpaid state.",
    fixes: [
      {
        tag: "Hold",
        body: "Delay same-day triggers until order settlement confirms.",
      },
      {
        tag: "Monitor",
        body: "Keep webhook latency on the Measurement scoreboard until p95 < 30m.",
      },
    ],
    nextStep: "Track latency and hold same-day triggers — no customer writeback required.",
    writeback: "Hold same-day triggers until order settles; track latency in Measurement dimension.",
    runId: "R#147",
    impactRibbon: {
      impactLabel: "Risk",
      impactNote: "~6% of paid orders affected",
      lifecycle: "Same-day triggers",
      lifecycleNote: "fires on stale unpaid state",
      dcsFrom: "Measurement 63",
      dcsTo: "70",
    },
    blocksLabel: "Affects",
    blocks: "Same-day lifecycle · Order-settled nurture",
    readinessChip: "Tracked · latency",
  },
};

/** Phase 2 · Fix — single-issue change-set (HTML activation panel) */
export type FixPlan = {
  eyebrow: string;
  title: string;
  summary: string;
  changeSetId: string;
  mode: "approve" | "build";
  kv: { k: string; v: string }[];
  touchpoints: string[];
  states: { label: string; status: "done" | "current" | "pending" }[];
  previewTitle: string;
  previewHelper: string;
  previewColumns: string[];
  previewRows: string[][];
  govHead: string;
  gov: { k: string; v: string }[];
  testBadge: string;
  ctaLabel: string;
};

export const fixPlans: Record<string, FixPlan> = {
  "iss-campaign": {
    eyebrow: "Campaign alignment · ready for approval",
    title: "Align the offer across ad, pop-up and landing",
    summary:
      "Klints found that Shopify promises 30% while the Manago.ai pop-up offers 10% on the same landing URL. Approve the alignment and Klints writes the corrected pop-up rule until the chain is consistent.",
    changeSetId: "chg_lumera_campaign_017",
    mode: "approve",
    kv: [
      { k: "What changes", v: "Pop-up offer rule on summer-campaign URL · raised to match the ad" },
      { k: "Where it changes", v: "Manago.ai pop-up config · campaign UTM scope only" },
      { k: "Scope", v: "Campaign traffic only · non-campaign visitors keep 10% baseline" },
      { k: "Approval owner", v: "Anton Král · Growth Lead" },
      { k: "Rollback", v: "Available · revert to prior pop-up rule · audit-tracked" },
      { k: "Change set ID", v: "chg_lumera_campaign_017" },
    ],
    touchpoints: ["Pop-up", "Landing", "Email", "Contact data", "Consent", "Funnel stage"],
    states: [
      { label: "Proposed", status: "done" },
      { label: "Previewed", status: "done" },
      { label: "Validated", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewTitle: "Consistency check · 3 elements",
    previewHelper:
      "Every step of the entry chain is checked for offer and copy consistency before the lifecycle starts.",
    previewColumns: ["Element", "Source", "Current offer", "After fix", "Status"],
    previewRows: [
      ["Shopify campaign discount", "Shopify", "up to 30%", "up to 30%", "anchor"],
      ["Pop-up (this URL)", "Manago.ai", "10%", "up to 30% (UTM-scoped)", "0.96"],
      ["Landing hero", "Shopify", "free shipping", "restates 30% offer", "0.92"],
    ],
    govHead:
      "Klints does not change a live campaign silently. The alignment is proposed, validated, and human-approved before any pop-up rule changes.",
    gov: [
      { k: "Approval owner", v: "Anton Král · Growth Lead" },
      { k: "Production target", v: "Manago.ai pop-up config" },
      { k: "Scope guard", v: "utm_campaign = summer26" },
      { k: "Audit mode", v: "Append-only · signed log" },
      { k: "Current state", v: "Awaiting approval" },
      { k: "Source evidence", v: "Shopify · Manago.ai" },
    ],
    testBadge: "Sandboxed test complete · 3/3 elements mapped · 0 conflicts",
    ctaLabel: "Proceed to Workflow Studio",
  },
  "iss-identity": {
    eyebrow: "Identity cluster · ready for approval",
    title: "Approve the identity cluster",
    summary:
      "Klints matched 1,284 contact pairs that are the same person across guest and registered checkout. On approval, Klints writes the corrected aggregate into both contacts — Manago.ai still sees two contacts, but both carry the unified view. Klints never auto-merges.",
    changeSetId: "chg_lumera_identity_033",
    mode: "approve",
    kv: [
      { k: "What changes", v: "Corrected aggregate (klints_identity_cluster, true LTV, stage)" },
      { k: "Where it changes", v: "Both Manago.ai contacts · klints_ namespace" },
      { k: "Pairs affected", v: "1,284 contact pairs · ≥ 0.90 confidence" },
      { k: "Match basis", v: "Deterministic · payment fingerprint + address + name" },
      { k: "Approval owner", v: "Mara Evstratova · Head of CRM" },
      { k: "Change set ID", v: "chg_lumera_identity_033" },
    ],
    touchpoints: ["Contact data", "Loyalty", "Funnel stage", "Consent", "Key Information", "Email"],
    states: [
      { label: "Matched", status: "done" },
      { label: "Evidenced", status: "done" },
      { label: "Test synced", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Written to both", status: "pending" },
    ],
    previewTitle: "Preview · 4 of 1,284 cluster candidates",
    previewHelper: "Each row is one person held as two contacts. Pairs below 0.90 confidence are never auto-approved.",
    previewColumns: ["Contact A", "Contact B", "Matched on", "Unified LTV", "Confidence"],
    previewRows: [
      ["anna.k@gmail.com", "a8f3x@…appleid.com", "card · addr · name", "€457", "0.95"],
      ["m.dvorak@firma.cz", "marek.d@seznam.cz", "card · phone · addr", "€612", "0.93"],
      ["guest_44182", "petra.n@gmail.com", "card · addr · name", "€388", "0.91"],
      ["j.cerny@gmail.com", "c3k9z@…appleid.com", "card · addr · name", "€529", "0.94"],
    ],
    govHead:
      "Klints never auto-merges identities. Every cluster is evidenced, test-synced and human-approved. Manago.ai keeps both contacts; both receive the corrected aggregate.",
    gov: [
      { k: "Approval owner", v: "Mara Evstratova · Head of CRM" },
      { k: "Production target", v: "Both Manago.ai contacts" },
      { k: "Field namespace", v: "klints_" },
      { k: "Match floor", v: "≥ 0.90 confidence · deterministic" },
      { k: "Audit mode", v: "Append-only · signed log" },
      { k: "Source evidence", v: "Shopify · payment gateway" },
    ],
    testBadge: "Sandboxed test complete · 100/100 clusters written to sandbox · 0 conflicts",
    ctaLabel: "Proceed to Workflow Studio",
  },
  "iss-margin": {
    eyebrow: "Margin re-rank · ready for approval",
    title: "Connect margin source & approve the re-rank",
    summary:
      "The Manago.ai agent recommends relevant products but optimises revenue, not profit. Connect Shopify cost/margin and approve the re-rank — Klints keeps only Manago’s relevant products and favours profit within them. Nothing irrelevant is ever introduced.",
    changeSetId: "chg_lumera_margin_051",
    mode: "approve",
    kv: [
      { k: "What changes", v: "Recommendation ranking · re-ordered by margin within relevance" },
      { k: "Where it changes", v: "Recommendation spec staged for Manago.ai (human activation)" },
      { k: "Relevance guard", v: "never below Manago relevance 0.70 · never irrelevant" },
      { k: "Margin floor", v: "shopify.sku.margin ≥ 0.38" },
      { k: "Approval owner", v: "Tomáš Liška · CRM Manager" },
      { k: "Change set ID", v: "chg_lumera_margin_051" },
    ],
    touchpoints: ["Reco frame", "Re-rank policy", "Price + stock", "Email", "Coupon"],
    states: [
      { label: "Proposed", status: "done" },
      { label: "Source connected", status: "current" },
      { label: "Re-rank tested", status: "pending" },
      { label: "Approved", status: "pending" },
      { label: "Staged for handoff", status: "pending" },
    ],
    previewTitle: "Re-rank preview · relevant × profitable",
    previewHelper: "Klints re-ranks within Manago’s relevant set to favour margin — same relevance, higher profit.",
    previewColumns: ["Product", "Relevance", "Margin", "Manago rank", "Klints rank"],
    previewRows: [
      ["Repair Serum 30ml", "0.88", "41%", "#4", "#1 ↑"],
      ["Night Cream 50ml", "0.84", "38%", "#5", "#2 ↑"],
      ["Gentle Cleanser 200ml", "0.91", "12%", "#1", "#3"],
      ["Discount Bundle", "0.79", "6%", "#3", "dropped"],
    ],
    govHead:
      "Klints never recommends a product just for its margin. The re-rank operates only within Manago’s relevant set, and is human-approved before staged handoff.",
    gov: [
      { k: "Approval owner", v: "Tomáš Liška · CRM Manager" },
      { k: "Production target", v: "Manago.ai agent (external · human activation)" },
      { k: "Relevance guard", v: "≥ 0.70" },
      { k: "Margin floor", v: "≥ 0.38" },
      { k: "Audit mode", v: "Append-only · signed log" },
      { k: "Source evidence", v: "Manago.ai agent · Shopify" },
    ],
    testBadge: "Sandboxed test complete · 340 SKUs scored · relevance preserved · 0 below floor",
    ctaLabel: "Proceed to Workflow Studio",
  },
  "iss-untapped": {
    eyebrow: "Data confirmed · no fix required",
    title: "This workflow is ready to build",
    summary:
      "Klints ran a full data readiness check on segment repeat_no_loyalty. All required fields are present and consistent — DCS for this workflow is 73, above the 70 build threshold. There is nothing to fix. Proceed straight to the workflow brief.",
    changeSetId: "chg_lumera_untapped_062",
    mode: "build",
    kv: [
      { k: "Segment", v: "repeat_no_loyalty · 1,247 contacts" },
      { k: "Revenue opportunity", v: "€46,000 / quarter" },
      { k: "Data readiness", v: "All required fields confirmed ✓" },
      { k: "Collision check", v: "No conflicts · confirmed before handoff" },
      { k: "Data consistency", v: "73 · above 70 build threshold" },
      { k: "Workflow brief", v: "second_purchase_accelerator_v1" },
    ],
    touchpoints: ["Segment", "Email", "SMS", "Web Push", "Paid retargeting", "Reco frame"],
    states: [
      { label: "Scanned", status: "done" },
      { label: "Data ready", status: "done" },
      { label: "Brief assembled", status: "current" },
      { label: "Build", status: "pending" },
      { label: "QA", status: "pending" },
    ],
    previewTitle: "Data readiness check · 5 signals",
    previewHelper: "All required fields present and consistent. No writeback needed.",
    previewColumns: ["Field", "Source", "Coverage", "Status"],
    previewRows: [
      ["klints_purchase_count", "Shopify", "100%", "OK"],
      ["klints_days_since_last_order", "Shopify", "100%", "OK"],
      ["klints_consent_email_safe", "Manago.ai", "98.7%", "OK"],
      ["klints_active_loyalty_workflow", "Klints", "100%", "OK"],
      ["ad_audience_membership", "Meta", "0 of 1,247", "OK"],
    ],
    govHead:
      "No production writeback. Klints cleared the segment for build — you will stage a validated brief for Manago once you continue to Workflow Studio.",
    gov: [
      { k: "Approval owner", v: "Tomáš Liška · CRM Manager" },
      { k: "Production target", v: "Workflow brief only" },
      { k: "Writeback", v: "None required" },
      { k: "Build threshold", v: "DCS ≥ 70 · cleared at 73" },
      { k: "Audit mode", v: "Coverage scan logged" },
      { k: "Source evidence", v: "Manago.ai · Shopify · Klints" },
    ],
    testBadge: "Data readiness confirmed · collision check passed · ready to build",
    ctaLabel: "Continue to Workflow Studio",
  },
  "iss-conflict": {
    eyebrow: "Governance collision · ready for approval",
    title: "Resolve winback / lapse exit-window overlap",
    summary:
      "winback_60d and lapse_90d both fire in a 7-day overlap. Approve exclusivity so Manago never double-sends. No customer field writeback.",
    changeSetId: "chg_lumera_conflict_019",
    mode: "approve",
    kv: [
      { k: "What changes", v: "Exit-window exclusivity rule between winback_60d and lapse_90d" },
      { k: "Where it changes", v: "Manago.ai workflow governance" },
      { k: "Scope", v: "7-day overlap window only" },
      { k: "Approval owner", v: "Mara Evstratova · Head of CRM" },
      { k: "Rollback", v: "Available · prior exclusivity rules" },
      { k: "Change set ID", v: "chg_lumera_conflict_019" },
    ],
    touchpoints: ["Winback", "Lapse", "Email", "SMS", "Consent"],
    states: [
      { label: "Detected", status: "done" },
      { label: "Previewed", status: "done" },
      { label: "Validated", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewTitle: "Collision preview",
    previewHelper: "Both workflows are valid alone; incompatible together in the overlap window.",
    previewColumns: ["Workflow", "Window", "Conflict", "After fix"],
    previewRows: [
      ["winback_60d", "exit d53–d60", "overlap", "exclusive exit"],
      ["lapse_90d", "entry d83–d90", "overlap", "waits for winback clear"],
    ],
    govHead: "Governance fix only — no customer profile fields are written.",
    gov: [
      { k: "Approval owner", v: "Mara Evstratova · Head of CRM" },
      { k: "Production target", v: "Workflow exclusivity rules" },
      { k: "Customer writeback", v: "None" },
      { k: "Audit mode", v: "Append-only · signed log" },
      { k: "Current state", v: "Awaiting approval" },
      { k: "Source evidence", v: "Manago.ai" },
    ],
    testBadge: "Sandboxed test complete · collision resolved in sandbox · 0 double-sends",
    ctaLabel: "Proceed to Workflow Studio",
  },
  "iss-sync": {
    eyebrow: "Measurement latency · ready for approval",
    title: "Hold same-day triggers until order settles",
    summary:
      "Shopify webhooks arrive 2–6h late for ~6% of paid orders. Approve a hold so same-day lifecycle triggers never arm on unpaid snapshots.",
    changeSetId: "chg_lumera_sync_044",
    mode: "approve",
    kv: [
      { k: "What changes", v: "Same-day trigger hold until order settlement" },
      { k: "Where it changes", v: "Manago.ai trigger policy" },
      { k: "Scope", v: "~6% of paid orders in latency tail" },
      { k: "Approval owner", v: "Anton Král · Growth Lead" },
      { k: "Rollback", v: "Available · prior trigger timing" },
      { k: "Change set ID", v: "chg_lumera_sync_044" },
    ],
    touchpoints: ["Order webhooks", "Same-day email", "Measurement"],
    states: [
      { label: "Detected", status: "done" },
      { label: "Previewed", status: "done" },
      { label: "Validated", status: "current" },
      { label: "Approved", status: "pending" },
      { label: "Applied", status: "pending" },
    ],
    previewTitle: "Latency signals",
    previewHelper: "Hold fires only when settlement is confirmed.",
    previewColumns: ["Signal", "Source", "Current", "After fix"],
    previewRows: [
      ["orders/create p95", "Shopify", "2.4h", "hold until settled"],
      ["Same-day triggers", "Manago.ai", "armed early", "wait for paid"],
    ],
    govHead: "No customer field writeback — trigger timing policy only.",
    gov: [
      { k: "Approval owner", v: "Anton Král · Growth Lead" },
      { k: "Production target", v: "Manago.ai trigger policy" },
      { k: "Customer writeback", v: "None" },
      { k: "Audit mode", v: "Append-only · signed log" },
      { k: "Current state", v: "Awaiting approval" },
      { k: "Source evidence", v: "Shopify · Manago.ai" },
    ],
    testBadge: "Sandboxed test complete · hold policy validated · 0 premature fires",
    ctaLabel: "Proceed to Workflow Studio",
  },
};

/** Phase 3 · Workflow Studio brief (HTML studio panel) */
export type StudioBlueprint = {
  headTitle: string;
  headSub: string;
  builtFrom: string;
  touchpoints: string[];
  connected: string[];
  identity: { k: string; v: string }[];
  steps: { title: string; desc: string; fields?: string[] }[];
  requiredFields: { field: string; source: string; status: string }[];
};

export const studioBlueprints: Record<string, StudioBlueprint> = {
  "iss-campaign": {
    headTitle: "Campaign Promise Alignment · v1",
    headSub: "Built from the approved offer-alignment fix — one promise across pop-up, landing, and lifecycle entry.",
    builtFrom:
      "Klints built this entry-alignment workflow from the campaign fix you approved — the corrected offer rule, UTM-scoped, so the lifecycle entry is triggered on one consistent promise.",
    touchpoints: ["Pop-up", "Landing", "Email", "Contact data", "Consent", "Funnel stage"],
    connected: ["Manago.ai agent · handoff target", "Shopify · campaign + landing", "On-site capture"],
    identity: [
      { k: "Name", v: "Campaign Promise Alignment" },
      { k: "Version", v: "v1.0.0" },
      { k: "Lifecycle stage", v: "Acquisition · entry" },
      { k: "Owner", v: "Anton Král · Growth Lead" },
      { k: "Status", v: "Ready for QA" },
      { k: "Change set", v: "chg_lumera_campaign_017" },
    ],
    steps: [
      {
        title: "1 · Enforce aligned offer on campaign UTM",
        desc: "Pop-up offer matches the campaign promise for summer26 traffic only. Non-campaign visitors keep the 10% baseline.",
        fields: ["utm_campaign = summer26", "offer = up_to_30_pct"],
      },
      {
        title: "2 · Restate offer on landing hero",
        desc: "Campaign-aware hero restates the 30% promise in the first viewport so the message survives the click.",
        fields: ["surface = landing_hero", "copy = campaign_aware"],
      },
      {
        title: "3 · Trigger lifecycle entry on clean capture",
        desc: "On-site capture tags the contact and fills required properties so Welcome Series entry fires on one consistent promise.",
        fields: ["trigger = email_captured", "tags = campaign_aligned"],
      },
    ],
    requiredFields: [
      { field: "klints_campaign_offer", source: "Klints writeback", status: "Pending apply" },
      { field: "utm_campaign", source: "Shopify / ads", status: "Present" },
      { field: "klints_consent_email_safe", source: "Manago.ai", status: "Present" },
    ],
  },
  "iss-identity": {
    headTitle: "Identity Cluster Unification · v1",
    headSub: "Built from the approved clustering policy — unified LTV written to both contacts, no auto-merge.",
    builtFrom:
      "Klints built this identity-cluster workflow from the fix you approved — the clustering policy (confidence ≥ 0.90, no auto-merge) that resolves guest and Apple Pay relay contacts to one person.",
    touchpoints: ["Contact data", "Loyalty", "Funnel stage", "Consent", "Key Information", "Email"],
    connected: ["Manago.ai agent · handoff target", "Shopify · orders + checkout", "Payment fingerprint"],
    identity: [
      { k: "Name", v: "Identity Cluster Unification" },
      { k: "Version", v: "v1.0.0" },
      { k: "Lifecycle stage", v: "Loyalty · VIP tiering" },
      { k: "Owner", v: "Mara Evstratova · Head of CRM" },
      { k: "Status", v: "Ready for QA" },
      { k: "Change set", v: "chg_lumera_identity_033" },
    ],
    steps: [
      {
        title: "1 · Apply clustering policy ≥ 0.90",
        desc: "Auto-cluster pairs with ≥ 2 deterministic signals; route 0.75–0.90 to manual review. Never merge below 0.75.",
        fields: ["floor = 0.90", "signals ≥ 2"],
      },
      {
        title: "2 · Write unified aggregate to both contacts",
        desc: "True LTV and purchase count written into both contacts in the klints_ namespace — never an auto-merge.",
        fields: ["klints_identity_cluster", "klints_unified_ltv"],
      },
      {
        title: "3 · Re-evaluate VIP and loyalty tiering",
        desc: "Loyalty workflows re-read unified value so high-value repeat buyers enter VIP.",
        fields: ["re_eval = vip_threshold"],
      },
    ],
    requiredFields: [
      { field: "klints_identity_cluster", source: "Klints", status: "Pending approval" },
      { field: "klints_unified_ltv", source: "Klints / Shopify", status: "Pending approval" },
      { field: "payment_fingerprint", source: "Payment gateway", status: "Present" },
    ],
  },
  "iss-margin": {
    headTitle: "Margin-Aware Recommendations · v2.1",
    headSub: "Built from the approved margin re-rank — relevance from Manago, margin from Shopify, re-ranked within the relevant set.",
    builtFrom:
      "Klints built this re-rank workflow from the margin fix you approved — relevance from Manago, margin from Shopify, re-ranked within the relevant set.",
    touchpoints: ["Reco frame", "Re-rank policy", "Price + stock", "Email", "Coupon"],
    connected: ["Manago.ai agent · handoff target", "Shopify · cost / margin", "On-site reco frame"],
    identity: [
      { k: "Name", v: "Margin-Aware Recommendations" },
      { k: "Version", v: "v2.1.0" },
      { k: "Lifecycle stage", v: "Expansion · cross-sell" },
      { k: "Owner", v: "Tomáš Liška · CRM Manager" },
      { k: "Status", v: "Ready for QA" },
      { k: "Change set", v: "chg_lumera_margin_051" },
    ],
    steps: [
      {
        title: "1 · Pull Manago relevance set",
        desc: "Read the products Manago already judged relevant for the segment — never invent SKUs for margin alone.",
        fields: ["source = manago.agent.relevance_set"],
      },
      {
        title: "2 · Inject Shopify margin + floor",
        desc: "Join cost/margin_pct; drop SKUs below 38% floor from promotion (keep if still relevant).",
        fields: ["floor = 0.38", "join = shopify.sku.margin"],
      },
      {
        title: "3 · Re-rank within relevance",
        desc: "Favour profit inside the relevant set; stage the re-rank spec for Manago human activation.",
        fields: ["output = ranked_relevance_set"],
      },
      {
        title: "4 · Scope on-site reco frame",
        desc: "Tag-gated frame shows the re-ranked set only to eligible contacts — no store-wide change.",
        fields: ["gate = klints_reco_frame_eligible"],
      },
    ],
    requiredFields: [
      { field: "klints_sku_margin_safe", source: "Shopify", status: "Present" },
      { field: "manago.agent.relevance_set", source: "Manago.ai", status: "Present" },
      { field: "klints_reco_frame_eligible", source: "Klints writeback", status: "On trigger" },
    ],
  },
  "iss-untapped": {
    headTitle: "Second Purchase Accelerator · v1",
    headSub: "Opportunity identified by Klints — data ready, no fix required. Omnichannel brief for 1,247 repeat buyers.",
    builtFrom:
      "Klints detected this segment gap during its lifecycle coverage scan — 1,247 repeat buyers with no active workflow. Data readiness confirmed. Klints assembled this workflow brief for the Manago.ai agent (external · staged handoff).",
    touchpoints: ["Segment", "Email", "SMS", "Web Push", "Paid retargeting", "Reco frame"],
    connected: ["Manago.ai agent · handoff target", "Shopify · order history", "Meta / Google · paid retargeting"],
    identity: [
      { k: "Name", v: "Second Purchase Accelerator" },
      { k: "Version", v: "v1.0.0" },
      { k: "Lifecycle stage", v: "Expansion · second purchase" },
      { k: "Owner", v: "Tomáš Liška · CRM Manager" },
      { k: "Status", v: "Ready to build · €46K /q" },
      { k: "Segment", v: "klints_segment.repeat_no_loyalty" },
    ],
    steps: [
      {
        title: "1 · Detect segment entry",
        desc: "Daily check for repeat_no_loyalty. Event-driven entry with 90-day cooldown.",
        fields: ["trigger = repeat_no_loyalty", "cooldown = 90d"],
      },
      {
        title: "2 · Engagement split",
        desc: "Split on email engagement tier before any send — active openers vs dormant 60d+.",
        fields: ["split = klints_email_engagement_tier"],
      },
      {
        title: "3 · Email · D+0 · Relationship touch",
        desc: "Acknowledge purchase history; reintroduce range. No hard sell yet.",
        fields: ["channel = email", "offer = none"],
      },
      {
        title: "4 · Email · D+3 · Second purchase offer",
        desc: "Free EU shipping ≥ €55 — margin-safe. SKUs from Manago relevance set.",
        fields: ["offer = free_shipping_eur55"],
      },
      {
        title: "5 · Exit + measurement",
        desc: "Exit on purchase or opt-out. 14-day attribution · 10% holdout.",
        fields: ["attribution = 14d", "holdout = 10%"],
      },
    ],
    requiredFields: [
      { field: "klints_purchase_count", source: "Shopify", status: "OK · 100%" },
      { field: "klints_consent_email_safe", source: "Manago.ai", status: "OK · 98.7%" },
      { field: "klints_active_loyalty_workflow", source: "Klints", status: "OK · 100%" },
    ],
  },
};

export type QaGateStatus = "Passed" | "Failed" | "Warning" | "Running";

export type QaRun = {
  id: string;
  issueId: string;
  title: string;
  status: "Ready" | "Running" | "Failed" | "Passed";
  impact: number;
  impactType: ImpactType;
  dimension: string;
  runId: string;
  ranAt: string;
  workflowId: string;
  summary: string;
  eyebrow: string;
  touchpoints: string[];
  gates: { name: string; desc: string; status: QaGateStatus }[];
};

/** Phase 4 · items ready for / in QA validation */
export const qaRuns: QaRun[] = [
  {
    id: "qa-campaign",
    issueId: "iss-campaign",
    title: "Campaign promise mismatch",
    status: "Ready",
    impact: 54000,
    impactType: "revenue",
    dimension: "Channel & Consent",
    runId: "QA#40",
    ranAt: "Just now",
    workflowId: "wf-campaign-align",
    eyebrow: "Acquisition · €54K revenue · blocked",
    summary:
      "Klints selected the gates that keep the entry chain consistent — offer, hold, consent and measurement. Klints supplies the cross-stack context; the Manago.ai agent builds the workflow.",
    touchpoints: ["Pop-up", "Landing", "Email", "Contact data", "Consent", "Funnel stage"],
    gates: [
      { name: "Offer consistency across ad → pop-up → landing", desc: "Campaign 30% vs pop-up 10% now aligned on the shared landing URL", status: "Passed" },
      { name: "Campaign hold enforced until chain consistent", desc: "Campaign paused; resumes only when all three surfaces match", status: "Passed" },
      { name: "Consent & suppression safe", desc: "Suppression list synced; no contact of opted-out profiles", status: "Passed" },
      { name: "Duplicate-send prevention", desc: "48h cool-off across overlapping flows", status: "Passed" },
      { name: "Measurement events mapped", desc: "Conversion events reconciled", status: "Passed" },
      { name: "Landing URL reachable & tracked", desc: "200 OK; UTM + event tracking present", status: "Passed" },
    ],
  },
  {
    id: "qa-identity",
    issueId: "iss-identity",
    title: "Identity fragmentation",
    status: "Ready",
    impact: 38000,
    impactType: "revenue",
    dimension: "Customer Identity",
    runId: "QA#39",
    ranAt: "8 min ago",
    workflowId: "wf-identity-unify",
    eyebrow: "Loyalty · €38K revenue · blocked",
    summary:
      "Klints selected the gates that protect identity integrity — cluster confidence, no auto-merge, consent inheritance — because identity resolution lives in the commerce layer.",
    touchpoints: ["Contact data", "Loyalty", "Funnel stage", "Consent", "Key Information", "Email"],
    gates: [
      { name: "Identity cluster confidence ≥ threshold", desc: "Same card, address and name; Apple Pay relay — one person", status: "Passed" },
      { name: "False-merge guard", desc: "Two distinct people at one address are NOT merged", status: "Passed" },
      { name: "Loyalty history reconciled across merged profiles", desc: "Points and order history consolidated across the cluster", status: "Warning" },
      { name: "Consent inheritance after merge", desc: "Most restrictive consent state inherited across the cluster", status: "Passed" },
      { name: "Sandboxed writeback validated", desc: "Merge tested against sandboxed target; 0 conflicts", status: "Passed" },
    ],
  },
  {
    id: "qa-margin",
    issueId: "iss-margin",
    title: "Margin-aware recommendations",
    status: "Ready",
    impact: 12000,
    impactType: "margin",
    dimension: "Business Reality",
    runId: "QA#41",
    ranAt: "12 min ago",
    workflowId: "wf-margin-rerank",
    eyebrow: "Expansion · €12K margin · leaking",
    summary:
      "Klints selected the gates that keep the re-rank honest — margin floor, relevance preserved, re-rank only within the relevant set.",
    touchpoints: ["Reco frame", "Re-rank policy", "Price + stock", "Email", "Coupon"],
    gates: [
      { name: "Margin source connected", desc: "Per-SKU margin from Shopify cost fields connected", status: "Passed" },
      { name: "Re-rank stays within Manago’s relevant set", desc: "No product surfaced for margin alone", status: "Passed" },
      { name: "Relevance signal intact post re-rank", desc: "Relevance ordering preserved; margin as tie-aware weighting", status: "Passed" },
      { name: "Margin floor respected", desc: "All re-ranked SKUs above the configured margin floor", status: "Passed" },
    ],
  },
  {
    id: "qa-untapped",
    issueId: "iss-untapped",
    title: "Second Purchase Accelerator",
    status: "Ready",
    impact: 46000,
    impactType: "opportunity",
    dimension: "Customer segments & fields",
    runId: "QA#38",
    ranAt: "5h ago",
    workflowId: "wf-second-purchase",
    eyebrow: "Expansion · €46K revenue · opportunity",
    summary:
      "Klints selected the gates that protect a net-new workflow — data readiness, collision, consent gating and measurement — because this segment has no prior coverage.",
    touchpoints: ["Segment", "Email", "SMS", "Web Push", "Paid retargeting", "Reco frame"],
    gates: [
      { name: "Logic graph closes · no infinite branches", desc: "Entry → exit paths verified", status: "Passed" },
      { name: "Data readiness · all required fields present", desc: "1,247 profiles · no missing fields", status: "Passed" },
      { name: "Collision check before handoff", desc: "No active workflow targets this segment", status: "Passed" },
      { name: "Consent gates · SMS", desc: "Gated on klints_consent_sms_safe · 96.2%", status: "Passed" },
      { name: "Consent gates · Web Push", desc: "Gated on klints_consent_webpush_safe", status: "Passed" },
      { name: "On-site reco scoped to segment", desc: "Tag-gated · 7-day window", status: "Passed" },
      { name: "Offer economics · margin-safe", desc: "Free shipping margin-safe · floor enforced", status: "Passed" },
      { name: "Measurement readiness · holdout", desc: "10% control · stratified by engagement tier", status: "Passed" },
    ],
  },
];

export type HandoffPackage = {
  id: string;
  issueId: string;
  title: string;
  status: "Ready" | "Sent" | "Blocked";
  impact: number;
  impactType: ImpactType;
  dimension: string;
  runId: string;
  qaRunId: string;
  ranAt: string;
  workflowId: string;
  summary: string;
  delivery: string;
  changeSetId: string;
  impactBadge: string;
  targets: { name: string; desc: string; channel: string }[];
  packageItems: string[];
  qaMini: string[];
  fields: { key: string; value: string }[];
  machineSpec: Record<string, unknown>;
};

/** Phase 5 · staged packages after QA */
export const handoffPackages: HandoffPackage[] = [
  {
    id: "ho-campaign",
    issueId: "iss-campaign",
    title: "Campaign promise alignment",
    status: "Ready",
    impact: 54000,
    impactType: "revenue",
    dimension: "Channel & Consent",
    runId: "HO#16",
    qaRunId: "QA#40",
    ranAt: "Ready",
    workflowId: "wf-campaign-align",
    summary: "QA cleared · offer chain consistent · ready to stage for human activation.",
    delivery: "Staged package · human activation in Manago.ai",
    changeSetId: "chg_lumera_campaign_017",
    impactBadge: "€54K revenue · blocked",
    targets: [
      { name: "Manago.ai agent", desc: "Workflow brief + aligned offer rule", channel: "Staged handoff" },
      { name: "Manago.ai pop-up", desc: "UTM-scoped offer config", channel: "External" },
      { name: "Shopify campaign", desc: "Hold / resume signal", channel: "API" },
    ],
    packageItems: [
      "Aligned offer rule · UTM-scoped",
      "Welcome Series entry trigger",
      "Consent + suppression snapshot",
      "Measurement event map",
    ],
    qaMini: ["Offer consistency · 3/3", "Consent safe", "Duplicate-send prevention", "Landing tracked"],
    fields: [
      { key: "Writeback", value: "UTM-scoped pop-up offer · 30%" },
      { key: "QA status", value: "Cleared · QA#40" },
    ],
    machineSpec: {
      change_set: "chg_lumera_campaign_017",
      offer: "up_to_30_pct",
      scope: "utm_campaign=summer26",
      entry: "email_captured",
    },
  },
  {
    id: "ho-identity",
    issueId: "iss-identity",
    title: "Identity cluster unification",
    status: "Ready",
    impact: 38000,
    impactType: "revenue",
    dimension: "Customer Identity",
    runId: "HO#15",
    qaRunId: "QA#39",
    ranAt: "Ready",
    workflowId: "wf-identity-unify",
    summary: "QA cleared · clustering policy approved · ready to stage for handoff.",
    delivery: "Staged package · human activation in Manago.ai",
    changeSetId: "chg_lumera_identity_033",
    impactBadge: "€38K revenue · blocked",
    targets: [
      { name: "Manago.ai CDP", desc: "klints_identity_cluster + unified LTV on both contacts", channel: "External" },
      { name: "Shopify", desc: "Match evidence · payment + address", channel: "API" },
    ],
    packageItems: [
      "Clustering policy ≥ 0.90",
      "Unified LTV writeback spec",
      "VIP re-evaluation trigger",
      "False-merge guard rules",
    ],
    qaMini: ["Cluster confidence", "False-merge guard", "Consent inheritance", "Sandbox writeback"],
    fields: [
      { key: "Writeback", value: "klints_identity_cluster · both contacts" },
      { key: "QA status", value: "Cleared · QA#39" },
    ],
    machineSpec: {
      change_set: "chg_lumera_identity_033",
      policy_floor: 0.9,
      auto_merge: false,
      pairs: 1284,
    },
  },
  {
    id: "ho-margin",
    issueId: "iss-margin",
    title: "Margin re-rank package",
    status: "Ready",
    impact: 12000,
    impactType: "margin",
    dimension: "Business Reality",
    runId: "HO#17",
    qaRunId: "QA#41",
    ranAt: "Ready",
    workflowId: "wf-margin-rerank",
    summary: "QA cleared · margin floor + relevance guard passed.",
    delivery: "Staged package · human activation in Manago.ai",
    changeSetId: "chg_lumera_margin_051",
    impactBadge: "€12K margin · leaking",
    targets: [
      { name: "Manago.ai agent", desc: "Re-rank spec within relevance set", channel: "Staged handoff" },
      { name: "Shopify", desc: "Cost / margin feed", channel: "API" },
    ],
    packageItems: [
      "Margin floor ≥ 38%",
      "Relevance guard ≥ 0.70",
      "Re-ranked SKU set",
      "Reco frame tag gate",
    ],
    qaMini: ["Margin source connected", "Re-rank in set", "Relevance intact", "Floor respected"],
    fields: [
      { key: "Writeback", value: "klints_sku_margin_safe · floor 38%" },
      { key: "QA status", value: "Cleared · QA#41" },
    ],
    machineSpec: {
      change_set: "chg_lumera_margin_051",
      margin_floor: 0.38,
      relevance_guard: 0.7,
    },
  },
  {
    id: "ho-untapped",
    issueId: "iss-untapped",
    title: "Second Purchase Accelerator",
    status: "Ready",
    impact: 46000,
    impactType: "opportunity",
    dimension: "Customer segments & fields",
    runId: "HO#18",
    qaRunId: "QA#38",
    ranAt: "5h ago",
    workflowId: "wf-second-purchase",
    summary: "DCS 73 · above build threshold — no data fix; blueprint ready to stage for handoff.",
    delivery: "Staged package · human activation in Manago.ai",
    changeSetId: "chg_lumera_untapped_062",
    impactBadge: "€46K revenue · opportunity",
    targets: [
      { name: "Manago.ai agent", desc: "Omnichannel workflow brief", channel: "Staged handoff" },
      { name: "Manago.ai CDP", desc: "Segment + retargeting writeback fields", channel: "API" },
      { name: "Meta / Google", desc: "Paid retargeting audience (via Manago)", channel: "External" },
    ],
    packageItems: [
      "Segment definition · repeat_no_loyalty",
      "11-step omnichannel brief",
      "Consent gates · SMS / Web Push",
      "10% holdout · measurement plan",
    ],
    qaMini: ["Logic graph", "Data readiness", "Collision check", "Consent gates", "Holdout"],
    fields: [
      { key: "Segment", value: "repeat_no_loyalty · 1,247 contacts" },
      { key: "Holdout", value: "10% control · engagement-stratified" },
    ],
    machineSpec: {
      change_set: "chg_lumera_untapped_062",
      segment: "klints_segment.repeat_no_loyalty",
      contacts: 1247,
      dcs: 73,
    },
  },
];

export function getQaRunForIssue(issueId: string | undefined) {
  if (!issueId) return undefined;
  return qaRuns.find((r) => r.issueId === issueId);
}

export function getHandoffForIssue(issueId: string | undefined) {
  if (!issueId) return undefined;
  return handoffPackages.find((p) => p.issueId === issueId);
}

export function getStudioBlueprint(issueId: string | undefined) {
  if (!issueId) return undefined;
  return studioBlueprints[issueId];
}

export const integrationHealth: Record<
  string,
  { score: number; issueContribution: number; lastCleanRun: string }
> = {
  "Manago.ai": { score: 72, issueContribution: 4, lastCleanRun: "R#146" },
  Shopify: { score: 81, issueContribution: 3, lastCleanRun: "R#148" },
  "Manageo.ai": { score: 72, issueContribution: 4, lastCleanRun: "R#146" },
};

/** Opportunity tracker — results loop (HTML backlog model) */
export type TrackerReadiness = "inflow" | "queued" | "done";
export type TrackerWorkflowState = "pending-handoff" | "in-build" | "active" | "ended";

export type TrackerImpact = {
  value: number | null;
  type: ImpactType | "risk";
  cadence: "/q" | "/y" | null;
};

export type TrackerRow = {
  id: string;
  title: string;
  meta: string;
  handedOff: string | null;
  workflowState: TrackerWorkflowState;
  endedDate: string | null;
  estImpact: TrackerImpact;
  realImpact: TrackerImpact;
  /** Shown instead of € when impact is a risk removal */
  riskLabel?: string;
  status: string;
  readiness: TrackerReadiness;
  owner: string;
  issueId?: string;
  workflowId?: string;
};

export const opportunityTracker: TrackerRow[] = [
  {
    id: "campaign",
    title: "Campaign promise mismatch",
    meta: "Shopify 30% vs Manago.ai pop-up 10% vs landing · lifecycle never enters",
    handedOff: null,
    workflowState: "pending-handoff",
    endedDate: null,
    estImpact: { value: 54000, type: "revenue", cadence: "/q" },
    realImpact: { value: null, type: "revenue", cadence: "/q" },
    status: "Phase 2 · Fix",
    readiness: "inflow",
    owner: "anton.k",
    issueId: "iss-campaign",
    workflowId: "wf-campaign-align",
  },
  {
    id: "identity",
    title: "Identity fragmentation",
    meta: "1,284 contact pairs are one person each · VIPs hidden by split LTV",
    handedOff: null,
    workflowState: "pending-handoff",
    endedDate: null,
    estImpact: { value: 38000, type: "revenue", cadence: "/q" },
    realImpact: { value: null, type: "revenue", cadence: "/q" },
    status: "Phase 2 · Fix",
    readiness: "inflow",
    owner: "mara.e",
    issueId: "iss-identity",
    workflowId: "wf-identity-unify",
  },
  {
    id: "margin",
    title: "Margin-aware recommendations",
    meta: "Re-rank relevant products by profit · connect Shopify margin",
    handedOff: null,
    workflowState: "pending-handoff",
    endedDate: null,
    estImpact: { value: 12000, type: "margin", cadence: "/q" },
    realImpact: { value: null, type: "margin", cadence: "/q" },
    status: "Phase 2 · Fix",
    readiness: "inflow",
    owner: "tomas.l",
    issueId: "iss-margin",
    workflowId: "wf-margin-rerank",
  },
  {
    id: "untapped",
    title: "Untapped segment · revenue identified",
    meta: "1,247 repeat buyers · no active workflow · data ready, no fix required",
    handedOff: null,
    workflowState: "pending-handoff",
    endedDate: null,
    estImpact: { value: 46000, type: "revenue", cadence: "/q" },
    realImpact: { value: null, type: "revenue", cadence: "/q" },
    status: "Opportunity · ready to build",
    readiness: "inflow",
    owner: "tomas.l",
    issueId: "iss-untapped",
    workflowId: "wf-second-purchase",
  },
  {
    id: "consent_sync",
    title: "Consent sync · Shopify ↔ Manago.ai",
    meta: "handed 04-26 · live 05-02 · measured 06-01",
    handedOff: "2026-04-26",
    workflowState: "active",
    endedDate: null,
    estImpact: { value: null, type: "risk", cadence: null },
    realImpact: { value: null, type: "risk", cadence: null },
    riskLabel: "risk removed",
    status: "Done · live",
    readiness: "done",
    owner: "mara.e",
  },
  {
    id: "vip_welcome",
    title: "VIP welcome timing fix",
    meta: "handed 04-10 · live 04-18 · measured 06-08",
    handedOff: "2026-04-10",
    workflowState: "active",
    endedDate: null,
    estImpact: { value: 46000, type: "revenue", cadence: "/q" },
    realImpact: { value: 52000, type: "revenue", cadence: "/q" },
    status: "Done · measured",
    readiness: "done",
    owner: "tomas.l",
  },
  {
    id: "q_nordic",
    title: "Welcome flow v2 · Nordic localisation",
    meta: "SE / NO / DK / FI · brand-board copy ready",
    handedOff: null,
    workflowState: "in-build",
    endedDate: null,
    estImpact: { value: 44000, type: "revenue", cadence: "/y" },
    realImpact: { value: null, type: "revenue", cadence: "/y" },
    status: "Queued · ready",
    readiness: "queued",
    owner: "mara.e",
  },
  {
    id: "q_paid",
    title: "Paid high-CAC activation",
    meta: "Waiting on consent flag fix · Shopify ↔ Manago.ai",
    handedOff: null,
    workflowState: "in-build",
    endedDate: null,
    estImpact: { value: 86000, type: "revenue", cadence: "/y" },
    realImpact: { value: null, type: "revenue", cadence: "/y" },
    status: "Queued · waiting",
    readiness: "queued",
    owner: "anton.k",
  },
  {
    id: "q_crosssell",
    title: "Cross-sell · serum → moisturizer",
    meta: "Active · v2 expansion to new serum line",
    handedOff: null,
    workflowState: "in-build",
    endedDate: null,
    estImpact: { value: 58000, type: "revenue", cadence: "/y" },
    realImpact: { value: null, type: "revenue", cadence: "/y" },
    status: "Queued · ready",
    readiness: "queued",
    owner: "mara.e",
  },
  {
    id: "q_sms",
    title: "Welcome flow v2 · SMS arm",
    meta: "Manago.ai SMS · DE / NL launch",
    handedOff: null,
    workflowState: "in-build",
    endedDate: null,
    estImpact: { value: 31000, type: "revenue", cadence: "/y" },
    realImpact: { value: null, type: "revenue", cadence: "/y" },
    status: "Queued · ready",
    readiness: "queued",
    owner: "tomas.l",
  },
  {
    id: "q_conflict",
    title: "Workflow conflict · winback / lapse overlap",
    meta: "Double-send risk in 7-day exit window",
    handedOff: null,
    workflowState: "pending-handoff",
    endedDate: null,
    estImpact: { value: null, type: "risk", cadence: "/q" },
    realImpact: { value: null, type: "risk", cadence: "/q" },
    riskLabel: "governance",
    status: "Tracked · governance",
    readiness: "inflow",
    owner: "mara.e",
    issueId: "iss-conflict",
    workflowId: "wf-campaign-align",
  },
];

export function formatTrackerImpact(imp: TrackerImpact, riskLabel?: string): string {
  if (riskLabel) return riskLabel;
  if (imp.value == null) return "—";
  const label =
    imp.type === "margin" ? "mar" : imp.type === "opportunity" ? "opp" : imp.type === "risk" ? "risk" : "rev";
  const cadence = imp.cadence ? ` ${imp.cadence}` : "";
  return `${formatCurrency(imp.value, { compact: true })}${cadence} ${label}`;
}

export function workflowStateLabel(state: TrackerWorkflowState, endedDate?: string | null): string {
  switch (state) {
    case "active":
      return "Active · live";
    case "ended":
      return endedDate ? `Ended (${endedDate})` : "Ended";
    case "in-build":
      return "In build";
    case "pending-handoff":
      return "Not yet live";
    default:
      return "—";
  }
}
