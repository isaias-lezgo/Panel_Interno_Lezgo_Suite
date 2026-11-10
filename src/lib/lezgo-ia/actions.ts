import type { GhlAction } from "@/data/lezgo-ia-ops"

/**
 * Lo que el asistente de Lezgo IA puede hacer en el CRM a petición de un
 * asesor, y cómo queda en la bitácora. Sin red: quién escribe en GHL está en
 * `assistant-tools.ts`.
 *
 * Una acción vive en `lezgo_ia_notifications` en dos renglones, con el
 * detalle como JSON en `body`:
 * - `kind = "proposal"`: lo que el asistente propuso. `status` pasa de
 *   "pending" a "done" cuando se ejecuta.
 * - `kind = "action"`: lo que sí se hizo en GoHighLevel.
 */

export type AssistantAction = "task" | "lost"

export type ActionDetail = {
  action: AssistantAction
  opportunityId: string
  contactId: string | null
  /** Nombre del lead, para la bitácora. */
  lead: string
  /** Solo en tareas. */
  title?: string
  dueInDays?: number
}

/**
 * `LEZGO_IA_WRITE_ACTIONS` y el ajuste "Escribir en el CRM" deciden si hay
 * acciones. La variable dice dónde: `interna` = solo en la subcuenta propia
 * de Lezgo Suite (para probar sin tocar el CRM de un cliente); `1` = en
 * todas. Cualquier otra cosa, en ninguna.
 */
export function writeMode(input: {
  flag: string | undefined
  /** ¿Es la subcuenta propia de Lezgo Suite? */
  internal: boolean
  crmWrite: string | undefined
}): "off" | "confirm" | "free" {
  const allowed = input.flag === "1" || (input.flag === "interna" && input.internal)
  if (!allowed) return "off"
  if (input.crmWrite === "free") return "free"
  if (input.crmWrite === "never") return "off"
  // Sin ajuste o con uno desconocido, lo prudente: pedir confirmación.
  return "confirm"
}

export const proposalKey = (action: AssistantAction, opportunityId: string) =>
  `proposal:${action}:${opportunityId}`

/** Una propuesta se puede confirmar durante un día; después hay que volver a proponer. */
export const PROPOSAL_TTL_MS = 24 * 3_600_000

/**
 * ¿Se puede ejecutar esta propuesta? Solo si se hizo en un turno **anterior**
 * de la conversación: así el modelo no puede proponer y ejecutar de un jalón
 * sin que el asesor haya visto la propuesta y contestado.
 */
export function confirmable(
  proposal: { runId: string; status: string; createdAt: string } | undefined,
  input: { runId: string; now: number },
): { ok: true } | { ok: false; error: string } {
  if (!proposal || proposal.status !== "pending") {
    return {
      ok: false,
      error:
        "No hay una propuesta pendiente de esta acción. Primero proponla con proposeAction y espera a que el asesor conteste que sí.",
    }
  }
  if (proposal.runId === input.runId) {
    return {
      ok: false,
      error:
        "La propuesta es de este mismo turno: el asesor todavía no la ha visto. Pídele confirmación y ejecútala cuando conteste.",
    }
  }
  if (input.now - Date.parse(proposal.createdAt) > PROPOSAL_TTL_MS) {
    return { ok: false, error: "La propuesta tiene más de un día. Vuelve a proponerla." }
  }
  return { ok: true }
}

/** ¿Sigue viva esta propuesta? Pendiente y de menos de un día. */
export function isLive(proposal: { status: string; createdAt: string }, now: number) {
  return proposal.status === "pending" && now - Date.parse(proposal.createdAt) <= PROPOSAL_TTL_MS
}

/** ¿Dos propuestas piden exactamente lo mismo? */
export function sameAction(a: ActionDetail, b: ActionDetail) {
  return (
    a.action === b.action &&
    a.opportunityId === b.opportunityId &&
    (a.title ?? null) === (b.title ?? null) &&
    (a.dueInDays ?? null) === (b.dueInDays ?? null)
  )
}

export function describeAction(detail: ActionDetail) {
  return detail.action === "lost"
    ? "Oportunidad marcada como perdida."
    : `Tarea «${detail.title ?? "Dar seguimiento"}»${
        detail.dueInDays === undefined
          ? ""
          : detail.dueInDays === 0
            ? " para hoy"
            : ` para dentro de ${detail.dueInDays} ${detail.dueInDays === 1 ? "día" : "días"}`
      }.`
}

export type ActionRow = {
  id: string
  ghlLocationId: string
  recipient: string
  recipientName: string
  body: string
  createdAt: string
}

/** De los renglones `action` a la pestaña Bitácora. Un renglón ilegible se salta. */
export function actionsFromRows(rows: ActionRow[]): GhlAction[] {
  return rows.flatMap((row) => {
    let detail: ActionDetail
    try {
      detail = JSON.parse(row.body) as ActionDetail
    } catch {
      return []
    }
    if (detail.action !== "task" && detail.action !== "lost") return []
    const time = Date.parse(row.createdAt)
    return [
      {
        id: row.id,
        subaccountId: row.ghlLocationId,
        advisorId: row.recipient,
        at: Number.isNaN(time) ? row.createdAt : new Date(time).toISOString(),
        kind: detail.action,
        contact: detail.lead,
        text: `${describeAction(detail)} A petición de ${row.recipientName}.`,
        ghlUrl: detail.contactId
          ? `https://login.lezgosuite.com/v2/location/${row.ghlLocationId}/contacts/detail/${detail.contactId}`
          : `https://login.lezgosuite.com/v2/location/${row.ghlLocationId}/opportunities/list`,
        reversible: false,
      },
    ]
  })
}
