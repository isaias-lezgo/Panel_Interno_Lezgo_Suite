import { describe, expect, it } from "vitest"

import { dayFromEpoch, daysBetween, formatInMexico, mexicoDay, mexicoMonth } from "./time"

describe("mexicoDay", () => {
  it("usa GMT-6: pasadas las 6 pm sigue siendo el mismo día", () => {
    // 23:59 del 24 en México son las 05:59 UTC del 25.
    expect(mexicoDay(new Date("2026-09-25T05:59:00Z"))).toBe("2026-09-24")
    expect(mexicoDay(new Date("2026-09-25T06:00:00Z"))).toBe("2026-09-25")
  })

  it("no mueve una fecha que ya viene sin hora", () => {
    expect(mexicoDay("2026-03-01")).toBe("2026-03-01")
  })

  it("no cambia de horario en abril ni en octubre", () => {
    expect(mexicoDay("2026-04-15T05:30:00Z")).toBe("2026-04-14")
    expect(mexicoDay("2026-11-15T05:30:00Z")).toBe("2026-11-14")
  })

  it("lee segundos de Stripe en GMT-6", () => {
    expect(dayFromEpoch(Date.parse("2026-01-01T03:00:00Z") / 1000)).toBe("2025-12-31")
  })
})

describe("mexicoMonth", () => {
  it("el último día del mes a la noche sigue en ese mes", () => {
    expect(mexicoMonth(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09")
  })
})

describe("daysBetween", () => {
  it("cuenta días enteros entre dos fechas", () => {
    expect(daysBetween("2026-09-24", "2026-09-26")).toBe(2)
    expect(daysBetween("2026-09-24", "2026-09-23")).toBe(-1)
  })
})

describe("formatInMexico", () => {
  it("dibuja un día sin hora como ese día", () => {
    expect(formatInMexico("2026-08-01", "es-MX", { day: "numeric", month: "numeric" })).toBe("1/8")
  })

  it("dibuja un instante en hora de México", () => {
    expect(
      formatInMexico("2026-09-25T02:30:00Z", "en-US", {
        hour: "numeric",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    ).toBe("20:30")
  })
})
