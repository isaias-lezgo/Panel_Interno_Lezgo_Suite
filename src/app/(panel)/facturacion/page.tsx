import { ClientRevenueChart } from "@/components/charts/client-revenue-chart"
import { InvoicesTable } from "@/components/billing/invoices-table"
import { RefreshButton } from "@/components/billing/refresh-button"
import { Instrument, PageHeader } from "@/components/panel/page-header"
import { money, moneySigned } from "@/lib/format"
import { splitByCurrency, type CurrencySplit } from "@/lib/stripe/totals"
import type { Currency } from "@/lib/types"
import { getBillingFeed, listClients, refreshBilling } from "@/lib/repository"

export const metadata = { title: "Facturación" }

export default async function FacturacionPage() {
  const [feed, clients] = await Promise.all([getBillingFeed(), listClients()])
  const { invoices, baseCurrency } = feed

  const paid = invoices.filter((i) => i.status === "paid")
  const overdue = invoices.filter((i) => i.status === "overdue")
  const issued = invoices.filter(
    (i) => i.status !== "draft" && i.status !== "void",
  )
  const pendientes = invoices.filter(
    (i) => i.status === "due" || i.status === "overdue",
  )

  // Cada KPI se parte por moneda: el número grande es lo cobrado en pesos de
  // verdad y el pie declara lo que viene convertido desde otra moneda.
  const cobrado = splitByCurrency(paid, baseCurrency)
  const porCobrar = splitByCurrency(pendientes, baseCurrency)
  const vencido = splitByCurrency(overdue, baseCurrency)
  const collected = cobrado.total

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
  const collectionRate = issued.length
    ? Math.round((paid.length / issued.length) * 100)
    : 0
  const average = paid.length ? Math.round(collected / paid.length) : 0

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Cartera"
        title="Facturación"
        description={
          feed.source === "stripe"
            ? "Lo cobrado, lo pendiente y lo vencido, directo de Stripe. Los importes incluyen IVA."
            : "Lo cobrado, lo pendiente y lo vencido. Datos de la base, no de Stripe."
        }
        actions={
          feed.source === "stripe" ? (
            <RefreshButton action={refreshBilling} />
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

        <section className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x lg:grid-cols-4">
          <Cell label="Cobrado">
            <span className="num text-[26px] leading-none font-semibold">
              {money(cobrado.exact, baseCurrency)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              {paid.length - cobrado.foreign.reduce((n, f) => n + f.count, 0)}{" "}
              facturas pagadas en {baseCurrency.toUpperCase()}
            </p>
            <Foreign split={cobrado} base={baseCurrency} />
          </Cell>
          <Cell label="Por cobrar">
            <span className="num text-[26px] leading-none font-semibold">
              {money(porCobrar.exact, baseCurrency)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              emitido y sin pagar
            </p>
            <Foreign split={porCobrar} base={baseCurrency} />
          </Cell>
          <Cell label="Vencido">
            <span className="num text-[26px] leading-none font-semibold text-status-risk">
              {money(vencido.exact, baseCurrency)}
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              {overdue.length} facturas fuera de plazo
            </p>
            <Foreign split={vencido} base={baseCurrency} />
          </Cell>
          <Cell label="Tasa de cobro">
            <span className="num text-[26px] leading-none font-semibold">
              {collectionRate}%
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              ticket promedio {money(average, baseCurrency)}
            </p>
          </Cell>
        </section>

        <p className="px-1 text-xs text-muted-foreground">
          {feed.usdToMxn
            ? `Las cifras grandes son lo cobrado en ${baseCurrency.toUpperCase()}, sin conversión de por medio. Lo que llegó en otra moneda se declara debajo y su equivalente es un estimado a ${feed.usdToMxn} MXN por dólar (STRIPE_FX_USD_MXN).`
            : feed.source === "stripe"
              ? "Hay facturas en USD fuera de los totales: falta configurar STRIPE_FX_USD_MXN."
              : "Importes en USD, tal como están en la base."}
        </p>

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

        <Instrument label="Facturas" hint={`${invoices.length} registradas`}>
          <InvoicesTable
            invoices={invoices}
            clients={clients}
            baseCurrency={baseCurrency}
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

/**
 * Lo que entró en otra moneda, debajo de la cifra medida. El equivalente va
 * rotulado como estimado: sale de una tasa configurada a mano, no de lo que
 * el banco liquidó ese día.
 */
function Foreign({ split, base }: { split: CurrencySplit; base: Currency }) {
  if (split.foreign.length === 0) return null
  return (
    <div className="mt-1.5 space-y-0.5">
      {split.foreign.map((f) => (
        <p key={f.currency} className="text-xs text-muted-foreground">
          <span className="num">
            + {moneySigned(f.amount, f.currency, base)}
          </span>{" "}
          en {f.count} {f.count === 1 ? "factura" : "facturas"}
          {f.converted !== null && (
            <>
              {" · "}
              <span className="num">≈ {money(f.converted, base)}</span> estimado
            </>
          )}
        </p>
      ))}
    </div>
  )
}
