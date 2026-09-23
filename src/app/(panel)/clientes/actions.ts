"use server"

import { refresh } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { db, schema } from "@/db"
import { syncClientsFromGhl, type SyncResult } from "@/lib/clients/sync"
import { listStripeCustomerOptions } from "@/lib/repository"
import type { StripeCustomerOption } from "@/lib/types"

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
 * Busca en los clientes de Stripe libres. La lista completa pasa de mil, así
 * que el desplegable pregunta por lo que se escribe en vez de cargarla toda.
 */
export async function searchStripeCustomers(
  query: string,
): Promise<StripeCustomerOption[]> {
  const { options } = await listStripeCustomerOptions(query)
  return options
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
    return { ok: false, error: `Ya está enlazado a ${taken.name}.` }
  }
  // Una fila archivada se revive: el cus_ vuelve, ahora a quien lo eligió.
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

/**
 * No borra la fila: la archiva. Quitar un enlace es una decisión, y la
 * siguiente sincronización volvería a proponer el mismo `cus_` si no queda
 * constancia de que ya se descartó.
 */
export async function unlinkStripeCustomer(customerId: string): Promise<Result> {
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
