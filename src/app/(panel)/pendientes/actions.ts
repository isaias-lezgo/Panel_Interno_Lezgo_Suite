"use server"

import { refresh } from "next/cache"
import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { isPendingOwner, type PendingOwner } from "@/lib/pendings/owners"
import { listLocationOptions } from "@/lib/repository"

type Done = { ok: true } | { ok: false; error: string }

const NO_DB = "Sin base de datos: los pendientes no se guardan en modo demo."

const MAX = 280

/**
 * Escribe un pendiente. Del navegador solo llega el id de la subcuenta; el
 * nombre se lee de GHL aquí, igual que en las implementaciones, para que la
 * lista no muestre lo que alguien mandó en el formulario.
 *
 * Escribe solo a Neon: un pendiente no existe en GoHighLevel.
 */
export async function createPending(input: {
  body: string
  owner: PendingOwner
  locationId: string | null
}): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  if (!isPendingOwner(input.owner)) {
    return { ok: false, error: "Esa persona no está en el equipo." }
  }

  const body = input.body.trim().replace(/\s+/g, " ")
  if (!body) return { ok: false, error: "Escribe el pendiente." }
  if (body.length > MAX) {
    return { ok: false, error: `El pendiente pasa de ${MAX} caracteres.` }
  }

  let ghlLocationId: string | null = null
  let ghlLocationName: string | null = null
  if (input.locationId) {
    const { options, error } = await listLocationOptions()
    if (error) return { ok: false, error }
    const location = options.find((l) => l.id === input.locationId)
    if (!location) return { ok: false, error: "Esa subcuenta no existe en GHL." }
    ghlLocationId = location.id
    ghlLocationName = location.name
  }

  await db.insert(schema.pendings).values({
    id: `pd_${crypto.randomUUID()}`,
    body,
    owner: input.owner,
    ghlLocationId,
    ghlLocationName,
  })

  refresh()
  return { ok: true }
}

/** Marcar hecho no borra: el renglón se tacha y baja al pie de su grupo. */
export async function togglePending(id: string, done: boolean): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .update(schema.pendings)
    .set({ done, doneAt: done ? new Date().toISOString() : null })
    .where(eq(schema.pendings.id, id))
    .returning({ id: schema.pendings.id })
  if (!row) return { ok: false, error: "Ese pendiente ya no existe." }
  refresh()
  return { ok: true }
}

/** Los pendientes no se editan: se borran y se vuelven a escribir. */
export async function deletePending(id: string): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .delete(schema.pendings)
    .where(eq(schema.pendings.id, id))
    .returning({ id: schema.pendings.id })
  if (!row) return { ok: false, error: "Ese pendiente ya no existe." }
  refresh()
  return { ok: true }
}
