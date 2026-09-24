/**
 * La zona horaria de todo el panel: GMT-6, hora del centro de México. Desde
 * 2022 México ya no cambia de horario, así que `America/Mexico_City` es
 * GMT-6 todo el año.
 *
 * El servidor (Vercel) corre en UTC y el navegador en la zona de quien abre
 * el panel. Cualquier día, mes u hora que se muestre o se guarde sale de aquí,
 * nunca de `toISOString().slice(0, 10)` ni de `getDate()`: pasadas las 6 de
 * la tarde esos ya dan el día de mañana.
 */
export const TIME_ZONE = "America/Mexico_City"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

type Instant = Date | number | string

/** Un instante como `Date`. Un número son milisegundos, como `Date.now()`. */
function toInstant(at: Instant) {
  return at instanceof Date ? at : new Date(at)
}

/**
 * El día (`YYYY-MM-DD`) de un instante en GMT-6. Una fecha que ya viene sin
 * hora se devuelve tal cual: no es un instante y no tiene zona que convertir.
 */
export function mexicoDay(at: Instant = new Date()) {
  if (typeof at === "string" && DATE_ONLY.test(at)) return at
  return dayFormat.format(toInstant(at))
}

/** El mes (`YYYY-MM`) de un instante en GMT-6. */
export const mexicoMonth = (at: Instant = new Date()) =>
  mexicoDay(at).slice(0, 7)

/** Segundos de Stripe a día en GMT-6. */
export const dayFromEpoch = (seconds: number) => mexicoDay(seconds * 1000)

/** Días de `from` a `to`, ambos `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

/**
 * Formatea un valor de fecha con la zona del panel. Un día sin hora se
 * dibuja como ese día, sin correrse; un instante se convierte a GMT-6.
 */
export function formatInMexico(
  value: Instant,
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    // Medianoche UTC leída en UTC: el mismo día, en cualquier zona.
    return new Date(`${value}T00:00:00Z`).toLocaleString(locale, {
      ...options,
      timeZone: "UTC",
    })
  }
  return toInstant(value).toLocaleString(locale, {
    ...options,
    timeZone: TIME_ZONE,
  })
}
