import "server-only"

import Stripe from "stripe"

import type { PlanLine } from "@/lib/clients/account"
import { isLive } from "@/lib/clients/subscriptions"
import type {
  ChargeAccount,
  Currency,
  PortfolioSubscription,
  SubscriptionStatus,
} from "@/lib/types"
import { dayFromEpoch } from "@/lib/time"

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

/**
 * La cartera: cada suscripción de la cuenta con quién la paga y qué cobra.
 * Es la unidad que se enlaza a un cliente del panel. Se listan las
 * suscripciones y no los customers: la cuenta tiene más de 82 000 `cus_`,
 * casi todos contactos que GoHighLevel creó sin cobrarles nunca, y las
 * suscripciones son unos cientos.
 *
 * Las `incomplete_expired` se omiten: nunca llegaron a cobrarse. Las
 * canceladas se quedan, porque sus facturas viejas también se atribuyen.
 */
export async function listPortfolioSubscriptions(): Promise<PortfolioSubscription[]> {
  let subs: Stripe.Subscription[]
  let names: Map<string, string>
  try {
    ;[subs, names] = await Promise.all([
      stripe()
        .subscriptions.list({ status: "all", limit: 100, expand: ["data.customer"] })
        .autoPagingToArray({ limit: 3000 }),
      productNames(),
    ])
  } catch (error) {
    if (error instanceof StripeError) throw error
    wrap(error, "/v1/subscriptions")
  }

  const out: PortfolioSubscription[] = []
  for (const s of subs) {
    if (s.status === "incomplete_expired") continue
    const cus = s.customer
    const customerId = typeof cus === "string" ? cus : cus.id
    const customer =
      typeof cus === "object" && !("deleted" in cus && cus.deleted)
        ? (cus as Stripe.Customer)
        : null
    const email = customer?.email?.trim() || null

    const lines: PlanLine[] = []
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
      lines.push({
        label: producto || price.nickname || s.description || "",
        amount: (price.unit_amount ?? 0) * (item.quantity ?? 1),
        currency: price.currency as Currency,
        interval: rec.interval,
        intervalCount: rec.interval_count,
        renewsAt: item.current_period_end ? diaDe(item.current_period_end) : null,
      })
    }
    const label =
      [...new Set([...lines].sort((a, b) => b.amount - a.amount).map((l) => l.label))]
        .filter(Boolean)
        .join(" + ") ||
      s.description ||
      "Suscripción"

    const status = s.status as SubscriptionStatus
    out.push({
      id: s.id,
      customerId,
      customerName: customer?.name?.trim() || email || customerId,
      email,
      phone: customer?.phone?.trim() || null,
      status,
      label,
      // El MRR es lo que se cobra hoy: solo las activas.
      amounts: status === "active" ? monthlyAmounts(s) : [],
      // La cuenta del cliente sale de lo que sigue vivo, aunque esté en
      // prueba o con un cobro fallido.
      plan: isLive(status) ? lines : [],
      createdAt: diaDe(s.created),
      canceledAt: s.canceled_at ? diaDe(s.canceled_at) : null,
    })
  }
  return out
}

/** Día en hora de México: el periodo termina a una hora, no en UTC. */
const diaDe = dayFromEpoch

/**
 * Quién cobró algo en los últimos 12 meses, por `cus_`: de aquí se eligen las
 * cuentas de cobro sin suscripción. Se deriva de los cargos y no de listar
 * customers, que pasan de 82 000. El nombre sale del cargo; si ninguno lo
 * trae, se pide el customer, que son pocos.
 */
export async function listChargingCustomers(): Promise<ChargeAccount[]> {
  const since = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60
  const charges = await listChargesSince(since)
  const porId = new Map<string, ChargeAccount>()
  for (const ch of charges) {
    if (ch.status !== "succeeded" || ch.refunded) continue
    const cus = typeof ch.customer === "string" ? ch.customer : ch.customer?.id
    const currency = ch.currency.toLowerCase()
    if (!cus || (currency !== "mxn" && currency !== "usd")) continue
    const a = porId.get(cus) ?? {
      id: cus,
      name: "",
      email: null,
      charges: 0,
      recharges: 0,
      totals: {},
      lastAt: null,
    }
    a.name ||= ch.billing_details?.name?.trim() || ""
    a.email ??= ch.billing_details?.email?.trim() || null
    a.charges += 1
    if ((ch.description ?? "").toLowerCase().includes("recharge")) a.recharges += 1
    a.totals[currency] = (a.totals[currency] ?? 0) + ch.amount
    const day = diaDe(ch.created)
    if (!a.lastAt || day > a.lastAt) a.lastAt = day
    porId.set(cus, a)
  }

  const sinNombre = [...porId.values()].filter((a) => !a.name)
  await Promise.all(
    sinNombre.map(async (a) => {
      try {
        const c = await stripe().customers.retrieve(a.id)
        if (!c.deleted) {
          a.name = c.name?.trim() || ""
          a.email ??= c.email?.trim() || null
        }
      } catch {
        // Un customer borrado se queda con lo que traiga el cargo.
      }
    }),
  )
  for (const a of porId.values()) a.name ||= a.email || a.id
  return [...porId.values()]
}

/**
 * Los `payment_intent` que pagaron una factura desde `since`. Desde la API
 * 2025-03-31 el cargo ya no dice a qué factura pertenece; esta es la única
 * forma de saber qué cargos son "sin factura" sin contar dos veces.
 */
export async function listInvoiceIntents(since: number) {
  try {
    const payments = await stripe()
      .invoicePayments.list({ created: { gte: since }, limit: 100 })
      .autoPagingToArray({ limit: 5000 })
    const out = new Set<string>()
    for (const p of payments) {
      const pi = p.payment?.payment_intent
      if (pi) out.add(typeof pi === "string" ? pi : pi.id)
    }
    return out
  } catch (error) {
    wrap(error, "/v1/invoice_payments")
  }
}

/** Cargos creados desde `since`. */
export async function listChargesSince(since: number, until?: number) {
  try {
    return await stripe()
      .charges.list({ created: { gte: since, ...(until ? { lte: until } : {}) }, limit: 100 })
      .autoPagingToArray({ limit: 5000 })
  } catch (error) {
    wrap(error, "/v1/charges")
  }
}

const YEAR = 365 * 24 * 60 * 60

/**
 * Todo lo que la vista de cobranza necesita de un mes, en un viaje. Las
 * facturas abiertas y los borradores van sin filtro de fecha: son dinero
 * pendiente de cualquier mes.
 */
export async function fetchCobranzaInput(range: { start: number; end: number }) {
  const client = stripe()
  const created = { gte: range.start, lte: range.end }
  const all = <T>(list: { autoPagingToArray(o: { limit: number }): Promise<T[]> }) =>
    list.autoPagingToArray({ limit: 2000 })
  const subs = (status: Stripe.SubscriptionListParams.Status) =>
    all(client.subscriptions.list({ status, limit: 100, expand: ["data.customer"] }))

  try {
    const [
      active,
      trialing,
      unpaid,
      pastDue,
      openInvoices,
      draftInvoices,
      paidInvoices,
      schedules,
      refunds,
      disputes,
      charges,
      invoiceIntents,
      products,
    ] = await Promise.all([
      subs("active"),
      subs("trialing"),
      subs("unpaid"),
      subs("past_due"),
      all(client.invoices.list({ status: "open", limit: 100 })),
      all(client.invoices.list({ status: "draft", limit: 100 })),
      // Pagada en el mes pero emitida antes: se busca un año hacia atrás.
      all(
        client.invoices.list({
          status: "paid",
          created: { gte: range.start - YEAR, lte: range.end },
          limit: 100,
        }),
      ),
      all(
        client.subscriptionSchedules.list({
          scheduled: true,
          limit: 100,
          expand: ["data.customer"],
        }),
      ),
      all(client.refunds.list({ created, limit: 100, expand: ["data.charge"] })),
      all(client.disputes.list({ created, limit: 100, expand: ["data.charge"] })),
      listChargesSince(range.start, range.end),
      // Una factura del mes pudo haberse finalizado —y abierto su pago— antes.
      listInvoiceIntents(range.start - YEAR),
      productNames(),
    ])

    const subscriptions = [...active, ...trialing, ...unpaid]

    // Nombres: lo que ya trae cada objeto, y un retrieve para el resto.
    const customers = new Map<string, { name: string | null; email: string | null }>()
    const note = (c: unknown) => {
      if (c && typeof c === "object" && "id" in c && !("deleted" in c && c.deleted)) {
        const cus = c as Stripe.Customer
        customers.set(cus.id, { name: cus.name?.trim() || null, email: cus.email?.trim() || null })
      }
    }
    for (const s of [...subscriptions, ...pastDue]) note(s.customer)
    for (const s of schedules) note(s.customer)

    const wanted = new Set<string>()
    const want = (c: string | { id: string } | null | undefined) => {
      const id = typeof c === "string" ? c : c?.id
      if (id && !customers.has(id)) wanted.add(id)
    }
    for (const r of refunds) if (typeof r.charge === "object") want(r.charge?.customer)
    for (const d of disputes) if (typeof d.charge === "object") want(d.charge.customer)
    for (const ch of charges) if (!ch.billing_details?.name) want(ch.customer)
    await Promise.all(
      [...wanted].map(async (id) => {
        try {
          note(await client.customers.retrieve(id))
        } catch {
          // Un cliente borrado se queda con lo que traiga el cargo.
        }
      }),
    )

    const priceIds = new Set<string>()
    for (const sch of schedules) {
      const phase = sch.phases.find((p) => p.start_date >= range.start && p.start_date <= range.end)
      for (const it of phase?.items ?? []) {
        const id = typeof it.price === "string" ? it.price : it.price?.id
        if (id) priceIds.add(id)
      }
    }
    const prices = new Map<string, Stripe.Price>()
    await Promise.all(
      [...priceIds].map(async (id) => {
        try {
          prices.set(id, await client.prices.retrieve(id))
        } catch {
          // Sin precio, el importe queda "por confirmar".
        }
      }),
    )

    return {
      subscriptions,
      pastDue,
      openInvoices,
      draftInvoices,
      paidInvoices,
      schedules,
      prices,
      refunds,
      disputes,
      charges,
      invoiceIntents,
      customers,
      products,
    }
  } catch (error) {
    if (error instanceof StripeError) throw error
    wrap(error, "cobranza")
  }
}
