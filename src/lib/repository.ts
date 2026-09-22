import "server-only"

import { unstable_cache, updateTag } from "next/cache"
import { desc, eq, max } from "drizzle-orm"

import * as demo from "@/data/demo"
import { db, schema } from "@/db"
import { ghl } from "@/lib/ghl/client"
import {
  listCustomers,
  listRecentInvoices,
  stripeEnabled,
  summarizeSubscriptions,
} from "@/lib/stripe/client"
import { mapInvoice, toMxn } from "@/lib/stripe/map"
import type {
  ActivityEvent,
  Client,
  ClientDetail,
  ClientOpportunity,
  ClientRow,
  Currency,
  Implementation,
  Invoice,
  InvoiceRow,
  LocationOption,
  RevenuePoint,
  StripeCustomerOption,
  StripeLink,
} from "@/lib/types"

export type {
  ClientDetail,
  ClientRow,
  LocationOption,
  StripeCustomerOption,
} from "@/lib/types"

/**
 * One read surface for the whole panel. Every page goes through here, so
 * swapping seed data for Neon is a single decision made in one place.
 */

export async function listClients(): Promise<Client[]> {
  if (!db) return demo.clients
  return (await db
    .select()
    .from(schema.clients)
    .orderBy(schema.clients.name)) as Client[]
}

export async function getClient(slug: string): Promise<Client | undefined> {
  if (!db) return demo.clients.find((c) => c.slug === slug)
  const [row] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.slug, slug))
    .limit(1)
  return row as Client | undefined
}

export async function listStripeLinks(): Promise<StripeLink[]> {
  if (!db) return demo.stripeLinks
  return (await db.select().from(schema.clientStripeCustomers)) as StripeLink[]
}

export async function lastSyncAt(): Promise<string | null> {
  if (!db) return demo.clients[0]?.syncedAt ?? null
  const [row] = await db
    .select({ at: max(schema.clients.syncedAt) })
    .from(schema.clients)
  return row?.at ?? null
}

export async function listImplementations(): Promise<Implementation[]> {
  if (!db) return demo.implementations
  return (await db.select().from(schema.implementations)) as Implementation[]
}

/**
 * El tipo de cambio es un supuesto, no un dato medido. Sin él, las facturas
 * en USD se muestran en su moneda y quedan fuera de los totales.
 */
export function usdToMxnRate(): number | null {
  const raw = process.env.STRIPE_FX_USD_MXN
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * La moneda en la que el panel suma. Stripe factura sobre todo en MXN; los
 * datos de Neon y del demo son enteramente USD, y sumarlos en su propia
 * moneda no mezcla nada. La base sigue a la fuente para que ningún KPI
 * dependa de un tipo de cambio que nadie configuró.
 */
export function baseCurrency(): Currency {
  return process.env.STRIPE_SECRET_KEY ? "mxn" : "usd"
}

/* ------------------------------------------------------ Stripe (cacheado) */

/**
 * La lista de clientes de Stripe y sus suscripciones cambian poco y pesan:
 * cinco minutos bajo el mismo tag que las facturas, para que "Actualizar"
 * refresque todo junto.
 */
const cachedStripeCustomers = unstable_cache(
  async () => {
    const [customers, subs] = await Promise.all([
      listCustomers(),
      summarizeSubscriptions(),
    ])
    return customers.map((c) => ({
      id: c.id,
      name: c.name?.trim() || c.email || c.id,
      email: c.email ?? null,
      phone: c.phone ?? null,
      subscriptions: subs.get(c.id) ?? [],
    }))
  },
  ["stripe-customers"],
  { revalidate: 300, tags: ["stripe"] },
)

type StripeCustomerSummary = Awaited<
  ReturnType<typeof cachedStripeCustomers>
>[number]

/** Centavos en moneda base, o `null` si ninguna suscripción se puede convertir. */
function mrrOf(
  subs: { amount: number; currency: Currency }[],
  base: Currency,
  fx: number | null,
) {
  let total: number | null = null
  for (const s of subs) {
    const v =
      base === "mxn"
        ? toMxn(s.amount, s.currency, fx)
        : s.currency === "usd"
          ? s.amount
          : null
    if (v === null) continue
    total = (total ?? 0) + v
  }
  return total
}

async function stripeCustomersOrNull(): Promise<{
  list: StripeCustomerSummary[]
  error: string | null
}> {
  if (!stripeEnabled()) return { list: [], error: "Falta STRIPE_SECRET_KEY" }
  try {
    return { list: await cachedStripeCustomers(), error: null }
  } catch (error) {
    console.error("Stripe no respondió", error)
    return { list: [], error: "Stripe no respondió" }
  }
}

/**
 * Clientes de Stripe que nadie tiene todavía. La cuenta pasa de mil
 * registros, así que el desplegable no los recibe todos: se sirve una
 * primera página (los que pagan, arriba) y lo demás se busca contra el
 * servidor conforme se escribe.
 */
export async function listStripeCustomerOptions(query = "", limit = 25) {
  const [{ list, error }, links] = await Promise.all([
    stripeCustomersOrNull(),
    listStripeLinks(),
  ])
  const linked = new Set(links.map((l) => l.stripeCustomerId))
  const base = baseCurrency()
  const fx = usdToMxnRate()
  // Sin acentos en ambos lados: quien busca "duran" espera ver "Durán".
  const plano = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  const q = plano(query.trim())

  const libres = list.filter(
    (c) =>
      !linked.has(c.id) &&
      (!q ||
        plano(c.name).includes(q) ||
        plano(c.email ?? "").includes(q) ||
        c.id.toLowerCase().includes(q)),
  )
  const options: StripeCustomerOption[] = libres
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      active: c.subscriptions.length > 0,
      mrr: mrrOf(c.subscriptions, base, fx),
    }))
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name, "es"),
    )
  return { options: options.slice(0, limit), total: libres.length, error }
}

/* ---------------------------------------------------------- GHL locations */

const cachedLocations = unstable_cache(
  async () => {
    const all = await ghl.listAllLocations()
    return all.map((l) => ({
      id: l.id,
      name: l.name.trim(),
      email: l.email ?? null,
    }))
  },
  ["ghl-locations"],
  { revalidate: 3600, tags: ["ghl-locations"] },
)

export async function listLocationOptions(): Promise<{
  options: LocationOption[]
  error: string | null
}> {
  if (!ghl.isConfigured) return { options: [], error: "Falta GHL_API_KEY" }
  try {
    const options = await cachedLocations()
    return {
      options: options.sort((a, b) => a.name.localeCompare(b.name, "es")),
      error: null,
    }
  } catch (error) {
    console.error("GHL no respondió", error)
    return { options: [], error: "GoHighLevel no respondió" }
  }
}

/**
 * Subcuentas que nadie tiene, más la del propio cliente. El desplegable no
 * ofrece lo que ya es de otro: el error "esa subcuenta ya es de X" solo
 * debería aparecer en una carrera entre dos pestañas.
 */
export async function listFreeLocationOptions(clientId?: string) {
  const [{ options, error }, clients] = await Promise.all([
    listLocationOptions(),
    listClients(),
  ])
  const tomadas = new Set(
    clients
      .filter((c) => c.ghlLocationId && c.id !== clientId)
      .map((c) => c.ghlLocationId as string),
  )
  return { options: options.filter((l) => !tomadas.has(l.id)), error }
}

/* ----------------------------------------------------------------- vistas */

export async function listClientRows(): Promise<ClientRow[]> {
  const [clients, links, { list: stripe }, { options: locations }] =
    await Promise.all([
      listClients(),
      listStripeLinks(),
      stripeCustomersOrNull(),
      listLocationOptions(),
    ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const stripeById = new Map(stripe.map((c) => [c.id, c]))
  const locationById = new Map(locations.map((l) => [l.id, l.name]))
  const linksByClient = new Map<string, StripeLink[]>()
  for (const l of links) {
    linksByClient.set(l.clientId, [...(linksByClient.get(l.clientId) ?? []), l])
  }

  return clients.map((c) => {
    const mine = linksByClient.get(c.id) ?? []
    const subs = mine.flatMap(
      (l) => stripeById.get(l.stripeCustomerId)?.subscriptions ?? [],
    )
    return {
      ...c,
      locationName: c.ghlLocationId
        ? (locationById.get(c.ghlLocationId) ?? c.ghlLocationId)
        : null,
      stripeCount: mine.length,
      mrr: mrrOf(subs, base, fx),
    }
  })
}

export async function getClientDetail(
  slug: string,
): Promise<ClientDetail | undefined> {
  const client = await getClient(slug)
  if (!client) return undefined

  const [opportunities, links, { list: stripe }, { options: locations }] =
    await Promise.all([
      db
        ? (db
            .select()
            .from(schema.clientOpportunities)
            .where(eq(schema.clientOpportunities.clientId, client.id))
            .orderBy(desc(schema.clientOpportunities.wonAt)) as Promise<
            ClientOpportunity[]
          >)
        : Promise.resolve(
            demo.clientOpportunities.filter((o) => o.clientId === client.id),
          ),
      listStripeLinks(),
      stripeCustomersOrNull(),
      listLocationOptions(),
    ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const stripeById = new Map(stripe.map((c) => [c.id, c]))
  const mine = links.filter((l) => l.clientId === client.id)
  const stripeRows = mine.map((l) => {
    const c = stripeById.get(l.stripeCustomerId)
    return {
      ...l,
      name: c?.name ?? l.stripeCustomerId,
      email: c?.email ?? null,
      active: (c?.subscriptions.length ?? 0) > 0,
      mrr: c ? mrrOf(c.subscriptions, base, fx) : null,
    }
  })
  return {
    client,
    opportunities,
    stripe: stripeRows,
    location: client.ghlLocationId
      ? (locations.find((l) => l.id === client.ghlLocationId) ?? {
          id: client.ghlLocationId,
          name: client.ghlLocationId,
          email: null,
        })
      : null,
    mrr: mrrOf(
      mine.flatMap(
        (l) => stripeById.get(l.stripeCustomerId)?.subscriptions ?? [],
      ),
      base,
      fx,
    ),
  }
}

/* ------------------------------------------------------------ facturación */

/** Las filas de Neon y del demo son dólares enteros ligados a un cliente. */
export function rowToInvoice(
  row: InvoiceRow,
  customerName: string,
  base: Currency,
  usdToMxn: number | null,
): Invoice {
  const amount = row.amount * 100
  return {
    ...row,
    amount,
    currency: "usd",
    amountBase:
      base === "usd"
        ? amount
        : usdToMxn === null
          ? null
          : Math.round(amount * usdToMxn),
    customerName,
  }
}

async function neonInvoices(): Promise<{
  invoices: Invoice[]
  source: "neon" | "demo"
}> {
  const [rows, clients] = await Promise.all([
    db
      ? (db.select().from(schema.invoices) as Promise<InvoiceRow[]>)
      : Promise.resolve(demo.invoices),
    listClients(),
  ])
  const nameById = new Map(clients.map((c) => [c.id, c.name]))
  const base = baseCurrency()
  const fx = usdToMxnRate()
  return {
    invoices: rows.map((row) =>
      rowToInvoice(
        row,
        nameById.get(row.clientId) ?? "Cliente desconocido",
        base,
        fx,
      ),
    ),
    source: db ? "neon" : "demo",
  }
}

/**
 * Cinco minutos es el trato: suficiente para que el equipo refresque la vista
 * sin gastar cuota, poco para que nadie tome una decisión de cobranza con
 * datos de ayer. El botón "Actualizar" invalida el tag cuando urge.
 *
 * Los pares llegan como argumento —y no se leen adentro— porque
 * `unstable_cache` construye la llave con los argumentos: si cambia el mapeo
 * de clientes, la entrada vieja deja de usarse sola.
 */
const cachedStripeInvoices = unstable_cache(
  async (usdToMxn: number | null, pares: [string, string][]) => {
    const byCustomer = new Map(pares)
    const raw = await listRecentInvoices(12)
    return raw
      .map((invoice) =>
        mapInvoice(invoice, usdToMxn, (cus) =>
          cus ? (byCustomer.get(cus) ?? null) : null,
        ),
      )
      .filter((i): i is Invoice => i !== null)
  },
  ["stripe-invoices"],
  { revalidate: 300, tags: ["stripe"] },
)

/**
 * Un panel de operaciones que se cae entero porque un proveedor tuvo un mal
 * minuto no sirve. Si Stripe falla, se sirve lo que haya en Neon y la vista
 * avisa que las cifras no están frescas.
 */
export async function getBillingFeed() {
  const usdToMxn = usdToMxnRate()
  const base = baseCurrency()

  if (!stripeEnabled()) {
    const { invoices, source } = await neonInvoices()
    return { invoices, source, stale: false, usdToMxn, baseCurrency: base }
  }

  // Un cliente puede tener varios cus_; cada uno apunta al mismo clientId.
  const links = await listStripeLinks()
  const pares = links
    .map((l) => [l.stripeCustomerId, l.clientId] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))

  try {
    const invoices = await cachedStripeInvoices(usdToMxn, pares)
    return {
      invoices,
      source: "stripe" as const,
      stale: false,
      usdToMxn,
      baseCurrency: base,
    }
  } catch (error) {
    console.error("Stripe no respondió; se sirve Neon", error)
    const { invoices, source } = await neonInvoices()
    return { invoices, source, stale: true, usdToMxn, baseCurrency: base }
  }
}

export async function listInvoices(): Promise<Invoice[]> {
  return (await getBillingFeed()).invoices
}

/**
 * `updateTag` y no `revalidateTag`: dentro de una Server Action es el que da
 * semántica de leer-lo-que-acabas-de-escribir, así que quien aprieta
 * "Actualizar" ve datos frescos en esa misma respuesta.
 */
export async function refreshBilling() {
  "use server"
  updateTag("stripe")
}

export async function listActivity(limit = 10): Promise<ActivityEvent[]> {
  if (!db) return demo.activity.slice(0, limit)
  return (await db
    .select()
    .from(schema.activity)
    .orderBy(desc(schema.activity.at))
    .limit(limit)) as ActivityEvent[]
}

export async function listRevenue(): Promise<RevenuePoint[]> {
  if (!db) return demo.revenue
  return (await db.select().from(schema.revenue)) as RevenuePoint[]
}

/** Everything the dashboard's telemetry band reports, computed once. */
export async function getPortfolioSummary() {
  const [rows, implementations, invoices, revenue] = await Promise.all([
    listClientRows(),
    listImplementations(),
    listInvoices(),
    listRevenue(),
  ])

  const clients: Client[] = rows
  const active = rows.filter((c) => !c.orphaned)
  // Con Stripe, el MRR son las suscripciones activas de los cus_ enlazados.
  // Sin él no hay fuente real: se usa la serie `revenue` (dólares enteros del
  // demo), que es lo único comparable mes a mes.
  const withStripe = stripeEnabled()
  const latest = revenue.at(-1)?.recurring ?? 0
  const previous = revenue.at(-2)?.recurring ?? 0
  const mrr = withStripe
    ? active.reduce((sum, c) => sum + (c.mrr ?? 0), 0)
    : latest * 100
  const mrrDelta =
    !withStripe && previous ? ((latest - previous) / previous) * 100 : 0

  const outstanding = invoices
    .filter((i) => i.status === "overdue" || i.status === "due")
    .reduce((sum, i) => sum + (i.amountBase ?? 0), 0)

  const overdueCount = invoices.filter((i) => i.status === "overdue").length

  const inFlight = implementations.filter((i) => i.stage !== "live")
  const blocked = implementations.filter((i) => i.blocked)
  const unlinked = active.filter((c) => c.stripeCount === 0 || !c.ghlLocationId)

  return {
    baseCurrency: baseCurrency(),
    clients,
    rows,
    implementations,
    invoices,
    revenue,
    mrr,
    mrrDelta,
    showMrrDelta: !withStripe,
    activeCount: active.length,
    outstanding,
    overdueCount,
    inFlightCount: inFlight.length,
    blockedCount: blocked.length,
    unlinked,
  }
}
