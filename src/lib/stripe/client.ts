import "server-only"

import Stripe from "stripe"

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
