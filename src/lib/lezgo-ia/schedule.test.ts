import { describe, expect, it } from "vitest"

import { dueLocations, parsePass } from "./schedule"

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

describe("parsePass", () => {
  it("la pasada completa es la de por defecto", () => {
    expect(parsePass("rapida")).toBe("quick")
    expect(parsePass("completa")).toBe("full")
    expect(parsePass(null)).toBe("full")
  })
})
