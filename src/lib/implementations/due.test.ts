import { describe, expect, it } from "vitest"

import { dueStatus } from "./due"

// 22 sep 2026, 11:00 en México.
const now = new Date("2026-09-22T17:00:00Z")

describe("dueStatus", () => {
  it("sin fecha va en azul", () => {
    expect(dueStatus(null, now)).toEqual({ tone: "build", label: "Sin fecha máxima" })
  })
  it("dos días o menos va en rojo, vencida incluida", () => {
    expect(dueStatus("2026-09-24", now)).toEqual({ tone: "risk", label: "Vence en 2 días" })
    expect(dueStatus("2026-09-22", now).label).toBe("Vence hoy")
    expect(dueStatus("2026-09-19", now)).toEqual({ tone: "risk", label: "Vencida hace 3 días" })
  })
  it("de tres a siete días va en amarillo", () => {
    expect(dueStatus("2026-09-25", now).tone).toBe("warn")
    expect(dueStatus("2026-09-29", now).tone).toBe("warn")
  })
  it("más de siete días va en verde", () => {
    expect(dueStatus("2026-09-30", now).tone).toBe("live")
  })
  it("cuenta el día de México aunque en UTC ya sea mañana", () => {
    // 22 sep, 23:30 en México = 23 sep 05:30 UTC.
    expect(dueStatus("2026-09-23", new Date("2026-09-23T05:30:00Z")).label).toBe("Vence mañana")
  })
})
