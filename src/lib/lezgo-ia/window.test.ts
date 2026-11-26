import { describe, expect, it } from "vitest"

import { ghlDate, watchDays, windowLabel, windowStart } from "./window"

describe("periodo vigilado", () => {
  it("90 días si nadie eligió; «Todas» quita el límite", () => {
    expect(watchDays({})).toBe(90)
    expect(watchDays({ watchWindow: { enabled: true, option: "30" } })).toBe(30)
    expect(watchDays({ watchWindow: { enabled: true, option: "all" } })).toBeNull()
    expect(watchDays({ watchWindow: { enabled: true, option: "raro" } })).toBe(90)
  })

  it("windowStart resta los días; sin límite no hay inicio", () => {
    const now = new Date("2026-11-16T18:00:00Z")
    expect(windowStart(now, 30)?.toISOString()).toBe("2026-10-17T18:00:00.000Z")
    expect(windowStart(now, null)).toBeNull()
  })

  it("ghlDate usa el formato MM-DD-YYYY de GHL", () => {
    expect(ghlDate(new Date("2026-11-08T03:00:00Z"))).toBe("11-08-2026")
  })

  it("windowLabel cuida el singular", () => {
    expect(windowLabel(1)).toBe("el último día")
    expect(windowLabel(90)).toBe("los últimos 90 días")
  })
})
