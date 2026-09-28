import type Stripe from "stripe"

import { shortDate } from "@/lib/format"
import { dayFromEpoch } from "@/lib/time"
import type { Currency } from "@/lib/types"

import { deriveStatus, toCurrency } from "./map"

/**
 * La cobranza de un mes, tal como la lee el equipo: lo que ya entró, lo que
 * falta por entrar y lo que se atoró. Todo sale de Stripe y es de solo
 * lectura.
 *
 * Lo cobrado tiene tres fuentes y ninguna se cuenta dos veces:
 *
 * 1. Facturas pagadas en el mes (por `paid_at`).
 * 2. Recargas de wallet: cargos de GHL cuyo concepto dice "recharge".
 * 3. Cobros sin factura: SPEI, links de pago de GHL, cobros a mano.
 *
 * Desde la API 2025-03-31 el cargo ya no trae `invoice`, así que "sin
 * factura" no se puede leer del cargo: se decide contra los `payment_intent`
 * de `invoice_payments`. Un tablero que filtraba con `!charge.invoice`
 * sumaba cada factura pagada dos veces.
 */

export type CobranzaSection =
  /** Suscripción `past_due`: el cobro automático falló. */
  | "failed"
  /** Factura emitida sin pagar, de cualquier mes. */
  | "open"
  | "draft"
  | "refunds"
  /** Schedule con una fase que arranca en el mes. */
  | "scheduled"
  | "paused"
  | "paid"
  | "loose"
  | "recharges"
  | "renewals"

export type CobranzaTone = "live" | "build" | "warn" | "risk" | "idle"

export type CobranzaItem = {
  id: string
  section: CobranzaSection
  customerId: string | null
  customerName: string
  customerEmail: string | null
  /** Qué se cobra: producto, concepto de la factura o del cargo. */
  concept: string
  /** Folio, id o cuenta de la que viene, en una línea. */
  ref: string
  /** Centavos de `currency`. `null` cuando Stripe no dice cuánto. */
  amount: number | null
  currency: Currency
  /** Día (`YYYY-MM-DD`, GMT-6) del cobro, del intento o del vencimiento. */
  day: string | null
  /** La fecha es la de un cobro programado; puede moverse. */
  approx: boolean
  tone: CobranzaTone
  label: string
  /** Día en que la suscripción se cancela, si ya está programado. */
  cancelDay: string | null
  /** Para los que cuentan como "requiere atención". */
  overdue: boolean
  stripeUrl: string
}

export type CustomerInfo = { name: string | null; email: string | null }

export type CobranzaInput = {
  range: { start: number; end: number }
  now: Date
  /** Suscripciones `active`, `trialing` y `unpaid`. */
  subscriptions: Stripe.Subscription[]
  pastDue: Stripe.Subscription[]
  openInvoices: Stripe.Invoice[]
  draftInvoices: Stripe.Invoice[]
  /** Facturas pagadas; se filtran aquí por `paid_at`. */
  paidInvoices: Stripe.Invoice[]
  schedules: Stripe.SubscriptionSchedule[]
  /** Precios de las fases de los schedules, por id. */
  prices: Map<string, Stripe.Price>
  refunds: Stripe.Refund[]
  disputes: Stripe.Dispute[]
  /** Cargos creados en el mes. */
  charges: Stripe.Charge[]
  /** `payment_intent` que pagaron alguna factura. */
  invoiceIntents: Set<string>
  customers: Map<string, CustomerInfo>
  /** Nombre de cada producto, por id: los items traen solo el id. */
  products: Map<string, string>
}

const DASHBOARD = "https://dashboard.stripe.com"

export function stripeUrl(id: string) {
  if (id.startsWith("sub_sched_")) return `${DASHBOARD}/subscription_schedules/${id}`
  if (id.startsWith("sub_")) return `${DASHBOARD}/subscriptions/${id}`
  if (id.startsWith("in_")) return `${DASHBOARD}/invoices/${id}`
  if (id.startsWith("cus_")) return `${DASHBOARD}/customers/${id}`
  if (id.startsWith("re_")) return `${DASHBOARD}/refunds/${id}`
  if (id.startsWith("dp_") || id.startsWith("du_")) return `${DASHBOARD}/disputes/${id}`
  return `${DASHBOARD}/payments/${id}`
}

const idOf = (x: string | { id: string } | null | undefined) =>
  typeof x === "string" ? x : (x?.id ?? null)

const inRange = (t: number | null | undefined, r: { start: number; end: number }) =>
  t != null && t >= r.start && t <= r.end

/** "Recharge" en el concepto: así rotula GHL las recargas de wallet. */
export const isRecharge = (charge: Stripe.Charge) =>
  (charge.description ?? "").toLowerCase().includes("recharge")

/**
 * La subcuenta de una recarga: "... Sub-Account - Inmobiliaria X of Lezgo".
 * Es más útil que el nombre del cliente de Stripe, que suele ser la agencia.
 */
export function subAccountName(description: string | null) {
  const m = (description ?? "").match(/Sub-Account\s*-\s*(.+?)\s+of\s+/i)
  return m ? m[1].trim() : null
}

/** La línea de mayor importe: Stripe a veces devuelve primero la del IVA. */
function mainLine(invoice: Stripe.Invoice) {
  let best: Stripe.InvoiceLineItem | null = null
  for (const line of invoice.lines?.data ?? []) {
    if (!line.description) continue
    if (!best || line.amount > best.amount) best = line
  }
  return best?.description ?? invoice.description ?? null
}

function itemLabel(item: Stripe.SubscriptionItem, products: Map<string, string>) {
  const product = item.price.product
  const name =
    typeof product === "string"
      ? products.get(product)
      : product && "name" in product
        ? product.name
        : null
  const qty = item.quantity ?? 1
  const label = name || item.price.nickname || "Suscripción"
  return qty > 1 ? `${qty} × ${label}` : label
}

function itemAmount(item: Stripe.SubscriptionItem) {
  const unit = item.price.unit_amount
  return unit === null ? null : unit * (item.quantity ?? 1)
}

const disputeState: Record<string, { label: string; tone: CobranzaTone }> = {
  won: { label: "Disputa ganada", tone: "live" },
  lost: { label: "Disputa perdida", tone: "risk" },
  needs_response: { label: "Disputa sin respuesta", tone: "warn" },
  warning_needs_response: { label: "Disputa sin respuesta", tone: "warn" },
}

export function buildCobranza(input: CobranzaInput): CobranzaItem[] {
  const { range, now } = input
  const items: CobranzaItem[] = []

  const who = (id: string | null, fallback?: CustomerInfo) => {
    const known = id ? input.customers.get(id) : undefined
    return {
      customerId: id,
      customerName:
        known?.name || fallback?.name || known?.email || fallback?.email || id || "Sin cliente",
      customerEmail: known?.email || fallback?.email || null,
    }
  }

  // Cobros fallidos: el periodo que no se pudo cobrar ya empezó.
  for (const s of input.pastDue) {
    const currency = toCurrency(s.currency)
    if (!currency) continue
    for (const si of s.items.data) {
      if (si.current_period_end > range.end) continue
      items.push({
        id: `${s.id}:${si.id}`,
        section: "failed",
        ...who(idOf(s.customer)),
        concept: itemLabel(si, input.products),
        ref: s.id,
        amount: itemAmount(si),
        currency,
        day: dayFromEpoch(si.current_period_start),
        approx: false,
        tone: "risk",
        label: "Cobro fallido",
        cancelDay: s.cancel_at ? dayFromEpoch(s.cancel_at) : null,
        overdue: true,
        stripeUrl: stripeUrl(s.id),
      })
    }
  }

  // Facturas abiertas: siempre, sin importar el mes. Es dinero emitido y no
  // cobrado; esconderla por su fecha la hace desaparecer de la cobranza.
  for (const inv of input.openInvoices) {
    const currency = toCurrency(inv.currency)
    if (!currency || !inv.id) continue
    const overdue = deriveStatus(inv, now) === "overdue"
    const folio = inv.number ? `Factura ${inv.number}` : inv.id
    const due = inv.due_date
      ? `${overdue ? "venció" : "vence"} el ${shortDate(dayFromEpoch(inv.due_date))}`
      : "sin vencimiento"
    items.push({
      id: inv.id,
      section: "open",
      ...who(idOf(inv.customer), { name: inv.customer_name, email: inv.customer_email }),
      concept: mainLine(inv) ?? "Factura",
      ref: `${folio} · ${due}`,
      amount: inv.amount_remaining || inv.amount_due,
      currency,
      day: inv.due_date ? dayFromEpoch(inv.due_date) : null,
      approx: false,
      tone: overdue ? "risk" : "warn",
      label: overdue ? "Vencida" : "Por cobrar",
      cancelDay: null,
      overdue,
      stripeUrl: stripeUrl(inv.id),
    })
  }

  for (const inv of input.draftInvoices) {
    const currency = toCurrency(inv.currency)
    if (!currency || !inv.id) continue
    items.push({
      id: inv.id,
      section: "draft",
      ...who(idOf(inv.customer), { name: inv.customer_name, email: inv.customer_email }),
      concept: mainLine(inv) ?? "Factura en borrador",
      ref: inv.id,
      amount: inv.amount_due,
      currency,
      day: null,
      approx: false,
      tone: "idle",
      label: "Borrador",
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(inv.id),
    })
  }

  for (const r of input.refunds) {
    const currency = toCurrency(r.currency)
    if (!currency || r.status === "failed" || r.status === "canceled") continue
    const charge = typeof r.charge === "object" ? r.charge : null
    items.push({
      id: r.id,
      section: "refunds",
      ...who(idOf(charge?.customer), {
        name: charge?.billing_details?.name ?? null,
        email: charge?.billing_details?.email ?? null,
      }),
      concept: charge?.description || "Reembolso",
      ref: r.id,
      amount: r.amount,
      currency,
      day: dayFromEpoch(r.created),
      approx: false,
      tone: "idle",
      label: "Reembolsado",
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(r.id),
    })
  }

  for (const d of input.disputes) {
    const currency = toCurrency(d.currency)
    if (!currency) continue
    const charge = typeof d.charge === "object" ? d.charge : null
    const state = disputeState[d.status] ?? { label: "Disputa abierta", tone: "warn" as const }
    items.push({
      id: d.id,
      section: "refunds",
      ...who(idOf(charge?.customer), {
        name: charge?.billing_details?.name ?? null,
        email: charge?.billing_details?.email ?? null,
      }),
      concept: `Contracargo: ${d.reason.replaceAll("_", " ")}`,
      ref: d.id,
      amount: d.amount,
      currency,
      day: dayFromEpoch(d.created),
      approx: false,
      tone: state.tone,
      label: state.label,
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(d.id),
    })
  }

  // Cargos del mes que no pagaron una factura. Uno reembolsado completo no
  // es dinero que entró; el reembolso ya aparece en su propia sección.
  for (const ch of input.charges) {
    if (ch.status !== "succeeded" || ch.refunded) continue
    const pi = idOf(ch.payment_intent)
    if (pi && input.invoiceIntents.has(pi)) continue
    const currency = toCurrency(ch.currency)
    if (!currency) continue
    const base = who(idOf(ch.customer), {
      name: ch.billing_details?.name ?? null,
      email: ch.billing_details?.email ?? null,
    })

    if (isRecharge(ch)) {
      const manual = (ch.description ?? "").toLowerCase().includes("manual recharge")
      const sub = subAccountName(ch.description)
      items.push({
        id: ch.id,
        section: "recharges",
        ...base,
        customerName: sub ?? base.customerName,
        concept: manual ? "Recarga manual de wallet" : "Autorecarga de wallet",
        ref: sub && sub !== base.customerName ? `Cuenta: ${base.customerName}` : ch.id,
        amount: ch.amount,
        currency,
        day: dayFromEpoch(ch.created),
        approx: false,
        tone: "live",
        label: manual ? "Manual" : "Autorecarga",
        cancelDay: null,
        overdue: false,
        stripeUrl: stripeUrl(ch.id),
      })
      continue
    }

    const transfer =
      ch.payment_method_details?.type === "customer_balance" ||
      (ch.payment_method_details?.type ?? "").includes("transfer") ||
      ch.id.startsWith("py_")
    const itemsDesc =
      typeof ch.metadata?.itemsDescriptions === "string"
        ? ch.metadata.itemsDescriptions.replace("/YYYY", "")
        : null
    items.push({
      id: ch.id,
      section: "loose",
      ...base,
      concept:
        ch.description || itemsDesc || (transfer ? "Pago por transferencia" : "Cobro directo"),
      ref: ch.id,
      amount: ch.amount,
      currency,
      day: dayFromEpoch(ch.created),
      approx: false,
      tone: "live",
      label: transfer ? "Transferencia" : "Cobro directo",
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(ch.id),
    })
  }

  for (const inv of input.paidInvoices) {
    const paidAt = inv.status_transitions?.paid_at ?? inv.created
    if (!inRange(paidAt, range)) continue
    const currency = toCurrency(inv.currency)
    if (!currency || !inv.id) continue
    items.push({
      id: inv.id,
      section: "paid",
      ...who(idOf(inv.customer), { name: inv.customer_name, email: inv.customer_email }),
      concept: mainLine(inv) ?? "Suscripción cobrada",
      ref: inv.number ? `Factura ${inv.number}` : inv.id,
      amount: inv.amount_paid,
      currency,
      day: dayFromEpoch(paidAt),
      approx: false,
      tone: "live",
      label: "Cobrado",
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(inv.id),
    })
  }

  for (const s of input.subscriptions) {
    const currency = toCurrency(s.currency)
    if (!currency) continue
    const cancelDay = s.cancel_at ? dayFromEpoch(s.cancel_at) : null
    const resumes = s.pause_collection?.resumes_at ?? null

    if (s.pause_collection) {
      if (!inRange(resumes, range)) continue
      for (const si of s.items.data) {
        items.push({
          id: `${s.id}:${si.id}:pausa`,
          section: "paused",
          ...who(idOf(s.customer)),
          concept: itemLabel(si, input.products),
          ref: `En pausa · ${s.id}`,
          amount: itemAmount(si),
          currency,
          day: dayFromEpoch(resumes!),
          approx: true,
          tone: "build",
          label: "Reanuda",
          cancelDay,
          overdue: false,
          stripeUrl: stripeUrl(s.id),
        })
      }
      continue
    }

    for (const si of s.items.data) {
      if (!si.price.recurring || !inRange(si.current_period_end, range)) continue
      // Si la suscripción se cancela en el corte o antes, ese cobro ya no va
      // a pasar: no es dinero por entrar.
      if (s.cancel_at && s.cancel_at <= si.current_period_end) continue
      items.push({
        id: `${s.id}:${si.id}`,
        section: "renewals",
        ...who(idOf(s.customer)),
        concept: itemLabel(si, input.products),
        ref: si.id,
        amount: itemAmount(si),
        currency,
        day: dayFromEpoch(si.current_period_end),
        approx: true,
        tone: "build",
        label: "Automático",
        cancelDay,
        overdue: false,
        stripeUrl: stripeUrl(s.id),
      })
    }
  }

  for (const sch of input.schedules) {
    const phase = sch.phases?.find((p) => inRange(p.start_date, range))
    if (!phase) continue
    let amount = 0
    let currency: Currency | null = toCurrency(phase.currency ?? "")
    let priced = false
    const names: string[] = []
    for (const pi of phase.items ?? []) {
      const price = input.prices.get(idOf(pi.price) ?? "")
      if (!price || price.unit_amount === null) continue
      priced = true
      amount += price.unit_amount * (pi.quantity ?? 1)
      currency ??= toCurrency(price.currency)
      const product = typeof price.product === "string" ? input.products.get(price.product) : null
      const name = product || price.nickname
      if (name) names.push(name)
    }
    if (!currency) continue
    items.push({
      id: sch.id,
      section: "scheduled",
      ...who(idOf(sch.customer)),
      concept: names.length ? names.join(" + ") : "Suscripción programada",
      ref: sch.id,
      amount: priced ? amount : null,
      currency,
      day: dayFromEpoch(phase.start_date),
      approx: false,
      tone: "build",
      label: "Programada",
      cancelDay: null,
      overdue: false,
      stripeUrl: stripeUrl(sch.id),
    })
  }

  return items
}

/* ---------------------------------------------------------------- Totales */

export type ByCurrency = Partial<Record<Currency, number>>

export function sumByCurrency(items: CobranzaItem[]): ByCurrency {
  const out: ByCurrency = {}
  for (const i of items) {
    if (!i.amount) continue
    out[i.currency] = (out[i.currency] ?? 0) + i.amount
  }
  return out
}

export function addTotals(...totals: ByCurrency[]): ByCurrency {
  const out: ByCurrency = {}
  for (const t of totals) {
    for (const [c, v] of Object.entries(t) as [Currency, number][]) {
      out[c] = (out[c] ?? 0) + v
    }
  }
  return out
}

export const COLLECTED: CobranzaSection[] = ["paid", "loose", "recharges"]
export const UPCOMING: CobranzaSection[] = ["renewals", "scheduled", "paused"]

/** Las cifras de arriba de la vista, cada una partida por moneda. */
export function summarizeCobranza(items: CobranzaItem[]) {
  const of = (...sections: CobranzaSection[]) =>
    items.filter((i) => sections.includes(i.section))

  const collected = of(...COLLECTED)
  const upcoming = of(...UPCOMING)
  const unpaid = of("open", "failed")
  const attention = items.filter((i) => i.overdue)
  const recharges = of("recharges")
  const refunds = of("refunds")

  return {
    collected: { total: sumByCurrency(collected), count: collected.length },
    upcoming: { total: sumByCurrency(upcoming), count: upcoming.length },
    month: addTotals(sumByCurrency(collected), sumByCurrency(upcoming)),
    unpaid: { total: sumByCurrency(unpaid), count: unpaid.length },
    recharges: { total: sumByCurrency(recharges), count: recharges.length },
    attention: { total: sumByCurrency(attention), count: attention.length },
    refunds: { total: sumByCurrency(refunds), count: refunds.length },
  }
}

/* ------------------------------------------------------ Serie del tablero */

/**
 * Lo cobrado como entradas sueltas —día, importe, moneda— con la misma regla
 * que la vista de cobranza. La serie "Cobrado por mes" del tablero sale de
 * aquí para que las dos cifras de un mes coincidan.
 */
export function collectedEntries(
  paidInvoices: Stripe.Invoice[],
  charges: Stripe.Charge[],
  invoiceIntents: Set<string>,
) {
  const out: { day: string; amount: number; currency: Currency }[] = []
  for (const inv of paidInvoices) {
    if (inv.status !== "paid") continue
    const currency = toCurrency(inv.currency)
    if (!currency) continue
    const at = inv.status_transitions?.paid_at ?? inv.created
    out.push({ day: dayFromEpoch(at), amount: inv.amount_paid, currency })
  }
  for (const ch of charges) {
    if (ch.status !== "succeeded" || ch.refunded) continue
    const pi = idOf(ch.payment_intent)
    if (pi && invoiceIntents.has(pi)) continue
    const currency = toCurrency(ch.currency)
    if (!currency) continue
    out.push({ day: dayFromEpoch(ch.created), amount: ch.amount, currency })
  }
  return out
}
