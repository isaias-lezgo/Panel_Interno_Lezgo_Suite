import type Stripe from "stripe"

import type { Currency, Invoice, InvoiceStatus } from "@/lib/types"

/** Stripe entrega segundos; el panel guarda fechas sin hora. */
function isoDate(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

export function toCurrency(code: string): Currency | null {
  const c = code.toLowerCase()
  return c === "mxn" || c === "usd" ? c : null
}

/**
 * Las facturas de cobro automático llegan con `due_date: null`, así que
 * "vencida" no se puede leer de una fecha: se deduce de que Stripe ya agotó
 * los intentos de cobro y no programó otro.
 */
export function deriveStatus(
  invoice: Stripe.Invoice,
  now: Date,
): InvoiceStatus {
  switch (invoice.status) {
    case "paid":
      return "paid"
    case "draft":
      return "draft"
    case "void":
      return "void"
    case "uncollectible":
      return "uncollectible"
    case "open": {
      const agotada =
        invoice.attempt_count > 0 && invoice.next_payment_attempt === null
      const pasada =
        invoice.due_date !== null && invoice.due_date * 1000 < now.getTime()
      return agotada || pasada ? "overdue" : "due"
    }
    default:
      return "draft"
  }
}

export function toMxn(
  amount: number,
  currency: Currency,
  usdToMxn: number | null,
): number | null {
  if (currency === "mxn") return amount
  if (usdToMxn === null) return null
  return Math.round(amount * usdToMxn)
}

/**
 * Devuelve `null` cuando la factura usa una moneda que el panel no sabe
 * representar. Es preferible omitirla a mostrarla con el símbolo equivocado.
 */
export function mapInvoice(
  invoice: Stripe.Invoice,
  usdToMxn: number | null,
  clientIdFor: (customerId: string | null) => string | null,
  now = new Date(),
): Invoice | null {
  const currency = toCurrency(invoice.currency)
  if (!currency) return null

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null)

  const paidAt = invoice.status_transitions.paid_at

  return {
    id: invoice.id,
    number: invoice.number ?? invoice.id,
    clientId: clientIdFor(customerId),
    customerName:
      invoice.customer_name ?? invoice.customer_email ?? "Sin nombre",
    amount: invoice.total,
    currency,
    amountBase: toMxn(invoice.total, currency, usdToMxn),
    status: deriveStatus(invoice, now),
    issuedAt: isoDate(invoice.status_transitions.finalized_at ?? invoice.created),
    dueAt: invoice.due_date ? isoDate(invoice.due_date) : null,
    ...(paidAt ? { paidAt: isoDate(paidAt) } : {}),
    memo:
      invoice.lines.data[0]?.description ??
      invoice.description ??
      "Sin concepto",
    ...(invoice.hosted_invoice_url
      ? { hostedUrl: invoice.hosted_invoice_url }
      : {}),
  }
}
