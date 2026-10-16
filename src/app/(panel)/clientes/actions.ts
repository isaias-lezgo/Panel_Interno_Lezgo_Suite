"use server"

import { refresh } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db, schema } from "@/db"
import { syncClientsFromGhl, type SyncResult } from "@/lib/clients/sync"
import {
  listChargeAccountOptions,
  listSubscriptionOptions,
} from "@/lib/repository"
import type { ChargeAccount, SubscriptionOption } from "@/lib/types"

type Result = { ok: true } | { ok: false; error: string }

const NO_DB = "Sin base de datos: los enlaces no se guardan en modo demo."

/**
 * Todas las acciones cierran con `refresh()` y no con `revalidatePath`: los
 * enlaces se leen de Neon sin caché, así que no hay nada que invalidar — lo
 * que falta es que el router del cliente vuelva a pedir la vista para que el
 * cambio se vea sin recargar.
 */

export async function syncClients(): Promise<SyncResult> {
  const result = await syncClientsFromGhl()
  refresh()
  return result
}

/**
 * Busca en las suscripciones libres de la cartera. Son cientos, así que el
 * desplegable pregunta por lo que se escribe en vez de cargarlas todas.
 */
export async function searchStripeSubscriptions(
  query: string,
): Promise<SubscriptionOption[]> {
  const { options } = await listSubscriptionOptions(query)
  return options
}

/**
 * Una suscripción tiene un solo dueño: si ya está enlazada, se dice a quién.
 * El `cus_` se toma de la cartera, no del navegador.
 */
export async function linkStripeSubscription(
  clientId: string,
  subscriptionId: string,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    return { ok: false, error: "Id de suscripción inválido." }
  }
  const [taken] = await db
    .select({
      clientId: schema.clientStripeSubscriptions.clientId,
      linkedBy: schema.clientStripeSubscriptions.linkedBy,
      customerId: schema.clientStripeSubscriptions.stripeCustomerId,
      name: schema.clients.name,
    })
    .from(schema.clientStripeSubscriptions)
    .innerJoin(
      schema.clients,
      eq(schema.clients.id, schema.clientStripeSubscriptions.clientId),
    )
    .where(eq(schema.clientStripeSubscriptions.stripeSubscriptionId, subscriptionId))
  if (taken && taken.linkedBy !== "excluded" && taken.clientId !== clientId) {
    return { ok: false, error: `Ya está enlazada a ${taken.name}.` }
  }

  let customerId: string | null = taken?.customerId ?? null
  if (!customerId) {
    const { options } = await listSubscriptionOptions(subscriptionId, 1)
    customerId = options.find((o) => o.id === subscriptionId)?.customerId ?? null
  }
  if (!customerId) {
    return { ok: false, error: "Esa suscripción no está en la cartera de Stripe." }
  }

  // Una fila archivada se revive: la suscripción vuelve, ahora a quien la eligió.
  const fila = {
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    clientId,
    linkedBy: "manual" as const,
    linkedAt: new Date().toISOString(),
  }
  await db
    .insert(schema.clientStripeSubscriptions)
    .values(fila)
    .onConflictDoUpdate({
      target: schema.clientStripeSubscriptions.stripeSubscriptionId,
      set: fila,
    })
  refresh()
  return { ok: true }
}

/**
 * No borra la fila: la archiva. Quitar un enlace es una decisión, y la
 * siguiente sincronización volvería a proponer la misma suscripción si no
 * queda constancia de que ya se descartó.
 */
export async function unlinkStripeSubscription(
  subscriptionId: string,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  await db
    .update(schema.clientStripeSubscriptions)
    .set({ linkedBy: "excluded" })
    .where(eq(schema.clientStripeSubscriptions.stripeSubscriptionId, subscriptionId))
  refresh()
  return { ok: true }
}

/** Busca entre los `cus_` con cobros que nadie tiene. */
export async function searchChargeAccounts(query: string): Promise<ChargeAccount[]> {
  const { options } = await listChargeAccountOptions(query)
  return options
}

/**
 * Enlaza un `cus_` como cuenta de cobro sin suscripción: sus recargas, SPEI
 * y cobros sueltos pasan a ser del cliente. Un `cus_` tiene un solo dueño.
 */
export async function linkChargeAccount(
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
      linkedBy: schema.clientStripeCustomers.linkedBy,
      name: schema.clients.name,
    })
    .from(schema.clientStripeCustomers)
    .innerJoin(
      schema.clients,
      eq(schema.clients.id, schema.clientStripeCustomers.clientId),
    )
    .where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  if (taken && taken.linkedBy !== "excluded" && taken.clientId !== clientId) {
    return { ok: false, error: `Ya es cuenta de cobro de ${taken.name}.` }
  }
  const fila = {
    stripeCustomerId: customerId,
    clientId,
    linkedBy: "manual" as const,
    linkedAt: new Date().toISOString(),
  }
  await db
    .insert(schema.clientStripeCustomers)
    .values(fila)
    .onConflictDoUpdate({
      target: schema.clientStripeCustomers.stripeCustomerId,
      set: fila,
    })
  refresh()
  return { ok: true }
}

/** Archiva, no borra, igual que los demás enlaces. */
export async function unlinkChargeAccount(customerId: string): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  await db
    .update(schema.clientStripeCustomers)
    .set({ linkedBy: "excluded" })
    .where(eq(schema.clientStripeCustomers.stripeCustomerId, customerId))
  refresh()
  return { ok: true }
}

/**
 * Un cliente puede tener varias subcuentas; una subcuenta, un solo dueño.
 * Como con Stripe, una fila archivada se revive a nombre de quien la elige.
 */
export async function linkGhlLocation(
  clientId: string,
  locationId: string,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  const [taken] = await db
    .select({
      clientId: schema.clientGhlLocations.clientId,
      linkedBy: schema.clientGhlLocations.linkedBy,
      name: schema.clients.name,
    })
    .from(schema.clientGhlLocations)
    .innerJoin(
      schema.clients,
      eq(schema.clients.id, schema.clientGhlLocations.clientId),
    )
    .where(eq(schema.clientGhlLocations.ghlLocationId, locationId))
  if (taken && taken.linkedBy !== "excluded" && taken.clientId !== clientId) {
    return { ok: false, error: `Esa subcuenta ya es de ${taken.name}.` }
  }
  const fila = {
    ghlLocationId: locationId,
    clientId,
    linkedBy: "manual" as const,
    linkedAt: new Date().toISOString(),
  }
  await db
    .insert(schema.clientGhlLocations)
    .values(fila)
    .onConflictDoUpdate({
      target: schema.clientGhlLocations.ghlLocationId,
      set: fila,
    })
  refresh()
  return { ok: true }
}

/** Archiva, no borra: la sincronización no vuelve a proponer la subcuenta. */
export async function unlinkGhlLocation(locationId: string): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  await db
    .update(schema.clientGhlLocations)
    .set({ linkedBy: "excluded" })
    .where(eq(schema.clientGhlLocations.ghlLocationId, locationId))
  refresh()
  return { ok: true }
}

/**
 * Las cuatro columnas de cuenta de la tabla de clientes. `null` borra lo
 * escrito y devuelve la celda a lo que digan Stripe o la etapa de GHL; por
 * eso cada campo es opcional y `null` es un valor, no un "no lo mandes".
 */
const patch = z.object({
  supportActive: z.boolean().nullable().optional(),
  licenseDueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .nullable()
    .optional(),
  billingPeriod: z.enum(["1m", "3m", "6m", "1y"]).nullable().optional(),
  membership: z.enum(["start", "growth", "pro", "elite"]).nullable().optional(),
})

export type AccountPatch = z.infer<typeof patch>

/** Escribe solo a Neon: ni Stripe ni GoHighLevel se enteran de esto. */
export async function updateClientAccount(
  clientId: string,
  input: AccountPatch,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  const parsed = patch.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dato inválido." }
  }
  if (Object.keys(parsed.data).length === 0) return { ok: true }

  const [row] = await db
    .update(schema.clients)
    .set(parsed.data)
    .where(eq(schema.clients.id, clientId))
    .returning({ id: schema.clients.id })
  if (!row) return { ok: false, error: "Ese cliente ya no existe." }
  refresh()
  return { ok: true }
}
