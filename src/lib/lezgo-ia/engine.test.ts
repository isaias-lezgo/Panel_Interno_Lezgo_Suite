import { describe, expect, it } from "vitest"

import type { Advisor, Pipeline } from "@/data/lezgo-ia"

import { defaultAccountConfig, type AccountConfig } from "./config"
import {
  composeMessage,
  detectAlerts,
  emailHtml,
  hotSignals,
  leadReply,
  planDeliveries,
  splitMessage,
  type EngineAppointment,
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

describe("leads calientes", () => {
  const msg = (direction: "inbound" | "outbound", minutesAgo: number, body = "") => ({
    direction,
    dateAdded: ago(minutesAgo * MIN),
    body,
  })

  it("leadReply junta lo que el lead escribió al final y mide cuánto tardó", () => {
    const reply = leadReply([
      msg("inbound", 5, "¿aceptan Infonavit?"),
      msg("inbound", 6, "Hola"),
      msg("outbound", 10, "Buen día, ¿sigue interesado?"),
      msg("inbound", 300, "info"),
    ])
    expect(reply).toEqual({ text: "Hola\n¿aceptan Infonavit?", replyMs: 4 * MIN })
  })

  it("leadReply: nada si lo último es nuestro; sin tiempo si nadie le había escrito", () => {
    expect(leadReply([msg("outbound", 1, "Hola"), msg("inbound", 5, "info")])).toBeNull()
    expect(leadReply([msg("inbound", 5, "info")])).toEqual({ text: "info", replyMs: null })
  })

  it("leadReply ignora la actividad que GHL anota como mensaje", () => {
    const reply = leadReply([
      { ...msg("outbound", 1), messageType: "TYPE_ACTIVITY_OPPORTUNITY" },
      msg("inbound", 5, "quiero verla"),
      msg("outbound", 8, "Hola"),
    ])
    expect(reply).toEqual({ text: "quiero verla", replyMs: 3 * MIN })
  })

  it("hotSignals: respuesta rápida, crédito y visita, con o sin acentos", () => {
    expect(hotSignals({ text: "ok gracias", replyMs: 3 * MIN })).toEqual(["contestó en 3 min"])
    expect(hotSignals({ text: "¿Aceptan CRÉDITO Infonavit?", replyMs: 2 * HOUR })).toEqual([
      "pregunta por crédito",
    ])
    expect(hotSignals({ text: "cuando puedo ir a verla?", replyMs: null })).toEqual(["pide visita"])
    expect(hotSignals({ text: "ok gracias", replyMs: 2 * HOUR })).toEqual([])
    // "cita" dentro de otra palabra no cuenta.
    expect(hotSignals({ text: "se solicita informacion", replyMs: null })).toEqual([])
  })

  const waiting = (minutes: number, text: string, replyMs: number | null = null) =>
    opp({
      conversation: {
        lastMessageAt: ago(minutes * MIN),
        lastDirection: "inbound",
        reply: { text, replyMs },
      },
    })

  it("avisa del lead que escribió con señal y sigue sin respuesta", () => {
    const [alert] = detect([waiting(20, "me interesa, ¿puedo agendar una visita?", 4 * MIN)])
    expect(alert).toMatchObject({
      kind: "hotLead",
      settingId: "hotLeads",
      userId: "ana",
      line: "Juan Ruiz: contestó en 4 min, pide visita. Espera respuesta hace 20 min",
    })
    expect(alert.key).toBe(`hot:o1:${ago(20 * MIN)}`)
  })

  it("sin señal, con más de un día o sin leer lo que escribió, no avisa", () => {
    expect(detect([waiting(20, "ok", 2 * HOUR)])).toEqual([])
    expect(detect([waiting(26 * 60, "quiero una cita")])).toEqual([])
    expect(
      detect([opp({ conversation: { lastMessageAt: ago(20 * MIN), lastDirection: "inbound" } })]),
    ).toEqual([])
  })
})

describe("recordatorio de visita", () => {
  const visit = (patch: Partial<EngineAppointment> = {}): EngineAppointment => ({
    id: "v1",
    title: "Visita Depto 4B",
    // 14:00 en CDMX: dos horas después de `now`.
    startTime: "2026-09-23T14:00:00-06:00",
    assignedTo: "ana",
    leadName: "Juan Ruiz",
    address: "Av. Juárez 10",
    ...patch,
  })
  const remind = (appointments: EngineAppointment[], acc = account()) =>
    detectAlerts({ now, account: acc, pipelines, advisors, opportunities: [], appointments })

  it("avisa al asesor de la cita que cae dentro de su anticipación (3 h por defecto)", () => {
    expect(remind([visit()])).toMatchObject([
      {
        kind: "visitReminder",
        settingId: "appointmentReminder",
        userId: "ana",
        key: "visit:v1:2026-09-23T14:00:00-06:00",
        line: "Hoy 14:00 · Visita Depto 4B · Juan Ruiz · Av. Juárez 10",
      },
    ])
  })

  it("todavía no si falta más que la anticipación; nunca de una que ya empezó", () => {
    expect(remind([visit({ startTime: "2026-09-23T17:00:00-06:00" })])).toEqual([])
    expect(remind([visit({ startTime: "2026-09-23T11:30:00-06:00" })])).toEqual([])
  })

  it("con un día de anticipación dice Mañana; sin asesor va al gerente", () => {
    const acc = account({
      settings: {
        dailySummary: { enabled: false },
        appointmentReminder: { enabled: true, option: "24h" },
      },
    })
    const [alert] = remind(
      [visit({ startTime: "2026-09-24T10:00:00-06:00", assignedTo: null, leadName: null, address: null })],
      acc,
    )
    expect(alert).toMatchObject({
      userId: "manager",
      line: "Mañana 10:00 · Visita Depto 4B · sin asignar",
    })
  })

  it("no repite el nombre del lead si el título ya lo trae", () => {
    const [alert] = remind([visit({ title: "Juan Ruiz · Recorrido", address: null })])
    expect(alert.line).toBe("Hoy 14:00 · Juan Ruiz · Recorrido")
  })

  it("el aviso respeta el interruptor del ajuste", () => {
    const acc = account({
      settings: { dailySummary: { enabled: false }, appointmentReminder: { enabled: false, option: "3h" } },
    })
    const plan = planDeliveries({
      alerts: remind([visit()], acc),
      account: acc,
      advisors,
      at: now,
      sentKeys: new Set(),
    })
    expect(plan.deliveries).toEqual([])
    expect(plan.skipped).toMatchObject([{ reason: "ajuste-apagado" }])
  })
})

describe("resumen con periodo vigilado y visitas", () => {
  it("dice qué periodo vigila cuando lo que quedó fuera es lo más viejo", () => {
    const alerts = detectAlerts({
      now,
      account: account({ settings: { dailySummary: { enabled: true, option: "09:00" } } }),
      pipelines,
      advisors,
      opportunities: [opp({ id: "o1", createdAt: ago(10 * DAY) }), opp({ id: "o2", createdAt: ago(40 * DAY) })],
      totalOpen: 3030,
      watchDays: 90,
      appointments: [],
    })
    expect(alerts.at(-1)?.line.split("\n")).toEqual([
      "3030 oportunidades abiertas; vigilo las 2 de los últimos 90 días, 0 nuevas en las últimas 24 h",
      "0 leads nuevos sin primer contacto",
      "0 leads sin contestar",
      "0 oportunidades sin movimiento en su etapa",
      "0 visitas por venir hoy",
    ])
  })
})

describe("emailHtml", () => {
  it("pasa negritas y saltos a HTML y escapa lo demás", () => {
    expect(emailHtml("*Hola*\nA <b> & c")).toContain("<strong>Hola</strong><br>A &lt;b&gt; &amp; c")
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
