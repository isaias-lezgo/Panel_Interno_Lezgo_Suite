import type Stripe from "stripe"
import { describe, expect, test } from "vitest"

import { deriveStatus, mapInvoice, toCurrency, toMxn } from "@/lib/stripe/map"

const AHORA = new Date("2026-09-07T00:00:00Z")

/** Molde mínimo con los campos que el mapeador toca. */
function factura(over: Record<string, unknown> = {}) {
  return {
    id: "in_test",
    number: "GLE-0001",
    status: "paid",
    total: 100_000,
    currency: "mxn",
    customer: "cus_test",
    customer_name: "Cliente Prueba",
    customer_email: "prueba@example.com",
    created: 1_788_718_925,
    due_date: null,
    attempt_count: 0,
    next_payment_attempt: null,
    hosted_invoice_url: "https://invoice.stripe.com/i/test",
    description: "¡Gracias por confiar en nosotros!",
    lines: { data: [{ description: "1 × Lezgo Pro MXN", amount: 539_700 }] },
    status_transitions: { finalized_at: 1_788_722_573, paid_at: 1_788_722_573 },
    ...over,
  } as unknown as Stripe.Invoice
}

describe("toCurrency", () => {
  test("acepta las dos monedas que factura la agencia", () => {
    expect(toCurrency("mxn")).toBe("mxn")
    expect(toCurrency("USD")).toBe("usd")
  })

  test("rechaza cualquier otra", () => {
    expect(toCurrency("eur")).toBeNull()
  })
})

describe("deriveStatus", () => {
  test("paid, draft, void y uncollectible pasan tal cual", () => {
    expect(deriveStatus(factura({ status: "paid" }), AHORA)).toBe("paid")
    expect(deriveStatus(factura({ status: "draft" }), AHORA)).toBe("draft")
    expect(deriveStatus(factura({ status: "void" }), AHORA)).toBe("void")
    expect(deriveStatus(factura({ status: "uncollectible" }), AHORA)).toBe(
      "uncollectible",
    )
  })

  test("GLE-0231: open recién emitida, sin due_date, es por vencer", () => {
    const i = factura({
      status: "open",
      due_date: null,
      attempt_count: 1,
      next_payment_attempt: 1_788_768_257,
    })
    expect(deriveStatus(i, AHORA)).toBe("due")
  })

  test("open con intentos agotados y sin próximo intento es vencida", () => {
    const i = factura({
      status: "open",
      due_date: null,
      attempt_count: 4,
      next_payment_attempt: null,
    })
    expect(deriveStatus(i, AHORA)).toBe("overdue")
  })

  test("open con due_date en el pasado es vencida", () => {
    const i = factura({
      status: "open",
      due_date: 1_780_000_000,
      attempt_count: 0,
      next_payment_attempt: null,
    })
    expect(deriveStatus(i, AHORA)).toBe("overdue")
  })
})

describe("toMxn", () => {
  test("MXN no se toca", () => {
    expect(toMxn(539_700, "mxn", 18.5)).toBe(539_700)
  })

  test("USD se convierte y se redondea a centavo", () => {
    expect(toMxn(24_012, "usd", 18.5)).toBe(444_222)
  })

  test("sin tipo de cambio, USD no se convierte: devuelve null", () => {
    expect(toMxn(24_012, "usd", null)).toBeNull()
  })

  test("sin tipo de cambio, MXN sigue sumando", () => {
    expect(toMxn(539_700, "mxn", null)).toBe(539_700)
  })
})

describe("mapInvoice", () => {
  test("GLE-0232: conserva los centavos, no los infla a pesos", () => {
    const i = mapInvoice(factura({ total: 887_052 }), 18.5, () => null)
    expect(i?.amount).toBe(887_052)
    expect(i?.currency).toBe("mxn")
    expect(i?.amountBase).toBe(887_052)
  })

  test("usa el concepto de la primera línea, no el agradecimiento", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.memo).toBe("1 × Lezgo Pro MXN")
  })

  test("GLE-0229: ignora la línea de IVA y toma el producto real", () => {
    // Stripe puede devolver la línea de impuesto primero. Tomar `data[0]`
    // dejaba facturas con el concepto "IVA" en vez del plan contratado.
    const i = mapInvoice(
      factura({
        lines: {
          data: [
            { description: "IVA", amount: 56_432 },
            { description: "1 × Lezgo Growth MXN", amount: 352_700 },
          ],
        },
      }),
      18.5,
      () => null,
    )
    expect(i?.memo).toBe("1 × Lezgo Growth MXN")
  })

  test("sin mapeo, clientId es null y queda el nombre de Stripe", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.clientId).toBeNull()
    expect(i?.customerName).toBe("Cliente Prueba")
  })

  test("con mapeo, resuelve el cliente del panel", () => {
    const i = mapInvoice(factura(), 18.5, (cus) =>
      cus === "cus_test" ? "cl_prueba" : null,
    )
    expect(i?.clientId).toBe("cl_prueba")
  })

  test("descarta monedas que el panel no sabe representar", () => {
    expect(mapInvoice(factura({ currency: "eur" }), 18.5, () => null)).toBeNull()
  })

  test("las fechas salen como YYYY-MM-DD", () => {
    const i = mapInvoice(factura(), 18.5, () => null)
    expect(i?.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(i?.dueAt).toBeNull()
  })
})
