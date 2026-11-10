import { describe, expect, it } from "vitest"

import { threadsFromNotifications, weeklySentBySubaccount, type NotificationRow } from "./log"

let n = 0
const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: `ln_${++n}`,
  ghlLocationId: "loc1",
  runId: "run_a",
  kind: "abandonedLead",
  recipient: "ana",
  recipientName: "Ana López",
  status: "sent",
  body: "Hola Ana. Te dejo lo pendiente:",
  error: null,
  createdAt: "2026-09-23 18:02:49.32+00",
  ...over,
})

describe("threadsFromNotifications", () => {
  it("junta en un hilo los avisos que viajaron en el mismo mensaje", () => {
    const threads = threadsFromNotifications([
      row({}),
      row({}),
      row({ recipient: "manager", recipientName: "Gerente", kind: "dailySummary", body: "Resumen" }),
      row({ runId: "run_b" }),
    ])
    expect(threads).toHaveLength(3)
    expect(threads[0]).toMatchObject({
      subaccountId: "loc1",
      advisorId: "ana",
      recipientName: "Ana López",
      kind: "alert",
      subject: "Leads que dejaron de contestar (2)",
      delivery: { status: "sent" },
    })
    expect(threads[0].messages).toHaveLength(1)
    expect(threads[1]).toMatchObject({ advisorId: "manager", kind: "analysis", subject: "Resumen del día" })
  })

  it("resume como 'N avisos' cuando el mensaje mezcla tipos", () => {
    const [thread] = threadsFromNotifications([
      row({}),
      row({ kind: "stageIdle" }),
      row({ kind: "dailySummary" }),
    ])
    expect(thread.subject).toBe("3 avisos")
    expect(thread.kind).toBe("alert")
  })

  it("pasa la fecha de Postgres a ISO", () => {
    const [thread] = threadsFromNotifications([row({})])
    expect(thread.messages[0].at).toBe("2026-09-23T18:02:49.320Z")
  })

  it("declara lo fallido con su error y lo demás como simulado", () => {
    const [failed, simulated] = threadsFromNotifications([
      row({ status: "failed", error: "GHL 400" }),
      row({ runId: "run_b", status: "simulated" }),
    ])
    expect(failed.delivery).toEqual({ status: "failed", error: "GHL 400" })
    expect(simulated.delivery).toEqual({ status: "simulated" })
  })
})

describe("weeklySentBySubaccount", () => {
  it("cuenta solo lo enviado en los últimos 7 días", () => {
    const threads = threadsFromNotifications([
      row({}),
      row({ runId: "run_b", status: "simulated" }),
      row({ runId: "run_c", createdAt: "2026-09-10 12:00:00+00" }),
      row({ runId: "run_d", ghlLocationId: "loc2" }),
    ])
    const counts = weeklySentBySubaccount(threads, new Date("2026-09-24T00:00:00Z"))
    expect(Object.fromEntries(counts)).toEqual({ loc1: 1, loc2: 1 })
  })
})

describe("preguntas al asistente", () => {
  it("arma un hilo con la pregunta del asesor y la respuesta de la IA", () => {
    const [thread] = threadsFromNotifications([
      row({ runId: "reply_m1", kind: "reply", body: "Tienes 3 leads sin contestar." }),
      row({ runId: "reply_m1", kind: "question", status: "received", body: "¿Cuántos leads\ntengo sin contestar?" }),
    ])
    expect(thread).toMatchObject({
      kind: "question",
      subject: "¿Cuántos leads tengo sin contestar?",
      delivery: { status: "sent" },
    })
    expect(thread.messages.map((m) => m.from)).toEqual(["advisor", "ia"])
  })

  it("una pregunta sin respuesta todavía no declara entrega", () => {
    const [thread] = threadsFromNotifications([
      row({ runId: "reply_m2", kind: "question", status: "received", body: "Hola" }),
    ])
    expect(thread.delivery).toBeUndefined()
    expect(thread.messages).toHaveLength(1)
  })
})
