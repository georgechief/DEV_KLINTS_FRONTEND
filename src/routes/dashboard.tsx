import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageTitle } from "@/components/klints/AppShell";
import { OverviewPanel } from "@/components/klints/OverviewPanel";
import { KlintsLoader } from "@/components/klints/KlintsLoader";
import {
  DCS_STATUS_QUERY_KEY,
  DCS_STATUS_STALE_MS,
  getDcsRunningRefetchInterval,
  isDcsScoringStuck,
} from "@/lib/app-access";
import { getCurrentUser } from "@/lib/auth";
import { getDcsStatus } from "@/lib/dcs";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Klints" },
      {
        name: "description",
        content: "Governance overview: Data Consistency Score, open issues, and next best fix.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardDcsError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <>
      <PageTitle
        kicker="Workspace"
        title="Executive overview"
        description="We couldn't load your Data Consistency Score status."
      />
      <div className="rounded-xl border border-border bg-elevated p-6 shadow-card md:p-8">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Could not load overview
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          The Data Consistency Score status could not be loaded. Check your connection and try
          again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? "Retrying…" : "Try again"}
        </button>
      </div>
    </>
  );
}

function DashboardPage() {
  const { data: dcsStatus, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: DCS_STATUS_QUERY_KEY,
    queryFn: getDcsStatus,
    staleTime: DCS_STATUS_STALE_MS,
    refetchInterval: (query) => getDcsRunningRefetchInterval(query.state.data),
  });

  const { data: currentUser } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
  });

  const companyName =
    currentUser?.company?.name ?? currentUser?.tenant.name ?? "Workspace";

  const retryStatus = () => {
    void refetch();
  };

  if (isPending && !dcsStatus) {
    return (
      <>
        <KlintsLoader label="Loading overview…" />
        <AppShell title="Executive overview" subtitle={`Governance layer · ${companyName}`}>
          {null}
        </AppShell>
      </>
    );
  }

  if (isError || !dcsStatus) {
    return (
      <AppShell title="Executive overview" subtitle={`Governance layer · ${companyName}`}>
        <DashboardDcsError onRetry={retryStatus} retrying={isFetching} />
      </AppShell>
    );
  }

  return (
    <AppShell title="Executive overview" subtitle={`Governance layer · ${companyName}`}>
      <OverviewPanel dcsStatus={dcsStatus} companyName={companyName} />
    </AppShell>
  );
}
