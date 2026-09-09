import { Link } from "@tanstack/react-router";
import { fixFlowStages } from "@/lib/klints-data";
import { getIssueById, isFixtureIssueId } from "@/lib/fix-flow";
import {
  resolveFlowStepperStage,
  type JourneyStageKey,
  type UseCasePilotRecommendation,
} from "@/lib/use-cases";

export type FlowStepKey = (typeof fixFlowStages)[number]["key"];

export type FlowStepperJourneyContext = {
  pilots?: UseCasePilotRecommendation[];
  recommendationsPending: boolean;
  recommendationsSuccess: boolean;
  recommendationsError: boolean;
  packageId?: string;
  ucFromSearch?: string;
  /** Latest package QA — PRD-QA-01 §8.7 Handoff gate. */
  qaStatus?: "PASS" | "FAIL" | null;
  qaPending?: boolean;
  qaRunId?: string;
};

/**
 * Global Diagnose → Handoff bar from index (1).html.
 * PRD-WF-02 §4 — enabled stages navigate with issue/uc context; disabled show tooltips.
 */
export function FlowStepper({
  current,
  issueId,
  issueTitle,
  dataCenterAllowed = true,
  journey,
}: {
  current: FlowStepKey;
  issueId?: string | null;
  issueTitle?: string | null;
  /** FE-03: gate Diagnose / pick-issue link while DCS routes are locked */
  dataCenterAllowed?: boolean;
  /** Live pilot gates + package context for Build/QA/Handoff (PRD-WF-02 Step 3). */
  journey?: FlowStepperJourneyContext;
}) {
  const currentPhase = fixFlowStages.find((s) => s.key === current)?.phase ?? 1;
  const hasIssue = Boolean(issueId || issueTitle);
  const journeyActive =
    hasIssue || Boolean(journey?.packageId || journey?.ucFromSearch);
  const fixtureIssue = isFixtureIssueId(issueId) ? getIssueById(issueId) : undefined;
  const isFixture = Boolean(fixtureIssue);
  const dataCenterSearch = issueId ? { issue: issueId } : undefined;

  const journeyCtx = {
    issueId,
    isFixture,
    legacyWorkflowId: fixtureIssue?.workflowId,
    pilots: journey?.pilots,
    recommendationsPending: journey?.recommendationsPending ?? false,
    recommendationsSuccess: journey?.recommendationsSuccess ?? false,
    recommendationsError: journey?.recommendationsError ?? false,
    packageId: journey?.packageId,
    ucFromSearch: journey?.ucFromSearch,
    dataCenterAllowed,
    qaStatus: journey?.qaStatus,
    qaPending: journey?.qaPending,
    qaRunId: journey?.qaRunId,
  };

  return (
    <div
      className={`mb-5 flex flex-wrap items-center gap-0 rounded-lg border border-border p-1 ${
        journeyActive ? "bg-elevated" : "bg-sand/60"
      }`}
    >
      <div className="mb-1.5 flex min-w-0 w-full items-center gap-2.5 border-b border-border px-2.5 py-1.5 sm:mb-0 sm:w-auto sm:border-b-0 sm:border-r sm:py-1.5 sm:pr-3.5 sm:mr-1.5">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
            Working on
          </div>
          <div
            className={`font-display truncate text-[13px] font-semibold tracking-tight ${
              journeyActive ? "text-foreground" : "font-sans italic font-medium text-fog"
            }`}
          >
            {issueTitle ??
              fixtureIssue?.title ??
              (journey?.ucFromSearch
                ? `${journey.ucFromSearch} · package journey`
                : "No issue selected")}
          </div>
        </div>
        {dataCenterAllowed ? (
          <Link
            to="/data-consistency"
            search={dataCenterSearch}
            hash="dcs-issues"
            onClick={() => {
              requestAnimationFrame(() => {
                document
                  .getElementById("dcs-issues")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            className="shrink-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[10.5px] text-anchor hover:border-ink/20"
          >
            {hasIssue ? "Switch issue" : "Pick one →"}
          </Link>
        ) : (
          <span
            className="shrink-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[10.5px] text-fog opacity-60 cursor-not-allowed"
            title="Available after your Data Consistency Score is calculated"
          >
            {hasIssue ? "Switch issue" : "Pick one →"}
          </span>
        )}
      </div>

      <div
        className={`flex min-w-0 flex-1 items-center ${journeyActive ? "" : "opacity-55"}`}
      >
        {fixFlowStages.map((stage, i) => {
          const stageKey = stage.key as JourneyStageKey;
          const resolution = resolveFlowStepperStage(stageKey, journeyCtx);
          const done = journeyActive && stage.phase < currentPhase;
          const isCurrent = journeyActive && stage.phase === currentPhase;
          const stageEnabled =
            resolution.enabled &&
            (hasIssue ||
              stageKey === "diagnose" ||
              // PRD-QA-01 §8.7 — QA/Handoff can unlock from package/uc without an issue id.
              (stageKey === "qa" &&
                Boolean(journey?.packageId || journey?.ucFromSearch)) ||
              (stageKey === "handoff" && Boolean(journey?.packageId)));

          const stageInner = (
            <>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px] font-semibold ${
                  done
                    ? "border-revenue bg-revenue text-white"
                    : isCurrent
                      ? "border-spark bg-spark text-white"
                      : stageEnabled
                        ? "border-stone bg-elevated text-fog"
                        : "border-stone/70 bg-elevated/80 text-fog/70"
                }`}
              >
                {stage.phase}
              </span>
              <span
                className={`hidden text-[12.5px] font-medium xl:inline ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : done
                      ? "text-foreground/70"
                      : stageEnabled
                        ? "text-fog"
                        : "text-fog/60"
                }`}
              >
                {stage.label}
              </span>
            </>
          );

          const stageClassName = `flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors sm:px-3 ${
            isCurrent
              ? "bg-spark/10"
              : stageEnabled
                ? "hover:bg-sand"
                : "cursor-not-allowed opacity-60"
          }`;

          return (
            <div key={stage.key} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <div
                  className={`mx-0.5 h-[1.5px] min-w-3 flex-1 ${
                    done ? "bg-revenue" : "bg-stone"
                  }`}
                />
              )}
              {stageEnabled ? (
                <Link
                  to={resolution.to}
                  search={resolution.search}
                  className={stageClassName}
                  title={resolution.tooltip}
                >
                  {stageInner}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title={resolution.tooltip}
                  className={stageClassName}
                >
                  {stageInner}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function stepKeyFromPath(pathname: string): FlowStepKey | null {
  if (pathname.startsWith("/data-consistency")) return "diagnose";
  if (pathname.startsWith("/fix")) return "fix";
  if (pathname.startsWith("/workflow")) return "build";
  if (pathname.startsWith("/qa")) return "qa";
  if (pathname.startsWith("/handoff")) return "handoff";
  return null;
}
