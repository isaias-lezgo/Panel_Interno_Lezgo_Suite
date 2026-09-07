"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compactMoney } from "@/lib/format"
import type { RevenuePoint } from "@/lib/types"

/** One series, so the instrument label names it and no legend is needed. */
const config = {
  recurring: { label: "Ingreso recurrente", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="recurring-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-recurring)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-recurring)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--grid-line)" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          className="text-[11px]"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickMargin={4}
          tickFormatter={(value: number) => compactMoney(value * 100)}
          className="text-[11px]"
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              formatter={(value) => compactMoney(Number(value) * 100)}
            />
          }
        />
        <Area
          dataKey="recurring"
          type="monotone"
          stroke="var(--color-recurring)"
          strokeWidth={2}
          fill="url(#recurring-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
