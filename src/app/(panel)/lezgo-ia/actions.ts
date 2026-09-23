"use server"

import { refresh } from "next/cache"
import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { saveAccountInput, type SaveAccountInput } from "@/lib/lezgo-ia/config"
import { listLocationLinks } from "@/lib/repository"

type Done = { ok: true } | { ok: false; error: string }

/**
 * Guarda la configuración de una subcuenta de un jalón: la subcuenta y sus
 * asesores en una sola transacción. Solo escribe a Neon, nunca a GHL.
 *
 * De los asesores se guarda solo a quien se sale de lo por defecto (avisos
 * prendidos, ajustes propios o fuera de oficina); los demás heredan y no
 * ocupan fila.
 */
export async function saveLezgoIaAccount(raw: SaveAccountInput): Promise<Done> {
  if (!db) {
    return { ok: false, error: "Sin base de datos: la configuración no se guarda en modo demo." }
  }
  const parsed = saveAccountInput.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" }
  }
  const input = parsed.data

  // Solo subcuentas enlazadas a un cliente: el navegador no elige a cuál escribir.
  const links = await listLocationLinks()
  if (!links.some((l) => l.ghlLocationId === input.locationId)) {
    return { ok: false, error: "Esa subcuenta no está enlazada a ningún cliente." }
  }

  const ids = new Set(input.advisors.map((a) => a.userId))
  const badCoverage = input.advisors.find(
    (a) => a.away && a.away.coverage !== "manager" && !ids.has(a.away.coverage),
  )
  if (badCoverage) {
    return { ok: false, error: "Quien cubre la ausencia no es asesor de esta subcuenta." }
  }

  const now = new Date().toISOString()
  const custom = input.advisors.filter(
    (a) => a.alerts || Object.keys(a.settings).length > 0 || a.away,
  )

  const account = {
    status: input.status,
    settings: input.settings,
    voice: input.voice,
    stageRules: input.stageRules,
    updatedAt: now,
  }

  try {
    await db.batch([
      db
        .insert(schema.lezgoIaAccounts)
        .values({ ghlLocationId: input.locationId, ...account })
        .onConflictDoUpdate({ target: schema.lezgoIaAccounts.ghlLocationId, set: account }),
      db
        .delete(schema.lezgoIaAdvisors)
        .where(eq(schema.lezgoIaAdvisors.ghlLocationId, input.locationId)),
      ...(custom.length > 0
        ? [
            db.insert(schema.lezgoIaAdvisors).values(
              custom.map((a) => ({
                ghlLocationId: input.locationId,
                ghlUserId: a.userId,
                alerts: a.alerts,
                settings: a.settings,
                awayFrom: a.away?.from ?? null,
                awayTo: a.away?.to ?? null,
                awayCoverage: a.away?.coverage ?? null,
                updatedAt: now,
              })),
            ),
          ]
        : []),
    ])
  } catch (error) {
    console.error("No se guardó la configuración de Lezgo IA", error)
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." }
  }

  refresh()
  return { ok: true }
}
