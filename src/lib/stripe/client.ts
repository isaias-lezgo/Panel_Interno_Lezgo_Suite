import "server-only"

import Stripe from "stripe"

import type { Currency } from "@/lib/types"

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

export async function listActiveSubscriptions() {
  try {
    return await stripe()
      .subscriptions.list({ status: "active", limit: 100 })
      .autoPagingToArray({ limit: 1000 })
  } catch (error) {
    wrap(error, "/v1/subscriptions")
  }
}

export async function listCustomers() {
  try {
    return await stripe()
      .customers.list({ limit: 100 })
      .autoPagingToArray({ limit: 2000 })
  } catch (error) {
    wrap(error, "/v1/customers")
  }
}

/**
 * Suscripciones activas agrupadas por cliente y llevadas a mes: una anual
 * cuenta por su doceava parte. Solo mes y año; semana y día no se usan aquí.
 */
export async function summarizeSubscriptions() {
  const subs = await listActiveSubscriptions()
  const out = new Map<string, { amount: number; currency: Currency }[]>()
  for (const s of subs) {
    const cus = typeof s.customer === "string" ? s.customer : s.customer.id
    for (const item of s.items.data) {
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
      out.set(cus, [
        ...(out.get(cus) ?? []),
        { amount: Math.round(perMonth), currency: c },
      ])
    }
  }
  return out
}
