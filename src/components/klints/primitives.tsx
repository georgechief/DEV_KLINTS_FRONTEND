import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function MetricCard({
  label,
  value,
  delta,
  tone = "revenue",
  hint,
  icon,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  tone?: "revenue" | "risk" | "loss" | "info" | "neutral";
  hint?: string;
  icon?: ReactNode;
}) {
  const toneMap: Record<string, string> = {
    revenue: "text-revenue",
    risk: "text-risk",
    loss: "text-loss",
    info: "text-info",
    neutral: "text-foreground",
  };
  const bgMap: Record<string, string> = {
    revenue: "bg-revenue-soft",
    risk: "bg-risk-soft",
    loss: "bg-loss-soft",
    info: "bg-info-soft",
    neutral: "bg-muted",
  };
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-elevated p-4 shadow-card transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          <div className={`font-display mt-1.5 text-2xl tabular leading-none ${toneMap[tone]}`}>
            {value}
          </div>
        </div>
        {icon && (
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bgMap[tone]} ${toneMap[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-auto pt-3">
        {hint && (
          <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{hint}</div>
        )}
        <div className="mt-2 min-h-[22px]">
          {delta ? (
            <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {delta.startsWith("-") ? (
                <ArrowDownRight className="h-3 w-3 text-loss" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-revenue" />
              )}
              <span className="tabular">{delta}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "bg-info-soft text-info",
    "In Progress": "bg-accent text-accent-foreground",
    Processing: "bg-accent text-accent-foreground",
    Ready: "bg-revenue-soft text-revenue",
    Draft: "bg-muted text-muted-foreground",
    Completed: "bg-revenue-soft text-revenue",
    Connected: "bg-revenue-soft text-revenue",
    Degraded: "bg-risk-soft text-risk",
    Error: "bg-loss-soft text-loss",
    Cleared: "bg-revenue-soft text-revenue",
    Blocked: "bg-loss-soft text-loss",
    Leaking: "bg-risk-soft text-risk",
    Opportunity: "bg-info-soft text-info",
    Tracked: "bg-muted text-muted-foreground",
    FAIL: "bg-loss-soft text-loss",
    WARN: "bg-risk-soft text-risk",
    Diagnose: "bg-info-soft text-info",
    Fix: "bg-risk-soft text-risk",
    Build: "bg-accent text-accent-foreground",
    QA: "bg-risk-soft text-risk",
    Handoff: "bg-revenue-soft text-revenue",
    Running: "bg-revenue-soft text-revenue",
    Paused: "bg-muted text-muted-foreground",
    Realized: "bg-revenue-soft text-revenue",
    Pending: "bg-muted text-muted-foreground",
    Lost: "bg-loss-soft text-loss",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1.5 rounded px-2 text-[11.5px] font-medium ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
}

export function Section({
  title,
  action,
  description,
  children,
  className = "",
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-lg border border-border bg-elevated ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 pb-3.5 pt-[18px]">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold tracking-[-0.015em] text-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export function Money({ value, tone = "neutral", size = "md" }: {
  value: string;
  tone?: "revenue" | "risk" | "loss" | "info" | "neutral";
  size?: "sm" | "md" | "lg";
}) {
  const toneMap: Record<string, string> = {
    revenue: "text-revenue",
    risk: "text-risk",
    loss: "text-loss",
    info: "text-info",
    neutral: "text-foreground",
  };
  const sizeMap = { sm: "text-xs", md: "text-sm", lg: "font-display text-xl" };
  return <span className={`tabular font-semibold ${toneMap[tone]} ${sizeMap[size]}`}>{value}</span>;
}
