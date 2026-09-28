import { describe, expect, it } from "vitest"

import {
  monthlyCollectedEntries,
  monthlyMovement,
  type SubscriptionSpan,
} from "./series"

const now = new Date("2026-09-22T12:00:00Z")

const span = (o: Partial<SubscriptionSpan> = {}): SubscriptionSpan => ({
  createdAt: "2026-09-01",
  canceledAt: null,
  amountBase: 1_000_00,
  ...o,
})

describe("monthlyCollectedEntries", () => {
  it("devuelve una entrada por mes, del más viejo al más nuevo", () => {
    const out = monthlyCollectedEntries([], 3, now)
    expect(out.map((p) => p.key)).toEqual(["2026-07", "2026-08", "2026-09"])
    expect(out.map((p) => p.collected)).toEqual([0, 0, 0])
  })

  it("suma cada cobro en el mes de su día", () => {
    const out = monthlyCollectedEntries(
      [
        { day: "2026-08-10", amountBase: 500_00 },
        { day: "2026-08-20", amountBase: 300_00 },
        { day: "2026-09-02", amountBase: 700_00 },
        { day: "2026-04-02", amountBase: 900_00 },
      ],
      3,
      now,
    )
    expect(out.map((p) => p.collected)).toEqual([0, 800_00, 700_00])
  })

  it("omite lo que no se puede convertir a la moneda base en vez de inventarlo", () => {
    const out = monthlyCollectedEntries(
      [
        { day: "2026-09-05", amountBase: null },
        { day: "2026-09-06", amountBase: 200_00 },
      ],
      1,
      now,
    )
    expect(out[0].collected).toBe(200_00)
    expect(out[0].omitted).toBe(1)
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
