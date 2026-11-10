import { describe, expect, it } from "vitest"

import { sumSpend, usageCost } from "./pricing"

describe("usageCost", () => {
  it("cobra entrada y salida al precio de lista, en micro-USD", () => {
    // 10,000 de entrada a $2/M + 1,000 de salida a $10/M = $0.02 + $0.01.
    expect(usageCost("anthropic/claude-sonnet-5", { inputTokens: 10_000, outputTokens: 1_000 })).toBe(30_000)
  })

  it("lo leído de caché cuesta la décima parte", () => {
    expect(
      usageCost("claude-sonnet-5", { inputTokens: 10_000, outputTokens: 0, cacheReadTokens: 10_000 }),
    ).toBe(2_000)
  })

  it("un modelo sin precio no se estima", () => {
    expect(usageCost("modelo-desconocido", { inputTokens: 1, outputTokens: 1 })).toBeNull()
  })
})

describe("sumSpend", () => {
  it("suma lo estimado y cuenta aparte lo que no tiene precio", () => {
    expect(
      sumSpend([
        { body: JSON.stringify({ microUsd: 30_000 }) },
        { body: JSON.stringify({ microUsd: 12_500 }) },
        { body: JSON.stringify({ microUsd: null }) },
        { body: "roto" },
      ]),
    ).toEqual({ microUsd: 42_500, calls: 3, unpriced: 1 })
  })
})
