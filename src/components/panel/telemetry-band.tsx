import { money } from "@/lib/format"
import type { Currency } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The pit-wall readout. Five numbers, one row, hairline-separated — the state
 * of the agency in a single glance before anyone scrolls.
 */
export function TelemetryBand({
  mrr,
  activeClients,
  inFlight,
  blocked,
  outstanding,
  baseCurrency,
  overdueCount,
  unlinked,
}: {
  /** Centavos de `baseCurrency`. */
  mrr: number
  activeClients: number
  inFlight: number
  blocked: number
  outstanding: number
  baseCurrency: Currency
  overdueCount: number
  /** Clientes activos sin Stripe o sin subcuenta enlazada. */
  unlinked: number
}) {
  return (
    <section
      aria-label="Telemetría de la cartera"
      className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x lg:grid-cols-5"
    >
      <Cell label="Ingreso recurrente" className="col-span-2 sm:col-span-1">
        <span className="num text-[26px] leading-none font-semibold">
          {money(mrr, baseCurrency)}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          suscripciones activas en Stripe · {activeClients} cuentas activas
        </p>
      </Cell>

      <Cell label="Clientes activos">
        <span className="num text-[26px] leading-none font-semibold">
          {activeClients}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          con oportunidad ganada en Lezgo Suite
        </p>
      </Cell>

      <Cell label="Proyectos en curso">
        <div className="flex items-baseline gap-2">
          <span className="num text-[26px] leading-none font-semibold">
            {inFlight}
          </span>
          {blocked > 0 && (
            <span className="num text-xs text-status-warn">
              {blocked} bloqueados
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          implementaciones aún no lanzadas
        </p>
      </Cell>

      <Cell label="Por cobrar">
        <div className="flex items-baseline gap-2">
          <span className="num text-[26px] leading-none font-semibold">
            {money(outstanding, baseCurrency)}
          </span>
          {overdueCount > 0 && (
            <span className="num text-xs text-status-risk">
              {overdueCount} vencidas
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          facturado y sin pagar
        </p>
      </Cell>

      <Cell label="Sin enlazar">
        <span
          className={cn(
            "num text-[26px] leading-none font-semibold",
            unlinked > 0 && "text-status-warn",
          )}
        >
          {unlinked}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          clientes sin Stripe o sin subcuenta
        </p>
      </Cell>
    </section>
  )
}

function Cell({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-t border-border px-4 py-4 first:border-t-0 sm:border-t-0",
        className,
      )}
    >
      <p className="eyebrow mb-2.5">{label}</p>
      {children}
    </div>
  )
}
