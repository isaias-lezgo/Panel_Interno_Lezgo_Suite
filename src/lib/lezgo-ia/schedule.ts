/**
 * A quién le toca en una corrida programada del motor de Lezgo IA. Sin red:
 * `run-all.ts` lee y corre.
 *
 * Hay dos pasadas, con ritmos distintos:
 * - **rápida** (`quick`): solo las oportunidades creadas en el último día,
 *   para "lead nuevo sin primer contacto". Pocas llamadas a GHL; se puede
 *   correr cada pocos minutos.
 * - **completa** (`full`): todas las abiertas que el motor lee, para lo
 *   demás. Cerca de un minuto por subcuenta grande; una o dos veces al día.
 */
export type Pass = "quick" | "full"

/** Lo mínimo entre dos pasadas iguales sobre la misma subcuenta. */
export const MIN_GAP_MS: Record<Pass, number> = {
  quick: 4 * 60_000,
  full: 6 * 3_600_000,
}

export const parsePass = (value: string | null): Pass =>
  value === "rapida" || value === "quick" ? "quick" : "full"

/**
 * Las subcuentas que ya pueden correr, primero la que lleva más tiempo sin
 * revisarse (las que nunca han corrido van antes que todas). Las que
 * corrieron hace menos de `minGapMs` se dejan fuera: así una llamada que
 * continúa donde se quedó la anterior no repite a las que ya pasaron.
 */
export function dueLocations<T extends { id: string }>(
  active: T[],
  lastRuns: Map<string, string>,
  input: { now: number; minGapMs: number },
): T[] {
  const last = (item: T) => {
    const at = lastRuns.get(item.id)
    return at ? Date.parse(at) : Number.NEGATIVE_INFINITY
  }
  return active
    .filter((item) => input.now - last(item) >= input.minGapMs)
    .sort((a, b) => last(a) - last(b))
}
