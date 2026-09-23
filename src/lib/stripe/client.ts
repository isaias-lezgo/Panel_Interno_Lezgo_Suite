import "server-only"

import Stripe from "stripe"

import type { PlanLine } from "@/lib/clients/account"
import type { Currency } from "@/lib/types"

import {
  collectPayingCustomers,
  type PayingCustomer,
  type PayingSource,
} from "./paying"

/**
 * Única superficie hacia Stripe, con el mismo papel que `ghl/client.ts` tiene
 * para GoHighLevel: auth, forma de error y paginación resueltos en un solo
 * lugar. Todo aquí es de solo lectura; el panel no cobra ni emite.
 */

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "StripeError"
  }
}

let client: Stripe | null = null

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new StripeError("Falta STRIPE_SECRET_KEY", 401, "config")
  }
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 })
  return client
}

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

function wrap(error: unknown, endpoint: string): never {
  if (error instanceof Stripe.errors.StripeError) {
    throw new StripeError(
      error.message,
      error.statusCode ?? 500,
      endpoint,
      error.raw,
    )
  }
  throw new StripeError(String(error), 500, endpoint)
}

/** Facturas emitidas en los últimos `months` meses, de la más nueva a la más vieja. */
export async function listRecentInvoices(months = 12) {
  const since = Math.floor(Date.now() / 1000) - months * 30 * 24 * 60 * 60
  try {
    return await stripe()
      .invoices.list({ created: { gte: since }, limit: 100 })
      .autoPagingToArray({ limit: 2000 })
  } catch (error) {
    wrap(error, "/v1/invoices")
  }
}

/** Todas, incluidas las canceladas: de ahí salen las altas y bajas por mes. */
export async function listAllSubscriptions() {
  try {
    return await stripe()
      .subscriptions.list({ status: "all", limit: 100 })
      .autoPagingToArray({ limit: 2000 })
  } catch (error) {
    wrap(error, "/v1/subscriptions")
  }
}

export async function listActiveSubscriptions() {
  try {
    return await stripe()
      .subscriptions.list({ status: "active", limit: 100 })
      .autoPagingToArray({ limit: 1000 })
  } catch (error) {
    wrap(error, "/v1/subscriptions")
  }
}

/**
 * Los clientes que alguna vez pagaron: se derivan de facturas, suscripciones
 * y cargos en vez de listar customers. La cuenta tiene más de 82 000, casi
 * todos contactos que GoHighLevel creó sin cobrarles nunca, y listarlos traía
 * los más recientes —leads— dejando fuera a quien paga desde hace años.
 * Ver `paying.ts`.
 */
export async function listCustomers(): Promise<PayingCustomer[]> {
  try {
    const client = stripe()
    const [invoices, subs, charges] = await Promise.all([
      client.invoices.list({ limit: 100 }).autoPagingToArray({ limit: 5000 }),
      client.subscriptions
        .list({ status: "all", limit: 100 })
        .autoPagingToArray({ limit: 2000 }),
      client.charges.list({ limit: 100 }).autoPagingToArray({ limit: 5000 }),
    ])

    const id = (c: string | { id: string } | null | undefined) =>
      typeof c === "string" ? c : (c?.id ?? null)

    const sources: PayingSource[] = [
      ...invoices.map((i) => ({
        customer: id(i.customer),
        name: i.customer_name,
        email: i.customer_email,
        phone: i.customer_phone,
      })),
      ...subs.map((x) => ({
        customer: id(x.customer),
        name: null,
        email: null,
        phone: null,
      })),
      ...charges.map((c) => ({
        customer: id(c.customer),
        name: c.billing_details?.name ?? null,
        email: c.billing_details?.email ?? null,
        phone: c.billing_details?.phone ?? null,
      })),
    ]

    const { customers, incomplete } = collectPayingCustomers(sources)

    // Los que solo aparecen en una suscripción no traen nombre: se piden
    // directo. Son un puñado, así que una llamada por cabeza está bien.
    const rellenos = await Promise.all(
      incomplete.map(async (cus) => {
        try {
          const c = await client.customers.retrieve(cus)
          return c.deleted ? null : c
        } catch {
          return null
        }
      }),
    )
    const porId = new Map(customers.map((c) => [c.id, c]))
    for (const c of rellenos) {
      if (!c) continue
      const actual = porId.get(c.id)
      if (!actual) continue
      actual.name ??= c.name?.trim() || null
      actual.email ??= c.email?.trim() || null
      actual.phone ??= c.phone?.trim() || null
    }

    return [...porId.values()]
  } catch (error) {
    wrap(error, "/v1/customers")
  }
}

/**
 * Suscripciones activas agrupadas por cliente y llevadas a mes: una anual
 * cuenta por su doceava parte. Solo mes y año; semana y día no se usan aquí.
 */
/**
 * Lo que una suscripción vale al mes, por moneda. Una anual cuenta por su
 * doceava parte; semana y día no se usan en esta cuenta.
 */
export function monthlyAmounts(sub: Stripe.Subscription) {
  const out: { amount: number; currency: Currency }[] = []
  for (const item of sub.items.data) {
    const price = item.price
    const unit = price.unit_amount ?? 0
    const qty = item.quantity ?? 1
    const rec = price.recurring
    if (!rec || unit === 0) continue
    const c = price.currency.toLowerCase()
    if (c !== "mxn" && c !== "usd") continue
    const perMonth =
      rec.interval === "month"
        ? (unit * qty) / rec.interval_count
        : rec.interval === "year"
          ? (unit * qty) / (12 * rec.interval_count)
          : 0
    if (!perMonth) continue
    out.push({ amount: Math.round(perMonth), currency: c })
  }
  return out
}

/** Los productos de la cuenta son pocos; con sus nombres se lee el plan. */
async function productNames(): Promise<Map<string, string>> {
  try {
    const list = await stripe()
      .products.list({ limit: 100 })
      .autoPagingToArray({ limit: 500 })
    return new Map(list.map((p) => [p.id, p.name]))
  } catch (error) {
    wrap(error, "/v1/products")
  }
}

/** Día en hora de México: el periodo termina a una hora, no en UTC. */
const diaDe = (epoch: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date(epoch * 1000))

export type CustomerSubs = {
  /** Lo que vale al mes, por moneda: de aquí sale el MRR. */
  amounts: { amount: number; currency: Currency }[]
  /** Una entrada por línea de suscripción: de aquí sale el plan. */
  lines: PlanLine[]
}

/**
 * Lo que cada cliente paga hoy. Dos lecturas del mismo viaje: el importe
 * mensual y la forma del plan —producto, periodicidad y fin del periodo—,
 * que `lib/clients/account.ts` traduce a membresía y vencimiento.
 */
export async function summarizeSubscriptions() {
  const [subs, names] = await Promise.all([
    listActiveSubscriptions(),
    productNames(),
  ])
  const out = new Map<string, CustomerSubs>()
  for (const s of subs) {
    const cus = typeof s.customer === "string" ? s.customer : s.customer.id
    const entry = out.get(cus) ?? { amounts: [], lines: [] }
    entry.amounts.push(...monthlyAmounts(s))
    for (const item of s.items.data) {
      const price = item.price
      const rec = price.recurring
      if (!rec) continue
      const producto =
        typeof price.product === "string"
          ? names.get(price.product)
          : "name" in price.product
            ? price.product.name
            : null
      entry.lines.push({
        label: producto || price.nickname || s.description || "",
        amount: (price.unit_amount ?? 0) * (item.quantity ?? 1),
        interval: rec.interval,
        intervalCount: rec.interval_count,
        renewsAt: item.current_period_end
          ? diaDe(item.current_period_end)
          : null,
      })
    }
    out.set(cus, entry)
  }
  return out
}
