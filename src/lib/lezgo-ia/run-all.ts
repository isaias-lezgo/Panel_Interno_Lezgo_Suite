import "server-only"

import { getLezgoIaData } from "@/lib/repository"

import { runLezgoIa, type RunResult } from "./run"

/**
 * Una corrida del motor sobre cada subcuenta con la IA activa, una tras
 * otra: en paralelo se pelearían el mismo WhatsApp de salida. La dispara el
 * cron (`/api/lezgo-ia/cron`).
 *
 * Leer una subcuenta grande tarda cerca de un minuto por el ritmo que pide
 * GHL, y la función tiene un tiempo máximo: cuando el presupuesto se acaba,
 * las que faltan se reportan en `pending` y les toca en la siguiente corrida.
 * Lo que una corrida no alcanzó a mandar no se pierde: no queda anotado
 * como enviado.
 */
export async function runAllActive(options: { budgetMs: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const started = now()
  const data = await getLezgoIaData()
  if (data.source !== "ghl") {
    return { ok: false as const, error: "Sin GHL o sin base de datos: no hay subcuentas que correr." }
  }

  const active = data.subaccounts.filter((s) => s.status === "active")
  const runs: { location: string; result: RunResult }[] = []
  const pending: string[] = []
  for (const account of active) {
    if (now() - started > options.budgetMs) {
      pending.push(account.name)
      continue
    }
    try {
      runs.push({ location: account.name, result: await runLezgoIa(account.ghlLocationId) })
    } catch (error) {
      console.error(`El motor de Lezgo IA falló en ${account.name}`, error)
      runs.push({ location: account.name, result: { ok: false, error: "El motor falló a la mitad." } })
    }
  }
  return { ok: true as const, active: active.length, runs, pending }
}
