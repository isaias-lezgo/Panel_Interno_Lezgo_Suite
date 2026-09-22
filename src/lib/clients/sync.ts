import "server-only"

import { eq, inArray } from "drizzle-orm"

import { db, schema } from "@/db"
import { ghl, GhlError } from "@/lib/ghl/client"
import {
  lezgoSuite,
  lezgoSuiteEnabled,
  VENTAS_PIPELINE_ID,
} from "@/lib/ghl/lezgo-suite"
import { listCustomers, stripeEnabled } from "@/lib/stripe/client"

import {
  groupWonOpportunities,
  type ClientDraft,
  type WonOpportunity,
} from "./group"
import { autoLink, type LinkSubject, type LinkTarget } from "./match"
import { planUpserts } from "./plan"

export type SyncResult =
  | {
      ok: true
      clients: number
      orphaned: number
      stripeLinked: number
      locationsLinked: number
    }
  | { ok: false; error: string }

async function fetchWon(): Promise<WonOpportunity[]> {
  const out: WonOpportunity[] = []
  let startAfter: number | undefined
  let startAfterId: string | undefined
  for (;;) {
    const page = await lezgoSuite.searchOpportunities({
      pipelineId: VENTAS_PIPELINE_ID,
      status: "won",
      limit: 100,
      startAfter,
      startAfterId,
    })
    for (const o of page.opportunities) {
      const now = new Date().toISOString()
      out.push({
        id: o.id,
        name: o.name,
        monetaryValue: o.monetaryValue ?? null,
        pipelineStageId: o.pipelineStageId,
        createdAt: o.createdAt ?? now,
        updatedAt: o.updatedAt ?? o.createdAt ?? now,
        lastStatusChangeAt: o.lastStatusChangeAt ?? null,
        contact: o.contact
          ? {
              id: o.contact.id,
              name: o.contact.name ?? null,
              companyName: o.contact.companyName ?? null,
              email: o.contact.email ?? null,
              phone: o.contact.phone ?? null,
            }
          : null,
      })
    }
    if (page.opportunities.length < 100 || !page.meta?.startAfterId) return out
    startAfter = page.meta.startAfter
    startAfterId = page.meta.startAfterId
  }
}

function toSubject(d: ClientDraft): LinkSubject {
  return {
    id: d.id,
    names: [d.name, d.contactName, ...d.opportunities.map((o) => o.name)],
    email: d.email,
    phone: d.phone,
  }
}

/**
 * Lee las ganadas del pipeline Ventas, las agrupa por contacto, hace upsert
 * en Neon y enlaza en automático lo que coincide exacto. Nunca lanza.
 */
export async function syncClientsFromGhl(): Promise<SyncResult> {
  if (!db) return { ok: false, error: "Falta DATABASE_URL" }
  if (!lezgoSuiteEnabled()) {
    return { ok: false, error: "Falta GHL_LEZGO_SUITE_TOKEN" }
  }

  try {
    const [won, { pipelines }] = await Promise.all([
      fetchWon(),
      lezgoSuite.listPipelines(),
    ])
    const ventas = pipelines.find((p) => p.id === VENTAS_PIPELINE_ID)
    const stageNames = new Map(
      (ventas?.stages ?? []).map((s) => [s.id, s.name]),
    )
    const drafts = groupWonOpportunities(won, stageNames)

    const existing = await db
      .select({ id: schema.clients.id, slug: schema.clients.slug })
      .from(schema.clients)
    const { upserts, orphanIds } = planUpserts(drafts, existing)
    const now = new Date().toISOString()

    for (const d of upserts) {
      const row = {
        name: d.name,
        contactName: d.contactName,
        email: d.email,
        phone: d.phone,
        ghlContactId: d.ghlContactId,
        stage: d.stage,
        wonAt: d.wonAt,
        syncedAt: now,
        orphaned: false,
      }
      await db
        .insert(schema.clients)
        .values({ id: d.id, slug: d.slug, ...row })
        .onConflictDoUpdate({ target: schema.clients.id, set: row })
      for (const o of d.opportunities) {
        await db
          .insert(schema.clientOpportunities)
          .values({ ...o, clientId: d.id })
          .onConflictDoUpdate({
            target: schema.clientOpportunities.id,
            set: { ...o, clientId: d.id },
          })
      }
    }
    if (orphanIds.length) {
      await db
        .update(schema.clients)
        .set({ orphaned: true })
        .where(inArray(schema.clients.id, orphanIds))
    }

    const stripeLinked = await autoLinkStripe(upserts)
    const locationsLinked = await autoLinkLocations(upserts)

    return {
      ok: true,
      clients: upserts.length,
      orphaned: orphanIds.length,
      stripeLinked,
      locationsLinked,
    }
  } catch (error) {
    const message =
      error instanceof GhlError
        ? `GoHighLevel: ${error.message}`
        : String(error)
    console.error("Sync de clientes falló", error)
    return { ok: false, error: message }
  }
}

/** Solo clientes sin ningún enlace; solo cus_ que nadie tiene. */
async function autoLinkStripe(drafts: ClientDraft[]) {
  if (!db || !stripeEnabled()) return 0
  const links = await db.select().from(schema.clientStripeCustomers)
  const linkedCus = new Set(links.map((l) => l.stripeCustomerId))
  const linkedClients = new Set(links.map((l) => l.clientId))

  const subjects = drafts
    .filter((d) => !linkedClients.has(d.id))
    .map(toSubject)
  if (!subjects.length) return 0

  const customers = await listCustomers()
  const targets: LinkTarget[] = customers
    .filter((c) => !linkedCus.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
    }))

  const found = autoLink(subjects, targets, "many")
  const now = new Date().toISOString()
  for (const [cus, clientId] of found) {
    await db
      .insert(schema.clientStripeCustomers)
      .values({
        stripeCustomerId: cus,
        clientId,
        linkedBy: "auto",
        linkedAt: now,
      })
      .onConflictDoNothing()
  }
  return found.size
}

async function autoLinkLocations(drafts: ClientDraft[]) {
  if (!db || !ghl.isConfigured) return 0
  const rows = await db
    .select({ id: schema.clients.id, ghlLocationId: schema.clients.ghlLocationId })
    .from(schema.clients)
  const withLocation = new Set(
    rows.filter((r) => r.ghlLocationId).map((r) => r.id),
  )
  const usedLocations = new Set(
    rows.map((r) => r.ghlLocationId).filter((id): id is string => Boolean(id)),
  )

  const subjects = drafts
    .filter((d) => !withLocation.has(d.id))
    .map(toSubject)
  if (!subjects.length) return 0

  const locations = await ghl.listAllLocations()
  const targets: LinkTarget[] = locations
    .filter((l) => !usedLocations.has(l.id))
    .map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email ?? null,
      phone: l.phone ?? null,
    }))

  const found = autoLink(subjects, targets, "one")
  for (const [locationId, clientId] of found) {
    await db
      .update(schema.clients)
      .set({ ghlLocationId: locationId, ghlLocationLinkedBy: "auto" })
      .where(eq(schema.clients.id, clientId))
  }
  return found.size
}
