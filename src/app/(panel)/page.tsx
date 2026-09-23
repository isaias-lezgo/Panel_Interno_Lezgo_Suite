import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  BotIcon,
  HammerIcon,
  RefreshCwIcon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"

import { MovementChart } from "@/components/charts/movement-chart"
import { RevenueChart } from "@/components/charts/revenue-chart"
import { LinkButton } from "@/components/panel/link-button"
import {
  EmptyState,
  Instrument,
  PageHeader,
} from "@/components/panel/page-header"
import { TelemetryBand } from "@/components/panel/telemetry-band"
import type { BandItem } from "@/components/panel/telemetry-band"
import {
  invoiceStatusLabel,
  stageLabel,
  StatusChip,
} from "@/components/signal/status-chip"
import { money, moneySigned, relativeDays, shortDate } from "@/lib/format"
import { getPortfolioSummary, listActivity } from "@/lib/repository"
import type { ActivityKind, ImplementationStage } from "@/lib/types"

export const metadata = { title: "Tablero" }

const activityIcon: Record<ActivityKind, typeof UserIcon> = {
  ai: BotIcon,
  billing: BanknoteIcon,
  implementation: HammerIcon,
  ghl: RefreshCwIcon,
  client: UserIcon,
}

/**
 * Lo que quedó fuera de la serie por no poder convertirse a la moneda base
 * se dice al pie; callarlo haría pasar la gráfica por completa.
 */
function omitidas(puntos: { omitted: number }[]) {
  const total = puntos.reduce((s, p) => s + p.omitted, 0)
  return total ? ` · ${total} sin tipo de cambio` : ""
}

export default async function TableroPage() {
  const [summary, activity] = await Promise.all([
    getPortfolioSummary(),
    listActivity(8),
  ])

  const nameOf = (id?: string) =>
    summary.clients.find((c) => c.id === id)?.name ?? "—"

  const attention = [
    ...summary.implementations
      .filter((i) => i.blocked)
      .map((i) => ({
        id: i.id,
        tone: "warn" as const,
        kind: "Proyecto bloqueado",
        title: i.name,
        client: i.clientId ? nameOf(i.clientId) : (i.ghlLocationName ?? "—"),
        detail: i.blockedReason ?? "Sin motivo registrado.",
        href: "/implementaciones",
      })),
    ...summary.invoices
      .filter((i) => i.status === "overdue")
      .map((i) => ({
        id: i.id,
        tone: "risk" as const,
        kind: "Factura vencida",
        title: `${i.number} · ${money(i.amount, i.currency)}`,
        client: i.clientId ? nameOf(i.clientId) : i.customerName,
        detail: i.dueAt
          ? `Venció el ${shortDate(i.dueAt)} — ${relativeDays(i.dueAt)}`
          : "Stripe agotó los intentos de cobro.",
        href: "/facturacion",
      })),
    ...summary.unlinked.slice(0, 5).map((c) => ({
      id: c.id,
      tone: "warn" as const,
      kind: "Cliente sin enlazar",
      title: c.name,
      client: c.contactName,
      detail:
        c.stripeCount === 0
          ? "Sin cliente de Stripe."
          : "Sin subcuenta de GoHighLevel.",
      href: `/clientes/${c.slug}`,
    })),
  ]

  // Cada cifra de la banda abre la lista de registros que la forman: un 34
  // no dice a quién hay que llamar, y salir a buscarlo a otra vista rompe el
  // hilo de lo que se estaba leyendo.
  const base = summary.baseCurrency

  const stageRank: Record<ImplementationStage, number> = {
    scoping: 0,
    building: 1,
    review: 2,
    launch: 3,
    live: 4,
  }

  const activeRows = summary.rows.filter((c) => !c.orphaned)

  const ingresoItems: BandItem[] = activeRows
    .filter((c) => (c.mrr ?? 0) > 0 || c.unconvertedSubs > 0)
    .sort((a, b) => (b.mrr ?? 0) - (a.mrr ?? 0))
    .map((c) => ({
      id: c.id,
      title: c.name,
      value: c.mrr ? money(c.mrr, base) : "—",
      meta:
        c.unconvertedSubs > 0
          ? "Cobra en USD: fuera del total sin tipo de cambio."
          : undefined,
      href: `/clientes/${c.slug}`,
    }))

  const clientesItems: BandItem[] = activeRows
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((c) => ({
      id: c.id,
      title: c.name,
      value: c.mrr ? money(c.mrr, base) : undefined,
      // Casi todos comparten etapa: con 34 filas, 34 chips iguales serían
      // adorno. La etapa va en texto y solo la cifra pide la vista.
      meta: [c.stage, c.contactName !== c.name ? c.contactName : null]
        .filter(Boolean)
        .join(" · "),
      href: `/clientes/${c.slug}`,
    }))

  const proyectosItems: BandItem[] = summary.implementations
    .filter((i) => i.stage !== "live")
    .sort((a, b) => stageRank[a.stage] - stageRank[b.stage])
    .map((i) => {
      const etapa = stageLabel[i.stage]
      // La implementación suele llamarse como la subcuenta; repetirlo debajo
      // no agrega nada.
      const donde = i.clientId ? nameOf(i.clientId) : i.ghlLocationName
      const lugar = donde && donde !== i.name ? donde : null
      return {
        id: i.id,
        title: i.name,
        value: `${i.progress}%`,
        chip: i.blocked ? { tone: "risk" as const, label: "Bloqueado" } : etapa,
        meta: i.blocked
          ? [etapa.label, lugar].filter(Boolean).join(" · ")
          : (lugar ?? undefined),
        href: "/implementaciones",
      }
    })

  const cobrarItems: BandItem[] = summary.invoices
    .filter((i) => i.status === "overdue" || i.status === "due")
    .sort(
      (a, b) =>
        Number(b.status === "overdue") - Number(a.status === "overdue") ||
        (b.amountBase ?? 0) - (a.amountBase ?? 0),
    )
    .map((i) => ({
      id: i.id,
      title: i.clientId ? nameOf(i.clientId) : i.customerName,
      value: moneySigned(i.amount, i.currency, base),
      chip: invoiceStatusLabel[i.status],
      meta:
        i.amountBase === null
          ? `${i.number} · sin tipo de cambio, fuera del total`
          : i.number,
      href: "/facturacion",
    }))

  const enlacesItems: BandItem[] = summary.unlinked.map((c) => ({
    id: c.id,
    title: c.name,
    meta:
      c.stripeCount === 0 && c.locationNames.length === 0
        ? "Sin cliente de Stripe ni subcuenta."
        : c.stripeCount === 0
          ? "Sin cliente de Stripe."
          : "Sin subcuenta de GoHighLevel.",
    href: `/clientes/${c.slug}`,
  }))

  return (
    <div className="blueprint">
      <PageHeader
        eyebrow="Resumen"
        title="Tablero de operaciones"
        description="Todo lo que la agencia tiene en marcha ahora mismo: ingresos, implementaciones y las cuentas que necesitan a una persona hoy."
        actions={
          <LinkButton href="/copiloto" size="sm">
            Preguntar al copiloto <ArrowRightIcon />
          </LinkButton>
        }
      />

      <div className="space-y-4 px-4 pb-12 md:px-6">
        <TelemetryBand
          mrr={summary.mrr}
          baseCurrency={summary.baseCurrency}
          activeClients={summary.activeCount}
          inFlight={summary.inFlightCount}
          blocked={summary.blockedCount}
          outstanding={summary.outstanding}
          overdueCount={summary.overdueCount}
          unlinked={summary.unlinked.length}
          unlinkedNoStripe={
            summary.unlinked.filter((c) => c.stripeCount === 0).length
          }
          unlinkedNoLocation={
            summary.unlinked.filter((c) => c.locationNames.length === 0).length
          }
          stripeLinkCount={summary.stripeLinkCount}
          orphanedCount={summary.orphanedCount}
          unconvertedClients={summary.unconvertedClients}
          voidedInvoices={summary.voidedInvoices}
          fxDefined={summary.fxDefined}
          stripeConnected={summary.stripeConnected}
          lists={{
            ingreso: ingresoItems,
            clientes: clientesItems,
            proyectos: proyectosItems,
            cobrar: cobrarItems,
            enlaces: enlacesItems,
          }}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Instrument
            label="Cobrado por mes"
            hint={
              summary.series.source === "stripe"
                ? `Últimos 12 meses, facturas pagadas en Stripe${omitidas(summary.series.collected)}`
                : "Sin Stripe conectado"
            }
          >
            {summary.series.source === "stripe" ? (
              <div className="p-3">
                <RevenueChart
                  data={summary.series.collected}
                  currency={summary.series.currency}
                />
              </div>
            ) : (
              <EmptyState title="Sin datos de cobro">
                La serie sale de las facturas de Stripe. Define{" "}
                <code>STRIPE_SECRET_KEY</code> para verla.
              </EmptyState>
            )}
          </Instrument>

          <Instrument
            label="Altas y cancelaciones"
            hint={
              summary.series.source === "stripe"
                ? `Suscripciones que empezaron y terminaron cada mes${omitidas(summary.series.movement)}`
                : "Sin Stripe conectado"
            }
          >
            {summary.series.source === "stripe" ? (
              <div className="p-3">
                <MovementChart
                  data={summary.series.movement}
                  currency={summary.series.currency}
                />
              </div>
            ) : (
              <EmptyState title="Sin movimiento que mostrar">
                Las altas y las bajas salen de Stripe. Define{" "}
                <code>STRIPE_SECRET_KEY</code> para verlas.
              </EmptyState>
            )}
          </Instrument>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Instrument
            label="Requiere atención"
            hint={`${attention.length} asuntos abiertos`}
            action={
              <LinkButton
                href="/implementaciones"
                variant="ghost"
                size="xs"
              >
                Ver todo
              </LinkButton>
            }
          >
            {attention.length === 0 ? (
              <EmptyState title="Nada está bloqueado">
                Cada implementación avanza y no hay facturas vencidas.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <AlertTriangleIcon
                        aria-hidden
                        className={
                          item.tone === "risk"
                            ? "mt-0.5 size-4 shrink-0 text-status-risk"
                            : "mt-0.5 size-4 shrink-0 text-status-warn"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <StatusChip tone={item.tone}>{item.kind}</StatusChip>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.client} · {item.detail}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Instrument>

          <Instrument label="Actividad" hint="Panel, GoHighLevel y facturación">
            <ul className="divide-y divide-border">
              {activity.map((event) => {
                const Icon = activityIcon[event.kind]
                return (
                  <li key={event.id} className="flex gap-3 px-4 py-3">
                    <Icon
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <p className="text-sm">{event.summary}</p>
                      <p className="eyebrow mt-1">
                        {event.actor} · {shortDate(event.at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Instrument>
        </div>
      </div>
    </div>
  )
}
