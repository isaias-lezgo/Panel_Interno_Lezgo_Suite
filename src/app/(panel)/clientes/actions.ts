"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { syncClientsFromGhl, type SyncResult } from "@/lib/clients/sync"

type Result = { ok: true } | { ok: false; error: string }

const NO_DB = "Sin base de datos: los enlaces no se guardan en modo demo."

function refresh() {
  revalidatePath("/clientes", "layout")
  revalidatePath("/")
  revalidatePath("/facturacion")
}

export async function syncClients(): Promise<SyncResult> {
  const result = await syncClientsFromGhl()
  refresh()
  return result
}

/** Un cus_ tiene un solo dueño: si ya está enlazado, se dice a quién. */
export async function linkStripeCustomer(
  clientId: string,
  customerId: string,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  if (!/^cus_[A-Za-z0-9]+$/.test(customerId)) {
    return { ok: false, error: "Id de Stripe inválido." }
  }
  const [taken] = await db
    .select({
      clientId: schema.clientStripeCustomers.clientId,
      name: schema.clients.name,
    })
    .from(schema.clientStripeCustomers)
    .innerJoin(
      schema.clients,
      eq(schema.clients.id, schema.clientStripeCustomers.clientId),
    )
    .where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  if (taken && taken.clientId !== clientId) {
    return { ok: false, error: `Ya está enlazado a ${taken.name}.` }
  }
  await db
    .insert(schema.clientStripeCustomers)
    .values({
      stripeCustomerId: customerId,
      clientId,
      linkedBy: "manual",
      linkedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
  refresh()
  return { ok: true }
}

export async function unlinkStripeCustomer(customerId: string): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  await db
    .delete(schema.clientStripeCustomers)
    .where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  refresh()
  return { ok: true }
}

export async function linkGhlLocation(
  clientId: string,
  locationId: string,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  const [taken] = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .where(eq(schema.clients.ghlLocationId, locationId))
  if (taken && taken.id !== clientId) {
    return { ok: false, error: `Esa subcuenta ya es de ${taken.name}.` }
  }
  await db
    .update(schema.clients)
    .set({ ghlLocationId: locationId, ghlLocationLinkedBy: "manual" })
    .where(eq(schema.clients.id, clientId))
  refresh()
  return { ok: true }
}

export async function unlinkGhlLocation(clientId: string): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  await db
    .update(schema.clients)
    .set({ ghlLocationId: null, ghlLocationLinkedBy: null })
    .where(eq(schema.clients.id, clientId))
  refresh()
  return { ok: true }
}
