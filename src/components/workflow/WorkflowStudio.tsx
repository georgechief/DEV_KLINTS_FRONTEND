import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { ArrowRight, Download, GitBranch, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/klints/AppShell";
import { StatusBadge } from "@/components/klints/primitives";
import { getApiErrorMessage, listConnectors } from "@/lib/connectors";
import { getCurrentUser } from "@/lib/auth";
import {
  BUILD_PACKAGE_QUERY_KEY,
  generateBuildPackage,
  getBuildPackage,
  getUseCase,
  getUseCaseRecommendations,
  isBuildableStatus,
  isSupplementalBlocker,
  isSupplementalGate,
  pilotStatusLabel,
  pilotStatusTone,
  pilotsUnblockedByCheck,
  supplementalBlockingEntries,
  UC_DETAIL_QUERY_KEY,
  UC_RECOMMENDATIONS_QUERY_KEY,
  UC_STALE_MS,
  type BuildPackageResponse,
  type UseCaseBlocker,
  type UseCaseDetailResponse,
  type UseCasePilotRecommendation,
} from "@/lib/use-cases";
import { packageRouteSummary } from "@/lib/capability-route";
import { PackageRouteHonesty } from "@/components/workflow/PackageRouteHonesty";

type WorkflowStudioProps = {
  uc: string;
  packageId?: string;
  /** Selected DCS/Fix check — design “Open approved fix” back-link. */
  issue?: string;
};

function studioSearch(
  uc: string,
  opts?: { packageId?: string; issue?: string },
) {
  return {
    uc,
    ...(opts?.packageId ? { package_id: opts.packageId } : {}),
    ...(opts?.issue ? { issue: opts.issue } : {}),
  };
}

function statusChipClass(tone: "ready" | "warn" | "risk" | "muted"): string {
  switch (tone) {
    case "ready":
      return "bg-revenue/15 text-revenue";
    case "warn":
      return "bg-warn/15 text-warn";
    case "risk":
      return "bg-risk/15 text-risk";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function blockerHref(blocker: UseCaseBlocker): string | null {
  // DCS-09: supplemental gates are not on the headline worklist.
  if (isSupplementalBlocker(blocker)) return null;
  if (blocker.href) return blocker.href;
  if (blocker.check_id) return `/data-consistency?issue=${blocker.check_id}`;
  return null;
}

function BlockerLink({ blocker }: { blocker: UseCaseBlocker }) {
  const href = blockerHref(blocker);
  if (!href) {
    return (
      <span>
        {blocker.detail}
        {isSupplementalBlocker(blocker) ? (
          <span className="ml-1 text-[11px] text-muted-foreground">
            (pilot supplemental)
          </span>
        ) : null}
      </span>
    );
  }
  if (href.startsWith("/fix")) {
    const issue = blocker.check_id ?? "";
    return (
      <Link to="/fix" search={{ issue }} className="text-primary hover:underline">
        {blocker.detail}
      </Link>
    );
  }
  if (href.includes("issue=")) {
    const issue = href.split("issue=")[1]?.split("&")[0] ?? blocker.check_id ?? "";
    return (
      <Link
        to="/data-consistency"
        search={{ issue }}
        className="text-primary hover:underline"
      >
        {blocker.detail}
      </Link>
    );
  }
  return (
    <Link to={href as "/lifecycle"} className="text-primary hover:underline">
      {blocker.detail}
    </Link>
  );
}

function downloadPackageJson(pkg: BuildPackageResponse) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${pkg.use_case_id}-build-package.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function touchpointPills(detail: UseCaseDetailResponse): string[] {
  const pills: string[] = [];
  if (detail.solution_type) pills.push(detail.solution_type);
  for (const platform of detail.target_platform ?? []) {
    if (platform && !pills.includes(platform)) pills.push(platform);
  }
  if (detail.trigger?.description) pills.push(detail.trigger.description);
  return pills.length > 0 ? pills : ["Workflow"];
}

function builtFromCopy(
  pilot: UseCasePilotRecommendation | undefined,
  buildable: boolean,
  fromApprovedFix: boolean,
): string {
  if (!pilot) {
    return "Klints assembled this workflow brief from the pack blueprint — generate a package to stage for handoff.";
  }
  if (fromApprovedFix && buildable) {
    return "Klints built this workflow from the fix you approved. Review each step, then generate a package to stage for handoff — staged, not live.";
  }
  if (!buildable) {
    const first = pilot.blockers[0]?.detail;
    return first
      ? `Blueprint preview from validated pack JSON. Generate stays locked until gates clear — ${first}`
      : "Blueprint preview from validated pack JSON. Generate stays locked until DCS, architecture, and gating checks clear.";
  }
  if (pilot.status === "ready_provisional") {
    const pending = Object.entries(pilot.supplemental_status ?? {})
      .filter(([, v]) => v === "not_evaluated")
      .map(([k]) => k);
    const suffix =
      pending.length > 0
        ? ` Supplemental checks pending: ${pending.join(", ")}.`
        : " Some supplemental preflight checks are not evaluated yet.";
    return `Klints built this workflow from validated data — core gates pass.${suffix} Package is staged, not live.`;
  }
  return "Klints built this workflow from validated data — all gating checks pass. No customer writeback required for this blueprint.";
}

function inferFieldSource(field: string): string {
  const name = field.toLowerCase();
  if (name.startsWith("klints_") || name.startsWith("klints:")) return "Klints";
  if (
    name === "email" ||
    name.includes("email_") ||
    name.endsWith("_email") ||
    name.includes("consent") ||
    name.includes("smclient") ||
    name.startsWith("manago.")
  ) {
    return "Manago.ai";
  }
  if (
    name.includes("purchase") ||
    name.includes("order") ||
    name.includes("product") ||
    name.includes("sku") ||
    name.includes("inventory") ||
    name === "contact_id" ||
    name.includes("customer_id") ||
    name.includes("shopify")
  ) {
    return "Shopify";
  }
  return "Blueprint";
}

function formatSchemaVersion(version: string | null | undefined): string {
  if (!version) return "—";
  return /^v/i.test(version) ? version : `v${version}`;
}

function studioSteps(
  pkg: BuildPackageResponse | undefined,
  detail: UseCaseDetailResponse | undefined,
) {
  const detailNodes = detail?.workflow_summary?.nodes ?? [];
  const fieldsByNodeId = new Map(
    detailNodes
      .filter((node) => node.node_id)
      .map((node) => [node.node_id as string, node.fields ?? []]),
  );
  const fromPkg = pkg?.human_guide?.steps;
  if (fromPkg && fromPkg.length > 0) {
    return fromPkg.map((step) => ({
      ...step,
      fields:
        step.fields && step.fields.length > 0
          ? step.fields
          : (step.node_id ? fieldsByNodeId.get(step.node_id) : undefined) ?? [],
    }));
  }
  return detailNodes.map((node) => ({
    node_id: node.node_id,
    node_type: node.node_type,
    title: node.label ?? node.platform_primitive ?? node.node_id,
    description: node.description ?? node.platform_primitive,
    fields: node.fields ?? [
      ...(node.configured_by ? [`configured_by = ${node.configured_by}`] : []),
      ...(node.executed_by ? [`executed_by = ${node.executed_by}`] : []),
    ],
  }));
}

function identityRows(
  uc: string,
  detail: UseCaseDetailResponse,
  pilot: UseCasePilotRecommendation,
  pkg: BuildPackageResponse | undefined,
): Array<{ k: string; v: string }> {
  const lifecycle =
    detail.primary_stage_ids?.length > 0
      ? detail.primary_stage_ids.join(" · ")
      : "—";
  const roles = (detail.approval?.roles ?? []).map((role) =>
    role === "CRM_OWNER" || role === "DATA_OWNER" ? "ADMIN" : role,
  );
  const uniqueRoles = [...new Set(roles)];
  const hash = detail.content_hash?.slice(0, 12);
  const routeInfo = packageRouteSummary(pkg?.route);
  return [
    { k: "Name", v: detail.title },
    { k: "Version", v: formatSchemaVersion(detail.schema_version) },
    { k: "Use case", v: uc },
    { k: "Lifecycle stage", v: lifecycle },
    { k: "Status", v: pilotStatusLabel(pilot.status) },
    { k: "Owner", v: uniqueRoles.length > 0 ? uniqueRoles.join(" · ") : "ADMIN" },
    // CAP-01: live package route only — never pilot.execution.fallback (capability id).
    { k: "Build route", v: pkg ? routeInfo.code : "—" },
    ...(hash ? [{ k: "Change set", v: hash }] : []),
  ];
}

function packageForPilot(
  uc: string,
  fetched: BuildPackageResponse | undefined,
  generated: BuildPackageResponse | undefined,
): BuildPackageResponse | undefined {
  if (fetched?.use_case_id === uc) return fetched;
  if (generated?.use_case_id === uc) return generated;
  return undefined;
}

export function WorkflowStudio({ uc, packageId, issue }: WorkflowStudioProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const recQuery = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  const detailQuery = useQuery({
    queryKey: [...UC_DETAIL_QUERY_KEY, uc],
    queryFn: () => getUseCase(uc),
    staleTime: UC_STALE_MS,
  });

  const packageQuery = useQuery({
    queryKey: [...BUILD_PACKAGE_QUERY_KEY, packageId],
    queryFn: () => getBuildPackage(packageId!),
    enabled: Boolean(packageId),
    staleTime: UC_STALE_MS,
  });

  const connectorsQuery = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    staleTime: UC_STALE_MS,
  });

  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentUser,
    staleTime: UC_STALE_MS,
  });

  const pilot = useMemo(
    () => recQuery.data?.pilots.find((p) => p.use_case_id === uc),
    [recQuery.data, uc],
  );

  const generateMutation = useMutation({
    mutationFn: () => generateBuildPackage(uc),
    onSuccess: (pkg) => {
      queryClient.setQueryData([...BUILD_PACKAGE_QUERY_KEY, pkg.package_id], pkg);
      toast.success("Build package generated", {
        description: `${pkg.use_case_id} · ${packageRouteSummary(pkg.route).code} · staged not live`,
      });
      void navigate({
        to: "/workflow",
        search: studioSearch(uc, { packageId: pkg.package_id, issue }),
        replace: true,
      });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, "Could not generate build package."));
    },
  });

  useEffect(() => {
    generateMutation.reset();
  }, [uc]); // eslint-disable-line react-hooks/exhaustive-deps -- reset stale package when pilot changes

  const detail = detailQuery.data;
  const pkg = packageForPilot(uc, packageQuery.data, generateMutation.data);
  const buildable = pilot ? isBuildableStatus(pilot.status) : false;
  const canGenerate =
    buildable &&
    userQuery.data?.role !== "VIEWER" &&
    userQuery.data?.role !== undefined;
  const connected = (connectorsQuery.data ?? [])
    .filter((c) => c.status === "connected" || c.status === "degraded")
    .map((c) => c.display_name || c.name);

  const steps = studioSteps(pkg, detail);

  const requiredFields = detail?.data_contract?.required_fields ?? [];

  if (recQuery.isPending || detailQuery.isPending) {
    return (
      <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading pilot blueprint…
      </div>
    );
  }

  if (recQuery.isError || detailQuery.isError) {
    return (
      <div className="flow-empty">
        <p className="text-sm text-muted-foreground">
          {getApiErrorMessage(
            recQuery.error ?? detailQuery.error,
            "Could not load Workflow Studio.",
          )}
        </p>
        <Link to="/opportunities" className="mt-4 text-sm text-primary hover:underline">
          Back to Opportunities
        </Link>
      </div>
    );
  }

  if (!pilot || !detail) {
    return (
      <div className="flow-empty">
        <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
        <h2>Pilot not found</h2>
        <p>{uc} is not in the MVP1 pilot library.</p>
        <Link
          to="/opportunities"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Browse Opportunities <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  /** Only show "Open approved fix" when there is an explicit ?issue= context (arrived from Fix/DCS). */
  const approvedFixId = issue?.trim() || undefined;
  const fromApprovedFix = Boolean(approvedFixId);

  return (
    <div>
      <PageTitle
        kicker="Phase 3 · Build the workflow"
        title={detail.title}
        description={
          detail.business_objective ??
          "Blueprint brief for human fallback build — staged in Manago, not live."
        }
        actions={
          approvedFixId ? (
            <Link
              to="/fix"
              search={{ issue: approvedFixId }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
            >
              Open approved fix
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] tabular text-muted-foreground">{uc}</span>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${statusChipClass(pilotStatusTone(pilot.status))}`}
        >
          {pilotStatusLabel(pilot.status)}
        </span>
        {pilot.gap_suggested ? (
          <span className="rounded bg-risk/15 px-1.5 py-0.5 text-[11px] font-medium text-risk">
            Gap suggested
          </span>
        ) : null}
      </div>

      {pilot.status === "ready_provisional" && buildable ? (
        <div className="flow-provisional-banner mb-4">
          <strong>Provisional build allowed.</strong> Supplemental preflight checks are
          not evaluated yet — the package is honestly staged with{" "}
          <code className="text-[11px]">provisional_supplemental=true</code>. No Manago
          write occurs.
        </div>
      ) : null}

      {packageId && packageQuery.isError ? (
        <div className="flow-card mb-4 border-warn/30 bg-warn/5 text-[13px]">
          {getApiErrorMessage(packageQuery.error, "Could not load saved build package.")}{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() =>
              void navigate({
                to: "/workflow",
                search: studioSearch(uc, { issue }),
                replace: true,
              })
            }
          >
            Clear package link
          </button>
        </div>
      ) : null}

      {packageId &&
      !packageQuery.isPending &&
      !packageQuery.isError &&
      packageQuery.data &&
      packageQuery.data.use_case_id !== uc ? (
        <div className="flow-card mb-4 border-warn/30 bg-warn/5 text-[13px]">
          Package {packageId} belongs to {packageQuery.data.use_case_id}, not {uc}.{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() =>
              void navigate({
                to: "/workflow",
                search: studioSearch(uc, { issue }),
                replace: true,
              })
            }
          >
            Clear package link
          </button>
        </div>
      ) : null}

      {!buildable ? (
        <div className="flow-card mb-4 border-risk/25 bg-risk/[0.03]">
          <div className="flow-section-label">Gates — build blocked</div>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {pilot.blockers.map((b, i) => (
              <li key={`${b.code}-${i}`}>
                <BlockerLink blocker={b} />
              </li>
            ))}
          </ul>
          {supplementalBlockingEntries(pilot).length > 0 ? (
            <div className="mt-3 rounded-md border border-border/70 bg-elevated/40 px-3 py-2 text-[12px] text-muted-foreground">
              <div className="font-medium text-foreground">Pilot supplemental</div>
              <ul className="mt-1 space-y-0.5">
                {supplementalBlockingEntries(pilot).map((row) => (
                  <li key={row.check_id}>
                    <span className="tabular">{row.check_id}</span>
                    {" · "}
                    <span className="font-medium text-loss">{row.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {pilot.blockers.some((b) => !isSupplementalBlocker(b)) ? (
            <Link
              to="/data-consistency"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Review Data Consistency <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Clear pilot supplemental gates to unlock Generate — these checks are
              not on the Data Center score worklist.
            </p>
          )}
        </div>
      ) : null}

      <div className="flow-card anchor-tint">
        <div className="flow-section-label">
          {fromApprovedFix
            ? "Built from your approved fix"
            : buildable
              ? "Built from validated data"
              : "Blueprint preview"}
        </div>
        <p className="text-[13px] leading-relaxed text-foreground">
          {builtFromCopy(pilot, buildable, fromApprovedFix)}
        </p>
        <div className="mt-4">
          <div className="flow-section-label">Touchpoints</div>
          <div className="flow-tp-pills">
            {touchpointPills(detail).map((tp, i) => (
              <span key={tp} className={`flow-tp-pill ${i === 0 ? "primary" : ""}`}>
                {tp}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="flow-section-label">Connected instances</div>
          <div className="flow-tp-pills">
            {connected.length > 0 ? (
              connected.map((c) => (
                <span key={c} className="flow-tp-pill">
                  {c}
                </span>
              ))
            ) : (
              <span className="flow-tp-pill">No connectors connected</span>
            )}
          </div>
        </div>
      </div>

      <div className="flow-card">
        <div className="flow-section-label">Workflow identity</div>
        <div className="flow-kv-grid">
          {identityRows(uc, detail, pilot, pkg).map(
            (row) => (
              <div key={row.k} className="flow-kv">
                <div className="k">{row.k}</div>
                <div className="v">{row.v}</div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="flow-card">
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <div className="flow-section-label !mb-0">
            Workflow Klints assembled — {steps.length} steps
          </div>
        </div>
        {steps.map((step, index) => (
          <div key={step.node_id ?? step.title ?? index} className="flow-step">
            <div className="flow-step-title">
              {index + 1} · {step.title ?? step.node_id}
              {step.node_type ? (
                <span className="ml-2 text-[10px] font-normal uppercase text-muted-foreground">
                  {step.node_type}
                </span>
              ) : null}
            </div>
            {step.description ? (
              <div className="flow-step-desc">{step.description}</div>
            ) : null}
            {step.fields && step.fields.length > 0 ? (
              <div className="flow-step-fields">
                {step.fields.map((field) => (
                  <span key={field}>{field}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!pkg && detail.workflow_summary?.truncated ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Node list truncated in preview — full graph in generated package.
          </p>
        ) : null}
      </div>

      {requiredFields.length > 0 ? (
        <div className="flow-card">
          <div className="flow-section-label">Required fields</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Field</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requiredFields.map((field) => (
                  <tr key={field}>
                    <td className="py-2.5 pr-3 font-mono text-[11px]">{field}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {inferFieldSource(field)}
                    </td>
                    <td className="py-2.5 font-medium">
                      {buildable ? "Present" : "Pending gates"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flow-section-label">Build package (BL-016)</div>
            <p className="text-[13px] text-muted-foreground">
              Human guide + machine package JSON — staged, not sent to Manago.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canGenerate ? (
              <button
                type="button"
                disabled={generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
                className="flow-cta"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>Generate build package</>
                )}
              </button>
            ) : userQuery.data?.role === "VIEWER" ? (
              <span className="text-[12px] text-muted-foreground">
                Viewers can download packages; Analyst or Admin role required to generate.
              </span>
            ) : !buildable ? (
              <span className="text-[12px] text-muted-foreground">
                Clear gates to generate a package.
              </span>
            ) : null}
            {pkg ? (
              <button
                type="button"
                onClick={() => downloadPackageJson(pkg)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3.5 py-2 text-sm font-medium hover:bg-sand"
              >
                <Download className="h-4 w-4" /> Download JSON
              </button>
            ) : null}
          </div>
        </div>
        {pkg ? (
          <div className="mt-4 space-y-2 rounded-md border border-border bg-sand/30 px-3 py-2.5 text-[12px]">
            <div>
              <span className="font-medium">{pkg.package_id}</span>
              <span className="text-muted-foreground">
                {pkg.hashes?.package_content_hash
                  ? ` · hash ${pkg.hashes.package_content_hash.slice(0, 12)}…`
                  : ""}
                {pkg.provisional_supplemental ? " · provisional" : ""}
              </span>
            </div>
            <PackageRouteHonesty
              route={pkg.route}
              capabilityResolution={pkg.capability_resolution}
            />
            {pkg ? (
              <div
                className="font-mono text-[11px] text-muted-foreground"
                data-testid="handoff-package-spec-format"
              >
                Spec {pkg.handoff_stub?.format?.trim() || "HANDOFF_PACKAGE_SPEC"}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flow-next">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
            Next in the fix flow · phase 4
          </div>
          <div className="font-display mt-1 text-[14px] font-semibold tracking-tight">
            Validate the workflow
          </div>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[rgb(22_22_26/0.65)]">
            Approving sends the assembled workflow to QA validation — every gate runs
            before the package is staged for handoff. No live MCP send.
          </p>
        </div>
        {pkg ? (
          <Link
            to="/qa"
            search={{
              uc,
              package_id: pkg.package_id,
              ...(issue?.trim() ? { issue: issue.trim() } : {}),
            }}
            className="flow-cta"
          >
            Approve workflow → send to QA <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="flow-cta locked">
            {buildable ? "Generate package first" : "Clear gates first"}{" "}
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  );
}

export function WorkflowReadyList({ gateCheckId }: { gateCheckId?: string } = {}) {
  const recQuery = useQuery({
    queryKey: UC_RECOMMENDATIONS_QUERY_KEY,
    queryFn: getUseCaseRecommendations,
    staleTime: UC_STALE_MS,
  });

  const allPilots = recQuery.data?.pilots ?? [];
  const readyCount = allPilots.filter((p) => isBuildableStatus(p.status)).length;
  const gated = gateCheckId ? pilotsUnblockedByCheck(allPilots, gateCheckId) : [];
  const tablePilots =
    gateCheckId && gated.length > 0
      ? [
          ...gated,
          ...allPilots.filter(
            (pilot) => !gated.some((g) => g.use_case_id === pilot.use_case_id),
          ),
        ]
      : allPilots;

  if (recQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading blueprints…
      </div>
    );
  }

  if (recQuery.isError) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {getApiErrorMessage(recQuery.error, "Could not load workflow pilots.")}
      </div>
    );
  }

  const blockingChecks = [
    ...new Set(
      allPilots
        .flatMap((p) => p.blockers.map((b) => b.check_id).filter(Boolean))
        .map((id) => id!.trim().toUpperCase()),
    ),
  ].slice(0, 4);
  const hardBlockingChecks = blockingChecks.filter(
    (checkId) => !isSupplementalGate(checkId),
  );
  const supplementalOnlyBlockers =
    blockingChecks.length > 0 && hardBlockingChecks.length === 0;

  return (
    <div>
      {readyCount === 0 ? (
        <div className="flow-empty mb-6">
          <ListChecks className="h-10 w-10 text-fog" strokeWidth={1.5} />
          <h2>Please select a blueprint</h2>
          <p>
            {gateCheckId
              ? `No buildable pilots are gated on ${gateCheckId} yet. Open a blueprint below to see its brief and remaining gates.`
              : "Open a blueprint to load its package-ready brief. Generate stays locked until DCS, architecture, and gating checks clear."}
          </p>
          {blockingChecks.length > 0 ? (
            <p className="mt-3 max-w-md text-[12px] text-muted-foreground">
              Common blockers:{" "}
              {blockingChecks.map((checkId, i) => (
                <span key={checkId}>
                  {i > 0 ? ", " : ""}
                  {isSupplementalGate(checkId) ? (
                    <span className="font-medium text-foreground">
                      {checkId}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        (supplemental)
                      </span>
                    </span>
                  ) : (
                    <Link
                      to="/data-consistency"
                      search={{ issue: checkId }}
                      className="font-medium text-primary hover:underline"
                    >
                      {checkId}
                    </Link>
                  )}
                </span>
              ))}
              .
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {supplementalOnlyBlockers ? (
              <Link
                to="/opportunities"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Review Opportunities <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to="/data-consistency"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Go to Data Consistency Score <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <Link
              to="/opportunities"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-4 py-2.5 text-sm font-medium hover:bg-sand"
            >
              Opportunities
            </Link>
          </div>
        </div>
      ) : (
        <p className="mb-3 px-1 text-[12px] text-muted-foreground">
          {readyCount} ready · {allPilots.length} in MVP1 library
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Blueprint</th>
              <th className="px-3 py-3 font-medium">Stack</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tablePilots.map((pilot) => {
              const stack =
                pilot.gates.architecture_modes[0]?.replace(/_/g, " ") ?? "Manago";
              const badge =
                pilot.status === "ready"
                  ? "Ready"
                  : pilot.status === "ready_provisional"
                    ? "Opportunity"
                    : "Blocked";
              return (
                <tr key={pilot.use_case_id} className="group hover:bg-sand/60">
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{pilot.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {pilot.use_case_id}
                      {pilot.gap_suggested ? " · gap suggested" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs text-muted-foreground">{stack}</td>
                  <td className="px-3 py-4">
                    <StatusBadge status={badge} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      to="/workflow"
                      search={{ uc: pilot.use_case_id }}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
