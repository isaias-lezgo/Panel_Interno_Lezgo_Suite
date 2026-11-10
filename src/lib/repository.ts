import "server-only"

import { unstable_cache, updateTag } from "next/cache"
import { and, asc, desc, eq, inArray, max, ne } from "drizzle-orm"

import * as demo from "@/data/demo"
import { db, schema } from "@/db"
import * as lezgoIaDemo from "@/data/lezgo-ia"
import { actions as lezgoIaDemoActions } from "@/data/lezgo-ia-ops"
import {
  GhlClient,
  GhlError,
  ghl,
  isTransientGhlError,
  type GhlContact,
  type GhlUser,
} from "@/lib/ghl/client"
import { locationToken, oauthConfigured } from "@/lib/ghl/oauth"
import {
  LEZGO_SUITE_LOCATION_ID,
  lezgoSuite,
  lezgoSuiteEnabled,
} from "@/lib/ghl/lezgo-suite"
import {
  applyConfig,
  defaultAccountConfig,
  type AccountConfig,
  type StoredStageRules,
} from "@/lib/lezgo-ia/config"
import { advisorUsers, toSubaccount } from "@/lib/lezgo-ia/from-ghl"
import { threadsFromNotifications, weeklySentBySubaccount } from "@/lib/lezgo-ia/log"
import type { IaStatus, SettingValues, Voice } from "@/data/lezgo-ia"
import {
  fetchCobranzaInput,
  listAllSubscriptions,
  listChargesSince,
  listChargingCustomers,
  listInvoiceIntents,
  listPortfolioSubscriptions,
  listRecentInvoices,
  monthlyAmounts,
  stripeEnabled,
} from "@/lib/stripe/client"
import {
  buildCobranza,
  collectedEntries,
  type CobranzaItem,
} from "@/lib/stripe/cobranza"
import { mexicoMonth, mexicoMonthRange } from "@/lib/time"
import {
  monthlyCollectedEntries,
  monthlyMovement,
  type CollectedPoint,
  type MovementPoint,
  type SubscriptionSpan,
} from "@/lib/stripe/series"
import { resolveAccount } from "@/lib/clients/account"
import { attribution, isLive } from "@/lib/clients/subscriptions"
import { noteImageSrc } from "@/lib/implementations/note-images"
import { createLimiter, mapLimit } from "@/lib/map-limit"
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
  ImplementationNote,
  ImplementationRow,
  Invoice,
  InvoiceRow,
  LocationLink,
  LocationOption,
  NoteImage,
  Pending,
  ChargeAccount,
  CustomerLink,
  PortfolioSubscription,
  SubscriptionLink,
  SubscriptionOption,
} from "@/lib/types"

export type {
  ClientDetail,
  ClientRow,
  LocationOption,
  SubscriptionOption,
} from "@/lib/types"
import { dayFromEpoch } from "@/lib/time"

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
export async function listSubscriptionLinks(): Promise<SubscriptionLink[]> {
  if (!db) return demo.subscriptionLinks
  return (await db
    .select()
    .from(schema.clientStripeSubscriptions)
    .where(
      ne(schema.clientStripeSubscriptions.linkedBy, "excluded"),
    )) as SubscriptionLink[]
}

/** Cuentas de cobro sin suscripción vivas: `cus_` enlazados a mano. */
export async function listCustomerLinks(): Promise<CustomerLink[]> {
  if (!db) return []
  return (await db
    .select()
    .from(schema.clientStripeCustomers)
    .where(ne(schema.clientStripeCustomers.linkedBy, "excluded"))) as CustomerLink[]
}

/** Igual que con Stripe: solo los vivos, los quitados quedan archivados. */
export async function listLocationLinks(): Promise<LocationLink[]> {
  if (!db) return demo.locationLinks
  return (await db
    .select()
    .from(schema.clientGhlLocations)
    .where(ne(schema.clientGhlLocations.linkedBy, "excluded"))) as LocationLink[]
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
      notes: [],
    }))
  }
  const [rows, contacts, items, notes, images] = await Promise.all([
    db
      .select()
      .from(schema.implementations)
      .orderBy(desc(schema.implementations.updatedAt)),
    db.select().from(schema.implementationContacts),
    db
      .select()
      .from(schema.implementationChecklistItems)
      .orderBy(schema.implementationChecklistItems.position),
    db
      .select()
      .from(schema.implementationNotes)
      .orderBy(desc(schema.implementationNotes.createdAt)),
    db
      .select({
        id: schema.implementationNoteImages.id,
        noteId: schema.implementationNoteImages.noteId,
      })
      .from(schema.implementationNoteImages)
      .orderBy(schema.implementationNoteImages.position),
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
  const imagesOf = new Map<string, NoteImage[]>()
  for (const { id, noteId } of images) {
    imagesOf.set(noteId, [...(imagesOf.get(noteId) ?? []), { id, src: noteImageSrc(id) }])
  }
  const notesOf = new Map<string, ImplementationNote[]>()
  for (const { implementationId, ...note } of notes) {
    notesOf.set(implementationId, [
      ...(notesOf.get(implementationId) ?? []),
      { ...note, images: imagesOf.get(note.id) ?? [] },
    ])
  }
  return rows.map((r) => ({
    ...(r as ImplementationRow),
    contacts: contactsOf.get(r.id) ?? [],
    checklist: orderChecklist(itemsOf.get(r.id) ?? []),
    notes: notesOf.get(r.id) ?? [],
  }))
}

/** Dónde está en Blob la imagen de una nota; `null` si no existe. */
export async function getNoteImage(
  id: string,
): Promise<{ pathname: string; contentType: string } | null> {
  if (!db) return null
  const [row] = await db
    .select({
      pathname: schema.implementationNoteImages.pathname,
      contentType: schema.implementationNoteImages.contentType,
    })
    .from(schema.implementationNoteImages)
    .where(eq(schema.implementationNoteImages.id, id))
  return row ?? null
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

/* ------------------------------------------------------- pendientes */

/**
 * Los pendientes en crudo. Agruparlos es cosa de `groupPendings`, que corre
 * en el navegador para que marcar y agregar reordenen la lista al instante.
 */
export async function listPendings(): Promise<Pending[]> {
  if (!db) return demo.pendings
  return (await db.select().from(schema.pendings)) as Pending[]
}

/**
 * El orden de los grupos de cada persona: ids de subcuenta por pestaña. En
 * modo demo no hay orden guardado y los grupos van por nombre.
 */
export async function listPendingGroupOrder(): Promise<Record<string, string[]>> {
  if (!db) return {}
  const rows = await db
    .select()
    .from(schema.pendingGroupOrder)
    .orderBy(asc(schema.pendingGroupOrder.position))
  const order: Record<string, string[]> = {}
  for (const row of rows) (order[row.owner] ??= []).push(row.ghlLocationId)
  return order
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
 * La cartera de suscripciones. Cambia cuando alguien contrata o cancela:
 * una hora de caché, y el botón "Actualizar" la tira antes si urge.
 */
const cachedPortfolio = unstable_cache(
  () => listPortfolioSubscriptions(),
  ["stripe-portfolio-v1"],
  { revalidate: 3600, tags: ["stripe"] },
)

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

async function portfolioOrNull(): Promise<{
  list: PortfolioSubscription[]
  error: string | null
}> {
  if (!stripeEnabled()) return { list: [], error: "Falta STRIPE_SECRET_KEY" }
  try {
    return { list: await cachedPortfolio(), error: null }
  } catch (error) {
    console.error("Stripe no respondió", error)
    return { list: [], error: "Stripe no respondió" }
  }
}

/**
 * Suscripciones que nadie tiene todavía. El desplegable recibe una primera
 * página —las vivas arriba— y lo demás se busca contra el servidor conforme
 * se escribe: por cliente de Stripe, correo, producto o id.
 */
export async function listSubscriptionOptions(query = "", limit = 25) {
  const [{ list, error }, links] = await Promise.all([
    portfolioOrNull(),
    listSubscriptionLinks(),
  ])
  const linked = new Set(links.map((l) => l.stripeSubscriptionId))
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
    (s) =>
      !linked.has(s.id) &&
      (!q ||
        plano(s.customerName).includes(q) ||
        plano(s.email ?? "").includes(q) ||
        plano(s.label).includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.customerId.toLowerCase().includes(q)),
  )
  const options: SubscriptionOption[] = libres
    .sort(
      (a, b) =>
        Number(isLive(b.status)) - Number(isLive(a.status)) ||
        a.customerName.localeCompare(b.customerName, "es") ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .map((s) => ({
      id: s.id,
      customerId: s.customerId,
      customerName: s.customerName,
      email: s.email,
      label: s.label,
      status: s.status,
      mrr: mrrOf(s.amounts, base, fx).total,
    }))
  return { options: options.slice(0, limit), total: libres.length, error }
}

/** Quién cobró en 12 meses, por `cus_`. Una hora, como la cartera. */
const cachedChargeAccounts = unstable_cache(
  () => listChargingCustomers(),
  ["stripe-charge-accounts-v1"],
  { revalidate: 3600, tags: ["stripe"] },
)

async function chargeAccountsOrNull(): Promise<{
  list: ChargeAccount[]
  error: string | null
}> {
  if (!stripeEnabled()) return { list: [], error: "Falta STRIPE_SECRET_KEY" }
  try {
    return { list: await cachedChargeAccounts(), error: null }
  } catch (error) {
    console.error("Stripe no respondió", error)
    return { list: [], error: "Stripe no respondió" }
  }
}

/**
 * Cuentas de cobro que nadie tiene, las que más cobraron arriba. No se
 * ofrecen las que ya se atribuyen solas por sus suscripciones: enlazarlas
 * no cambiaría nada.
 */
export async function listChargeAccountOptions(query = "", limit = 25) {
  const [{ list, error }, customerLinks, subscriptionLinks] = await Promise.all([
    chargeAccountsOrNull(),
    listCustomerLinks(),
    listSubscriptionLinks(),
  ])
  const tomados = new Set(customerLinks.map((l) => l.stripeCustomerId))
  const { byCustomer } = attribution(subscriptionLinks)
  const plano = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  const q = plano(query.trim())
  const libres = list.filter(
    (a) =>
      !tomados.has(a.id) &&
      !byCustomer.has(a.id) &&
      (!q ||
        plano(a.name).includes(q) ||
        plano(a.email ?? "").includes(q) ||
        a.id.toLowerCase().includes(q)),
  )
  const options = libres.sort(
    (a, b) =>
      (b.lastAt ?? "").localeCompare(a.lastAt ?? "") || b.charges - a.charges,
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
 * Subcuentas que nadie tiene. El desplegable no ofrece lo que ya es de otro
 * ni lo que el cliente ya tiene: el error "esa subcuenta ya es de X" solo
 * debería aparecer en una carrera entre dos pestañas.
 */
export async function listFreeLocationOptions() {
  const [{ options, error }, links] = await Promise.all([
    listLocationOptions(),
    listLocationLinks(),
  ])
  const tomadas = new Set(links.map((l) => l.ghlLocationId))
  return { options: options.filter((l) => !tomadas.has(l.id)), error }
}

/* ----------------------------------------------------------------- vistas */

export async function listClientRows(): Promise<ClientRow[]> {
  const [clients, links, locationLinks, { list: portfolio }, { options: locations }] =
    await Promise.all([
      listClients(),
      listSubscriptionLinks(),
      listLocationLinks(),
      portfolioOrNull(),
      listLocationOptions(),
    ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const subById = new Map(portfolio.map((s) => [s.id, s]))
  const locationById = new Map(locations.map((l) => [l.id, l.name]))
  const linksByClient = new Map<string, SubscriptionLink[]>()
  for (const l of links) {
    linksByClient.set(l.clientId, [...(linksByClient.get(l.clientId) ?? []), l])
  }
  const locationsByClient = new Map<string, string[]>()
  for (const l of locationLinks) {
    const name = locationById.get(l.ghlLocationId) ?? l.ghlLocationId
    locationsByClient.set(l.clientId, [
      ...(locationsByClient.get(l.clientId) ?? []),
      name,
    ])
  }

  return clients.map((c) => {
    const mine = linksByClient.get(c.id) ?? []
    const subs = mine.flatMap(
      (l) => subById.get(l.stripeSubscriptionId)?.amounts ?? [],
    )
    const { total, unconverted } = mrrOf(subs, base, fx)
    const lines = mine.flatMap(
      (l) => subById.get(l.stripeSubscriptionId)?.plan ?? [],
    )
    return {
      ...c,
      locationNames: (locationsByClient.get(c.id) ?? []).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
      subscriptionCount: mine.length,
      mrr: total,
      unconvertedSubs: unconverted,
      account: resolveAccount(c, lines),
    }
  })
}

export async function getClientDetail(
  slug: string,
): Promise<ClientDetail | undefined> {
  const client = await getClient(slug)
  if (!client) return undefined

  const [
    opportunities,
    links,
    locationLinks,
    { list: portfolio },
    { options: locations },
    customerLinks,
    { list: chargeAccounts },
  ] =
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
      listSubscriptionLinks(),
      listLocationLinks(),
      portfolioOrNull(),
      listLocationOptions(),
      listCustomerLinks(),
      chargeAccountsOrNull(),
    ])
  const base = baseCurrency()
  const fx = usdToMxnRate()
  const subById = new Map(portfolio.map((s) => [s.id, s]))
  const accountById = new Map(chargeAccounts.map((a) => [a.id, a]))
  const locationById = new Map(locations.map((l) => [l.id, l]))
  const mine = links.filter((l) => l.clientId === client.id)
  const subscriptionRows = mine
    .map((l) => {
      const s = subById.get(l.stripeSubscriptionId)
      return {
        ...l,
        customerName: s?.customerName ?? l.stripeCustomerId,
        email: s?.email ?? null,
        label: s?.label ?? "Suscripción",
        status: s?.status ?? null,
        mrr: s ? mrrOf(s.amounts, base, fx).total : null,
        plan: s?.plan ?? [],
      }
    })
    // Las vivas arriba; entre ellas, la que más pesa.
    .sort(
      (a, b) =>
        Number(b.status !== null && isLive(b.status)) -
          Number(a.status !== null && isLive(a.status)) ||
        (b.mrr ?? 0) - (a.mrr ?? 0),
    )
  return {
    client,
    opportunities,
    subscriptions: subscriptionRows,
    chargeAccounts: customerLinks
      .filter((l) => l.clientId === client.id)
      .map((l) => {
        const a = accountById.get(l.stripeCustomerId)
        return {
          ...l,
          name: a?.name ?? l.stripeCustomerId,
          email: a?.email ?? null,
          charges: a?.charges ?? 0,
          recharges: a?.recharges ?? 0,
          totals: a?.totals ?? {},
          lastAt: a?.lastAt ?? null,
        }
      })
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "")),
    locations: locationLinks
      .filter((l) => l.clientId === client.id)
      .map((l) => {
        const loc = locationById.get(l.ghlLocationId)
        return {
          ...l,
          name: loc?.name ?? l.ghlLocationId,
          email: loc?.email ?? null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    mrr: mrrOf(
      mine.flatMap((l) => subById.get(l.stripeSubscriptionId)?.amounts ?? []),
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
  async (
    usdToMxn: number | null,
    links: SubscriptionLink[],
    customerLinks: CustomerLink[],
  ) => {
    const { clientFor } = attribution(links, customerLinks)
    const raw = await listRecentInvoices(12)
    return raw
      .map((invoice) => mapInvoice(invoice, usdToMxn, clientFor))
      .filter((i): i is Invoice => i !== null)
  },
  ["stripe-invoices-v3"],
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

  // Cada factura va con el dueño de su suscripción; la que no trae, con el
  // de su `cus_` (ver `attribution`).
  // Sin `linkedAt` y ordenados: la llave de la caché solo cambia cuando
  // cambia a quién pertenece algo.
  const [subscriptionLinks, customerLinks] = await Promise.all([
    listSubscriptionLinks(),
    listCustomerLinks(),
  ])
  const links = subscriptionLinks
    .map((l) => ({ ...l, linkedAt: "" }))
    .sort((a, b) => a.stripeSubscriptionId.localeCompare(b.stripeSubscriptionId))
  const cuentas = customerLinks
    .map((l) => ({ ...l, linkedAt: "" }))
    .sort((a, b) => a.stripeCustomerId.localeCompare(b.stripeCustomerId))

  try {
    const invoices = await cachedStripeInvoices(usdToMxn, links, cuentas)
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

/* ------------------------------------------------------------- Cobranza */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** El mes pedido en la URL, o el actual en GMT-6 si no es válido. */
export function cobranzaMonth(value: string | string[] | undefined) {
  return typeof value === "string" && MONTH.test(value) ? value : mexicoMonth()
}

/**
 * Cinco minutos por mes, igual que las facturas. El mes va en la llave: cada
 * mes que alguien abre se cachea por separado, y "Actualizar" los tira todos.
 */
const cachedCobranza = unstable_cache(
  async (month: string) => {
    const range = mexicoMonthRange(month)
    const input = await fetchCobranzaInput(range)
    return {
      items: buildCobranza({ ...input, range, now: new Date() }),
      fetchedAt: new Date().toISOString(),
    }
  },
  ["stripe-cobranza-v2"],
  { revalidate: 300, tags: ["stripe"] },
)

export type CobranzaRow = CobranzaItem & {
  /** El cliente del panel, cuando su suscripción está enlazada. */
  client: { name: string; slug: string } | null
}

export type CobranzaFeed =
  | { status: "ok"; month: string; rows: CobranzaRow[]; fetchedAt: string }
  | { status: "off" | "error"; month: string; rows: []; fetchedAt: null }

/**
 * La cobranza de un mes, con cada renglón ligado a su cliente del panel
 * cuando hay enlace. Sin Stripe no hay de dónde leerla: la vista lo dice en
 * vez de inventar renglones.
 */
export async function getCobranza(month: string): Promise<CobranzaFeed> {
  if (!stripeEnabled()) return { status: "off", month, rows: [], fetchedAt: null }
  try {
    const [{ items, fetchedAt }, links, customerLinks, clients] = await Promise.all([
      cachedCobranza(month),
      listSubscriptionLinks(),
      listCustomerLinks(),
      listClients(),
    ])
    const { clientFor } = attribution(links, customerLinks)
    const byId = new Map(clients.map((c) => [c.id, c]))
    const rows = items.map((item) => {
      const clientId = clientFor(item.subscriptionId, item.customerId)
      const c = clientId ? byId.get(clientId) : undefined
      return { ...item, client: c ? { name: c.name, slug: c.slug } : null }
    })
    return { status: "ok", month, rows, fetchedAt }
  } catch (error) {
    console.error("Stripe no respondió; sin cobranza", error)
    return { status: "error", month, rows: [], fetchedAt: null }
  }
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
    const since = Math.floor(Date.now() / 1000) - 13 * 31 * 24 * 60 * 60
    const [invoicesRaw, subs, charges, intents] = await Promise.all([
      listRecentInvoices(13),
      listAllSubscriptions(),
      listChargesSince(since),
      listInvoiceIntents(since),
    ])
    // Misma regla que la vista de facturación: facturas pagadas más cargos
    // que no pagaron una factura (recargas, SPEI, links de pago).
    const entries = collectedEntries(invoicesRaw, charges, intents).map((e) => ({
      day: e.day,
      amountBase:
        base === "mxn"
          ? toMxn(e.amount, e.currency, fx)
          : e.currency === "usd"
            ? e.amount
            : null,
    }))

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
          createdAt: dayFromEpoch(s.created),
          canceledAt: s.canceled_at ? dayFromEpoch(s.canceled_at) : null,
          amountBase: amounts.length === 0 ? 0 : total,
        }
      })

    return {
      collected: monthlyCollectedEntries(entries, 12),
      movement: monthlyMovement(spans, 12),
    }
  },
  ["stripe-series-v2"],
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
  // El MRR son las suscripciones activas enlazadas a algún cliente.
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
  const unlinked = active.filter(
    (c) => c.subscriptionCount === 0 || c.locationNames.length === 0,
  )

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
    subscriptionLinkCount: rows.reduce((sum, c) => sum + c.subscriptionCount, 0),
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

/* -------------------------------------------------------------- Lezgo IA */

/**
 * Un usuario con acceso a la subcuenta Lezgo Suite, o con correo nuestro, es
 * del equipo de la agencia: GHL lo lista como "account" en cada subcuenta
 * que atiende, pero no es asesor del cliente.
 */
function isLezgoStaff(user: GhlUser) {
  return (
    (user.roles?.locationIds ?? []).includes(LEZGO_SUITE_LOCATION_ID) ||
    /lezgosuite/i.test(user.email ?? "")
  )
}

/**
 * Topes de la carga de Lezgo IA, que hace una llamada por asesor: unas 360
 * con la cartera actual. Dan como máximo 6 × (4 + 1) = 30 a la vez, y
 * `mapLimit` explica por qué sin tope se caen. El de subcuentas va dentro de
 * la función cacheada: `unstable_cache` revalida en segundo plano las entradas
 * viejas, y ahí un tope por fuera no alcanza.
 */
const subaccountSlot = createLimiter(6)
const ADVISORS_AT_ONCE = 4

/**
 * Solo lo que usa la subcuenta: esto viaja en los argumentos de la caché, y
 * `unstable_cache` los escribe en el log cuando una revalidación falla.
 */
const cachedLezgoIaLocations = unstable_cache(
  async () =>
    (await ghl.listAllLocations()).flatMap(({ id, companyId, name, city, timezone }) =>
      companyId ? [{ id, companyId, name, city, timezone }] : [],
    ),
  ["lezgo-ia-locations"],
  { revalidate: 3600, tags: ["ghl-locations", "lezgo-ia"] },
)

type LezgoIaLink = {
  location: Awaited<ReturnType<typeof cachedLezgoIaLocations>>[number]
  clientName: string
}

/**
 * Una entrada de caché por subcuenta. Lo que se lanza no se guarda: la que
 * falla se reintenta en la siguiente carga sin releer las demás y, si ya tenía
 * una entrada, la conserva. La llave no ve `readLezgoIaSubaccount`: si cambia
 * lo que devuelve, sube el `-v1`.
 */
const cachedLezgoIaSubaccount = unstable_cache(
  (link: LezgoIaLink) => subaccountSlot(() => readLezgoIaSubaccount(link)),
  ["lezgo-ia-subaccount-v1"],
  { revalidate: 3600, tags: ["ghl-locations", "lezgo-ia"] },
)

async function readLezgoIaSubaccount({ location, clientName }: LezgoIaLink) {
  try {
    const { users } = await ghl.searchUsers({
      companyId: location.companyId,
      locationId: location.id,
    })
    const live = await readLocationPipeline(
      location.id,
      advisorUsers(users, isLezgoStaff).map((u) => u.id),
    )
    const subaccount = toSubaccount({
      location,
      users,
      clientName,
      isStaff: isLezgoStaff,
      ...live,
    })
    return { kind: "live" as const, subaccount }
  } catch (error) {
    // Una subcuenta suspendida o cancelada en GHL no es una falla: se
    // declara por nombre y no ensucia la consola.
    if (isInactiveLocation(error)) return { kind: "inactive" as const, name: location.name }
    throw error
  }
}

/** GHL responde "The location is not active" a una subcuenta desactivada. */
function isInactiveLocation(error: unknown) {
  return error instanceof GhlError && /location is not active/i.test(error.message)
}

/**
 * Lo que solo la app OAuth puede leer de una subcuenta: sus pipelines y
 * cuántas oportunidades abiertas tiene cada asesor (`meta.total` con
 * `limit=1`, una llamada por asesor). Si la app no está o no llega a la
 * subcuenta, `null`: la vista lo declara en vez de mostrar ceros. Un fallo
 * pasajero se lanza: como `null` se quedaría una hora en la caché, sin aviso.
 */
async function readLocationPipeline(locationId: string, advisorIds: string[]) {
  if (!oauthConfigured()) return { pipelines: null, openLeads: null }
  try {
    const client = new GhlClient(await locationToken(locationId), locationId)
    const [{ pipelines }, counts] = await Promise.all([
      client.listPipelines(locationId),
      mapLimit(advisorIds, ADVISORS_AT_ONCE, async (id) => {
        const r = await client.request<{ meta?: { total?: number } }>(
          "/opportunities/search",
          {
            query: {
              location_id: locationId,
              assigned_to: id,
              status: "open",
              limit: 1,
            },
          },
        )
        return [id, r.meta?.total ?? 0] as const
      }),
    ])
    return { pipelines, openLeads: Object.fromEntries(counts) }
  } catch (error) {
    if (isTransientGhlError(error)) throw error
    console.error(`La app OAuth no leyó ${locationId}`, error)
    return { pipelines: null, openLeads: null }
  }
}

/**
 * Subcuentas de Lezgo IA: las de GHL enlazadas a un cliente, con sus
 * usuarios reales como asesores. La IA aún no corre, así que no hay hilos
 * ni bitácora que leer: llegan vacíos, no inventados. Sin GHL o sin Neon, el
 * demo completo.
 */
export async function getLezgoIaData(): Promise<lezgoIaDemo.LezgoIaData> {
  const demoData: lezgoIaDemo.LezgoIaData = {
    source: "demo",
    now: lezgoIaDemo.DEMO_NOW,
    subaccounts: lezgoIaDemo.subaccounts,
    threads: lezgoIaDemo.threads,
    actions: lezgoIaDemoActions,
    failed: 0,
    inactive: [],
  }
  if (!ghl.isConfigured || !db) return demoData

  const [links, clients] = await Promise.all([
    listLocationLinks(),
    db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients),
  ])
  const clientById = new Map(clients.map((c) => [c.id, c.name]))

  try {
    const locations = await cachedLezgoIaLocations()
    const byId = new Map(locations.map((l) => [l.id, l]))
    const reads = await Promise.all(
      links.map(async (link) => {
        const location = byId.get(link.ghlLocationId)
        if (!location) return null
        try {
          return await cachedLezgoIaSubaccount({
            location,
            clientName: clientById.get(link.clientId) ?? "",
          })
        } catch (error) {
          console.error(`GHL no devolvió ${link.ghlLocationId}`, error)
          return null
        }
      }),
    )
    const failed = reads.filter((r) => r === null).length
    const inactive = reads
      .flatMap((r) => (r?.kind === "inactive" ? [r.name] : []))
      .sort((a, b) => a.localeCompare(b, "es"))
    const subaccounts = reads
      .flatMap((r) => (r?.kind === "live" ? [r.subaccount] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
    // La configuración no pasa por la caché de GHL: lo guardado se ve al instante.
    const configs = await getLezgoIaConfigs(
      subaccounts.map((s) => ({ locationId: s.id, timezone: s.timezone })),
    )
    const now = new Date()
    const threads = await getLezgoIaThreads(subaccounts.map((s) => s.id))
    const weekly = weeklySentBySubaccount(threads, now)
    return {
      source: "ghl",
      now: now.toISOString(),
      subaccounts: subaccounts.map((s) => ({
        ...applyConfig(s, configs.get(s.id)),
        weeklyMessages: weekly.get(s.id) ?? 0,
      })),
      threads,
      // El motor todavía solo avisa: no hace nada en GHL que anotar aquí.
      actions: [],
      failed,
      inactive,
    }
  } catch (error) {
    console.error("GHL no respondió para Lezgo IA", error)
    return demoData
  }
}

/**
 * Configuración guardada de Lezgo IA, una por subcuenta. Solo trae las que
 * tienen fila; a las demás les toca `defaultAccountConfig`. Es la lectura
 * que usa el motor de la IA: con esto y `shouldNotify` decide sin modelo.
 */
export async function getLezgoIaConfigs(
  locations: { locationId: string; timezone?: string }[],
): Promise<Map<string, AccountConfig>> {
  const result = new Map<string, AccountConfig>()
  if (!db || locations.length === 0) return result
  const ids = locations.map((l) => l.locationId)
  const [accounts, advisors] = await Promise.all([
    db
      .select()
      .from(schema.lezgoIaAccounts)
      .where(inArray(schema.lezgoIaAccounts.ghlLocationId, ids)),
    db
      .select()
      .from(schema.lezgoIaAdvisors)
      .where(inArray(schema.lezgoIaAdvisors.ghlLocationId, ids)),
  ])
  const timezoneOf = new Map(locations.map((l) => [l.locationId, l.timezone]))
  for (const row of accounts) {
    result.set(row.ghlLocationId, {
      ...defaultAccountConfig(row.ghlLocationId, timezoneOf.get(row.ghlLocationId)),
      status: row.status as IaStatus,
      settings: row.settings as SettingValues,
      voice: (row.voice as Voice | null) ?? null,
      stageRules: row.stageRules as StoredStageRules,
    })
  }
  for (const row of advisors) {
    const config =
      result.get(row.ghlLocationId) ??
      defaultAccountConfig(row.ghlLocationId, timezoneOf.get(row.ghlLocationId))
    config.advisors[row.ghlUserId] = {
      userId: row.ghlUserId,
      alerts: row.alerts,
      settings: row.settings as SettingValues,
      away:
        row.awayFrom && row.awayTo && row.awayCoverage
          ? { from: row.awayFrom, to: row.awayTo, coverage: row.awayCoverage }
          : null,
    }
    result.set(row.ghlLocationId, config)
  }
  return result
}

/** Una sola subcuenta; sin fila guardada, la configuración por defecto. */
export async function getLezgoIaConfig(
  locationId: string,
  timezone?: string,
): Promise<AccountConfig> {
  const configs = await getLezgoIaConfigs([{ locationId, timezone }])
  return configs.get(locationId) ?? defaultAccountConfig(locationId, timezone)
}

/** Renglones de la bitácora que se leen para la pestaña Mensajes. */
const MAX_NOTIFICATION_ROWS = 1500

/**
 * Lo que el motor de Lezgo IA mandó (o habría mandado) en estas subcuentas,
 * un hilo por WhatsApp, lo más reciente primero. Si la bitácora no se puede
 * leer, la vista sigue en pie sin mensajes.
 */
export async function getLezgoIaThreads(locationIds: string[]) {
  if (!db || locationIds.length === 0) return []
  try {
    const rows = await db
      .select({
        id: schema.lezgoIaNotifications.id,
        ghlLocationId: schema.lezgoIaNotifications.ghlLocationId,
        runId: schema.lezgoIaNotifications.runId,
        kind: schema.lezgoIaNotifications.kind,
        recipient: schema.lezgoIaNotifications.recipient,
        recipientName: schema.lezgoIaNotifications.recipientName,
        status: schema.lezgoIaNotifications.status,
        body: schema.lezgoIaNotifications.body,
        error: schema.lezgoIaNotifications.error,
        createdAt: schema.lezgoIaNotifications.createdAt,
      })
      .from(schema.lezgoIaNotifications)
      .where(inArray(schema.lezgoIaNotifications.ghlLocationId, locationIds))
      .orderBy(desc(schema.lezgoIaNotifications.createdAt))
      .limit(MAX_NOTIFICATION_ROWS)
    return threadsFromNotifications(rows)
  } catch (error) {
    console.error("No se leyó la bitácora de Lezgo IA", error)
    return []
  }
}

/**
 * El último aviso que el motor le mandó a este contacto de pruebas: dice a
 * quién representa ese número cuando contesta (subcuenta y destinatario).
 */
export async function getLastNotificationTo(testContactId: string) {
  if (!db) return null
  const [row] = await db
    .select({
      ghlLocationId: schema.lezgoIaNotifications.ghlLocationId,
      recipient: schema.lezgoIaNotifications.recipient,
      recipientName: schema.lezgoIaNotifications.recipientName,
    })
    .from(schema.lezgoIaNotifications)
    .where(
      and(
        eq(schema.lezgoIaNotifications.testContactId, testContactId),
        eq(schema.lezgoIaNotifications.status, "sent"),
      ),
    )
    .orderBy(desc(schema.lezgoIaNotifications.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Cuáles de estos avisos ya salieron (`status = "sent"`) en una corrida
 * anterior del motor de Lezgo IA. Lo fallido o simulado no cuenta: se
 * vuelve a intentar.
 */
export async function getSentNotificationKeys(
  locationId: string,
  keys: string[],
): Promise<Set<string>> {
  if (!db || keys.length === 0) return new Set()
  const rows = await db
    .selectDistinct({ key: schema.lezgoIaNotifications.key })
    .from(schema.lezgoIaNotifications)
    .where(
      and(
        eq(schema.lezgoIaNotifications.ghlLocationId, locationId),
        eq(schema.lezgoIaNotifications.status, "sent"),
        inArray(schema.lezgoIaNotifications.key, keys),
      ),
    )
  return new Set(rows.map((r) => r.key))
}
