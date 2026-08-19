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
import { StatusChip } from "@/components/signal/status-chip"
import { money, relativeDays, shortDate } from "@/lib/format"
import { getPortfolioSummary, listActivity } from "@/lib/repository"
import type { ActivityKind } from "@/lib/types"

export const metadata = { title: "Tablero" }

const activityIcon: Record<ActivityKind, typeof UserIcon> = {
  ai: BotIcon,
  billing: BanknoteIcon,
  implementation: HammerIcon,
  ghl: RefreshCwIcon,
  client: UserIcon,
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
        client: nameOf(i.clientId),
        detail: i.blockedReason ?? "Sin motivo registrado.",
        href: "/implementaciones",
      })),
    ...summary.invoices
      .filter((i) => i.status === "overdue")
      .map((i) => ({
        id: i.id,
        tone: "risk" as const,
        kind: "Factura vencida",
        title: `${i.number} · ${money(i.amount)}`,
        client: nameOf(i.clientId),
        detail: `Venció el ${shortDate(i.dueAt)} — ${relativeDays(i.dueAt)}`,
        href: "/facturacion",
      })),
    ...summary.atRisk.map((c) => ({
      id: c.id,
      tone: "risk" as const,
      kind: "Cuenta en riesgo",
      title: c.name,
      client: c.owner,
      detail: c.notes ?? `Salud ${c.health}/100.`,
      href: `/clientes/${c.slug}`,
    })),
  ]

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
          mrrDelta={summary.mrrDelta}
          activeClients={summary.activeCount}
          inFlight={summary.inFlightCount}
          blocked={summary.blockedCount}
          outstanding={summary.outstanding}
          overdueCount={summary.overdueCount}
          health={summary.health}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Instrument
            label="Ingreso recurrente"
            hint="Últimos 12 meses, cierre de mes"
          >
            <div className="p-3">
              <RevenueChart data={summary.revenue} />
            </div>
          </Instrument>

          <Instrument
            label="Movimiento de ingreso"
            hint="Altas y expansión frente a cancelación"
          >
            <div className="p-3">
              <MovementChart data={summary.revenue} />
            </div>
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
