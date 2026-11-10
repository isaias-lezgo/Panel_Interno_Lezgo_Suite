import type { Thread } from "@/data/lezgo-ia"

import { parseInbound } from "./assistant"
import { alertKindLabel, type AlertKind } from "./engine"

/**
 * De la bitácora del motor (`lezgo_ia_notifications`) a los hilos de la
 * pestaña Mensajes. La tabla guarda un renglón por aviso; varios avisos
 * viajan en un mismo WhatsApp y comparten corrida, destinatario y `body`.
 * Aquí se vuelven a juntar: un hilo por mensaje, con lo que se mandó tal
 * cual —o lo que se habría mandado, si la corrida fue simulada—.
 */

export type NotificationRow = {
  id: string
  ghlLocationId: string
  runId: string
  kind: string
  /** Id de GHL del asesor, o "manager". */
  recipient: string
  recipientName: string
  status: string
  body: string
  error: string | null
  createdAt: string
}

const deliveryStatus = (status: string): NonNullable<Thread["delivery"]>["status"] =>
  status === "sent" || status === "failed" ? status : "simulated"

/** Postgres devuelve "2026-09-23 18:02:49.32+00"; el panel compara ISO. */
function iso(at: string) {
  const time = Date.parse(at)
  return Number.isNaN(time) ? at : new Date(time).toISOString()
}

function subjectFor(kinds: string[]) {
  const unique = [...new Set(kinds)]
  if (unique.length > 1) return `${kinds.length} avisos`
  const label = alertKindLabel[unique[0] as AlertKind] ?? "Aviso"
  return kinds.length > 1 ? `${label} (${kinds.length})` : label
}

export function threadsFromNotifications(rows: NotificationRow[]): Thread[] {
  const groups = new Map<string, NotificationRow[]>()
  for (const row of rows) {
    const key = `${row.runId}:${row.recipient}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return [...groups.entries()].map(([key, group]) => {
    const asked = group.find((r) => r.kind === "question")
    if (asked) return questionThread(key, asked, group.find((r) => r.kind === "reply"))
    const first = group[0]
    const kinds = group.map((r) => r.kind)
    return {
      id: key,
      subaccountId: first.ghlLocationId,
      advisorId: first.recipient,
      recipientName: first.recipientName,
      kind: kinds.every((k) => k === "dailySummary") ? "analysis" : "alert",
      subject: subjectFor(kinds),
      unread: false,
      delivery: {
        status: deliveryStatus(first.status),
        ...(first.error ? { error: first.error } : {}),
      },
      messages: [{ id: first.id, from: "ia", text: first.body, at: iso(first.createdAt) }],
    }
  })
}

/** Lo que un asesor le preguntó al asistente y lo que este contestó. */
function questionThread(
  id: string,
  asked: NotificationRow,
  reply: NotificationRow | undefined,
): Thread {
  // Los renglones de antes guardaron el mensaje como lo entrega GoGHL, con
  // lo citado y el pie de "Received on": aquí se muestra solo lo escrito.
  const text = parseInbound(asked.body).text
  const subject = text.replace(/\s+/g, " ").trim()
  return {
    id,
    subaccountId: asked.ghlLocationId,
    advisorId: asked.recipient,
    recipientName: asked.recipientName,
    kind: "question",
    subject: subject.length > 60 ? `${subject.slice(0, 60)}…` : subject,
    unread: false,
    ...(reply
      ? {
          delivery: {
            status: deliveryStatus(reply.status),
            ...(reply.error ? { error: reply.error } : {}),
          },
        }
      : {}),
    messages: [
      { id: asked.id, from: "advisor", text, at: iso(asked.createdAt) },
      ...(reply
        ? [{ id: reply.id, from: "ia" as const, text: reply.body, at: iso(reply.createdAt) }]
        : []),
    ],
  }
}

const WEEK = 7 * 24 * 3_600_000

/** Mensajes que sí salieron en los últimos 7 días, por subcuenta. */
export function weeklySentBySubaccount(threads: Thread[], now: Date) {
  const since = now.getTime() - WEEK
  const counts = new Map<string, number>()
  for (const thread of threads) {
    if (thread.delivery?.status !== "sent") continue
    if (Date.parse(thread.messages[thread.messages.length - 1].at) < since) continue
    counts.set(thread.subaccountId, (counts.get(thread.subaccountId) ?? 0) + 1)
  }
  return counts
}
