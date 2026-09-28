import Link from "next/link"
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react"

import { Instrument } from "@/components/panel/page-header"
import { LinkButton } from "@/components/panel/link-button"
import { StatusChip } from "@/components/signal/status-chip"
import { money, moneyExact, moneySigned, shortDate } from "@/lib/format"
import type { CobranzaRow } from "@/lib/repository"
import {
  sumByCurrency,
  type ByCurrency,
  type CobranzaSection,
  type CobranzaTone,
  type summarizeCobranza,
} from "@/lib/stripe/cobranza"
import { formatInMexico, mexicoDay, shiftMonth } from "@/lib/time"
import type { Currency } from "@/lib/types"
import { cn } from "@/lib/utils"

type Summary = ReturnType<typeof summarizeCobranza>

/* ------------------------------------------------------------- Selector */

export function monthLabel(month: string) {
  const label = formatInMexico(`${month}-01`, "es-MX", {
    month: "long",
    year: "numeric",
  }).replace(" de ", " ")
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthNav({ month }: { month: string }) {
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      <LinkButton
        href={`/facturacion?mes=${prev}`}
        variant="ghost"
        size="icon-sm"
        aria-label={`Ver ${monthLabel(prev)}`}
      >
        <ChevronLeft aria-hidden />
      </LinkButton>
      <span className="num min-w-32 text-center text-sm font-medium">
        {monthLabel(month)}
      </span>
      <LinkButton
        href={`/facturacion?mes=${next}`}
        variant="ghost"
        size="icon-sm"
        aria-label={`Ver ${monthLabel(next)}`}
      >
        <ChevronRight aria-hidden />
      </LinkButton>
    </div>
  )
}

/* --------------------------------------------------------------- Montos */

/**
 * Un total partido por moneda: la base primero y lo demás rotulado. No se
 * convierte nada; MXN y USD se suman cada uno por su lado.
 */
function Amounts({ total, base }: { total: ByCurrency; base: Currency }) {
  const parts = (Object.entries(total) as [Currency, number][])
    .filter(([, v]) => v)
    .sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)))
  if (parts.length === 0) return <>{money(0, base)}</>
  return (
    <>
      {parts.map(([c, v], i) => (
        <span key={c}>
          {i > 0 && " + "}
          {moneySigned(v, c, base)}
        </span>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ KPI */

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: React.ReactNode
  sub: React.ReactNode
  tone?: "live" | "risk" | "warn"
}) {
  return (
    <div className="border-t border-border px-4 py-4 [&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(-n+3)]:border-t-0 xl:border-t-0">
      <p className="eyebrow mb-2.5">{label}</p>
      <p
        className={cn("num text-[22px] leading-none font-semibold", {
          "text-status-live": tone === "live",
          "text-status-risk": tone === "risk",
          "text-status-warn": tone === "warn",
        })}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

/** Lo que no es la moneda base, para el pie de la cifra grande. */
function Others({ total, base }: { total: ByCurrency; base: Currency }) {
  const others = (Object.entries(total) as [Currency, number][]).filter(
    ([c, v]) => c !== base && v,
  )
  if (others.length === 0) return null
  return (
    <>
      {others.map(([c, v]) => (
        <span key={c} className="num">
          {moneySigned(v, c, base)} ·{" "}
        </span>
      ))}
    </>
  )
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

export function CobranzaKpis({
  summary,
  base,
}: {
  summary: Summary
  base: Currency
}) {
  const { collected, upcoming, month, unpaid, recharges, attention } = summary
  return (
    <section className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 xl:grid-cols-6 xl:divide-x">
      <Kpi
        label="Cobrado este mes"
        tone="live"
        value={money(collected.total[base] ?? 0, base)}
        sub={
          <>
            <Others total={collected.total} base={base} />
            {plural(collected.count, "cobro", "cobros")}
          </>
        }
      />
      <Kpi
        label="Por cobrar este mes"
        value={money(upcoming.total[base] ?? 0, base)}
        sub={
          <>
            <Others total={upcoming.total} base={base} />
            {plural(upcoming.count, "programado", "programados")}
          </>
        }
      />
      <Kpi
        label="Total del mes"
        value={money(month[base] ?? 0, base)}
        sub={
          <>
            <Others total={month} base={base} />
            cobrado más por cobrar
          </>
        }
      />
      <Kpi
        label="Facturas sin cobrar"
        tone={unpaid.count ? "warn" : "live"}
        value={<Amounts total={unpaid.total} base={base} />}
        sub={plural(unpaid.count, "pendiente", "pendientes")}
      />
      <Kpi
        label="Recargas cobradas"
        value={recharges.count}
        sub={<Amounts total={recharges.total} base={base} />}
      />
      <Kpi
        label="Requieren atención"
        tone={attention.count ? "risk" : "live"}
        value={attention.count}
        sub={
          attention.count ? (
            <Amounts total={attention.total} base={base} />
          ) : (
            "Todo al día"
          )
        }
      />
    </section>
  )
}

/* -------------------------------------------------------------- Avisos */

export function CobranzaAlerts({
  summary,
  base,
}: {
  summary: Summary
  base: Currency
}) {
  const { attention, refunds } = summary
  if (!attention.count && !refunds.count) return null
  return (
    <div className="space-y-2">
      {attention.count > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-status-risk/40 bg-card px-4 py-3 text-sm">
          <span aria-hidden className="size-1.5 rounded-full bg-status-risk" />
          <span>
            {plural(attention.count, "cobro vencido", "cobros vencidos")} por{" "}
            <span className="num font-medium">
              <Amounts total={attention.total} base={base} />
            </span>
            . Están arriba de la columna de pendientes.
          </span>
        </p>
      )}
      {refunds.count > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden className="size-1.5 rounded-full bg-status-idle" />
          <span>
            {plural(refunds.count, "reembolso o disputa", "reembolsos o disputas")}{" "}
            este mes por{" "}
            <span className="num font-medium">
              <Amounts total={refunds.total} base={base} />
            </span>
            .
          </span>
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ Columnas */

function Row({ row, base }: { row: CobranzaRow; base: Currency }) {
  // En una recarga manda la subcuenta: el cliente de Stripe suele ser la
  // agencia que la paga.
  const name =
    row.section === "recharges" ? row.customerName : (row.client?.name ?? row.customerName)
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        {row.client ? (
          <Link
            href={`/clientes/${row.client.slug}`}
            className="block truncate text-sm font-medium hover:text-primary"
          >
            {name}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium">{name}</span>
        )}
        {row.customerEmail && (
          <span className="block truncate text-xs text-muted-foreground">
            {row.customerEmail}
          </span>
        )}
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {row.concept}
          {row.cancelDay && (
            <span className="text-status-warn">
              {" "}
              · se cancela {shortDate(row.cancelDay)}
            </span>
          )}
        </span>
        <a
          href={row.stripeUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 inline-flex max-w-full items-center gap-0.5 truncate text-xs text-muted-foreground hover:text-primary"
        >
          <span className={cn("truncate", /^[a-z]{2,5}_/.test(row.ref) && "mono")}>
            {row.ref}
          </span>
          <ArrowUpRight className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">Abrir en Stripe</span>
        </a>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm font-semibold">
          {row.amount === null
            ? "Por confirmar"
            : row.currency === base
              ? moneyExact(row.amount, row.currency)
              : `${moneyExact(row.amount, row.currency)} ${row.currency.toUpperCase()}`}
        </p>
        {row.day && (
          <p
            className={cn(
              "num mt-0.5 text-xs",
              row.overdue ? "font-medium text-status-risk" : "text-muted-foreground",
            )}
          >
            {row.approx && "~"}
            {shortDate(row.day)}
          </p>
        )}
        <div className="mt-1.5">
          <StatusChip tone={row.tone}>{row.label}</StatusChip>
        </div>
      </div>
    </li>
  )
}

/** Cuántos renglones enseña cada sección antes de "Ver los restantes". */
const VISIBLE = 5

function Section({
  label,
  rows,
  base,
}: {
  label: string
  rows: CobranzaRow[]
  base: Currency
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-y border-border bg-muted/40 px-4 py-2 first:border-t-0">
        <h3 className="eyebrow">
          {label} <span className="num">· {rows.length}</span>
        </h3>
        <span className="num text-xs font-medium">
          <Amounts total={sumByCurrency(rows)} base={base} />
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.slice(0, VISIBLE).map((r) => (
          <Row key={r.id} row={r} base={base} />
        ))}
      </ul>
      {rows.length > VISIBLE && (
        <details className="group border-t border-border">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Ver {rows.length - VISIBLE === 1 ? "el restante" : `los ${rows.length - VISIBLE} restantes`}
            </span>
            <span className="hidden group-open:inline">Ocultar</span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {rows.slice(VISIBLE).map((r) => (
              <Row key={r.id} row={r} base={base} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

const byDayDesc = (a: CobranzaRow, b: CobranzaRow) =>
  (b.day ?? "").localeCompare(a.day ?? "")
const byDayAsc = (a: CobranzaRow, b: CobranzaRow) =>
  (a.day ?? "9999").localeCompare(b.day ?? "9999")

const PENDING: { section: CobranzaSection; label: string; asc?: boolean }[] = [
  { section: "failed", label: "Cobros fallidos, acción urgente" },
  { section: "open", label: "Facturas emitidas sin cobrar", asc: true },
  { section: "refunds", label: "Reembolsos y disputas del mes" },
  { section: "scheduled", label: "Suscripciones nuevas que inician", asc: true },
  { section: "paused", label: "Pausadas que reanudan", asc: true },
  { section: "draft", label: "Borradores por resolver" },
]

const COLLECTED: { section: CobranzaSection; label: string; asc?: boolean }[] = [
  { section: "paid", label: "Facturas cobradas" },
  { section: "loose", label: "Transferencias y cobros sin factura" },
  { section: "recharges", label: "Recargas de wallet" },
  { section: "renewals", label: "Renovaciones automáticas por venir", asc: true },
]

function Column({
  label,
  hint,
  groups,
  rows,
  base,
  empty,
}: {
  label: string
  hint: string
  groups: typeof PENDING
  rows: CobranzaRow[]
  base: Currency
  empty: string
}) {
  const mine = rows.filter((r) => groups.some((g) => g.section === r.section))
  return (
    <Instrument
      className="min-w-0"
      label={label}
      hint={hint}
      action={
        <span className="num shrink-0 text-sm font-semibold">
          <Amounts total={sumByCurrency(mine)} base={base} />
        </span>
      }
    >
      {mine.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        groups.map((g) => (
          <Section
            key={g.section}
            label={g.label}
            base={base}
            rows={mine
              .filter((r) => r.section === g.section)
              .sort(g.asc ? byDayAsc : byDayDesc)}
          />
        ))
      )}
    </Instrument>
  )
}

export function CobranzaColumns({
  rows,
  base,
}: {
  rows: CobranzaRow[]
  base: Currency
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Column
        label="Pendiente de cobro y próximos"
        hint="Las facturas abiertas salen aunque sean de otro mes"
        groups={PENDING}
        rows={rows}
        base={base}
        empty="Nada pendiente ni por arrancar este mes."
      />
      <Column
        label="Cobros del mes"
        hint="Lo que entró y las renovaciones que faltan"
        groups={COLLECTED}
        rows={rows}
        base={base}
        empty="Sin cobros registrados este mes."
      />
    </div>
  )
}

/* ----------------------------------------------------------- Calendario */

type Kind = "collected" | "failed" | "upcoming" | "pending"

const kindOf = (s: CobranzaSection): Kind =>
  s === "paid" || s === "loose" || s === "recharges"
    ? "collected"
    : s === "failed"
      ? "failed"
      : s === "renewals" || s === "scheduled" || s === "paused"
        ? "upcoming"
        : "pending"

const KIND: Record<Kind, { label: string; tone: CobranzaTone; order: number }> = {
  failed: { label: "Fallido", tone: "risk", order: 0 },
  collected: { label: "Cobrado", tone: "live", order: 1 },
  upcoming: { label: "Programado", tone: "build", order: 2 },
  pending: { label: "Pendiente", tone: "warn", order: 3 },
}

const dot: Record<CobranzaTone, string> = {
  live: "bg-status-live",
  build: "bg-status-build",
  warn: "bg-status-warn",
  risk: "bg-status-risk",
  idle: "bg-status-idle",
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

/**
 * El total de un día es dinero que entra: lo cobrado y lo programado. Un
 * reembolso o una factura pendiente se listan, pero sumarlos inflaría el día.
 */
function dayTotal(list: CobranzaRow[]) {
  return sumByCurrency(
    list.filter((r) => {
      const k = kindOf(r.section)
      return k === "collected" || k === "upcoming"
    }),
  )
}

function displayName(r: CobranzaRow) {
  return r.section === "recharges" ? r.customerName : (r.client?.name ?? r.customerName)
}

export function CobranzaCalendar({
  month,
  rows,
  base,
}: {
  month: string
  rows: CobranzaRow[]
  base: Currency
}) {
  const [y, m] = month.split("-").map(Number)
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = mexicoDay()

  const byDay = new Map<number, CobranzaRow[]>()
  for (const r of rows) {
    if (!r.day || !r.day.startsWith(month)) continue
    const d = Number(r.day.slice(8, 10))
    byDay.set(d, [...(byDay.get(d) ?? []), r])
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => KIND[kindOf(a.section)].order - KIND[kindOf(b.section)].order)
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  while (cells.length % 7) cells.push(null)

  const dayKey = (d: number) => `${month}-${String(d).padStart(2, "0")}`
  const withEvents = [...byDay.keys()].sort((a, b) => a - b)

  return (
    <Instrument
      className="min-w-0"
      label={`Calendario de cobros, ${monthLabel(month).toLowerCase()}`}
      hint="Cada día con lo que se cobró, lo que falló y lo que está programado"
      action={
        <ul className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          {(Object.keys(KIND) as Kind[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-1.5 rounded-full", dot[KIND[k].tone])} />
              {KIND[k].label}
            </li>
          ))}
        </ul>
      }
    >
      {/* Rejilla de siete columnas desde tableta; en teléfono, lista por día. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="eyebrow px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) {
              return (
                <div
                  key={`x${i}`}
                  className="min-h-24 border-r border-b border-border bg-muted/30 [&:nth-child(7n)]:border-r-0"
                />
              )
            }
            const list = byDay.get(d) ?? []
            const isToday = dayKey(d) === today
            return (
              <div
                key={d}
                className={cn(
                  "min-h-24 min-w-0 border-r border-b border-border p-1.5 [&:nth-child(7n)]:border-r-0",
                  isToday && "bg-primary/5",
                )}
              >
                <p
                  className={cn(
                    "num mb-1 text-xs",
                    isToday ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {d}
                  {isToday && <span className="sr-only"> (hoy)</span>}
                </p>
                {list.slice(0, 2).map((r) => (
                  <p
                    key={r.id}
                    title={`${displayName(r)} · ${r.label}${r.amount ? ` · ${moneyExact(r.amount, r.currency)}` : ""}`}
                    className="flex items-center gap-1 truncate text-[11px] leading-5"
                  >
                    <span
                      aria-hidden
                      className={cn("size-1.5 shrink-0 rounded-full", dot[KIND[kindOf(r.section)].tone])}
                    />
                    <span className="truncate">{displayName(r)}</span>
                  </p>
                ))}
                {list.length > 2 && (
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    y {list.length - 2} más
                  </p>
                )}
                {list.length > 0 && (
                  <p className="num mt-1 border-t border-border pt-1 text-[11px] font-medium">
                    <Amounts total={dayTotal(list)} base={base} />
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="md:hidden">
        {withEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Sin cobros registrados este mes.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {withEvents.map((d) => {
              const list = byDay.get(d)!
              return (
                <li key={d} className="flex gap-3 px-4 py-3">
                  <p className="num w-12 shrink-0 text-sm font-semibold">
                    {shortDate(dayKey(d))}
                  </p>
                  <div className="min-w-0 flex-1 space-y-1">
                    {list.map((r) => (
                      <p key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            aria-hidden
                            className={cn("size-1.5 shrink-0 rounded-full", dot[KIND[kindOf(r.section)].tone])}
                          />
                          <span className="truncate">{displayName(r)}</span>
                          <span className="sr-only">, {KIND[kindOf(r.section)].label}</span>
                        </span>
                        <span className="num shrink-0 text-xs">
                          {r.amount === null ? "Por confirmar" : moneySigned(r.amount, r.currency, base)}
                        </span>
                      </p>
                    ))}
                    <p className="num border-t border-border pt-1 text-xs font-medium">
                      Total: <Amounts total={dayTotal(list)} base={base} />
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Instrument>
  )
}
