import { describe, expect, it } from "vitest"

import { cleanBody, leadScope, pendingQuestion, transcript, type ChatMessage } from "./assistant"

let n = 0
const msg = (direction: ChatMessage["direction"], body: string, patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  direction,
  messageType: "TYPE_CUSTOM_PROVIDER_SMS",
  body,
  dateAdded: "2026-11-10T05:20:00.000Z",
  ...patch,
})

describe("cleanBody", () => {
  it("quita la etiqueta de instancia de GoGHL", () => {
    expect(cleanBody("{WA#2} Hola Ana")).toBe("Hola Ana")
    expect(cleanBody(undefined)).toBe("")
  })
})

describe("pendingQuestion", () => {
  it("junta los mensajes seguidos del asesor, en el orden en que los escribió", () => {
    // GHL los entrega del más reciente al más viejo.
    const q = pendingQuestion([
      msg("inbound", "y el de Silvia?", { id: "nuevo" }),
      msg("inbound", "cuál es el más urgente"),
      msg("outbound", "{WA#2} Hola Ana. Te dejo lo pendiente:"),
    ])
    expect(q).toMatchObject({ id: "nuevo", count: 2, text: "cuál es el más urgente\ny el de Silvia?" })
  })

  it("no hay pregunta si lo último es nuestro", () => {
    expect(pendingQuestion([msg("outbound", "{WA#2} Listo"), msg("inbound", "hola")])).toBeNull()
  })

  it("ignora actividad, llamadas y mensajes sin texto", () => {
    const q = pendingQuestion([
      msg("outbound", "Oportunidad creada", { messageType: "TYPE_ACTIVITY_OPPORTUNITY" }),
      msg("inbound", "", { messageType: "TYPE_CALL" }),
      msg("inbound", "sigues ahí?"),
      msg("outbound", "{WA#2} Hola"),
    ])
    expect(q?.text).toBe("sigues ahí?")
  })
})

describe("transcript", () => {
  it("deja fuera la pregunta pendiente y va del más viejo al más reciente", () => {
    const text = transcript(
      [
        msg("inbound", "cuál es el más urgente"),
        msg("outbound", "{WA#2} Te dejo lo pendiente"),
        msg("inbound", "gracias"),
      ],
      1,
    )
    expect(text).toBe("ASESOR: gracias\n\nTÚ: Te dejo lo pendiente")
  })
})

describe("leadScope", () => {
  it("gerente y admin ven todo; un usuario, según el ajuste", () => {
    expect(leadScope({ recipient: "manager", role: null, crmScope: "own" })).toEqual({ assignedTo: null })
    expect(leadScope({ recipient: "u1", role: "admin", crmScope: "own" })).toEqual({ assignedTo: null })
    expect(leadScope({ recipient: "u1", role: "user", crmScope: "own" })).toEqual({ assignedTo: "u1" })
    expect(leadScope({ recipient: "u1", role: "user", crmScope: "team" })).toEqual({ assignedTo: null })
    // Alguien que ya no está en GHL no hereda más alcance que el suyo.
    expect(leadScope({ recipient: "u1", role: null, crmScope: undefined })).toEqual({ assignedTo: "u1" })
  })
})
