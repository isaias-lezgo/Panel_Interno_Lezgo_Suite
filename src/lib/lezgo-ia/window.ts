import { baseSettings, type SettingValues } from "@/data/lezgo-ia"

/**
 * Qué tan atrás mira Lezgo IA. Hay subcuentas con más de 3,000
 * oportunidades abiertas y el motor lee 500 por corrida: en vez de leer las
 * primeras que salgan, vigila las creadas en un periodo ("Antigüedad que
 * vigila"), de la más nueva a la más vieja. El asistente lista ese mismo
 * periodo y solo lee las anteriores cuando la persona se lo pide.
 *
 * Sin red: quién le pregunta a GHL está en `run.ts` y `assistant-tools.ts`.
 */

const DAY_MS = 24 * 3_600_000

/** Días que cubre el periodo vigilado. `null` = todas, sin importar su edad. */
export function watchDays(settings: SettingValues): number | null {
  const option = settings.watchWindow?.option ?? baseSettings.watchWindow?.option
  if (option === "all") return null
  const days = Number(option)
  return Number.isInteger(days) && days > 0 ? days : 90
}

/** El instante desde el que se vigila. `null` = sin límite. */
export function windowStart(now: Date, days: number | null): Date | null {
  return days === null ? null : new Date(now.getTime() - days * DAY_MS)
}

/**
 * "11-08-2026": el formato que pide `date` en `GET /opportunities/search`.
 * El filtro de GHL es por día, sin hora ni zona: quien necesite el corte
 * exacto pide desde un día antes y recorta por `createdAt`.
 */
export function ghlDate(at: Date) {
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(at.getUTCDate()).padStart(2, "0")
  return `${mm}-${dd}-${at.getUTCFullYear()}`
}

/** "los últimos 90 días", para decirlo en un mensaje. */
export function windowLabel(days: number) {
  return days === 1 ? "el último día" : `los últimos ${days} días`
}
