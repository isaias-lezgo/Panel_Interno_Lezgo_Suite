"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compactMoney, money } from "@/lib/format"
import type { CollectedPoint } from "@/lib/stripe/series"
import type { Currency } from "@/lib/types"

/** One series, so the instrument label names it and no legend is needed. */
const config = {
  collected: { label: "Cobrado", color: "var(--chart-1)" },
} satisfies ChartConfig

export function RevenueChart({
  data,
  currency,
}: {
  data: CollectedPoint[]
  currency: Currency
}) {
  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="collected-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-collected)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-collected)" stopOpacity={0} />
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
          tickFormatter={(value: number) => compactMoney(value)}
          className="text-[11px]"
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              formatter={(value) => money(Number(value), currency)}
            />
          }
        />
        <Area
          dataKey="collected"
          type="monotone"
          stroke="var(--color-collected)"
          strokeWidth={2}
          fill="url(#collected-fill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
