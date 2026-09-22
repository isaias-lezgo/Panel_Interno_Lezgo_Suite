import type { Currency, Invoice } from "@/lib/types"

/**
 * Un total que no esconde de dónde viene cada peso: lo que se cobró en la
 * moneda base es un hecho, lo que venía en otra moneda es una conversión a
 * la tasa que alguien configuró. Mezclarlos en una sola cifra sin decirlo
 * convierte un supuesto en un dato.
 */
export type ForeignTotal = {
  currency: Currency
  /** Centavos en su propia moneda. */
  amount: number
  count: number
  /** Centavos en la moneda base, o `null` si falta el tipo de cambio. */
  converted: number | null
}

export type CurrencySplit = {
  /** Centavos cobrados en la moneda base, sin conversión de por medio. */
  exact: number
  foreign: ForeignTotal[]
  /** `exact` más lo convertible. Lo que no convierte no se suma. */
  total: number
}

export function splitByCurrency(
  invoices: Invoice[],
  base: Currency,
): CurrencySplit {
  let exact = 0
  const porMoneda = new Map<Currency, ForeignTotal>()

  for (const invoice of invoices) {
    if (invoice.currency === base) {
      exact += invoice.amount
      continue
    }
    const actual = porMoneda.get(invoice.currency) ?? {
      currency: invoice.currency,
      amount: 0,
      count: 0,
      converted: null as number | null,
    }
    actual.amount += invoice.amount
    actual.count += 1
    if (invoice.amountBase !== null) {
      actual.converted = (actual.converted ?? 0) + invoice.amountBase
    }
    porMoneda.set(invoice.currency, actual)
  }

  const foreign = [...porMoneda.values()].sort(
    (a, b) => (b.converted ?? 0) - (a.converted ?? 0),
  )
  const total =
    exact + foreign.reduce((sum, f) => sum + (f.converted ?? 0), 0)

  return { exact, foreign, total }
}
