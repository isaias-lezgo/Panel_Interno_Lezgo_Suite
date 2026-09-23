"use client"

import Link from "next/link"
import { ArrowRightIcon, InfoIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { StatusChip } from "@/components/signal/status-chip"
import { money } from "@/lib/format"
import type { Currency } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The pit-wall readout. Five numbers, one row, hairline-separated — the state
 * of the agency in a single glance before anyone scrolls.
 *
 * Cada celda se abre: una cifra sin procedencia obliga a creer o a ir a
 * buscarla al código. El popover dice de qué sistema sale, cómo se calcula y
 * qué se quedó fuera.
 */

type Tone = "live" | "build" | "warn" | "risk" | "idle"

/**
 * Un registro de los que forman la cifra. Una cuenta de 34 no dice a quién
 * hay que llamar; la lista sí.
 */
export type BandItem = {
  id: string
  title: string
  /** Lo que lo distingue: el cliente, la subcuenta, lo que le falta. */
  meta?: string
  /** Etapa o estado. Punto y palabra, como en el resto del panel. */
  chip?: { tone: Tone; label: string }
  /** La cifra de la fila, ya formateada con su moneda. */
  value?: string
  href: string
}

/** Los registros detrás de cada celda, en el orden en que se leen. */
export type BandLists = {
  ingreso: BandItem[]
  clientes: BandItem[]
  proyectos: BandItem[]
  cobrar: BandItem[]
  enlaces: BandItem[]
}

/** La procedencia de una cifra, en el orden en que se lee. */
type Origin = {
  /** Los registros que la componen. */
  items: BandItem[]
  /** El encabezado de esa lista. */
  itemsLabel: string
  /** Qué decir cuando no hay ninguno. */
  itemsEmpty: string
  /** El sistema del que sale, en una frase. */
  source: string
  /** Las reglas que la forman. */
  how: string[]
  /** Lo que no entra en la cuenta, cuando hay algo que declarar. */
  excluded?: string
  href: string
  hrefLabel: string
}

export function TelemetryBand({
  mrr,
  activeClients,
  inFlight,
  blocked,
  outstanding,
  baseCurrency,
  overdueCount,
  unlinked,
  unlinkedNoStripe,
  unlinkedNoLocation,
  stripeLinkCount,
  orphanedCount,
  unconvertedClients,
  voidedInvoices,
  fxDefined,
  stripeConnected,
  lists,
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
  unlinkedNoStripe: number
  unlinkedNoLocation: number
  stripeLinkCount: number
  orphanedCount: number
  unconvertedClients: number
  voidedInvoices: number
  fxDefined: boolean
  stripeConnected: boolean
  lists: BandLists
}) {
  const ingreso: Origin = {
    items: lists.ingreso,
    itemsLabel: "Quién lo paga",
    itemsEmpty: "Ningún cliente enlazado tiene una suscripción activa.",
    source: stripeConnected
      ? `Stripe — las suscripciones activas de los ${stripeLinkCount} clientes de Stripe enlazados.`
      : "Nadie: falta STRIPE_SECRET_KEY, así que no hay suscripciones que sumar.",
    how: [
      "Cada suscripción se lleva a mes: una anual cuenta por su doceava parte.",
      `Se suman en ${baseCurrency.toUpperCase()}; las de otra moneda se convierten con STRIPE_FX_USD_MXN.`,
    ],
    excluded:
      !fxDefined && unconvertedClients > 0
        ? unconvertedClients === 1
          ? "1 cliente cobra en USD: sin STRIPE_FX_USD_MXN su suscripción no se convierte y queda fuera del total."
          : `${unconvertedClients} clientes cobran en USD: sin STRIPE_FX_USD_MXN sus suscripciones no se convierten y quedan fuera del total.`
        : undefined,
    href: "/clientes",
    hrefLabel: "Ver clientes",
  }

  const clientes: Origin = {
    items: lists.clientes,
    itemsLabel: "Quiénes son",
    itemsEmpty: "Ningún contacto tiene una oportunidad ganada.",
    source:
      "GoHighLevel — contactos con al menos una oportunidad ganada en el pipeline Ventas de la subcuenta Lezgo Suite.",
    how: [
      "Las oportunidades se agrupan por contacto: dos ganadas de la misma persona son un cliente, no dos.",
      "Se vuelve a leer al abrir Clientes si la última sincronización pasó de una hora.",
    ],
    excluded:
      orphanedCount > 0
        ? orphanedCount === 1
          ? "1 cuenta dejó de aparecer en GoHighLevel: queda marcada sin oportunidad y no cuenta."
          : `${orphanedCount} cuentas dejaron de aparecer en GoHighLevel: quedan marcadas sin oportunidad y no cuentan.`
        : undefined,
    href: "/clientes",
    hrefLabel: "Ver clientes",
  }

  const proyectos: Origin = {
    items: lists.proyectos,
    itemsLabel: "Cuáles son",
    itemsEmpty: "Todo lo registrado ya está en producción.",
    source: "El panel — las implementaciones registradas en la base.",
    how: [
      "Cuenta las que todavía no están en producción.",
      blocked > 0
        ? blocked === 1
          ? "1 está bloqueada y sigue contando: bloqueado no es entregado."
          : `${blocked} están bloqueadas y siguen contando: bloqueado no es entregado.`
        : "Una implementación bloqueada seguiría contando: bloqueado no es entregado.",
    ],
    href: "/implementaciones",
    hrefLabel: "Ver implementaciones",
  }

  const cobrar: Origin = {
    items: lists.cobrar,
    itemsLabel: "Qué falta cobrar",
    itemsEmpty: "No hay facturas sin pagar.",
    source: stripeConnected
      ? "Stripe — facturas emitidas en los últimos 12 meses que siguen sin pagarse."
      : "La base — las facturas guardadas en Neon.",
    how: [
      "Suma las que están por vencer y las vencidas.",
      "Vencida es la que Stripe intentó cobrar y ya no volverá a intentar, no la que pasó una fecha: en cobro automático no hay vencimiento.",
    ],
    excluded:
      voidedInvoices > 0
        ? voidedInvoices === 1
          ? "1 factura anulada o incobrable: no es dinero que se espere."
          : `${voidedInvoices} facturas anuladas o incobrables: no son dinero que se espere.`
        : "Las facturas anuladas e incobrables no cuentan.",
    href: "/facturacion",
    hrefLabel: "Ver facturación",
  }

  const enlaces: Origin = {
    items: lists.enlaces,
    itemsLabel: "A quiénes les falta",
    itemsEmpty: "Cada cliente activo tiene Stripe y subcuenta.",
    source: "El panel — clientes activos a los que les falta un enlace.",
    how: [
      `${unlinkedNoStripe} sin cliente de Stripe: no se les puede atribuir ningún cobro.`,
      `${unlinkedNoLocation} sin subcuenta de GoHighLevel: no se sabe en qué location trabajan.`,
    ],
    excluded:
      "Se enlazan solos cuando coincide el correo, el teléfono o el nombre exacto; el resto se elige a mano en la ficha.",
    href: "/clientes",
    hrefLabel: "Ver clientes",
  }

  return (
    <section
      aria-label="Telemetría de la cartera"
      className="grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x lg:grid-cols-5"
    >
      <Cell
        label="Ingreso recurrente"
        origin={ingreso}
        summary={money(mrr, baseCurrency)}
        className="col-span-2 sm:col-span-1"
      >
        <span className="num text-[26px] leading-none font-semibold">
          {money(mrr, baseCurrency)}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          suscripciones activas en Stripe · {activeClients} cuentas activas
        </p>
      </Cell>

      <Cell
        label="Clientes activos"
        origin={clientes}
        summary={String(activeClients)}
      >
        <span className="num text-[26px] leading-none font-semibold">
          {activeClients}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          con oportunidad ganada en Lezgo Suite
        </p>
      </Cell>

      <Cell
        label="Proyectos en curso"
        origin={proyectos}
        summary={String(inFlight)}
      >
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

      <Cell
        label="Por cobrar"
        origin={cobrar}
        summary={money(outstanding, baseCurrency)}
      >
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

      <Cell label="Sin enlazar" origin={enlaces} summary={String(unlinked)}>
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

/**
 * La celda abre la lista de registros: es lo que se busca al hacer clic. La
 * procedencia de la cifra —de qué sistema sale y cómo se calcula— vive
 * detrás de la (i) junto a la etiqueta, para quien la necesite.
 */
function Cell({
  label,
  origin,
  summary,
  children,
  className,
}: {
  label: string
  origin: Origin
  /** La cifra, para que el lector de pantalla anuncie qué se va a abrir. */
  summary: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative border-t border-border px-4 py-4 transition-colors first:border-t-0 hover:bg-muted/40 has-[[aria-expanded=true]]:bg-muted/40 sm:border-t-0",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`De dónde sale ${label}`}
                // Por encima de la superficie que abre la lista: dos destinos
                // distintos no pueden compartir el mismo clic.
                className="relative z-10 -m-1 rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            }
          >
            <InfoIcon className="size-3.5" aria-hidden />
          </PopoverTrigger>

          <PopoverContent align="start" className="w-80 gap-0 p-0">
            <div className="border-b border-border px-3.5 py-3">
              <PopoverTitle className="text-sm font-medium">
                {label}
              </PopoverTitle>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                {summary}
              </p>
            </div>

            <div className="space-y-3 px-3.5 py-3">
              <div>
                <p className="eyebrow mb-1.5">De dónde sale</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {origin.source}
                </p>
              </div>

              <div>
                <p className="eyebrow mb-1.5">Cómo se calcula</p>
                <ul className="space-y-1">
                  {origin.how.map((linea) => (
                    <li
                      key={linea}
                      className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground"
                    >
                      <span aria-hidden className="text-muted-foreground/50">
                        ·
                      </span>
                      {linea}
                    </li>
                  ))}
                </ul>
              </div>

              {origin.excluded && (
                <div>
                  <p className="eyebrow mb-1.5">Qué queda fuera</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {origin.excluded}
                  </p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`${label}: ${summary}. Ver cuáles son.`}
              // El ::after estira el clic a toda la celda sin anidar un botón
              // dentro de otro.
              className="block w-full text-left after:absolute after:inset-0 after:outline-offset-[-2px] focus-visible:z-10 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring"
            />
          }
        >
          {children}
        </PopoverTrigger>

        <PopoverContent align="start" className="w-88 gap-0 p-0">
          <div className="border-b border-border px-3.5 py-3">
            <PopoverTitle className="text-sm font-medium">
              {origin.itemsLabel}
            </PopoverTitle>
            <p className="num mt-0.5 text-xs text-muted-foreground">
              {label} · {summary}
            </p>
          </div>

          <div className="px-3.5 py-3">
            {origin.items.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {origin.itemsEmpty}
              </p>
            ) : (
              // Con más de ocho la lista se desplaza sola en vez de estirar el
              // popover fuera de la pantalla.
              <ul className="-mx-1.5 max-h-72 overflow-y-auto">
                {origin.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {item.title}
                        </span>
                        {item.value && (
                          <span className="num shrink-0 text-xs">
                            {item.value}
                          </span>
                        )}
                      </span>
                      {(item.chip || item.meta) && (
                        <span className="mt-1 flex items-center gap-1.5">
                          {item.chip && (
                            <StatusChip
                              tone={item.chip.tone}
                              className="shrink-0 px-1.5 py-0 text-[11px]"
                            >
                              {item.chip.label}
                            </StatusChip>
                          )}
                          {item.meta && (
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {item.meta}
                            </span>
                          )}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-3.5 py-2.5">
            <Link
              href={origin.href}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {origin.hrefLabel}
              <ArrowRightIcon className="size-3" aria-hidden />
            </Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
