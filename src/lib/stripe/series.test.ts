import { describe, expect, it } from "vitest"

import {
  monthlyCollected,
  monthlyMovement,
  type SubscriptionSpan,
} from "./series"
import type { Invoice } from "@/lib/types"

const now = new Date("2026-09-22T12:00:00Z")

const invoice = (o: Partial<Invoice> & { id: string }): Invoice => ({
  number: o.id,
  clientId: null,
  customerName: "X",
  amount: 100_00,
  currency: "mxn",
  amountBase: 100_00,
  status: "paid",
  issuedAt: "2026-09-01",
  dueAt: null,
  memo: "",
  ...o,
})

const span = (o: Partial<SubscriptionSpan> = {}): SubscriptionSpan => ({
  createdAt: "2026-09-01",
  canceledAt: null,
  amountBase: 1_000_00,
  ...o,
})

describe("monthlyCollected", () => {
  it("devuelve una entrada por mes, del más viejo al más nuevo", () => {
    const out = monthlyCollected([], 3, now)
    expect(out.map((p) => p.key)).toEqual(["2026-07", "2026-08", "2026-09"])
    expect(out.map((p) => p.collected)).toEqual([0, 0, 0])
  })

  it("suma solo las facturas pagadas, por el mes en que se pagaron", () => {
    const out = monthlyCollected(
      [
        invoice({ id: "a", paidAt: "2026-08-10", amountBase: 500_00 }),
        invoice({ id: "b", paidAt: "2026-08-20", amountBase: 300_00 }),
        invoice({ id: "c", paidAt: "2026-09-02", amountBase: 700_00 }),
        invoice({ id: "d", status: "due", paidAt: undefined, amountBase: 900_00 }),
      ],
      3,
      now,
    )
    expect(out.map((p) => p.collected)).toEqual([0, 800_00, 700_00])
  })

  it("omite lo que no se puede convertir a la moneda base en vez de inventarlo", () => {
    const out = monthlyCollected(
      [
        invoice({ id: "a", paidAt: "2026-09-05", amountBase: null, currency: "usd" }),
        invoice({ id: "b", paidAt: "2026-09-06", amountBase: 200_00 }),
      ],
      1,
      now,
    )
    expect(out[0].collected).toBe(200_00)
    expect(out[0].omitted).toBe(1)
  })

  it("ignora meses fuera de la ventana", () => {
    const out = monthlyCollected(
      [invoice({ id: "viejo", paidAt: "2025-01-05", amountBase: 999_00 })],
      2,
      now,
    )
    expect(out.reduce((s, p) => s + p.collected, 0)).toBe(0)
  })
})

describe("monthlyMovement", () => {
  it("cuenta el alta en el mes de creación y la baja en el de cancelación", () => {
    const out = monthlyMovement(
      [
        span({ createdAt: "2026-08-03", amountBase: 300_00 }),
        span({ createdAt: "2026-07-15", canceledAt: "2026-09-04", amountBase: 500_00 }),
      ],
      3,
      now,
    )
    expect(out.map((p) => [p.key, p.new, p.churn])).toEqual([
      ["2026-07", 500_00, 0],
      ["2026-08", 300_00, 0],
      ["2026-09", 0, 500_00],
    ])
  })

  it("la cancelación se guarda en positivo: la gráfica decide el signo", () => {
    const out = monthlyMovement(
      [span({ createdAt: "2026-01-01", canceledAt: "2026-09-10", amountBase: 250_00 })],
      1,
      now,
    )
    expect(out[0].churn).toBe(250_00)
  })

  it("omite las suscripciones sin importe convertible", () => {
    const out = monthlyMovement(
      [
        span({ createdAt: "2026-09-01", amountBase: null }),
        span({ createdAt: "2026-09-02", amountBase: 100_00 }),
      ],
      1,
      now,
    )
    expect(out[0].new).toBe(100_00)
    expect(out[0].omitted).toBe(1)
  })
})
