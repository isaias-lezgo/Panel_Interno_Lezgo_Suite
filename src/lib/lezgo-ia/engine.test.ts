import { describe, expect, it } from "vitest"

import type { Advisor, Pipeline } from "@/data/lezgo-ia"

import { defaultAccountConfig, type AccountConfig } from "./config"
import {
  composeMessage,
  detectAlerts,
  planDeliveries,
  splitMessage,
  type EngineOpportunity,
} from "./engine"

// Miércoles 23 sep 2026, 12:00 en CDMX (UTC−6).
const now = new Date("2026-09-23T18:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const advisor = (id: string, name: string, role: Advisor["role"] = "user"): Advisor => ({
  id,
  name,
  role,
  activeLeads: null,
  responseMinutes: null,
  lastActiveAt: null,
  alerts: true,
  metrics: null,
})
const advisors = [advisor("ana", "Ana López"), advisor("luis", "Luis Pérez", "admin")]

const pipelines: Pipeline[] = [
  {
    id: "p1",
    name: "Ventas",
    stages: [
      { id: "s1", stage: "Nuevo", idle: "off", action: "notify" },
      { id: "s2", stage: "Negociación", idle: "off", action: "notify" },
    ],
  },
]

function account(patch: Partial<AccountConfig> = {}): AccountConfig {
  return {
    ...defaultAccountConfig("loc_1"),
    status: "active",
    // El resumen del día queda fuera salvo que la prueba lo pida.
    settings: { dailySummary: { enabled: false, option: "09:00" } },
    advisors: {
      ana: { userId: "ana", alerts: true, settings: {}, away: null },
      luis: { userId: "luis", alerts: true, settings: {}, away: null },
    },
    ...patch,
  }
}

const opp = (patch: Partial<EngineOpportunity> = {}): EngineOpportunity => ({
  id: "o1",
  name: "Oportunidad",
  contactName: "Juan Ruiz",
  contactId: null,
  pipelineId: "p1",
  stageId: "s1",
  assignedTo: "ana",
  createdAt: ago(10 * DAY),
  lastStageChangeAt: ago(10 * DAY),
  conversation: null,
  ...patch,
})

const detect = (opportunities: EngineOpportunity[], acc = account()) =>
  detectAlerts({ now, account: acc, pipelines, advisors, opportunities })

describe("detectAlerts", () => {
  it("avisa de un lead nuevo que nadie ha contactado pasado el umbral", () => {
    const alerts = detect([opp({ createdAt: ago(45 * MIN), firstContactAt: null })])
    expect(alerts).toMatchObject([
      { kind: "newLeadUntouched", userId: "ana", key: "new:o1", line: "Juan Ruiz: entró hace 45 min" },
    ])
  })

  it("no avisa si ya le escribieron o si aún no pasa el umbral", () => {
    expect(detect([opp({ createdAt: ago(45 * MIN), firstContactAt: ago(40 * MIN) })])).toEqual([])
    expect(detect([opp({ createdAt: ago(10 * MIN), firstContactAt: null })])).toEqual([])
  })

  it("un lead sin asignar se le avisa al gerente", () => {
    const [alert] = detect([opp({ assignedTo: null, createdAt: ago(45 * MIN), firstContactAt: null })])
    expect(alert.userId).toBe("manager")
    expect(alert.line).toContain("(sin asignar)")
  })

  it("lead que dejó de contestar, y pasado el umbral se propone perderlo", () => {
    const silent = (ms: number) =>
      opp({ conversation: { lastMessageAt: ago(ms), lastDirection: "outbound" } })
    expect(detect([silent(3 * DAY)])).toMatchObject([{ kind: "abandonedLead" }])
    expect(detect([silent(8 * DAY)])).toMatchObject([{ kind: "suggestLost" }])
    expect(detect([silent(10 * HOUR)])).toEqual([])
  })

  it("con 'Sugerir perdido' apagado se queda como lead sin contestar", () => {
    const acc = account({
      settings: {
        dailySummary: { enabled: false },
        suggestLost: { enabled: false, option: "7" },
      },
    })
    const alerts = detect(
      [opp({ conversation: { lastMessageAt: ago(8 * DAY), lastDirection: "outbound" } })],
      acc,
    )
    expect(alerts).toMatchObject([{ kind: "abandonedLead" }])
  })

  it("dos oportunidades del mismo contacto dan un solo aviso de su conversación", () => {
    const conversation = { lastMessageAt: ago(8 * DAY), lastDirection: "outbound" as const }
    const alerts = detect([
      opp({ id: "o1", contactId: "c1", conversation }),
      opp({ id: "o2", contactId: "c1", conversation }),
      opp({ id: "o3", contactId: "c2", conversation }),
    ])
    expect(alerts.map((a) => a.opportunityId)).toEqual(["o1", "o3"])
    expect(alerts[0].line).toBe("Juan Ruiz: 8 días sin contestar")
  })

  it("si el último mensaje es del lead, no es abandono", () => {
    expect(
      detect([opp({ conversation: { lastMessageAt: ago(5 * DAY), lastDirection: "inbound" } })]),
    ).toEqual([])
  })

  it("etapa sin movimiento según la regla de la etapa y su acción", () => {
    const acc = account({ stageRules: { p1: { s2: { idle: "5d", action: "manager" } } } })
    const alerts = detect([opp({ stageId: "s2", lastStageChangeAt: ago(6 * DAY) })], acc)
    expect(alerts).toMatchObject([
      { kind: "stageIdle", userId: "manager", settingId: null, line: "Juan Ruiz: 6 días en Negociación. Asesor: Ana López" },
    ])
    expect(detect([opp({ stageId: "s2", lastStageChangeAt: ago(4 * DAY) })], acc)).toEqual([])
  })

  it("resumen al gerente solo pasada la hora configurada", () => {
    const at = (option: string) =>
      detect([], account({ settings: { dailySummary: { enabled: true, option } } }))
    expect(at("09:00")).toMatchObject([{ kind: "dailySummary", key: "summary:2026-09-23" }])
    expect(at("18:00")).toEqual([])
  })

  it("el resumen cuida el singular, declara lo que no leyó y lo que nadie recibe", () => {
    const acc = account({ settings: { dailySummary: { enabled: true, option: "09:00" } } })
    acc.advisors.ana.alerts = false
    const alerts = detectAlerts({
      now,
      account: acc,
      pipelines,
      advisors,
      opportunities: [opp({ createdAt: ago(45 * MIN), firstContactAt: null })],
      totalOpen: 1234,
    })
    expect(alerts.at(-1)?.line).toBe(
      [
        "1234 oportunidades abiertas; revisé 1, 1 nueva en las últimas 24 h",
        "1 lead nuevo sin primer contacto",
        "0 leads sin contestar",
        "0 oportunidades sin movimiento en su etapa",
        "1 aviso no sale: es de asesores con los avisos apagados",
      ].join("\n"),
    )
  })
})

describe("planDeliveries", () => {
  const plan = (alerts = detect([
    opp({ id: "o1", createdAt: ago(45 * MIN), firstContactAt: null }),
    opp({ id: "o2", createdAt: ago(50 * MIN), firstContactAt: null }),
  ]), acc = account(), sentKeys = new Set<string>(), at = now) =>
    planDeliveries({ alerts, account: acc, advisors, at, sentKeys })

  it("junta los avisos de una persona en un solo mensaje", () => {
    const p = plan()
    expect(p.deliveries).toHaveLength(1)
    expect(p.deliveries[0].recipient).toMatchObject({ id: "ana", role: "asesor" })
    expect(p.deliveries[0].alerts).toHaveLength(2)
  })

  it("no repite lo que ya salió", () => {
    const p = plan(undefined, account(), new Set(["new:o1"]))
    expect(p.alreadySent).toBe(1)
    expect(p.deliveries[0].alerts).toHaveLength(1)
  })

  it("en horario de silencio queda en espera, no descartado", () => {
    const p = plan(undefined, account(), new Set(), new Date("2026-09-24T04:30:00Z"))
    expect(p.deliveries).toEqual([])
    expect(p.deferred).toHaveLength(2)
  })

  it("asesor con avisos apagados: descartado con su razón", () => {
    const acc = account()
    acc.advisors.ana.alerts = false
    expect(plan(undefined, acc).skipped.map((s) => s.reason)).toEqual([
      "avisos-apagados",
      "avisos-apagados",
    ])
  })

  it("fuera de oficina se desvía a quien cubre", () => {
    const acc = account()
    acc.advisors.ana.away = { from: "2026-09-22", to: "2026-09-25", coverage: "luis" }
    const p = plan(undefined, acc)
    expect(p.deliveries[0].recipient).toMatchObject({ id: "luis", role: "admin" })
  })

  it("avisa de un tope de oportunidades, lo más urgente primero, y cuenta el resto", () => {
    const silent = { lastMessageAt: ago(3 * DAY), lastDirection: "outbound" as const }
    const p = planDeliveries({
      alerts: detect([
        opp({ id: "o1", contactId: "c1", conversation: silent }),
        opp({ id: "o2", contactId: "c2", conversation: silent }),
        opp({ id: "o3", contactId: "c3", createdAt: ago(45 * MIN), firstContactAt: null }),
      ]),
      account: account(),
      advisors,
      at: now,
      sentKeys: new Set(),
      maxOpportunities: 2,
    })
    expect(p.held).toBe(1)
    expect(p.deliveries[0].more).toBe(1)
    // El lead nuevo entra aunque venga al final; se queda fuera un "sin contestar".
    expect(p.deliveries[0].alerts.map((a) => a.opportunityId)).toEqual(["o3", "o1"])
    const text = composeMessage({ delivery: p.deliveries[0], voice: null, test: false })
    expect(text.endsWith(
      "Hay 1 oportunidad más que necesita atención. Arregla estas 2 primero y luego te ayudo con el resto.",
    )).toBe(true)
  })

  it("el gerente son los admins; sin admins no hay a quién", () => {
    const alerts = detect([opp({ assignedTo: null, createdAt: ago(45 * MIN), firstContactAt: null })])
    const p = plan(alerts)
    expect(p.deliveries[0].recipient).toMatchObject({ id: "manager", members: ["Luis Pérez"] })
    const none = planDeliveries({
      alerts,
      account: account(),
      advisors: [advisors[0]],
      at: now,
      sentKeys: new Set(),
    })
    expect(none.skipped.map((s) => s.reason)).toEqual(["sin-gerente"])
  })
})

describe("composeMessage", () => {
  it("en prueba encabeza con el destinatario real y agrupa por tipo", () => {
    const [delivery] = planDeliveries({
      alerts: detect([opp({ createdAt: ago(45 * MIN), firstContactAt: null })]),
      account: account(),
      advisors,
      at: now,
      sentKeys: new Set(),
    }).deliveries
    const text = composeMessage({
      delivery,
      voice: { agentName: "Asistente Lezgo", formality: "tu" },
      test: true,
    })
    expect(text).toBe(
      [
        "[Prueba → Ana López · asesor]",
        "Hola Ana, soy Asistente Lezgo. Te dejo lo pendiente:",
        "*Lead nuevo sin primer contacto* (1)\n• Juan Ruiz: entró hace 45 min",
      ].join("\n\n"),
    )
  })
})

describe("splitMessage", () => {
  const line = (n: number) => `• Lead ${n}: 14 días sin contestar. ¿Lo pasamos a perdido?`
  const block = (title: string, count: number) =>
    [`*${title}*`, ...Array.from({ length: count }, (_, i) => line(i))].join("\n")

  it("deja entero lo que cabe", () => {
    expect(splitMessage("Hola Ana.\n\n*Resumen*")).toEqual(["Hola Ana.\n\n*Resumen*"])
  })

  it("corta entre bloques sin perder ni repetir nada", () => {
    const text = ["Hola.", block("Uno", 5), block("Dos", 5), block("Tres", 5)].join("\n\n")
    const parts = splitMessage(text, 400)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(400)
    expect(parts.join("\n\n")).toBe(text)
  })

  it("parte por renglones un bloque que solo no cabe", () => {
    const text = block("Propuestos para perdido", 20)
    const parts = splitMessage(text, 300)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(300)
    expect(parts.join("\n")).toBe(text)
    // Ningún renglón queda a medias.
    for (const part of parts) expect(part.endsWith("?") || part.endsWith("*")).toBe(true)
  })
})
