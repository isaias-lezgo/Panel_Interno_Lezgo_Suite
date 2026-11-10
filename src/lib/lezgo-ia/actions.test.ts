import { describe, expect, it } from "vitest"

import { actionsFromRows, confirmable, writeMode } from "./actions"

describe("writeMode", () => {
  it("sin el interruptor no hay acciones, diga lo que diga el ajuste", () => {
    expect(writeMode({ flag: undefined, internal: true, crmWrite: "free" })).toBe("off")
    expect(writeMode({ flag: "0", internal: true, crmWrite: "confirm" })).toBe("off")
  })

  it("con el interruptor manda el ajuste; ante la duda, confirmar", () => {
    expect(writeMode({ flag: "1", internal: false, crmWrite: "never" })).toBe("off")
    expect(writeMode({ flag: "1", internal: false, crmWrite: "confirm" })).toBe("confirm")
    expect(writeMode({ flag: "1", internal: false, crmWrite: "free" })).toBe("free")
    expect(writeMode({ flag: "1", internal: false, crmWrite: undefined })).toBe("confirm")
  })

  it("'interna' solo abre la subcuenta propia: el CRM de un cliente sigue en solo lectura", () => {
    expect(writeMode({ flag: "interna", internal: true, crmWrite: "confirm" })).toBe("confirm")
    expect(writeMode({ flag: "interna", internal: false, crmWrite: "free" })).toBe("off")
  })
})

describe("confirmable", () => {
  const now = Date.parse("2026-11-10T12:00:00Z")
  const proposal = { runId: "reply_a", status: "pending", createdAt: "2026-11-10T11:50:00Z" }

  it("se ejecuta lo propuesto en un turno anterior", () => {
    expect(confirmable(proposal, { runId: "reply_b", now })).toEqual({ ok: true })
  })

  it("no en el mismo turno, ni sin propuesta, ni ya hecha, ni vieja", () => {
    expect(confirmable(proposal, { runId: "reply_a", now }).ok).toBe(false)
    expect(confirmable(undefined, { runId: "reply_b", now }).ok).toBe(false)
    expect(confirmable({ ...proposal, status: "done" }, { runId: "reply_b", now }).ok).toBe(false)
    expect(
      confirmable({ ...proposal, createdAt: "2026-11-09T11:00:00Z" }, { runId: "reply_b", now }).ok,
    ).toBe(false)
  })
})

describe("actionsFromRows", () => {
  it("arma el renglón de la bitácora y salta lo ilegible", () => {
    const base = {
      ghlLocationId: "loc1",
      recipient: "ana",
      recipientName: "Ana López",
      createdAt: "2026-11-10 12:00:00+00",
    }
    const actions = actionsFromRows([
      {
        ...base,
        id: "a1",
        body: JSON.stringify({ action: "task", opportunityId: "o1", contactId: "c1", lead: "Juan Ruiz", title: "Llamar a Juan", dueInDays: 1 }),
      },
      { ...base, id: "a2", body: JSON.stringify({ action: "lost", opportunityId: "o2", contactId: null, lead: "Silvia" }) },
      { ...base, id: "a3", body: "no es json" },
    ])
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      kind: "task",
      contact: "Juan Ruiz",
      text: "Tarea «Llamar a Juan» para dentro de 1 día. A petición de Ana López.",
      ghlUrl: "https://login.lezgosuite.com/v2/location/loc1/contacts/detail/c1",
      at: "2026-11-10T12:00:00.000Z",
      reversible: false,
    })
    expect(actions[1]).toMatchObject({ kind: "lost", text: "Oportunidad marcada como perdida. A petición de Ana López." })
  })
})
