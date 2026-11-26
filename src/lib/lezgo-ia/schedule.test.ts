import { describe, expect, it } from "vitest"

import { dueLocations, fullGapMs, parsePass } from "./schedule"

describe("dueLocations", () => {
  const now = Date.parse("2026-11-10T12:00:00Z")
  const active = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]
  const lastRuns = new Map([
    ["a", "2026-11-10T11:58:00Z"], // hace 2 min
    ["b", "2026-11-10T09:00:00Z"],
    ["c", "2026-11-10T11:00:00Z"],
  ])

  it("primero la que nunca ha corrido, luego la más atrasada; fuera las recientes", () => {
    const due = dueLocations(active, lastRuns, { now, minGapMs: 4 * 60_000 })
    expect(due.map((x) => x.id)).toEqual(["d", "b", "c"])
  })

  it("con un hueco largo solo pasan las que de verdad esperaron", () => {
    const due = dueLocations(active, lastRuns, { now, minGapMs: 2 * 3_600_000 })
    expect(due.map((x) => x.id)).toEqual(["d", "b"])
  })
})

describe("fullGapMs", () => {
  const MIN = 60_000

  it("sale de «Análisis de la cartera», con 10 minutos de margen", () => {
    expect(fullGapMs({ enabled: true, option: "1h" })).toBe(50 * MIN)
    expect(fullGapMs({ enabled: true, option: "4h" })).toBe(230 * MIN)
    expect(fullGapMs({ enabled: true, option: "daily" })).toBe((24 * 60 - 10) * MIN)
  })

  it("apagado o sin ajuste, la completa no corre sola; una opción rara cae a diario", () => {
    expect(fullGapMs({ enabled: false, option: "1h" })).toBeNull()
    expect(fullGapMs(undefined)).toBeNull()
    expect(fullGapMs({ enabled: true, option: "?" })).toBe((24 * 60 - 10) * MIN)
  })

  it("dueLocations acepta un hueco por subcuenta y deja fuera las que no tienen", () => {
    const now = Date.parse("2026-11-10T12:00:00Z")
    const active = [
      { id: "hora", every: "1h" },
      { id: "diaria", every: "daily" },
      { id: "apagada", every: null },
    ]
    const lastRuns = new Map([
      ["hora", "2026-11-10T11:01:00Z"], // hace 59 min: un cron de cada hora sí la toma
      ["diaria", "2026-11-10T09:00:00Z"],
    ])
    const due = dueLocations(active, lastRuns, {
      now,
      minGapMs: (a) => (a.every ? fullGapMs({ enabled: true, option: a.every }) : null),
    })
    expect(due.map((x) => x.id)).toEqual(["hora"])
  })
})

describe("parsePass", () => {
  it("la pasada completa es la de por defecto", () => {
    expect(parsePass("rapida")).toBe("quick")
    expect(parsePass("completa")).toBe("full")
    expect(parsePass(null)).toBe("full")
  })
})
