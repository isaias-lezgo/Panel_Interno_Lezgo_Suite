import type { Invoice } from "@/lib/types"

/**
 * Las dos series del tablero, derivadas de lo que Stripe sí sabe: facturas
 * pagadas y fechas de alta y cancelación de cada suscripción. Nada se
 * extrapola — un mes sin datos vale cero, y lo que no se puede convertir a la
 * moneda base se cuenta aparte en `omitted` para poder declararlo.
 */

const LOCALE = "es-MX"

export type CollectedPoint = {
  /** "2026-09", para ordenar. */
  key: string
  /** Etiqueta del eje: "sep". */
  month: string
  /** Centavos de la moneda base. */
  collected: number
  omitted: number
}

export type MovementPoint = {
  key: string
  month: string
  /** Centavos de la moneda base. Ambos en positivo; la gráfica invierte churn. */
  new: number
  churn: number
  omitted: number
}

export type SubscriptionSpan = {
  createdAt: string
  canceledAt: string | null
  /** Importe mensualizado en centavos de la moneda base, o `null` si no convierte. */
  amountBase: number | null
}

function label(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: "short" })
}

/** Las `months` claves "YYYY-MM" que terminan en el mes de `now`. */
export function monthKeys(now: Date, months: number) {
  const out: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

const monthOf = (iso: string) => iso.slice(0, 7)

export function monthlyCollected(
  invoices: Invoice[],
  months: number,
  now = new Date(),
): CollectedPoint[] {
  const buckets = new Map(
    monthKeys(now, months).map((key) => [key, { collected: 0, omitted: 0 }]),
  )

  for (const invoice of invoices) {
    if (invoice.status !== "paid" || !invoice.paidAt) continue
    const bucket = buckets.get(monthOf(invoice.paidAt))
    if (!bucket) continue
    if (invoice.amountBase === null) bucket.omitted += 1
    else bucket.collected += invoice.amountBase
  }

  return [...buckets].map(([key, b]) => ({ key, month: label(key), ...b }))
}

export function monthlyMovement(
  spans: SubscriptionSpan[],
  months: number,
  now = new Date(),
): MovementPoint[] {
  const buckets = new Map(
    monthKeys(now, months).map((key) => [
      key,
      { new: 0, churn: 0, omitted: 0 },
    ]),
  )

  for (const span of spans) {
    const alta = buckets.get(monthOf(span.createdAt))
    const baja = span.canceledAt ? buckets.get(monthOf(span.canceledAt)) : undefined
    if (!alta && !baja) continue
    if (span.amountBase === null) {
      // Se cuenta una vez por suscripción, en el primer mes donde aparece.
      ;(alta ?? baja)!.omitted += 1
      continue
    }
    if (alta) alta.new += span.amountBase
    if (baja) baja.churn += span.amountBase
  }

  return [...buckets].map(([key, b]) => ({ key, month: label(key), ...b }))
}
