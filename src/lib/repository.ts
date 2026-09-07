import "server-only"

import { unstable_cache, updateTag } from "next/cache"
import { desc, eq } from "drizzle-orm"

import * as demo from "@/data/demo"
import { db, schema } from "@/db"
import { listRecentInvoices, stripeEnabled } from "@/lib/stripe/client"
import { mapInvoice } from "@/lib/stripe/map"
import type {
  ActivityEvent,
  Client,
  Currency,
  Implementation,
  Invoice,
  InvoiceRow,
  RevenuePoint,
} from "@/lib/types"

/**
 * One read surface for the whole panel. Every page goes through here, so
 * swapping seed data for Neon is a single decision made in one place.
 */

export async function listClients(): Promise<Client[]> {
  if (!db) return demo.clients
  return (await db.select().from(schema.clients)) as Client[]
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

  const clients = await listClients()
  const pares = clients
    .filter((c) => c.stripeCustomerId)
    .map((c) => [c.stripeCustomerId as string, c.id] as [string, string])
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
  const [clients, implementations, invoices, revenue] = await Promise.all([
    listClients(),
    listImplementations(),
    listInvoices(),
    listRevenue(),
  ])

  const active = clients.filter((c) => c.status !== "churned")
  const mrr = active.reduce((sum, c) => sum + c.mrr, 0)
  const previous = revenue.at(-2)?.recurring ?? mrr
  const mrrDelta = previous ? ((mrr - previous) / previous) * 100 : 0

  const outstanding = invoices
    .filter((i) => i.status === "overdue" || i.status === "due")
    .reduce((sum, i) => sum + (i.amountBase ?? 0), 0)

  const overdueCount = invoices.filter((i) => i.status === "overdue").length

  const inFlight = implementations.filter((i) => i.stage !== "live")
  const blocked = implementations.filter((i) => i.blocked)
  const atRisk = clients.filter((c) => c.status === "at_risk")

  return {
    baseCurrency: baseCurrency(),
    clients,
    implementations,
    invoices,
    revenue,
    mrr,
    mrrDelta,
    activeCount: active.length,
    outstanding,
    overdueCount,
    inFlightCount: inFlight.length,
    blockedCount: blocked.length,
    atRisk,
    /** Seat-weighted average health across everything still paying us. */
    health: active.length
      ? Math.round(active.reduce((s, c) => s + c.health, 0) / active.length)
      : 0,
  }
}
