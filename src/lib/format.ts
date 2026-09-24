import { daysBetween, formatInMexico, mexicoDay } from "@/lib/time"
import type { Currency } from "@/lib/types"

const LOCALE = "es-MX"

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: Currency, decimals: boolean) {
  const key = `${currency}:${decimals}`
  const cached = formatters.get(key)
  if (cached) return cached
  const made = new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: decimals ? 2 : 0,
  })
  formatters.set(key, made)
  return made
}

/**
 * `cents` va en la unidad mínima de `currency`. La moneda es obligatoria a
 * propósito: cuando el panel dejó de ser solo USD, un valor por defecto
 * habría convertido cada call site viejo en una cifra silenciosamente falsa.
 */
export const money = (cents: number, currency: Currency) =>
  formatter(currency, false).format(cents / 100)

export const moneyExact = (cents: number, currency: Currency) =>
  formatter(currency, true).format(cents / 100)

const tagged = new Map<string, Intl.NumberFormat>()

/**
 * Como `money`, pero rotula la moneda cuando no es la que suma el panel. En
 * `es-MX` el símbolo estrecho de MXN y el de USD son ambos "$": una factura de
 * $240 USD y otra de $240 MXN se veían idénticas en la misma columna. La
 * mayoría queda limpia; solo la excepción se anuncia.
 */
export const moneySigned = (
  cents: number,
  currency: Currency,
  base: Currency,
) => {
  if (currency === base) return money(cents, currency)
  const key = currency
  let f = tagged.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "symbol",
      maximumFractionDigits: 0,
    })
    tagged.set(key, f)
  }
  return f.format(cents / 100)
}

/** Para ejes de gráfica. Siempre MXN. */
export const compactMoney = (cents: number) => {
  const n = cents / 100
  return n >= 1000
    ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
    : `$${Math.round(n)}`
}

export const percent = (n: number, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits).replace(".", ",")}%`

/*
 * Todas las fechas se dibujan en GMT-6 (ver `@/lib/time`): un día sin hora
 * se queda en ese día, y un instante se convierte a la hora de México. Así el
 * HTML del servidor (UTC) y el navegador dicen lo mismo.
 */

export function shortDate(iso: string) {
  return formatInMexico(iso, LOCALE, { day: "numeric", month: "short" })
}

export function stampDate(iso: string) {
  return formatInMexico(iso, LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Día y hora de un instante, en hora de México. */
export function stampDateTime(iso: string) {
  return formatInMexico(iso, LOCALE, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function fullDate(iso: string) {
  return stampDate(iso)
}

/** "hace 3 d" / "en 12 d". Se lee más rápido que una fecha en una tabla densa. */
export function relativeDays(iso: string, now = new Date()) {
  const days = daysBetween(mexicoDay(now), mexicoDay(iso))
  if (days === 0) return "hoy"
  if (days === 1) return "mañana"
  if (days === -1) return "ayer"
  return days > 0 ? `en ${days} d` : `hace ${Math.abs(days)} d`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}
