import "server-only"

import { getLezgoIaData, getLezgoIaLastRuns } from "@/lib/repository"

import { runLezgoIa, type RunResult } from "./run"
import { dueLocations, MIN_GAP_MS, type Pass } from "./schedule"

/**
 * Una corrida programada del motor sobre las subcuentas con la IA activa,
 * una tras otra: en paralelo se pelearían el mismo WhatsApp de salida y el
 * límite de GHL. La dispara `/api/lezgo-ia/cron`.
 *
 * No caben todas en una llamada —una subcuenta grande tarda cerca de un
 * minuto en la pasada completa—, así que se reparte: corre primero la que
 * lleva más tiempo sin revisarse y, cuando el presupuesto se acaba, las que
 * faltan quedan en `pending`. La siguiente llamada sigue con esas, porque
 * las que ya pasaron quedan fuera hasta que venza su hueco (`MIN_GAP_MS`).
 * Lo que una corrida no alcanzó a mandar no se pierde: no queda anotado
 * como enviado.
 */
export async function runAllActive(options: {
  budgetMs: number
  pass: Pass
  now?: () => number
}) {
  const now = options.now ?? Date.now
  const started = now()
  const data = await getLezgoIaData()
  if (data.source !== "ghl") {
    return { ok: false as const, error: "Sin GHL o sin base de datos: no hay subcuentas que correr." }
  }

  const active = data.subaccounts.filter((s) => s.status === "active")
  const due = dueLocations(active, await getLezgoIaLastRuns(options.pass), {
    now: started,
    minGapMs: MIN_GAP_MS[options.pass],
  })

  const runs: { location: string; result: RunResult }[] = []
  const pending: string[] = []
  for (const account of due) {
    if (now() - started > options.budgetMs) {
      pending.push(account.name)
      continue
    }
    try {
      runs.push({
        location: account.name,
        result: await runLezgoIa(account.ghlLocationId, { pass: options.pass }),
      })
    } catch (error) {
      console.error(`El motor de Lezgo IA falló en ${account.name}`, error)
      runs.push({ location: account.name, result: { ok: false, error: "El motor falló a la mitad." } })
    }
  }
  return {
    ok: true as const,
    pass: options.pass,
    active: active.length,
    /** Activas que no tocaban todavía: corrieron hace poco. */
    recent: active.length - due.length,
    runs,
    pending,
  }
}
