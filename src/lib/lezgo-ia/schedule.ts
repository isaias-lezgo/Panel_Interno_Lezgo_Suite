/**
 * A quién le toca en una corrida programada del motor de Lezgo IA. Sin red:
 * `run-all.ts` lee y corre.
 *
 * Hay dos pasadas, con ritmos distintos:
 * - **rápida** (`quick`): solo las oportunidades creadas en el último día,
 *   para "lead nuevo sin primer contacto". Pocas llamadas a GHL; se puede
 *   correr cada pocos minutos.
 * - **completa** (`full`): todas las abiertas que el motor lee, para lo
 *   demás. Cerca de un minuto por subcuenta grande. Cada cuánto le toca a
 *   una subcuenta lo dice su ajuste "Análisis de la cartera".
 */
export type Pass = "quick" | "full"

/** Lo mínimo entre dos pasadas rápidas sobre la misma subcuenta. */
export const QUICK_GAP_MS = 4 * 60_000

/**
 * Margen que se le quita al hueco de la pasada completa. La marca de una
 * corrida se anota al terminar: sin margen, un cron que llama cada hora en
 * punto encontraría la de hace 59 minutos y la subcuenta correría cada dos.
 */
const SLACK_MS = 10 * 60_000

const FULL_EVERY_MS: Record<string, number> = {
  "1h": 3_600_000,
  "4h": 4 * 3_600_000,
  daily: 24 * 3_600_000,
}

/**
 * Lo mínimo entre dos pasadas completas, según "Análisis de la cartera" de
 * la subcuenta: cada hora, cada 4 h o una vez al día. `null` = apagado: la
 * completa no corre sola (a mano, desde el panel, sí).
 */
export function fullGapMs(
  setting: { enabled: boolean; option?: string } | undefined,
): number | null {
  if (!setting?.enabled) return null
  return (FULL_EVERY_MS[setting.option ?? ""] ?? FULL_EVERY_MS.daily) - SLACK_MS
}

export const parsePass = (value: string | null): Pass =>
  value === "rapida" || value === "quick" ? "quick" : "full"

/**
 * Las subcuentas que ya pueden correr, primero la que lleva más tiempo sin
 * revisarse (las que nunca han corrido van antes que todas). Las que
 * corrieron hace menos de `minGapMs` se dejan fuera: así una llamada que
 * continúa donde se quedó la anterior no repite a las que ya pasaron.
 * `minGapMs` puede depender de la subcuenta; `null` la deja fuera siempre.
 */
export function dueLocations<T extends { id: string }>(
  active: T[],
  lastRuns: Map<string, string>,
  input: { now: number; minGapMs: number | ((item: T) => number | null) },
): T[] {
  const gapOf = (item: T) =>
    typeof input.minGapMs === "function" ? input.minGapMs(item) : input.minGapMs
  const last = (item: T) => {
    const at = lastRuns.get(item.id)
    return at ? Date.parse(at) : Number.NEGATIVE_INFINITY
  }
  return active
    .filter((item) => {
      const gap = gapOf(item)
      return gap !== null && input.now - last(item) >= gap
    })
    .sort((a, b) => last(a) - last(b))
}
