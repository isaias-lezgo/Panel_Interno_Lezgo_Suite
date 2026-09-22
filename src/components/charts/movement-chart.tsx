"use client"

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { compactMoney, money } from "@/lib/format"
import type { MovementPoint } from "@/lib/stripe/series"
import type { Currency } from "@/lib/types"

/**
 * Sin serie de expansión: Stripe no guarda el historial de cambios de importe
 * de una suscripción, y una barra estimada al lado de dos exactas se leería
 * igual de cierta que ellas.
 */
const config = {
  new: { label: "Altas", color: "var(--chart-2)" },
  churn: { label: "Cancelación", color: "var(--chart-5)" },
} satisfies ChartConfig

/**
 * Gains stack up from the zero line, churn drops below it, so the month's net
 * is the visible difference rather than a number you have to compute.
 */
export function MovementChart({
  data,
  currency,
}: {
  data: MovementPoint[]
  currency: Currency
}) {
  const series = data.map((point) => ({ ...point, churn: -point.churn }))

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
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
          tickFormatter={(value: number) => compactMoney(Math.abs(value))}
          className="text-[11px]"
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              formatter={(value) => money(Math.abs(Number(value)), currency)}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {/* 2px stroke in the surface colour keeps a hairline gap between
            stacked segments, which is what separates them for a reader who
            cannot tell teal from indigo. */}
        <Bar
          dataKey="new"
          fill="var(--color-new)"
          stroke="var(--card)"
          strokeWidth={2}
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="churn"
          fill="var(--color-churn)"
          stroke="var(--card)"
          strokeWidth={2}
          radius={[0, 0, 3, 3]}
        />
      </BarChart>
    </ChartContainer>
  )
}
