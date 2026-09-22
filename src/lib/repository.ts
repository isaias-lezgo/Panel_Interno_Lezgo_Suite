import "server-only"

import { unstable_cache, updateTag } from "next/cache"
import { desc, eq, max, ne } from "drizzle-orm"

import * as demo from "@/data/demo"
import { db, schema } from "@/db"
import { ghl, type GhlContact } from "@/lib/ghl/client"
import { lezgoSuite, lezgoSuiteEnabled } from "@/lib/ghl/lezgo-suite"
import {
  listAllSubscriptions,
  listCustomers,
  listRecentInvoices,
  monthlyAmounts,
  stripeEnabled,
  summarizeSubscriptions,
} from "@/lib/stripe/client"
import {
  monthlyCollected,
  monthlyMovement,
  type CollectedPoint,
  type MovementPoint,
  type SubscriptionSpan,
} from "@/lib/stripe/series"
import { mapInvoice, toMxn } from "@/lib/stripe/map"
import type {
  ActivityEvent,
  ChecklistItem,
  Client,
  ClientDetail,
  ClientOpportunity,
  ClientRow,
  Currency,
  Implementation,
  ImplementationContact,
  ImplementationRow,
  Invoice,
  InvoiceRow,
  LocationOption,
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

/** Solo los enlaces vivos: los que se quitaron a mano quedan archivados. */
export async function listStripeLinks(): Promise<StripeLink[]> {
  if (!db) return demo.stripeLinks
  return (await db
    .select()
    .from(schema.clientStripeCustomers)
    .where(ne(schema.clientStripeCustomers.linkedBy, "excluded"))) as StripeLink[]
}

export async function lastSyncAt(): Promise<string | null> {
  if (!db) return demo.clients[0]?.syncedAt ?? null
  const [row] = await db
    .select({ at: max(schema.clients.syncedAt) })
    .from(schema.clients)
  return row?.at ?? null
}

export async function listImplementations(): Promise<Implementation[]> {
  if (!db) {
    return demo.implementations.map((i) => ({
      ...i,
      contacts: [],
      checklist: [],
    }))
  }
  const [rows, contacts, items] = await Promise.all([
    db
      .select()
      .from(schema.implementations)
      .orderBy(desc(schema.implementations.updatedAt)),
    db.select().from(schema.implementationContacts),
    db
      .select()
      .from(schema.implementationChecklistItems)
      .orderBy(schema.implementationChecklistItems.position),
  ])
  const contactsOf = new Map<string, ImplementationContact[]>()
  for (const c of contacts) {
    const list = contactsOf.get(c.implementationId) ?? []
    list.push({ id: c.ghlContactId, name: c.name, email: c.email, phone: c.phone })
    contactsOf.set(c.implementationId, list)
  }
  const itemsOf = new Map<string, ChecklistItem[]>()
  for (const { implementationId, ...item } of items) {
    itemsOf.set(implementationId, [...(itemsOf.get(implementationId) ?? []), item])
  }
  return rows.map((r) => ({
    ...(r as ImplementationRow),
    contacts: contactsOf.get(r.id) ?? [],
    checklist: orderChecklist(itemsOf.get(r.id) ?? []),
  }))
}

/** Cada punto principal seguido de sus sub-puntos, ambos por `position`. */
function orderChecklist(items: ChecklistItem[]) {
  const children = new Map<string, ChecklistItem[]>()
  for (const i of items) {
    if (i.parentId) children.set(i.parentId, [...(children.get(i.parentId) ?? []), i])
  }
  return items
    .filter((i) => !i.parentId)
    .flatMap((i) => [i, ...(children.get(i.id) ?? [])])
}

/* ------------------------------------------- contactos de Lezgo Suite */

/** GHL entrega `contactName` en minúsculas; el nombre se arma de sus partes. */
export function contactDisplayName(c: GhlContact) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim()
  return name || c.companyName?.trim() || c.email || c.phone || c.id
}

function toContactOption(c: GhlContact): ImplementationContact {
  return {
    id: c.id,
    name: contactDisplayName(c),
    email: c.email ?? null,
    phone: c.phone ?? null,
  }
}

/**
 * Contactos de la subcuenta Lezgo Suite. Sin texto se ofrecen los clientes
 * del panel —ya son contactos de Lezgo Suite y son los probables—; con texto
 * se busca en GHL, que tiene miles.
 */
export async function searchLezgoContacts(query: string): Promise<{
  options: ImplementationContact[]
  error: string | null
}> {
  const q = query.trim()
  if (!q) {
    const clients = await listClients()
    return {
      options: clients
        .filter((c) => !c.orphaned)
        .map((c) => ({
          id: c.ghlContactId,
          name: c.contactName,
          email: c.email,
          phone: c.phone,
        })),
      error: null,
    }
  }
  if (!lezgoSuiteEnabled()) {
    return { options: [], error: "Falta GHL_LEZGO_SUITE_TOKEN" }
  }
  try {
    const { contacts } = await lezgoSuite.searchContacts({
      query: q,
      pageLimit: 20,
    })
    return { options: contacts.map(toContactOption), error: null }
  } catch (error) {
    console.error("GHL no respondió", error)
    return { options: [], error: "GoHighLevel no respondió" }
  }
}

/** Lee un contacto de Lezgo Suite; `null` si no existe o GHL no responde. */
export async function getLezgoContact(
  id: string,
): Promise<ImplementationContact | null> {
  if (!lezgoSuiteEnabled()) return null
  try {
    const { contact } = await lezgoSuite.getContact(id)
    return contact ? toContactOption(contact) : null
  } catch (error) {
    console.error("GHL no respondió", error)
    return null
  }
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
 * Quién paga en Stripe se deriva de todo el historial de cobros, así que
 * cuesta unos segundos armarla. Cambia solo cuando alguien paga por primera
 * vez: una hora de caché, y el botón "Actualizar" la tira antes si urge.
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
  { revalidate: 3600, tags: ["stripe"] },
)

type StripeCustomerSummary = Awaited<
  ReturnType<typeof cachedStripeCustomers>
>[number]

/**
 * Centavos en moneda base, o `null` si no hay ninguna suscripción activa o
 * si ninguna se puede convertir. `unconverted` separa ambos casos: sin él,
 * un cliente con todo cancelado se confunde con uno que cobra en una moneda
 * que no sabemos convertir.
 */
function mrrOf(
  subs: { amount: number; currency: Currency }[],
  base: Currency,
  fx: number | null,
) {
  let total: number | null = null
  let unconverted = 0
  for (const s of subs) {
    const v =
      base === "mxn"
        ? toMxn(s.amount, s.currency, fx)
        : s.currency === "usd"
          ? s.amount
          : null
    if (v === null) {
      unconverted += 1
      continue
    }
    total = (total ?? 0) + v
  }
  return { total, unconverted }
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
      mrr: mrrOf(c.subscriptions, base, fx).total,
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
    const { total, unconverted } = mrrOf(subs, base, fx)
    return {
      ...c,
      locationName: c.ghlLocationId
        ? (locationById.get(c.ghlLocationId) ?? c.ghlLocationId)
        : null,
      stripeCount: mine.length,
      mrr: total,
      unconvertedSubs: unconverted,
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
      mrr: c ? mrrOf(c.subscriptions, base, fx).total : null,
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
    ).total,
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

/**
 * Las dos series del tablero. Con Stripe salen de las facturas pagadas y de
 * las fechas de alta y cancelación de cada suscripción; sin Stripe no hay
 * historia que contar y se dice así, en vez de dibujar la serie de ejemplo
 * junto a cifras reales.
 */
const cachedSeries = unstable_cache(
  async (fx: number | null, base: Currency) => {
    const [invoicesRaw, subs] = await Promise.all([
      listRecentInvoices(12),
      listAllSubscriptions(),
    ])
    const invoices = invoicesRaw
      .map((i) => mapInvoice(i, fx, () => null))
      .filter((i): i is Invoice => i !== null)

    const spans: SubscriptionSpan[] = subs
      // Una suscripción que nunca llegó a cobrarse no es un alta.
      .filter((s) => s.status !== "incomplete_expired")
      .map((s) => {
        const amounts = monthlyAmounts(s)
        const total = amounts.reduce<number | null>((acc, a) => {
          const v =
            base === "mxn"
              ? toMxn(a.amount, a.currency, fx)
              : a.currency === "usd"
                ? a.amount
                : null
          return v === null ? acc : (acc ?? 0) + v
        }, null)
        return {
          createdAt: new Date(s.created * 1000).toISOString().slice(0, 10),
          canceledAt: s.canceled_at
            ? new Date(s.canceled_at * 1000).toISOString().slice(0, 10)
            : null,
          amountBase: amounts.length === 0 ? 0 : total,
        }
      })

    return {
      collected: monthlyCollected(invoices, 12),
      movement: monthlyMovement(spans, 12),
    }
  },
  ["stripe-series"],
  { revalidate: 300, tags: ["stripe"] },
)

export type RevenueSeries = {
  collected: CollectedPoint[]
  movement: MovementPoint[]
  source: "stripe" | "none"
  currency: Currency
}

export async function getRevenueSeries(): Promise<RevenueSeries> {
  const base = baseCurrency()
  if (!stripeEnabled()) {
    return { collected: [], movement: [], source: "none", currency: base }
  }
  try {
    const { collected, movement } = await cachedSeries(usdToMxnRate(), base)
    return { collected, movement, source: "stripe", currency: base }
  } catch (error) {
    console.error("Stripe no respondió; sin series", error)
    return { collected: [], movement: [], source: "none", currency: base }
  }
}

/** Everything the dashboard's telemetry band reports, computed once. */
export async function getPortfolioSummary() {
  const [rows, implementations, invoices, series] = await Promise.all([
    listClientRows(),
    listImplementations(),
    listInvoices(),
    getRevenueSeries(),
  ])

  const clients: Client[] = rows
  const active = rows.filter((c) => !c.orphaned)
  // El MRR son las suscripciones activas de Stripe de los cus_ enlazados.
  // Sin Stripe no hay fuente: cero y sin variación, en vez de una cifra de
  // ejemplo con aire de real.
  const mrr = active.reduce((sum, c) => sum + (c.mrr ?? 0), 0)

  const fxDefined = usdToMxnRate() !== null
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
    series,
    mrr,
    activeCount: active.length,
    outstanding,
    overdueCount,
    /** Para explicar de dónde sale cada cifra del tablero. */
    stripeLinkCount: rows.reduce((sum, c) => sum + c.stripeCount, 0),
    orphanedCount: rows.filter((c) => c.orphaned).length,
    unconvertedClients: rows.filter((c) => c.unconvertedSubs > 0).length,
    voidedInvoices: invoices.filter(
      (i) => i.status === "void" || i.status === "uncollectible",
    ).length,
    fxDefined,
    stripeConnected: stripeEnabled(),
    inFlightCount: inFlight.length,
    blockedCount: blocked.length,
    unlinked,
  }
}
