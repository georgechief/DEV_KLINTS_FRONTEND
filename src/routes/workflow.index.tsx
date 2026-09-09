import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { Section } from "@/components/klints/primitives";
import {
  WorkflowReadyList,
  WorkflowStudio,
} from "@/components/workflow/WorkflowStudio";
import { getApiErrorMessage } from "@/lib/connectors";
import { getCheckIdFromSearch } from "@/lib/fix-flow";
import {
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  getUseCaseRecommendations,
  parseWorkflowSearch,
  workflowStudioFromFix,
} from "@/lib/use-cases";

export const Route = createFileRoute("/workflow/")({
  validateSearch: parseWorkflowSearch,
  head: () => ({
    meta: [
      { title: "Workflow Studio — Klints" },
      {
        name: "description",
        content:
          "Validated blueprints for the package builder — Diagnose → Fix → Build → QA → Handoff.",
      },
    ],
  }),
  component: WorkflowList,
});

function WorkflowList() {
  const navigate = useNavigate();
  const { uc, package_id: packageId, issue, check } = Route.useSearch();
  const gateCheckId = getCheckIdFromSearch({ issue, check });

  const recQuery = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  const fromFix = useMemo(() => {
    if (!gateCheckId || !recQuery.data) return undefined;
    return workflowStudioFromFix(recQuery.data.pilots, gateCheckId);
  }, [gateCheckId, recQuery.data]);

  useEffect(() => {
    if (uc || !gateCheckId || !fromFix?.search.uc) return;
    void navigate({
      to: "/workflow",
      search: {
        uc: fromFix.search.uc,
        issue: fromFix.search.issue ?? gateCheckId,
        ...(packageId ? { package_id: packageId } : {}),
      },
      replace: true,
    });
  }, [uc, gateCheckId, fromFix, packageId, navigate]);

  const activeUc = uc ?? fromFix?.search.uc;
  const resolvingPilot = !activeUc && Boolean(gateCheckId) && recQuery.isPending;

  return (
    <AppShell title="Workflow Studio" subtitle="Phase 3 · Build">
      {resolvingPilot ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Resolving pilot for {gateCheckId}…
        </div>
      ) : recQuery.isError && !activeUc ? (
        <div className="flow-empty">
          <p className="text-sm text-muted-foreground">
            {getApiErrorMessage(recQuery.error, "Could not load workflow pilots.")}
          </p>
          <Link
            to="/opportunities"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Browse Opportunities <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : !activeUc ? (
        <>
          <PageTitle
            kicker="Phase 3 · Build the workflow"
            title="Workflow Studio"
            description="Each blueprint packages a diagnosed integrity issue into a staged workflow package."
          />
          <Section
            title="All blueprints"
            description="Open a blueprint to view its brief — generate stays locked until gates pass."
          >
            <div className="px-0 pb-2">
              <WorkflowReadyList gateCheckId={gateCheckId} />
            </div>
          </Section>
        </>
      ) : (
        <WorkflowStudio uc={activeUc} packageId={packageId} issue={gateCheckId} />
      )}
    </AppShell>
  );
}
