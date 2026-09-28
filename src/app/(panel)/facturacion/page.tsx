import { ClientRevenueChart } from "@/components/charts/client-revenue-chart"
import {
  CobranzaAlerts,
  CobranzaCalendar,
  CobranzaColumns,
  CobranzaKpis,
  MonthNav,
} from "@/components/billing/cobranza"
import { InvoicesTable } from "@/components/billing/invoices-table"
import { RefreshButton } from "@/components/billing/refresh-button"
import { EmptyState, Instrument, PageHeader } from "@/components/panel/page-header"
import { stampDateTime } from "@/lib/format"
import { summarizeCobranza } from "@/lib/stripe/cobranza"
import {
  cobranzaMonth,
  getBillingFeed,
  getCobranza,
  listClients,
  refreshBilling,
} from "@/lib/repository"

export const metadata = { title: "Facturación" }

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const month = cobranzaMonth((await searchParams).mes)
  const [feed, clients, cobranza] = await Promise.all([
    getBillingFeed(),
    listClients(),
    getCobranza(month),
  ])
  const { invoices, baseCurrency } = feed
  const summary = summarizeCobranza(cobranza.rows)

  // Facturado real por cliente en la ventana, en centavos de la moneda base.
  // Antes esto salía de `client.mrr`, que son dólares de los datos de ejemplo:
  // habría quedado una gráfica inventada junto a cifras reales.
  const porCliente = new Map<string, number>()
  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  for (const i of invoices) {
    if (i.status === "void" || i.status === "draft") continue
    const nombre = i.clientId
      ? (nameById.get(i.clientId) ?? i.customerName)
      : i.customerName
    porCliente.set(nombre, (porCliente.get(nombre) ?? 0) + (i.amountBase ?? 0))
  }
  const ranked = [...porCliente.entries()]
    .map(([name, total]) => ({ name, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
  const totalFacturado = ranked.reduce((s, r) => s + r.total, 0)

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Facturación"
        description={
          feed.source === "stripe"
            ? "La cobranza del mes, directo de Stripe: lo que entró, lo que falta y lo que se atoró. Los importes cobrados incluyen IVA."
            : "Lo cobrado, lo pendiente y lo vencido. Datos de la base, no de Stripe."
        }
        actions={
          feed.source === "stripe" ? (
            <>
              <MonthNav month={month} />
              <RefreshButton action={refreshBilling} />
            </>
          ) : undefined
        }
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        {feed.stale && (
          <p className="rounded-lg border border-status-warn/40 bg-card px-4 py-3 text-sm">
            Stripe no respondió. Estas cifras salen de la base y pueden estar
            atrasadas.
          </p>
        )}

        {cobranza.status === "ok" ? (
          <>
            <CobranzaKpis summary={summary} base={baseCurrency} />
            <p className="px-1 text-xs text-muted-foreground">
              Cobrado suma las facturas pagadas, las recargas de wallet y los
              cobros sin factura (SPEI, links de pago); un cargo que pagó una
              factura cuenta una sola vez. Por cobrar son las renovaciones,
              suscripciones programadas y pausas que reanudan, al precio de
              lista y antes de impuestos. MXN y USD se suman por separado.
            </p>
            <CobranzaAlerts summary={summary} base={baseCurrency} />
            <CobranzaColumns rows={cobranza.rows} base={baseCurrency} />
            <CobranzaCalendar month={month} rows={cobranza.rows} base={baseCurrency} />
          </>
        ) : (
          <Instrument label="Cobranza del mes">
            <EmptyState
              title={
                cobranza.status === "off"
                  ? "Sin Stripe conectado"
                  : "Stripe no respondió"
              }
            >
              {cobranza.status === "off"
                ? "La cobranza sale de Stripe. Define STRIPE_SECRET_KEY para verla."
                : "Aprieta Actualizar en un momento para volver a consultar."}
            </EmptyState>
          </Instrument>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Instrument
            label="Facturado por cliente"
            hint="Las ocho cuentas más grandes, últimos 12 meses"
          >
            <div className="p-3">
              <ClientRevenueChart data={ranked} currency={baseCurrency} />
            </div>
          </Instrument>

          <Instrument
            label="Concentración"
            hint="Qué tanto depende la agencia de sus cuentas grandes"
          >
            <Concentration ranked={ranked} total={totalFacturado} />
          </Instrument>
        </div>

        <Instrument label="Facturas" hint={`${invoices.length} registradas en 12 meses`}>
          <InvoicesTable
            invoices={invoices}
            clients={clients}
            baseCurrency={baseCurrency}
          />
        </Instrument>

        {cobranza.fetchedAt && (
          <p className="px-1 text-xs text-muted-foreground">
            Consultado en Stripe el {stampDateTime(cobranza.fetchedAt)}. Se
            vuelve a consultar cada cinco minutos o al apretar Actualizar.
          </p>
        )}
      </div>
    </div>
  )
}

function Concentration({
  ranked,
  total,
}: {
  ranked: { name: string; total: number }[]
  total: number
}) {
  const top3 = ranked.slice(0, 3).reduce((sum, r) => sum + r.total, 0)
  const share = total ? Math.round((top3 / total) * 100) : 0

  return (
    <div className="px-4 py-4">
      <p className="num text-[26px] leading-none font-semibold">{share}%</p>
      <p className="mt-2 text-sm text-muted-foreground">
        del facturado de los últimos 12 meses viene de las tres cuentas más
        grandes.
      </p>

      <ul className="mt-4 space-y-2.5">
        {ranked.slice(0, 5).map((client) => {
          const percent = total ? (client.total / total) * 100 : 0
          return (
            <li key={client.name}>
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
