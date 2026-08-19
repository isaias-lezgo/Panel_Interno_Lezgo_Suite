import { ClientRevenueChart } from "@/components/charts/client-revenue-chart"
import { InvoicesTable } from "@/components/billing/invoices-table"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { money } from "@/lib/format"
import { getPortfolioSummary } from "@/lib/repository"

export const metadata = { title: "Facturación" }

export default async function FacturacionPage() {
  const summary = await getPortfolioSummary()

  const paid = summary.invoices.filter((i) => i.status === "paid")
  const overdue = summary.invoices.filter((i) => i.status === "overdue")
  const collected = paid.reduce((sum, i) => sum + i.amount, 0)
  const overdueTotal = overdue.reduce((sum, i) => sum + i.amount, 0)
  const issued = summary.invoices.filter((i) => i.status !== "draft")
  const collectionRate = issued.length
    ? Math.round((paid.length / issued.length) * 100)
    : 0
  const average = paid.length ? Math.round(collected / paid.length) : 0

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Facturación"
        description="Lo cobrado, lo pendiente y lo vencido. Los importes están en USD y no incluyen impuestos."
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        <section className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x lg:grid-cols-4">
          <Cell label="Cobrado">
            <span className="num text-[26px] leading-none font-semibold">
              {money(collected)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              {paid.length} facturas pagadas
            </p>
          </Cell>
          <Cell label="Por cobrar">
            <span className="num text-[26px] leading-none font-semibold">
              {money(summary.outstanding)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              emitido y sin pagar
            </p>
          </Cell>
          <Cell label="Vencido">
            <span className="num text-[26px] leading-none font-semibold text-status-risk">
              {money(overdueTotal)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              {overdue.length} facturas fuera de plazo
            </p>
          </Cell>
          <Cell label="Tasa de cobro">
            <span className="num text-[26px] leading-none font-semibold">
              {collectionRate}%
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              ticket promedio {money(average)}
            </p>
          </Cell>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Instrument
            label="Ingreso por cliente"
            hint="MRR de las ocho cuentas más grandes"
          >
            <div className="p-3">
              <ClientRevenueChart clients={summary.clients} />
            </div>
          </Instrument>

          <Instrument
            label="Concentración"
            hint="Qué tanto depende la agencia de sus cuentas grandes"
          >
            <Concentration
              clients={summary.clients}
              mrr={summary.mrr}
            />
          </Instrument>
        </div>

        <Instrument
          label="Facturas"
          hint={`${summary.invoices.length} registradas`}
        >
          <InvoicesTable
            invoices={summary.invoices}
            clients={summary.clients}
          />
        </Instrument>
      </div>
    </div>
  )
}

function Cell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-border px-4 py-4 first:border-t-0 sm:border-t-0">
      <p className="eyebrow mb-2.5">{label}</p>
      {children}
    </div>
  )
}

function Concentration({
  clients,
  mrr,
}: {
  clients: { name: string; mrr: number; slug: string }[]
  mrr: number
}) {
  const ranked = [...clients].sort((a, b) => b.mrr - a.mrr)
  const top3 = ranked.slice(0, 3).reduce((sum, c) => sum + c.mrr, 0)
  const share = mrr ? Math.round((top3 / mrr) * 100) : 0

  return (
    <div className="px-4 py-4">
      <p className="num text-[26px] leading-none font-semibold">{share}%</p>
      <p className="mt-2 text-sm text-muted-foreground">
        del ingreso recurrente viene de las tres cuentas más grandes.
      </p>

      <ul className="mt-4 space-y-2.5">
        {ranked.slice(0, 5).map((client) => {
          const percent = mrr ? (client.mrr / mrr) * 100 : 0
          return (
            <li key={client.slug}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{client.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {percent.toFixed(1).replace(".", ",")}%
                </span>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-chart-1"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
