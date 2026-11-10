"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { PriceHistorySegment, PriceHistorySeries } from "@/core/pricing/price-history";

/**
 * Draws one price at a time. The view already built every series.
 *
 * A known period is a flat line. A step that stayed up across the days
 * we never saw would pretend we still knew the old price. The dashed
 * line is that gap. Recharts needs a number to place a point. The
 * caption, the tooltip, and the hidden table keep the stored decimal.
 */

type ChartPoint = {
  date: number;
  amount: number;
  amountText: string;
  kind: "known" | "gap";
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Tick text only. The tooltip keeps the full YYYY-MM-DD day, because
 * that is the day the reader can match to the change log.
 */
export function shortUtcDay(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const date = new Date(value);
  const month = MONTHS[date.getUTCMonth()];
  if (month === undefined) {
    return "";
  }
  return `${month} ${date.getUTCDate()}`;
}

export function PriceHistoryChart({ series }: { series: readonly PriceHistorySeries[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const current =
    series.find((item) => item.id === picked) ??
    series.find((item) => item.id === "input") ??
    series[0];

  if (current === undefined) {
    return null;
  }

  const drawn = current.segments.map(segmentPoints);
  const points = drawn.flat();
  const first = points[0];
  if (first === undefined) {
    throw new Error("price history has no points to draw");
  }

  const dates = points.map((point) => point.date);
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const pad = min === max ? DAY_MS : 0;
  const peak = Math.max(...points.map((point) => point.amount));
  const yMax = peak > 0 ? peak * 1.25 : 1;
  const labels = current.segments.flatMap((segment) =>
    segment.kind === "known" ? [segment.label] : [],
  );
  const started = firstKnownDay(current);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Price dimension" className="flex flex-wrap gap-2">
          {series.map((item) => {
            const selected = item.id === current.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={
                  selected
                    ? "rounded-md border border-primary px-2.5 py-1 text-sm text-primary"
                    : "rounded-md border border-transparent px-2.5 py-1 text-sm text-muted-foreground"
                }
                onClick={() => setPicked(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {current.changeCount} {current.changeCount === 1 ? "change" : "changes"} · {current.label}
        </p>
      </div>

      {current.note !== null ? (
        <p className="mt-2 text-sm text-muted-foreground">{current.note}</p>
      ) : null}

      <div
        role="img"
        aria-label={`${current.label} price history`}
        className="mt-3 h-60 w-full min-w-0 text-muted-foreground"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 28, bottom: 24, left: 28 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis
              dataKey="date"
              type="number"
              domain={[min - pad, max + pad]}
              scale="time"
              axisLine={false}
              tickLine={false}
              ticks={min === max ? [min] : [min, max]}
              interval={0}
              tickFormatter={shortUtcDay}
              tick={{ fontSize: 11, fill: "currentColor" }}
            />
            <YAxis hide domain={[0, yMax]} />
            <Tooltip
              content={PriceTooltip}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {drawn.map((segmentPoints, index) => {
              const segment = current.segments[index];
              const dashed = segment?.kind === "gap";
              const key = `${segmentPoints[0]?.date ?? index}-${dashed ? "gap" : "known"}`;
              if (dashed) {
                return (
                  <Line
                    key={key}
                    data={segmentPoints}
                    dataKey="amount"
                    type="linear"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                    name={current.label}
                  />
                );
              }
              return (
                <Area
                  key={key}
                  data={segmentPoints}
                  dataKey="amount"
                  type="linear"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  fill="var(--primary)"
                  fillOpacity={0.08}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  name={current.label}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {current.changeCount === 0 && started !== null ? (
        <p className="mt-3 text-sm text-muted-foreground">No changes since {started}.</p>
      ) : null}

      <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
        {labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-primary" aria-hidden="true" />
          Solid line: a price we saw
        </li>
        <li className="inline-flex items-center gap-2">
          <span
            className="inline-block w-6 border-t border-dashed border-muted-foreground"
            aria-hidden="true"
          />
          Dashed line: a gap between checks
        </li>
      </ul>

      <div className="sr-only">
        <table>
          <caption>{current.label} price history</caption>
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {current.segments.map((segment) =>
              segment.kind === "known" ? (
                <tr key={`${segment.from}-${segment.to}-known`}>
                  <td>{segment.from}</td>
                  <td>{segment.to}</td>
                  <td>${segment.amountText}</td>
                  <td>{segment.label}</td>
                </tr>
              ) : (
                <tr key={`${segment.from}-${segment.to}-gap`}>
                  <td>{segment.from}</td>
                  <td>{segment.to}</td>
                  <td>
                    ${segment.fromAmountText} to ${segment.toAmountText}
                  </td>
                  <td>Not observed between checks.</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function firstKnownDay(series: PriceHistorySeries): string | null {
  for (const segment of series.segments) {
    if (segment.kind === "known") {
      return segment.from;
    }
  }
  return null;
}

function PriceTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || payload.length === 0) {
    return null;
  }

  const point = tooltipPoint(payload);
  if (point === null) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
      <p className="text-muted-foreground">
        {formatDay(typeof label === "number" ? label : Number(label))}
      </p>
      <p className="font-mono text-sm font-semibold text-foreground">${point.amountText}</p>
      {point.kind === "gap" ? (
        <p className="mt-1 text-muted-foreground">Not observed between checks.</p>
      ) : null}
    </div>
  );
}

function segmentPoints(segment: PriceHistorySegment): ChartPoint[] {
  if (segment.kind === "known") {
    const start = point(segment.from, segment.amount, segment.amountText, "known");
    if (segment.from === segment.to) {
      return [start];
    }
    return [start, point(segment.to, segment.amount, segment.amountText, "known")];
  }

  return [
    point(segment.from, segment.fromAmount, segment.fromAmountText, "gap"),
    point(segment.to, segment.toAmount, segment.toAmountText, "gap"),
  ];
}

function point(
  day: string,
  amount: number,
  amountText: string,
  kind: ChartPoint["kind"],
): ChartPoint {
  return { date: dayToUtc(day), amount, amountText, kind };
}

function dayToUtc(day: string): number {
  const match = DAY.exec(day);
  if (match === null) {
    throw new Error("chart day must be YYYY-MM-DD");
  }
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDay(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const date = new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tooltipPoint(payload: TooltipContentProps["payload"]): ChartPoint | null {
  const points = payload.map((item) => item.payload).filter(isChartPoint);
  return points.find((item) => item.kind === "known") ?? points[0] ?? null;
}

function isChartPoint(value: unknown): value is ChartPoint {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.date === "number" &&
    typeof value.amount === "number" &&
    typeof value.amountText === "string" &&
    (value.kind === "known" || value.kind === "gap")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
