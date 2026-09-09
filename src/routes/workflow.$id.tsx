import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/klints/AppShell";
import { LEGACY_WORKFLOW_TO_UC, UC_ID_RE } from "@/lib/use-cases";

export const Route = createFileRoute("/workflow/$id")({
  validateSearch: (search: Record<string, unknown>): { issue?: string } =>
    typeof search.issue === "string" ? { issue: search.issue } : {},
  beforeLoad: ({ params }) => {
    const id = params.id.trim();
    const upper = id.toUpperCase();
    if (UC_ID_RE.test(upper)) {
      throw redirect({
        to: "/workflow",
        search: { uc: upper },
      });
    }
    const uc = LEGACY_WORKFLOW_TO_UC[id];
    if (uc) {
      throw redirect({
        to: "/workflow",
        search: { uc },
      });
    }
  },
  head: () => ({
    meta: [{ title: "Workflow — Klints" }],
  }),
  component: LegacyWorkflowRedirect,
});

/** Legacy fixture route — live BL-016 uses /workflow?uc=UC-xx (PRD §7.5). */
function LegacyWorkflowRedirect() {
  return (
    <AppShell title="Workflow Studio">
      <div className="flow-empty">
        <p className="text-sm text-muted-foreground">
          Fixture workflow ids are retired. Open a ready pilot from Opportunities or use{" "}
          <code className="text-[12px]">/workflow?uc=UC-02</code>.
        </p>
        <Link
          to="/workflow"
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          Go to Workflow Studio
        </Link>
      </div>
    </AppShell>
  );
}
