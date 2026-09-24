import { daysBetween, mexicoDay } from "@/lib/time"

/**
 * Semáforo de la fecha máxima de una implementación. Los días se cuentan
 * contra el día de hoy en México, no en la zona del servidor: si no, el
 * HTML y el navegador podrían contar distinto cerca de medianoche.
 */
export type DueTone = "risk" | "warn" | "live" | "build"

export function daysUntil(dueAt: string, now = new Date()) {
  return daysBetween(mexicoDay(now), mexicoDay(dueAt))
}

/** Dos días o menos (o vencida) en rojo, hasta siete en amarillo, más en verde. Sin fecha, azul. */
export function dueStatus(
  dueAt: string | null,
  now = new Date(),
): { tone: DueTone; label: string } {
  if (!dueAt) return { tone: "build", label: "Sin fecha máxima" }
  const days = daysUntil(dueAt, now)
  const tone = days <= 2 ? "risk" : days <= 7 ? "warn" : "live"
  if (days < -1) return { tone, label: `Vencida hace ${-days} días` }
  if (days === -1) return { tone, label: "Venció ayer" }
  if (days === 0) return { tone, label: "Vence hoy" }
  if (days === 1) return { tone, label: "Vence mañana" }
  return { tone, label: `Vence en ${days} días` }
}
