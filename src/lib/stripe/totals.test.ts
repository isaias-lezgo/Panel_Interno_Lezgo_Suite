import { describe, expect, it } from "vitest"

import { splitByCurrency } from "./totals"
import type { Invoice } from "@/lib/types"

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

describe("splitByCurrency", () => {
  it("separa lo medido en la moneda base de lo convertido", () => {
    const out = splitByCurrency(
      [
        invoice({ id: "a", currency: "mxn", amount: 500_00, amountBase: 500_00 }),
        invoice({ id: "b", currency: "usd", amount: 100_00, amountBase: 1_750_00 }),
        invoice({ id: "c", currency: "usd", amount: 50_00, amountBase: 875_00 }),
      ],
      "mxn",
    )
    expect(out.exact).toBe(500_00)
    expect(out.foreign).toEqual([
      { currency: "usd", amount: 150_00, count: 2, converted: 2_625_00 },
    ])
    expect(out.total).toBe(500_00 + 2_625_00)
  })

  it("sin tipo de cambio, lo extranjero no entra en el total", () => {
    const out = splitByCurrency(
      [
        invoice({ id: "a", currency: "mxn", amount: 500_00, amountBase: 500_00 }),
        invoice({ id: "b", currency: "usd", amount: 100_00, amountBase: null }),
      ],
      "mxn",
    )
    expect(out.exact).toBe(500_00)
    expect(out.total).toBe(500_00)
    expect(out.foreign).toEqual([
      { currency: "usd", amount: 100_00, count: 1, converted: null },
    ])
  })

  it("sin facturas extranjeras no hay nada que declarar", () => {
    const out = splitByCurrency(
      [invoice({ id: "a", currency: "mxn", amount: 300_00, amountBase: 300_00 })],
      "mxn",
    )
    expect(out.foreign).toEqual([])
    expect(out.total).toBe(300_00)
  })

  it("ordena las monedas extranjeras por importe convertido, de mayor a menor", () => {
    const out = splitByCurrency(
      [
        invoice({ id: "a", currency: "usd", amount: 10_00, amountBase: 175_00 }),
        invoice({ id: "b", currency: "mxn", amount: 900_00, amountBase: 900_00 }),
      ],
      "mxn",
    )
    expect(out.foreign.map((f) => f.currency)).toEqual(["usd"])
  })
})
