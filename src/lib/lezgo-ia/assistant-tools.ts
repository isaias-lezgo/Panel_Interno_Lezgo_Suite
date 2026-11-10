import "server-only"

import { tool } from "ai"
import { z } from "zod"

import { and, desc, eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { GhlError, type GhlClient, type GhlOpportunity } from "@/lib/ghl/client"

import {
  confirmable,
  describeAction,
  isLive,
  proposalKey,
  sameAction,
  type ActionDetail,
  type AssistantAction,
} from "./actions"
import { cleanBody } from "./assistant"
import { elapsed } from "./engine"

/**
 * Las herramientas del asistente de Lezgo IA: lecturas del CRM de **una**
 * subcuenta, acotadas a lo que puede ver quien escribe. La subcuenta y el
 * alcance se fijan aquí, al armar las herramientas; el modelo no los elige.
 *
 * Nunca lanzan: el error de GHL vuelve como `{ ok: false, error }` para que
 * el modelo lo diga en vez de inventar.
 *
 * Con `writes` se suman dos herramientas que **sí escriben en el CRM del
 * cliente**: crear una tarea y marcar una oportunidad como perdida. En modo
 * "confirm" van en dos tiempos —`proposeAction` anota la propuesta,
 * `executeAction` solo corre si esa propuesta es de un turno anterior—, así
 * que entre proponer y hacer siempre hay un mensaje del asesor. En modo
 * "free" se ejecuta directo. Cada cosa hecha deja su renglón `action`, que
 * es lo que muestra la Bitácora.
 */
export type AssistantWrites = {
  mode: "confirm" | "free"
  /** Identifica el turno: la pregunta que se está contestando. */
  runId: string
  recipient: string
  recipientName: string
  testContactId: string | null
  /** `?simular=1`: se dice qué pasaría, sin tocar GHL ni Neon. */
  simulate: boolean
}

const actionInput = z.object({
  opportunityId: z.string().min(1).max(64),
  action: z.enum(["task", "lost"]),
})

export function assistantTools(input: {
  client: GhlClient
  locationId: string
  /** Id del asesor al que se limita la lectura; `null` = todo el pipeline. */
  assignedTo: string | null
  /** "pipelineId:stageId" → nombre de la etapa. */
  stageName: Map<string, string>
  pipelineName: Map<string, string>
  advisorName: Map<string, string>
  now: Date
  /** `null` = solo lectura. */
  writes?: AssistantWrites | null
}) {
  const { client, locationId, assignedTo, now } = input
  const writes = input.writes ?? null

  /** La oportunidad, comprobando que el id (viene del modelo) sea de esta subcuenta y de su alcance. */
  const inScope = async (opportunityId: string) => {
    const { opportunity } = await client.getOpportunity(opportunityId)
    if (opportunity.locationId && opportunity.locationId !== locationId) {
      throw new Error("Esa oportunidad no es de esta subcuenta.")
    }
    if (assignedTo && opportunity.assignedTo !== assignedTo) {
      throw new Error("Esa oportunidad no está asignada a esta persona.")
    }
    return opportunity
  }

  const row = (o: GhlOpportunity) => {
    const since = Date.parse(o.lastStageChangeAt ?? o.createdAt ?? "")
    return {
      id: o.id,
      lead: o.contact?.name?.trim() || o.name,
      oportunidad: o.name,
      pipeline: input.pipelineName.get(o.pipelineId) ?? null,
      etapa: input.stageName.get(`${o.pipelineId}:${o.pipelineStageId}`) ?? null,
      enSuEtapaDesde: Number.isNaN(since) ? null : elapsed(now.getTime() - since),
      asesor: o.assignedTo ? (input.advisorName.get(o.assignedTo) ?? "otro usuario") : "sin asignar",
      valor: o.monetaryValue ?? null,
      creada: o.createdAt ?? null,
    }
  }

  return {
    listLeads: tool({
      description:
        "Oportunidades abiertas del CRM, las más recientes primero. Con `query` busca por nombre del lead o de la oportunidad. `total` dice cuántas hay en total aunque solo se devuelvan `limit`.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(80).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      execute: ({ query, limit }) =>
        attempt(async () => {
          const page = await client.searchOpportunities({
            locationId,
            status: "open",
            assignedTo: assignedTo ?? undefined,
            query,
            limit: limit ?? 20,
          })
          return { total: page.meta.total, leads: page.opportunities.map(row) }
        }),
    }),

    getLead: tool({
      description:
        "Detalle de una oportunidad por su id (de listLeads): etapa, asesor, valor y los últimos mensajes de la conversación con el lead, del más reciente al más viejo.",
      inputSchema: z.object({ opportunityId: z.string().min(1).max(64) }),
      execute: ({ opportunityId }) =>
        attempt(async () => {
          const opportunity = await inScope(opportunityId)
          const contactId = opportunity.contactId ?? opportunity.contact?.id
          let mensajes: { de: string; cuando: string; texto: string }[] = []
          if (contactId) {
            const { conversations } = await client.searchConversations({
              locationId,
              contactId,
              limit: 1,
            })
            if (conversations[0]) {
              const { messages } = await client.listMessages(conversations[0].id, 15)
              mensajes = messages.messages
                .filter((m) => !m.messageType?.startsWith("TYPE_ACTIVITY") && cleanBody(m.body))
                .map((m) => ({
                  de: m.direction === "inbound" ? "lead" : "equipo",
                  cuando: m.dateAdded,
                  texto: cleanBody(m.body).slice(0, 500),
                }))
            }
          }
          return { ...row(opportunity), estado: opportunity.status, mensajes }
        }),
    }),
    ...(writes ? writeTools() : {}),
  }

  function writeTools() {
    const w = writes!
    const common = {
      ghlLocationId: locationId,
      runId: w.runId,
      recipient: w.recipient,
      recipientName: w.recipientName,
      testContactId: w.testContactId,
    }

    const detailOf = async (
      opportunityId: string,
      action: AssistantAction,
      extra: { title?: string; dueInDays?: number },
    ): Promise<{ detail: ActionDetail; assignedTo: string | undefined }> => {
      const opportunity = await inScope(opportunityId)
      if (opportunity.status !== "open") throw new Error("Esa oportunidad ya no está abierta.")
      const contactId = opportunity.contactId ?? opportunity.contact?.id ?? null
      if (action === "task" && !contactId) throw new Error("La oportunidad no tiene contacto.")
      return {
        assignedTo: opportunity.assignedTo,
        detail: {
          action,
          opportunityId,
          contactId,
          lead: opportunity.contact?.name?.trim() || opportunity.name,
          ...(action === "task"
            ? { title: extra.title ?? "Dar seguimiento", dueInDays: extra.dueInDays ?? 1 }
            : {}),
        },
      }
    }

    const perform = async (detail: ActionDetail, taskOwner: string | undefined) => {
      if (w.simulate) return
      if (detail.action === "lost") {
        await client.setOpportunityStatus(detail.opportunityId, "lost")
      } else {
        await client.createTask(detail.contactId!, {
          title: detail.title ?? "Dar seguimiento",
          dueDate: new Date(now.getTime() + (detail.dueInDays ?? 1) * 86_400_000).toISOString(),
          ...(taskOwner ? { assignedTo: taskOwner } : {}),
        })
      }
      await db!.insert(schema.lezgoIaNotifications).values({
        ...common,
        id: `ln_act_${crypto.randomUUID()}`,
        key: `action:${detail.action}:${detail.opportunityId}`,
        kind: "action",
        status: "done",
        body: JSON.stringify(detail),
      })
    }

    return {
      ...(w.mode === "confirm"
        ? {
            proposeAction: tool({
              description:
                "Anota la propuesta de una acción en el CRM: crear una tarea de seguimiento (task) o marcar la oportunidad como perdida (lost). NO la ejecuta. Después de llamarla, dile al asesor qué propones y pídele que confirme; ejecútala con executeAction solo cuando conteste que sí, en su siguiente mensaje.",
              inputSchema: actionInput.extend({
                title: z.string().trim().min(1).max(120).optional().describe("Solo task: título de la tarea."),
                dueInDays: z.number().int().min(0).max(30).optional().describe("Solo task: en cuántos días vence. 0 = hoy."),
              }),
              execute: ({ opportunityId, action, title, dueInDays }) =>
                attempt(async () => {
                  const { detail } = await detailOf(opportunityId, action, { title, dueInDays })
                  if (!w.simulate) {
                    const key = proposalKey(action, opportunityId)
                    // Si ya propuso esto mismo y sigue vivo, NO se reescribe: reescribirlo
                    // le pondría el turno actual y el "sí" del asesor nunca alcanzaría a
                    // confirmarlo (el modelo no recuerda sus llamadas de turnos anteriores
                    // y tiende a volver a proponer).
                    const [existing] = await db!
                      .select({
                        runId: schema.lezgoIaNotifications.runId,
                        status: schema.lezgoIaNotifications.status,
                        body: schema.lezgoIaNotifications.body,
                        createdAt: schema.lezgoIaNotifications.createdAt,
                      })
                      .from(schema.lezgoIaNotifications)
                      .where(
                        and(
                          eq(schema.lezgoIaNotifications.ghlLocationId, locationId),
                          eq(schema.lezgoIaNotifications.key, key),
                          eq(schema.lezgoIaNotifications.recipient, w.recipient),
                          eq(schema.lezgoIaNotifications.status, "pending"),
                        ),
                      )
                      .orderBy(desc(schema.lezgoIaNotifications.createdAt))
                      .limit(1)
                    if (
                      existing &&
                      isLive(existing, now.getTime()) &&
                      sameAction(JSON.parse(existing.body) as ActionDetail, detail)
                    ) {
                      return existing.runId === w.runId
                        ? {
                            propuesta: describeAction(detail),
                            lead: detail.lead,
                            siguiente: "Ya la propusiste en este turno. Pide confirmación al asesor.",
                          }
                        : {
                            propuesta: describeAction(detail),
                            lead: detail.lead,
                            siguiente:
                              "Esta propuesta ya existía de un turno anterior. Si el mensaje actual del asesor la confirma, llama executeAction AHORA; no pidas otra confirmación.",
                          }
                    }
                    // Una sola propuesta viva por acción y oportunidad: la nueva reemplaza a la vieja.
                    await db!
                      .delete(schema.lezgoIaNotifications)
                      .where(
                        and(
                          eq(schema.lezgoIaNotifications.ghlLocationId, locationId),
                          eq(schema.lezgoIaNotifications.key, key),
                          eq(schema.lezgoIaNotifications.status, "pending"),
                        ),
                      )
                    await db!.insert(schema.lezgoIaNotifications).values({
                      ...common,
                      id: `ln_prop_${crypto.randomUUID()}`,
                      key,
                      kind: "proposal",
                      status: "pending",
                      body: JSON.stringify(detail),
                    })
                  }
                  return {
                    propuesta: describeAction(detail),
                    lead: detail.lead,
                    siguiente: "Pide confirmación al asesor. No se ha hecho nada todavía.",
                  }
                }),
            }),
          }
        : {}),

      executeAction: tool({
        description:
          w.mode === "confirm"
            ? "Ejecuta en el CRM una acción que propusiste en un turno ANTERIOR con proposeAction y que el asesor acaba de confirmar. Falla si no hay propuesta pendiente o si es de este mismo turno."
            : "Ejecuta en el CRM una acción que el asesor pidió: crear una tarea de seguimiento (task) o marcar la oportunidad como perdida (lost).",
        inputSchema:
          w.mode === "confirm"
            ? actionInput
            : actionInput.extend({
                title: z.string().trim().min(1).max(120).optional(),
                dueInDays: z.number().int().min(0).max(30).optional(),
              }),
        execute: (args) =>
          attempt(async () => {
            const { opportunityId, action } = args
            let extra: { title?: string; dueInDays?: number } = {}
            let proposalId: string | null = null
            if (w.mode === "confirm") {
              const [proposal] = w.simulate
                ? []
                : await db!
                    .select({
                      id: schema.lezgoIaNotifications.id,
                      runId: schema.lezgoIaNotifications.runId,
                      status: schema.lezgoIaNotifications.status,
                      body: schema.lezgoIaNotifications.body,
                      createdAt: schema.lezgoIaNotifications.createdAt,
                    })
                    .from(schema.lezgoIaNotifications)
                    .where(
                      and(
                        eq(schema.lezgoIaNotifications.ghlLocationId, locationId),
                        eq(schema.lezgoIaNotifications.key, proposalKey(action, opportunityId)),
                        eq(schema.lezgoIaNotifications.recipient, w.recipient),
                      ),
                    )
                    .orderBy(desc(schema.lezgoIaNotifications.createdAt))
                    .limit(1)
              const check = confirmable(proposal, { runId: w.runId, now: now.getTime() })
              if (!check.ok) throw new Error(check.error)
              const saved = JSON.parse(proposal.body) as ActionDetail
              extra = { title: saved.title, dueInDays: saved.dueInDays }
              proposalId = proposal.id
            } else {
              extra = args as { title?: string; dueInDays?: number }
            }

            // La oportunidad se vuelve a leer: pudo cambiar desde que se propuso.
            const { detail, assignedTo: owner } = await detailOf(opportunityId, action, extra)
            await perform(detail, owner)
            if (proposalId && !w.simulate) {
              await db!
                .update(schema.lezgoIaNotifications)
                .set({ status: "done" })
                .where(eq(schema.lezgoIaNotifications.id, proposalId))
            }
            return { hecho: describeAction(detail), lead: detail.lead, simulado: w.simulate }
          }),
      }),
    }
  }
}

async function attempt<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, data: await run() }
  } catch (error) {
    if (error instanceof GhlError) {
      return { ok: false as const, error: `GHL respondió ${error.status}: ${error.message}` }
    }
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}
