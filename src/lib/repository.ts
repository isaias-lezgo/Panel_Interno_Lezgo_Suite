import "server-only"

import { desc, eq } from "drizzle-orm"

import * as demo from "@/data/demo"
import { db, schema } from "@/db"
import type {
  ActivityEvent,
  Client,
  Implementation,
  Invoice,
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

export async function listInvoices(): Promise<Invoice[]> {
  if (!db) return demo.invoices
  return (await db.select().from(schema.invoices)) as Invoice[]
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
    .reduce((sum, i) => sum + i.amount, 0)

  const overdueCount = invoices.filter((i) => i.status === "overdue").length

  const inFlight = implementations.filter((i) => i.stage !== "live")
  const blocked = implementations.filter((i) => i.blocked)
  const atRisk = clients.filter((c) => c.status === "at_risk")

  return {
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
