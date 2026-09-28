import type Stripe from "stripe"
import { describe, expect, it } from "vitest"

import { mexicoMonthRange } from "@/lib/time"

import {
  buildCobranza,
  collectedEntries,
  subAccountName,
  summarizeCobranza,
  type CobranzaInput,
} from "./cobranza"

const range = mexicoMonthRange("2026-09")
const now = new Date("2026-09-26T18:00:00Z")
const at = (iso: string) => Date.parse(iso) / 1000

const charge = (o: Partial<Stripe.Charge> & { id: string }) =>
  ({
    amount: 100_00,
    currency: "mxn",
    status: "succeeded",
    refunded: false,
    created: at("2026-09-10T18:00:00Z"),
    customer: "cus_a",
    payment_intent: null,
    description: null,
    billing_details: { name: null, email: null },
    payment_method_details: { type: "card" },
    metadata: {},
    ...o,
  }) as unknown as Stripe.Charge

const invoice = (o: Partial<Stripe.Invoice> & { id: string }) =>
  ({
    currency: "mxn",
    status: "paid",
    customer: "cus_a",
    customer_name: "Cliente A",
    customer_email: null,
    number: "GLE-1",
    amount_paid: 500_00,
    amount_due: 500_00,
    amount_remaining: 0,
    total: 500_00,
    attempt_count: 1,
    next_payment_attempt: null,
    due_date: null,
    created: at("2026-09-05T18:00:00Z"),
    status_transitions: { paid_at: at("2026-09-05T18:00:00Z") },
    lines: { data: [] },
    description: null,
    ...o,
  }) as unknown as Stripe.Invoice

const input = (o: Partial<CobranzaInput> = {}): CobranzaInput => ({
  range,
  now,
  subscriptions: [],
  pastDue: [],
  openInvoices: [],
  draftInvoices: [],
  paidInvoices: [],
  schedules: [],
  prices: new Map(),
  refunds: [],
  disputes: [],
  charges: [],
  invoiceIntents: new Set(),
  customers: new Map(),
  products: new Map(),
  ...o,
})

describe("buildCobranza", () => {
  it("no cuenta dos veces el cargo con el que se pagó una factura", () => {
    const items = buildCobranza(
      input({
        paidInvoices: [invoice({ id: "in_1" })],
        charges: [charge({ id: "ch_1", amount: 500_00, payment_intent: "pi_1" })],
        invoiceIntents: new Set(["pi_1"]),
      }),
    )
    expect(items.map((i) => i.section)).toEqual(["paid"])
    expect(summarizeCobranza(items).collected.total).toEqual({ mxn: 500_00 })
  })

  it("separa recargas de wallet y cobros sin factura", () => {
    const items = buildCobranza(
      input({
        charges: [
          charge({
            id: "ch_r",
            description: "Wallet auto recharge for Sub-Account - Inmobiliaria Sol of Lezgo",
          }),
          charge({ id: "py_1", payment_method_details: { type: "customer_balance" } as never }),
        ],
      }),
    )
    const r = items.find((i) => i.id === "ch_r")!
    expect(r.section).toBe("recharges")
    expect(r.customerName).toBe("Inmobiliaria Sol")
    const t = items.find((i) => i.id === "py_1")!
    expect(t.section).toBe("loose")
    expect(t.label).toBe("Transferencia")
  })

  it("ignora cargos fallidos o reembolsados completos", () => {
    const items = buildCobranza(
      input({
        charges: [
          charge({ id: "ch_f", status: "failed" }),
          charge({ id: "ch_x", refunded: true }),
        ],
      }),
    )
    expect(items).toEqual([])
  })

  it("toma las facturas pagadas por el día de pago en GMT-6", () => {
    const items = buildCobranza(
      input({
        paidInvoices: [
          // 31 ago 20:00 en México: todavía es agosto.
          invoice({ id: "in_ago", status_transitions: { paid_at: at("2026-09-01T02:00:00Z") } as never }),
          invoice({ id: "in_sep", status_transitions: { paid_at: at("2026-09-01T07:00:00Z") } as never }),
        ],
      }),
    )
    expect(items.map((i) => i.id)).toEqual(["in_sep"])
    expect(items[0].day).toBe("2026-09-01")
  })

  it("muestra las facturas abiertas aunque sean de otro mes y marca las vencidas", () => {
    const items = buildCobranza(
      input({
        openInvoices: [
          invoice({ id: "in_v", status: "open", amount_remaining: 300_00, due_date: at("2026-06-01T18:00:00Z") }),
          invoice({ id: "in_p", status: "open", amount_remaining: 200_00, due_date: at("2026-11-01T18:00:00Z"), attempt_count: 0 }),
        ],
      }),
    )
    const v = items.find((i) => i.id === "in_v")!
    expect(v.overdue).toBe(true)
    expect(v.label).toBe("Vencida")
    expect(items.find((i) => i.id === "in_p")!.overdue).toBe(false)
    const s = summarizeCobranza(items)
    expect(s.unpaid.total).toEqual({ mxn: 500_00 })
    expect(s.attention.count).toBe(1)
  })

  it("no cuenta como por cobrar la renovación de una suscripción que se cancela en el corte", () => {
    const end = at("2026-09-28T18:00:00Z")
    const sub = (id: string, cancel_at: number | null) =>
      ({
        id,
        currency: "mxn",
        customer: "cus_a",
        cancel_at,
        cancel_at_period_end: cancel_at !== null,
        pause_collection: null,
        items: {
          data: [
            {
              id: `si_${id}`,
              quantity: 1,
              current_period_end: end,
              current_period_start: end - 30 * 86400,
              price: { unit_amount: 352700, recurring: { interval: "month" }, product: "prod_g", nickname: null },
            },
          ],
        },
      }) as unknown as Stripe.Subscription
    const items = buildCobranza(
      input({
        subscriptions: [sub("sub_ok", null), sub("sub_fin", end)],
        products: new Map([["prod_g", "Lezgo Growth"]]),
      }),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ section: "renewals", concept: "Lezgo Growth", amount: 352700 })
  })

  it("suma MXN y USD por separado, sin convertir", () => {
    const items = buildCobranza(
      input({
        paidInvoices: [invoice({ id: "in_m" }), invoice({ id: "in_u", currency: "usd", amount_paid: 50_00 })],
      }),
    )
    expect(summarizeCobranza(items).collected.total).toEqual({ mxn: 500_00, usd: 50_00 })
  })
})

describe("collectedEntries", () => {
  it("aplica la misma regla que la vista: facturas pagadas más cargos sin factura", () => {
    const out = collectedEntries(
      [invoice({ id: "in_1" }), invoice({ id: "in_2", status: "open" })],
      [
        charge({ id: "ch_1", payment_intent: "pi_1" }),
        charge({ id: "ch_2", amount: 70_00 }),
      ],
      new Set(["pi_1"]),
    )
    expect(out.map((e) => e.amount)).toEqual([500_00, 70_00])
  })
})

describe("subAccountName", () => {
  it("lee la subcuenta del concepto de GHL", () => {
    expect(subAccountName("Recharge for Sub-Account - Casa Azul of Lezgo Suite")).toBe("Casa Azul")
    expect(subAccountName("Licencia")).toBeNull()
  })
})
