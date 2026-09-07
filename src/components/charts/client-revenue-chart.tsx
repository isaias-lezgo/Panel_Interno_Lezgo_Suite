"use client"

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compactMoney, money } from "@/lib/format"
import type { Currency } from "@/lib/types"

const config = {
  total: { label: "Facturado", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Ranked magnitude, so bars run horizontally and the client names read as
 * labels rather than rotated tick text. One series, values labelled directly.
 */
export function ClientRevenueChart({
  data: rows,
  currency,
}: {
  data: { name: string; total: number }[]
  currency: Currency
}) {
  const data = rows.slice(0, 8)

  return (
    <ChartContainer
      config={config}
      className="h-[280px] w-full"
      style={{ aspectRatio: "auto" }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 4, right: 56, top: 4, bottom: 4 }}
      >
        <XAxis type="number" dataKey="total" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={148}
          tickLine={false}
          axisLine={false}
          className="text-[11px]"
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent formatter={(value) => money(Number(value), currency)} />
          }
        />
        <Bar
          dataKey="total"
          fill="var(--color-total)"
          radius={[0, 4, 4, 0]}
          barSize={14}
        >
          <LabelList
            dataKey="total"
            position="right"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(value: unknown) => compactMoney(Number(value))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
