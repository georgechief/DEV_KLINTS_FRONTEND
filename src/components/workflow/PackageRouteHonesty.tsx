import {
  packageResolutionLine,
  packageRouteSummary,
  type CapabilityResolutionRow,
} from "@/lib/capability-route";

type PackageRouteHonestyProps = {
  route: string | undefined | null;
  capabilityResolution?: CapabilityResolutionRow[] | null;
  /** Tighter mono line under the label (Studio card vs QA eyebrow). */
  className?: string;
};

/** CAP-01 route chip + honest copy + UPSERT resolution line. */
export function PackageRouteHonesty({
  route,
  capabilityResolution,
  className,
}: PackageRouteHonestyProps) {
  const routeInfo = packageRouteSummary(route);
  const resolution = packageResolutionLine(capabilityResolution);
  return (
    <div
      className={
        className
          ? `flex flex-wrap items-start gap-2 ${className}`
          : "flex flex-wrap items-start gap-2"
      }
    >
      <span className="inline-flex items-center rounded-md border border-border bg-elevated px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-foreground">
        {routeInfo.code}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] normal-case tracking-normal leading-snug text-[rgb(22_22_26/0.78)]">
          {routeInfo.label}
        </div>
        {resolution ? (
          <div className="mt-0.5 font-mono text-[11px] normal-case tracking-normal text-muted-foreground">
            {resolution}
          </div>
        ) : null}
      </div>
    </div>
  );
}
