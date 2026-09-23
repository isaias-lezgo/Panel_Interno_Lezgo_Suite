"use server"

import { refresh } from "next/cache"
import { and, eq, isNull, max } from "drizzle-orm"

import { db, schema } from "@/db"
import {
  checklistProgress,
  checklistRows,
} from "@/lib/implementations/checklist"
import {
  getLezgoContact,
  listClients,
  listLocationLinks,
  listLocationOptions,
  searchLezgoContacts,
} from "@/lib/repository"
import type { ImplementationContact, ImplementationStage } from "@/lib/types"

type Result = { ok: true; id: string } | { ok: false; error: string }
type Done = { ok: true } | { ok: false; error: string }

const NO_DB =
  "Sin base de datos: las implementaciones no se guardan en modo demo."

const STAGES: readonly ImplementationStage[] = [
  "scoping",
  "building",
  "review",
  "launch",
  "live",
]

export async function searchContacts(
  query: string,
): Promise<ImplementationContact[]> {
  const { options } = await searchLezgoContacts(query)
  return options
}

/**
 * Primer paso de una implementación: subcuenta + contactos. Del navegador
 * solo llegan ids; nombre de la subcuenta y datos de cada contacto se leen
 * de GHL aquí, para que la tarjeta no muestre lo que el cliente mandó.
 */
export async function createImplementation(input: {
  locationId: string
  contactIds: string[]
}): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }

  const contactIds = [...new Set(input.contactIds)]
  if (!input.locationId) return { ok: false, error: "Elige una subcuenta." }
  if (contactIds.length === 0) {
    return { ok: false, error: "Elige al menos un contacto de Lezgo Suite." }
  }

  const [{ options: locations, error }, clients, locationLinks, contacts] = await Promise.all([
    listLocationOptions(),
    listClients(),
    listLocationLinks(),
    Promise.all(contactIds.map(getLezgoContact)),
  ])
  if (error) return { ok: false, error }
  const location = locations.find((l) => l.id === input.locationId)
  if (!location) return { ok: false, error: "Esa subcuenta no existe en GHL." }
  if (contacts.some((c) => c === null)) {
    return { ok: false, error: "No se pudo leer uno de los contactos en GHL." }
  }
  const found = contacts as ImplementationContact[]

  // El cliente del panel sale de la subcuenta si ya está enlazada; si no,
  // del primer contacto que sea cliente.
  const clientIds = new Set(clients.map((c) => c.id))
  const clientId =
    locationLinks.find((l) => l.ghlLocationId === location.id)?.clientId ??
    found.find((c) => clientIds.has(c.id))?.id ??
    null

  const id = `im_${crypto.randomUUID()}`
  const today = new Date().toISOString().slice(0, 10)

  await db.batch([
    db.insert(schema.implementations).values({
      id,
      clientId,
      ghlLocationId: location.id,
      ghlLocationName: location.name,
      name: location.name,
      stage: "scoping",
      progress: 0,
      updatedAt: today,
    }),
    db.insert(schema.implementationChecklistItems).values(checklistRows(id)),
    db.insert(schema.implementationContacts).values(
      found.map((c) => ({
        implementationId: id,
        ghlContactId: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
      })),
    ),
  ])

  refresh()
  return { ok: true, id }
}

/** Cambia la etapa al soltar una tarjeta en otra columna del tablero. */
export async function moveImplementation(
  id: string,
  stage: ImplementationStage,
): Promise<Result> {
  if (!db) return { ok: false, error: NO_DB }
  if (!STAGES.includes(stage)) return { ok: false, error: "Etapa inválida." }

  const [row] = await db
    .update(schema.implementations)
    .set({ stage, updatedAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.implementations.id, id))
    .returning({ id: schema.implementations.id })
  if (!row) return { ok: false, error: "Esa implementación ya no existe." }

  refresh()
  return { ok: true, id }
}

export async function renameImplementation(
  id: string,
  name: string,
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const clean = name.trim().replace(/\s+/g, " ")
  if (!clean) return { ok: false, error: "El nombre no puede quedar vacío." }
  if (clean.length > 120) {
    return { ok: false, error: "El nombre pasa de 120 caracteres." }
  }
  const [row] = await db
    .update(schema.implementations)
    .set({ name: clean, updatedAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.implementations.id, id))
    .returning({ id: schema.implementations.id })
  if (!row) return { ok: false, error: "Esa implementación ya no existe." }
  refresh()
  return { ok: true }
}

/** Fecha máxima de entrega, `YYYY-MM-DD`. `null` la quita: es opcional. */
export async function setImplementationDueDate(
  id: string,
  dueAt: string | null,
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const valid =
    dueAt === null ||
    (/^\d{4}-\d{2}-\d{2}$/.test(dueAt) && !Number.isNaN(Date.parse(dueAt)))
  if (!valid) {
    return { ok: false, error: "Fecha inválida." }
  }
  const [row] = await db
    .update(schema.implementations)
    .set({ dueAt, updatedAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.implementations.id, id))
    .returning({ id: schema.implementations.id })
  if (!row) return { ok: false, error: "Esa implementación ya no existe." }
  refresh()
  return { ok: true }
}

/* -------------------------------------------------------------- checklist */

const items = schema.implementationChecklistItems

/**
 * El avance de la tarjeta es el del checklist. Se guarda en `progress` y no
 * se calcula al leer para que el tablero, la ficha y el copiloto lean la
 * misma cifra sin cargar los puntos.
 */
async function syncProgress(implementationId: string) {
  if (!db) return
  const rows = await db
    .select({ done: items.done })
    .from(items)
    .where(eq(items.implementationId, implementationId))
  await db
    .update(schema.implementations)
    .set({
      progress: checklistProgress(rows),
      updatedAt: new Date().toISOString().slice(0, 10),
    })
    .where(eq(schema.implementations.id, implementationId))
}

export async function toggleChecklistItem(
  itemId: string,
  done: boolean,
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .update(items)
    .set({ done })
    .where(eq(items.id, itemId))
    .returning({ implementationId: items.implementationId })
  if (!row) return { ok: false, error: "Ese punto ya no existe." }
  await syncProgress(row.implementationId)
  refresh()
  return { ok: true }
}

/** Sin `parentId` agrega un punto principal; con él, un sub-punto al final. */
export async function addChecklistItem(
  implementationId: string,
  label: string,
  parentId: string | null = null,
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const clean = label.trim().replace(/\s+/g, " ")
  if (!clean) return { ok: false, error: "Escribe el punto." }
  if (clean.length > 300) {
    return { ok: false, error: "El punto pasa de 300 caracteres." }
  }
  if (parentId) {
    const [parent] = await db
      .select({ implementationId: items.implementationId, parentId: items.parentId })
      .from(items)
      .where(eq(items.id, parentId))
    if (!parent || parent.implementationId !== implementationId) {
      return { ok: false, error: "Ese punto ya no existe." }
    }
    if (parent.parentId) {
      return { ok: false, error: "Los sub-puntos no llevan sub-puntos." }
    }
  }
  const [last] = await db
    .select({ position: max(items.position) })
    .from(items)
    .where(
      and(
        eq(items.implementationId, implementationId),
        parentId ? eq(items.parentId, parentId) : isNull(items.parentId),
      ),
    )
  await db.insert(items).values({
    id: `ck_${crypto.randomUUID()}`,
    implementationId,
    parentId,
    label: clean,
    done: false,
    position: (last?.position ?? -1) + 1,
  })
  await syncProgress(implementationId)
  refresh()
  return { ok: true }
}

/**
 * Nuevo orden de un grupo de hermanos: los puntos principales entre sí o los
 * sub-puntos de un mismo padre. `ids` debe traer el grupo completo; si el
 * checklist cambió mientras tanto, se rechaza en vez de dejar huecos.
 */
export async function reorderChecklistItems(
  implementationId: string,
  parentId: string | null,
  ids: string[],
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const siblings = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.implementationId, implementationId),
        parentId ? eq(items.parentId, parentId) : isNull(items.parentId),
      ),
    )
  const known = new Set(siblings.map((s) => s.id))
  if (
    ids.length !== known.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !known.has(id))
  ) {
    return { ok: false, error: "El checklist cambió. Vuelve a intentarlo." }
  }
  const [first, ...rest] = ids.map((id, position) =>
    db!.update(items).set({ position }).where(eq(items.id, id)),
  )
  if (first) await db.batch([first, ...rest])
  refresh()
  return { ok: true }
}

/** Borrar un punto principal borra también sus sub-puntos. */
export async function deleteChecklistItem(itemId: string): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .delete(items)
    .where(eq(items.id, itemId))
    .returning({ implementationId: items.implementationId })
  if (!row) return { ok: false, error: "Ese punto ya no existe." }
  await syncProgress(row.implementationId)
  refresh()
  return { ok: true }
}

/* ---------------------------------------------------------- notas rápidas */

export async function addNote(
  implementationId: string,
  body: string,
): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const clean = body.trim()
  if (!clean) return { ok: false, error: "Escribe la nota." }
  if (clean.length > 2000) {
    return { ok: false, error: "La nota pasa de 2000 caracteres." }
  }
  const [exists] = await db
    .select({ id: schema.implementations.id })
    .from(schema.implementations)
    .where(eq(schema.implementations.id, implementationId))
  if (!exists) return { ok: false, error: "Esa implementación ya no existe." }
  await db.insert(schema.implementationNotes).values({
    id: `nt_${crypto.randomUUID()}`,
    implementationId,
    body: clean,
  })
  refresh()
  return { ok: true }
}

export async function deleteNote(noteId: string): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .delete(schema.implementationNotes)
    .where(eq(schema.implementationNotes.id, noteId))
    .returning({ id: schema.implementationNotes.id })
  if (!row) return { ok: false, error: "Esa nota ya no existe." }
  refresh()
  return { ok: true }
}

/**
 * Borra la implementación con sus contactos, checklist y notas (en cascada).
 * Solo toca Neon: la subcuenta y los contactos de GHL siguen intactos.
 */
export async function deleteImplementation(id: string): Promise<Done> {
  if (!db) return { ok: false, error: NO_DB }
  const [row] = await db
    .delete(schema.implementations)
    .where(eq(schema.implementations.id, id))
    .returning({ id: schema.implementations.id })
  if (!row) return { ok: false, error: "Esa implementación ya no existe." }
  refresh()
  return { ok: true }
}
