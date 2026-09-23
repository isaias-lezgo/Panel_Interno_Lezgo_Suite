import { describe, expect, it } from "vitest"

import {
  defaultAccountConfig,
  idleMs,
  resolveAdvisor,
  saveAccountInput,
  shouldNotify,
  stageRuleFor,
  type AccountConfig,
} from "./config"

// Miércoles 23 sep 2026. En CDMX (UTC−6) las 18:00 UTC son las 12:00.
const noonCdmx = new Date("2026-09-23T18:00:00Z")
const lateCdmx = new Date("2026-09-24T04:30:00Z") // 22:30 del miércoles
const sundayCdmx = new Date("2026-09-27T18:00:00Z")

function account(patch: Partial<AccountConfig> = {}): AccountConfig {
  return {
    ...defaultAccountConfig("loc_1"),
    status: "active",
    advisors: {
      ana: { userId: "ana", alerts: true, settings: {}, away: null },
      beto: { userId: "beto", alerts: true, settings: {}, away: null },
    },
    ...patch,
  }
}

describe("resolveAdvisor", () => {
  it("hereda del equipo y encima pone lo propio", () => {
    const a = account({
      settings: { abandonedLead: { enabled: true, option: "48" } },
      advisors: {
        ana: {
          userId: "ana",
          alerts: true,
          settings: { abandonedLead: { enabled: true, option: "24" } },
          away: null,
        },
      },
    })
    expect(resolveAdvisor(a, "ana").settings.abandonedLead.option).toBe("24")
    expect(resolveAdvisor(a, "beto").settings.abandonedLead.option).toBe("48")
    expect(resolveAdvisor(a, "beto").alerts).toBe(false)
  })
})

describe("shouldNotify", () => {
  it("manda en horario laborable", () => {
    expect(
      shouldNotify({ account: account(), userId: "ana", settingId: "abandonedLead", at: noonCdmx }),
    ).toEqual({ send: true, to: "ana" })
  })

  it("no manda si la IA de la subcuenta no está activa", () => {
    const r = shouldNotify({
      account: account({ status: "paused" }),
      userId: "ana",
      settingId: "abandonedLead",
      at: noonCdmx,
    })
    expect(r).toMatchObject({ send: false, reason: "ia-inactiva" })
  })

  it("respeta el ajuste apagado del asesor aunque el equipo lo tenga prendido", () => {
    const a = account()
    a.advisors.ana.settings = { hotLeads: { enabled: false } }
    expect(
      shouldNotify({ account: a, userId: "ana", settingId: "hotLeads", at: noonCdmx }),
    ).toMatchObject({ send: false, reason: "ajuste-apagado" })
  })

  it("junta lo que cae en horario de silencio", () => {
    expect(
      shouldNotify({ account: account(), userId: "ana", settingId: "abandonedLead", at: lateCdmx }),
    ).toMatchObject({ send: false, reason: "horario-de-silencio", deferred: true })
  })

  it("domingo no es laborable con lunes a sábado", () => {
    expect(
      shouldNotify({ account: account(), userId: "ana", settingId: "abandonedLead", at: sundayCdmx }),
    ).toMatchObject({ send: false, reason: "dia-no-laborable", deferred: true })
  })

  it("desvía a quien cubre mientras el asesor está fuera", () => {
    const a = account()
    a.advisors.ana.away = { from: "2026-09-21", to: "2026-09-25", coverage: "beto" }
    expect(
      shouldNotify({ account: a, userId: "ana", settingId: "abandonedLead", at: noonCdmx }),
    ).toEqual({ send: true, to: "beto" })
  })
})

describe("reglas por etapa", () => {
  it("sin regla guardada la etapa no se vigila", () => {
    expect(stageRuleFor(account(), "pip", "stage")).toEqual({ idle: "off", action: "notify" })
    expect(idleMs("off")).toBeNull()
    expect(idleMs("48h")).toBe(48 * 3_600_000)
  })
})

describe("saveAccountInput", () => {
  const base = {
    locationId: "loc_1",
    status: "active" as const,
    settings: {},
    voice: { agentName: "Asistente", formality: "tu" as const },
    stageRules: {},
    advisors: [],
  }

  it("rechaza ajustes y opciones que no existen", () => {
    expect(saveAccountInput.safeParse({ ...base, settings: { inventado: { enabled: true } } }).success).toBe(false)
    expect(
      saveAccountInput.safeParse({ ...base, settings: { abandonedLead: { enabled: true, option: "999" } } }).success,
    ).toBe(false)
    expect(
      saveAccountInput.safeParse({ ...base, settings: { abandonedLead: { enabled: true, option: "24" } } }).success,
    ).toBe(true)
  })

  it("rechaza una ausencia que termina antes de empezar", () => {
    const r = saveAccountInput.safeParse({
      ...base,
      advisors: [
        { userId: "ana", alerts: true, settings: {}, away: { from: "2026-09-26", to: "2026-09-20", coverage: "manager" } },
      ],
    })
    expect(r.success).toBe(false)
  })
})
