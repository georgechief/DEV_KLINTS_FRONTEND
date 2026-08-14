import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDcsRevenue, DCS_BUILD_READY_THRESHOLD } from "@/lib/dcs";
import { formatCurrency, issues } from "@/lib/klints-data";
import { roundDisplayScore, formatDisplayCount } from "@/lib/presentation";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import type * as React from "react";

const trendConfig = {
  score: { label: "DCS", color: "#FF5B3D" },
} satisfies ChartConfig;

const dimConfig = {
  score: { label: "Score", color: "#F5F2EB" },
} satisfies ChartConfig;

const statusConfig = {
  count: { label: "Issues", color: "#F5F2EB" },
} satisfies ChartConfig;

const STATUS_COLORS: Record<string, string> = {
  Blocked: "#F87171",
  Leaking: "#D97706",
  Opportunity: "#2E8857",
  Tracked: "#9C9A92",
  FAIL: "#F87171",
  WARN: "#D97706",
  PASS: "#2E8857",
};

function dimFill(score: number) {
  if (score < 60) return "#F87171";
  if (score < 70) return "#D97706";
  return "#2E8857";
}

function shortDimName(name: string) {
  const map: Record<string, string> = {
    "Customer segments & fields": "Segments",
    "Customer Identity": "Identity",
    Measurement: "Measurement",
    "Business Reality": "Business",
    "Lifecycle Event": "Lifecycle",
    "Channel & Consent": "Consent",
    "Product & Transaction": "Product",
  };
  return map[name] ?? name;
}

function ValueCaptureTooltip({
  currency,
  formatter: _formatter,
  ...props
}: React.ComponentProps<typeof ChartTooltipContent> & {
  currency?: string | null;
}) {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value) => formatDcsRevenue(Number(value), currency)}
    />
  );
}

/** DCS headline score trend area chart (live data only — pass `data` from /api/v1/dcs/history/). */
export function DcsTrendChart({
  tone = "light",
  height = 120,
  data,
  threshold = DCS_BUILD_READY_THRESHOLD,
}: {
  tone?: "light" | "dark";
  height?: number;
  data?: Array<{ run: string; score: number }> | null;
  threshold?: number;
}) {
  const mute = tone === "dark" ? "rgba(245,242,235,0.35)" : "#9C9A92";
  const grid = tone === "dark" ? "rgba(245,242,235,0.08)" : "rgba(22,22,26,0.08)";
  const ref = tone === "dark" ? "rgba(245,242,235,0.28)" : "rgba(22,22,26,0.22)";
  const stroke = tone === "dark" ? "#FF5B3D" : "#1F3A5F";
  const fillId = tone === "dark" ? "dcsScoreFillDark" : "dcsScoreFillLight";

  const chartData = (data ?? []).map((row) => ({
    run: row.run,
    score: roundDisplayScore(row.score),
  }));

  if (!chartData.length) {
    return <div className="w-full" style={{ height }} aria-hidden />;
  }

  const scores = chartData.map((row) => row.score);
  const yMin = Math.max(0, Math.min(...scores) - 5);
  const yMax = Math.min(100, Math.max(...scores, threshold) + 5);

  return (
    <ChartContainer
      config={trendConfig}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={tone === "dark" ? 0.35 : 0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
        <XAxis
          dataKey="run"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tick={{ fill: mute, fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={28}
          tick={{ fill: mute, fontSize: 10 }}
        />
        <ReferenceLine
          y={threshold}
          stroke={ref}
          strokeDasharray="3 4"
          label={{
            value: formatDisplayCount(threshold),
            position: "insideTopRight",
            fill: mute,
            fontSize: 10,
          }}
        />
        <ChartTooltip
          cursor={{ stroke: grid }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Dimension scores as horizontal bars (weakest first). */
export function DcsDimensionChart({
  height = 220,
  showDelta = false,
  dimensions,
}: {
  height?: number;
  showDelta?: boolean;
  dimensions?: Array<{ name: string; score: number; delta?: number | null }> | null;
}) {
  if (!dimensions?.length) {
    return (
      <p className="text-sm text-muted-foreground">No dimension scores available.</p>
    );
  }

  const data = [...dimensions]
        .sort((a, b) => a.score - b.score)
        .map((d) => {
          const deltaLabel =
            d.delta == null
              ? "—"
              : d.delta >= 0
                ? `+${roundDisplayScore(d.delta)}`
                : `−${Math.abs(roundDisplayScore(d.delta))}`;
          return {
          name: shortDimName(d.name),
          fullName: d.name,
          score: roundDisplayScore(d.score),
          delta: d.delta == null ? 0 : roundDisplayScore(d.delta),
          deltaLabel,
          fill: dimFill(d.score),
        };
        });

  return (
    <ChartContainer
      config={dimConfig}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: showDelta ? 36 : 16, left: 4, bottom: 0 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke="rgba(245,242,235,0.08)"
          strokeDasharray="3 4"
        />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "rgba(245,242,235,0.35)", fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={92}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "rgba(245,242,235,0.72)", fontSize: 10 }}
        />
        <ChartTooltip
          cursor={{ fill: "rgba(245,242,235,0.04)" }}
          content={<ChartTooltipContent />}
        />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={12}>
          {data.map((entry) => (
            <Cell key={entry.fullName} fill={entry.fill} />
          ))}
          {showDelta ? (
            <LabelList
              dataKey="deltaLabel"
              position="right"
              fill="rgba(245,242,235,0.55)"
              fontSize={10}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export type DcsIssueStatusChartCounts = {
  blocked: number;
  leaking: number;
  opportunity: number;
  tracked: number;
};

/** Open-issue mix by customer-facing status (Blocked / Leaking / Opportunity / Tracked). */
export function DcsStatusChart({
  height = 140,
  issueCounts,
}: {
  height?: number;
  issueCounts: DcsIssueStatusChartCounts;
}) {
  const data = [
    { status: "Blocked", count: issueCounts.blocked, fill: STATUS_COLORS.Blocked },
    { status: "Leaking", count: issueCounts.leaking, fill: STATUS_COLORS.Leaking },
    {
      status: "Opportunity",
      count: issueCounts.opportunity,
      fill: STATUS_COLORS.Opportunity,
    },
    { status: "Tracked", count: issueCounts.tracked, fill: STATUS_COLORS.Tracked },
  ] as const;

  const hasAny = data.some((row) => row.count > 0);

  if (!hasAny) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        No open issues on the latest run yet.
      </p>
    );
  }

  return (
    <ChartContainer
      config={statusConfig}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart data={[...data]} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="rgba(245,242,235,0.08)"
          strokeDasharray="3 4"
        />
        <XAxis
          dataKey="status"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "rgba(245,242,235,0.45)", fontSize: 9 }}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={24}
          tick={{ fill: "rgba(245,242,235,0.35)", fontSize: 10 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={22}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

type ValueMetric =
  | "revenueCaptured"
  | "marginCaptured"
  | "revenueAtStake"
  | "marginAtStake";

const VALUE_META: Record<
  ValueMetric,
  { label: string; color: string; fillId: string }
> = {
  revenueCaptured: { label: "Revenue captured", color: "#2E8857", fillId: "ovValRevCap" },
  marginCaptured: { label: "Margin captured", color: "#2E8857", fillId: "ovValMarCap" },
  revenueAtStake: { label: "Revenue at risk", color: "#1F3A5F", fillId: "ovValRevRisk" },
  marginAtStake: { label: "Margin at risk", color: "#D97706", fillId: "ovValMarRisk" },
};

/**
 * Weekly series for a headline metric. Pass `data` when live history exists;
 * otherwise renders an empty chart shell (original-design structure).
 */
export function OverviewValueSpark({
  metric,
  data,
  currency,
  emptyMessage = "Awaiting data",
}: {
  metric: ValueMetric;
  data?: Array<{ week?: string; label?: string; value: number }>;
  currency?: string | null;
  /** When null, hide the empty overlay (loaded period with no series data). */
  emptyMessage?: string | null;
}) {
  const meta = VALUE_META[metric];
  const chartData = data ?? [];
  const isEmpty = chartData.length === 0;

  return (
    <div className="ov-spark-chart-wrap">
      <ChartContainer
        config={{
          value: { label: meta.label, color: meta.color },
        }}
        className="ov-spark-chart aspect-auto h-[44px] w-full"
      >
        <AreaChart data={chartData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={meta.fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={meta.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={meta.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {!isEmpty ? (
            <ChartTooltip
              cursor={{ stroke: "rgba(22,22,26,0.12)" }}
              content={<ValueCaptureTooltip currency={currency} />}
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.label ?? "")
              }
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="value"
            name={meta.label}
            stroke={meta.color}
            strokeWidth={1.8}
            fill={`url(#${meta.fillId})`}
            dot={!isEmpty ? { r: 2.5, fill: meta.color, strokeWidth: 0 } : false}
            activeDot={!isEmpty ? { r: 4, fill: meta.color, strokeWidth: 0 } : false}
          />
        </AreaChart>
      </ChartContainer>
      {isEmpty && emptyMessage != null ? (
        <div className="ov-spark-empty">{emptyMessage}</div>
      ) : null}
    </div>
  );
}

/**
 * Bars for the open issues that make up an at-stake total.
 * Labels are short workflow ids linking to that workflow.
 */
export function OverviewStakeBreakdown({
  kind,
}: {
  kind: "revenue" | "margin";
}) {
  const rows = issues
    .filter(
      (i) =>
        i.impact > 0 &&
        (kind === "revenue"
          ? i.impactType === "revenue"
          : i.impactType === "margin"),
    )
    .map((i) => ({
      id: i.id,
      workflowId: i.workflowId,
      title: i.title,
      value: i.impact,
    }));

  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.value), 1);
  const fill = kind === "revenue" ? "#1F3A5F" : "#D97706";

  return (
    <div className="ov-stake-list">
      {rows.map((row) => (
        <Link
          key={row.id}
          to="/workflow/$id"
          params={{ id: row.workflowId }}
          search={{ issue: row.id }}
          className="ov-stake-row"
          title={`${row.title} · ${formatCurrency(row.value, { compact: true })} / q`}
        >
          <span className="ov-stake-id">{row.workflowId}</span>
          <div className="ov-stake-track">
            <div
              className="ov-stake-fill"
              style={{ width: `${(row.value / max) * 100}%`, background: fill }}
            />
          </div>
          <span className="ov-stake-val">
            {formatCurrency(row.value, { compact: true })}
          </span>
        </Link>
      ))}
    </div>
  );
}
