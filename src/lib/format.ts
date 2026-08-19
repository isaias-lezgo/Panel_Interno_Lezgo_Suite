const LOCALE = "es-MX"

const usd = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
})

const usdCents = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
})

export const money = (n: number) => usd.format(n)
export const moneyExact = (n: number) => usdCents.format(n)

export const compactMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `$${n}`

export const percent = (n: number, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits).replace(".", ",")}%`

/**
 * `new Date("2026-08-01")` se interpreta como medianoche UTC, así que en
 * América se dibuja como el día anterior. Las fechas sin hora se construyen
 * en la zona local para que la tabla muestre el día que realmente es.
 */
export function toDate(iso: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!dateOnly) return new Date(iso)
  const [, year, month, day] = dateOnly
  return new Date(Number(year), Number(month) - 1, Number(day))
}

export function shortDate(iso: string) {
  return toDate(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  })
}

export function fullDate(iso: string) {
  return toDate(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** "hace 3 d" / "en 12 d". Se lee más rápido que una fecha en una tabla densa. */
export function relativeDays(iso: string, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = toDate(iso)
  const days = Math.round(
    (new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
    ).getTime() -
      start.getTime()) /
      86_400_000,
  )
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
