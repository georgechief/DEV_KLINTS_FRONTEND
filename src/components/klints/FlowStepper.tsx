import { Link } from "@tanstack/react-router";
import { fixFlowStages } from "@/lib/klints-data";
import { getIssueById, isFixtureIssueId, withIssueSearch } from "@/lib/fix-flow";

export type FlowStepKey = (typeof fixFlowStages)[number]["key"];

/**
 * Global Diagnose → Handoff bar from index (1).html.
 * Neutral when no issue is selected; live when `issueId` / `issueTitle` is set.
 */
export function FlowStepper({
  current,
  issueId,
  issueTitle,
  dataCenterAllowed = true,
}: {
  current: FlowStepKey;
  issueId?: string | null;
  issueTitle?: string | null;
  /** FE-03: gate Diagnose / pick-issue link while DCS routes are locked */
  dataCenterAllowed?: boolean;
}) {
  const currentPhase = fixFlowStages.find((s) => s.key === current)?.phase ?? 1;
  const hasIssue = Boolean(issueId || issueTitle);
  const fixtureIssue = isFixtureIssueId(issueId) ? getIssueById(issueId) : undefined;
  const search = withIssueSearch(issueId);
  const dataCenterSearch = issueId ? { issue: issueId } : undefined;

  return (
    <div
      className={`mb-5 flex flex-wrap items-center gap-0 rounded-lg border border-border p-1 ${
        hasIssue ? "bg-elevated" : "bg-sand/60"
      }`}
    >
      <div className="mb-1.5 flex min-w-0 w-full items-center gap-2.5 border-b border-border px-2.5 py-1.5 sm:mb-0 sm:w-auto sm:border-b-0 sm:border-r sm:py-1.5 sm:pr-3.5 sm:mr-1.5">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
            Working on
          </div>
          <div
            className={`font-display truncate text-[13px] font-semibold tracking-tight ${
              hasIssue ? "text-foreground" : "font-sans italic font-medium text-fog"
            }`}
          >
            {issueTitle ?? fixtureIssue?.title ?? "No issue selected"}
          </div>
        </div>
        {dataCenterAllowed ? (
          <Link
            to="/data-consistency"
            search={dataCenterSearch}
            hash="dcs-issues"
            onClick={() => {
              // Same-route clicks don't remount; scroll explicitly.
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
        className={`flex min-w-0 flex-1 items-center ${hasIssue ? "" : "opacity-55"}`}
      >
        {fixFlowStages.map((stage, i) => {
          const done = hasIssue && stage.phase < currentPhase;
          const isCurrent = hasIssue && stage.phase === currentPhase;
          const to =
            stage.key === "build" && fixtureIssue?.workflowId
              ? `/workflow/${fixtureIssue.workflowId}`
              : stage.to;

          return (
            <div key={stage.key} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <div
                  className={`mx-0.5 h-[1.5px] min-w-3 flex-1 ${
                    done ? "bg-revenue" : "bg-stone"
                  }`}
                />
              )}
              <Link
                to={to}
                search={search}
                className={`flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors sm:px-3 ${
                  isCurrent
                    ? "bg-spark/10"
                    : hasIssue
                      ? "hover:bg-sand"
                      : "pointer-events-none"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px] font-semibold ${
                    done
                      ? "border-revenue bg-revenue text-white"
                      : isCurrent
                        ? "border-spark bg-spark text-white"
                        : "border-stone bg-elevated text-fog"
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
                        : "text-fog"
                  }`}
                >
                  {stage.label}
                </span>
              </Link>
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
