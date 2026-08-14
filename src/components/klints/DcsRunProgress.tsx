import {
  formatStageCustomerCopy,
  isDcsScoreReady,
  resolvePrimaryBlocker,
  type DcsAppStatus,
  type DcsIssue,
  type DcsRunProgress as DcsRunProgressPayload,
  type DcsRunStage,
} from "@/lib/dcs";
import {
  highlightSearchText,
  normalizeSearchQuery,
  textMatchesQuery,
} from "@/lib/overview-search";
import { cn } from "@/lib/utils";

function stageStateClass(state: DcsRunStage["state"]): string {
  switch (state) {
    case "running":
      return "dcs-stage-tile--running";
    case "passed":
      return "dcs-stage-tile--passed";
    case "failed":
      return "dcs-stage-tile--failed";
    case "skipped":
      return "dcs-stage-tile--skipped";
    default:
      return "dcs-stage-tile--pending";
  }
}

function stageStatusLabel(state: DcsRunStage["state"]): string {
  switch (state) {
    case "running":
      return "Running";
    case "passed":
      return "Passed ✓";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Waiting";
  }
}

function StageTile({
  stage,
  primaryBlocker,
  searchQuery = "",
  activeId = null,
}: {
  stage: DcsRunStage;
  primaryBlocker: ReturnType<typeof resolvePrimaryBlocker>;
  searchQuery?: string;
  activeId?: string | null;
}) {
  const isRunning = stage.state === "running";
  const customer =
    stage.state === "failed" || stage.state === "passed"
      ? formatStageCustomerCopy(stage, primaryBlocker)
      : null;
  const searchId = `run-${stage.dimension_id}`;
  const searchable = [
    stage.label,
    stageStatusLabel(stage.state),
    customer?.line1,
    customer?.line2,
    "Run progress",
  ]
    .filter(Boolean)
    .join(" ");
  const matches = Boolean(normalizeSearchQuery(searchQuery)) && textMatchesQuery(searchable, searchQuery);

  return (
    <div
      data-ov-search-id={searchId}
      className={cn(
        "dcs-stage-tile",
        stageStateClass(stage.state),
        matches && "ov-search-hit",
        activeId === searchId && "ov-search-hit--active",
      )}
      aria-current={isRunning ? "step" : undefined}
    >
      <div className="dcs-stage-tile__label">
        {highlightSearchText(stage.label, searchQuery)}
      </div>
      <div className="dcs-stage-tile__status">
        {highlightSearchText(stageStatusLabel(stage.state), searchQuery)}
      </div>

      {stage.state === "failed" && customer?.line1 ? (
        <div className="dcs-stage-tile__copy">
          <div className="dcs-stage-tile__reason">
            <p>{highlightSearchText(customer.line1, searchQuery)}</p>
          </div>
          {customer.line2 ? (
            <div className="dcs-stage-tile__next">
              <p>{highlightSearchText(customer.line2, searchQuery)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {stage.state === "passed" && customer?.line1 ? (
        <div className="dcs-stage-tile__copy">
          <p className="dcs-stage-tile__waiting">
            {highlightSearchText(customer.line1, searchQuery)}
          </p>
          {customer.line2 ? (
            <p className="dcs-stage-tile__waiting">
              {highlightSearchText(customer.line2, searchQuery)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DcsStageGrid({
  runProgress,
  lockReason,
  issues = [],
  scoreReady: _scoreReady,
  className,
  searchQuery = "",
  activeId = null,
}: {
  runProgress: DcsRunProgressPayload | null | undefined;
  lockReason?: string | null;
  issues?: DcsIssue[];
  /** Kept for call-site compatibility; passed tiles no longer vary by this. */
  scoreReady?: boolean;
  className?: string;
  searchQuery?: string;
  activeId?: string | null;
}) {
  const stages = runProgress?.stages ?? [];
  const showNoRunMessage = lockReason === "no_run";
  const primaryBlocker = resolvePrimaryBlocker(stages, issues);

  if (showNoRunMessage && stages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No score run yet — connect stack to start.
      </p>
    );
  }

  return (
    <div className={cn("dcs-stage-grid", className)}>
      {stages.map((stage) => (
        <StageTile
          key={stage.dimension_id}
          stage={stage}
          primaryBlocker={primaryBlocker}
          searchQuery={searchQuery}
          activeId={activeId}
        />
      ))}
    </div>
  );
}

export function DcsRunProgress({
  runProgress,
  lockReason,
  issues = [],
  status,
}: {
  runProgress: DcsRunProgressPayload | null | undefined;
  lockReason: string | null;
  issues?: DcsIssue[];
  status?: DcsAppStatus | null;
}) {
  return (
    <div className="dcs-run-progress-card">
      <div className="dcs-run-progress-card__head">
        <h3 className="dcs-run-progress-card__title">Run progress</h3>
        <p className="dcs-run-progress-card__sub">
          How far the latest Data Consistency run got across dimensions
        </p>
      </div>
      <div className="dcs-run-progress-card__body">
        <DcsStageGrid
          runProgress={runProgress}
          lockReason={lockReason}
          issues={issues}
          scoreReady={status ? isDcsScoreReady(status) : undefined}
        />
      </div>
    </div>
  );
}
